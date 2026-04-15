import Foundation

/// View model for the chat interface.
/// Manages message state, SSE streaming, and quick chips.
@Observable
final class ChatViewModel {
    var messages: [ChatMessage] = []
    var inputText = ""
    var isLoading = false
    var quickChips: [String] = ["Wheat", "Canola", "My area", "Haul or hold?"]

    private var threadId: String?
    private let supabase = SupabaseManager.shared.client
    private let sseClient = SSEClient(supabaseURL: SupabaseManager.supabaseURL)

    func sendMessage() {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let userMessage = ChatMessage(
            id: UUID(),
            role: .user,
            content: inputText,
            timestamp: Date()
        )
        messages.append(userMessage)
        let text = inputText
        inputText = ""
        isLoading = true

        Task {
            await streamResponse(for: text)
            isLoading = false
        }
    }

    /// Populate quick chips from user's crop plan grains + defaults.
    /// Queries crop_plans table for the current crop year, uses grain names as first chips.
    func loadQuickChips(for profile: AuthManager.UserProfile?) {
        guard profile != nil else {
            quickChips = ["Wheat", "Canola", "Haul or hold?", "My area"]
            return
        }

        Task {
            let cropYear = Self.currentCropYear()
            let defaultChips = ["Haul or hold?", "My area", "Basis check"]

            do {
                let response: [CropPlanRow] = try await supabase
                    .from("crop_plans")
                    .select("grain")
                    .eq("crop_year", value: cropYear)
                    .execute()
                    .value

                let grainChips = response.map(\.grain)

                if grainChips.isEmpty {
                    // No crop plans yet — use common prairie defaults
                    quickChips = ["Wheat", "Canola"] + defaultChips
                } else {
                    // Use farmer's actual grains as first chips
                    quickChips = grainChips + defaultChips
                }
            } catch {
                // Fallback to defaults on query failure
                quickChips = ["Wheat", "Canola"] + defaultChips
            }
        }
    }

    /// CGC crop year: August 1 to July 31
    private static func currentCropYear() -> String {
        let cal = Calendar.current
        let now = Date()
        let year = cal.component(.year, from: now)
        let month = cal.component(.month, from: now)
        if month >= 8 { return "\(year)-\(year + 1)" }
        return "\(year - 1)-\(year)"
    }

    private func streamResponse(for message: String) async {
        // Show status line immediately
        let statusId = UUID()
        let statusMessage = ChatMessage(
            id: statusId,
            role: .status,
            content: statusLineForMessage(message),
            timestamp: Date()
        )
        messages.append(statusMessage)

        // Get access token for authenticated request
        guard let session = try? await supabase.auth.session else {
            removeStatus(statusId)
            appendError("Not signed in. Please sign in and try again.")
            return
        }

        // On-device entity extraction (iPhone 15 Pro+ only, <100ms)
        // Runs in parallel with status line display — no visible delay.
        let entities = await FarmerMessageExtractor.extract(from: message)

        let responseId = UUID()
        var accumulatedText = ""
        var trustFooter: TrustFooterData?

        await sseClient.stream(
            message: message,
            threadId: threadId,
            accessToken: session.accessToken,
            entities: entities
        ) { [weak self] event in
            guard let self else { return }

            Task { @MainActor in
                switch event {
                case .textDelta(let text):
                    // Remove status line on first delta
                    self.removeStatus(statusId)

                    accumulatedText += text
                    // Update or create the analyst message
                    if let idx = self.messages.firstIndex(where: { $0.id == responseId }) {
                        self.messages[idx] = ChatMessage(
                            id: responseId,
                            role: .analyst,
                            content: accumulatedText,
                            timestamp: Date()
                        )
                    } else {
                        self.messages.append(ChatMessage(
                            id: responseId,
                            role: .analyst,
                            content: accumulatedText,
                            timestamp: Date()
                        ))
                    }

                case .toolCall(let name):
                    // Update status to show tool execution
                    if let idx = self.messages.firstIndex(where: { $0.id == statusId }) {
                        self.messages[idx] = ChatMessage(
                            id: statusId,
                            role: .status,
                            content: self.toolCallStatusLine(name),
                            timestamp: Date()
                        )
                    }

                case .toolResult:
                    break // Tool results are for the LLM, not the user

                case .verificationPrompt(let serverPrompt):
                    // Inject a verification card into the message list
                    let labels = VerificationPromptData.gamifiedLabels(for: serverPrompt.dataType)
                    let verificationMsg = ChatMessage(
                        id: UUID(),
                        role: .analyst,
                        content: serverPrompt.prompt,
                        timestamp: Date(),
                        cardData: .verificationPrompt(VerificationPromptData(
                            grain: serverPrompt.grain,
                            dataType: serverPrompt.dataType,
                            inferredValue: serverPrompt.dataDescription,
                            elevatorName: nil,
                            confirmLabel: serverPrompt.options.first?.label ?? labels.confirm,
                            denyLabel: serverPrompt.options.last?.label ?? labels.deny,
                            threadId: self.threadId
                        ))
                    )
                    self.messages.append(verificationMsg)

                case .trustFooter(let footer):
                    trustFooter = footer

                case .done(let tid, _, _):
                    self.removeStatus(statusId)
                    if let tid { self.threadId = tid }

                    // Try to parse accumulated text as structured card JSON
                    if let cardData = self.parseCardData(from: accumulatedText, trustFooter: trustFooter) {
                        if let idx = self.messages.firstIndex(where: { $0.id == responseId }) {
                            self.messages[idx] = ChatMessage(
                                id: responseId,
                                role: .analyst,
                                content: accumulatedText,
                                timestamp: Date(),
                                cardData: cardData
                            )
                        }
                    } else if let footer = trustFooter {
                        // Plain text response — still attach trust footer
                        if let idx = self.messages.firstIndex(where: { $0.id == responseId }) {
                            self.messages[idx] = ChatMessage(
                                id: responseId,
                                role: .analyst,
                                content: accumulatedText,
                                timestamp: Date()
                            )
                        }
                    }

                case .error(let error):
                    self.removeStatus(statusId)
                    self.appendError(error)
                }
            }
        }
    }

    // MARK: - JSON Card Parsing

    /// Try to parse the LLM's JSON response into a typed card.
    private func parseCardData(from text: String, trustFooter: TrustFooterData?) -> MessageContent? {
        // Strip markdown code fences if present
        var jsonText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if jsonText.hasPrefix("```json") {
            jsonText = String(jsonText.dropFirst(7))
        }
        if jsonText.hasPrefix("```") {
            jsonText = String(jsonText.dropFirst(3))
        }
        if jsonText.hasSuffix("```") {
            jsonText = String(jsonText.dropLast(3))
        }
        jsonText = jsonText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let data = jsonText.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return nil
        }

        let defaultFooter = trustFooter ?? TrustFooterData(
            cgcFreshness: "unknown", futuresFreshness: "unknown",
            localReportCount: 0, localReportFreshness: "",
            elevatorPricing: nil, confidence: .earlyRead
        )

        switch type {
        case "market_summary":
            let reasons = (json["reasons"] as? [[String: String]])?.map { r in
                ReasonBullet(
                    text: r["text"] ?? "",
                    sourceTag: SourceTag(rawValue: (r["source_tag"] ?? "").replacingOccurrences(of: "_", with: " ")) ?? .nationalMarket
                )
            } ?? []

            return .marketSummary(MarketSummaryData(
                grain: json["grain"] as? String ?? "Wheat",
                stanceBadge: json["stance_badge"] as? String ?? "",
                takeaway: json["takeaway"] as? String ?? "",
                reasons: reasons,
                recommendation: json["recommendation"] as? String ?? "",
                followUpAsk: json["follow_up_ask"] as? String,
                trustFooter: defaultFooter
            ))

        case "recommendation":
            let actions = (json["actions"] as? [[String: String]])?.map { a in
                QuickAction(label: a["label"] ?? "", icon: a["icon"] ?? "arrow.right")
            } ?? []

            return .recommendation(RecommendationData(
                headline: json["headline"] as? String ?? "",
                explanation: json["explanation"] as? String ?? "",
                actions: actions,
                trustFooter: defaultFooter
            ))

        case "verification_prompt":
            let dataType = json["data_type"] as? String ?? ""
            let labels = VerificationPromptData.gamifiedLabels(for: dataType)
            return .verificationPrompt(VerificationPromptData(
                grain: json["grain"] as? String ?? "",
                dataType: dataType,
                inferredValue: json["inferred_value"] as? String ?? "",
                elevatorName: json["elevator_name"] as? String,
                confirmLabel: json["confirm_label"] as? String ?? labels.confirm,
                denyLabel: json["deny_label"] as? String ?? labels.deny,
                threadId: self.threadId
            ))

        default:
            return nil
        }
    }

    // MARK: - Verification Handlers

    /// Farmer confirmed the inferred data — send as verified message to thread.
    func handleVerification(messageId: UUID, confirmed: Bool) {
        guard let message = messages.first(where: { $0.id == messageId }),
              case .verificationPrompt(let data) = message.cardData else { return }

        if confirmed {
            // Send confirmation to thread — backend upgrades confidence to 'verified'
            Task {
                await sendVerificationResponse(
                    threadId: data.threadId,
                    dataType: data.dataType,
                    grain: data.grain,
                    confirmed: true,
                    value: data.inferredValue
                )
            }
        }
        // Denied: data stays at 'reported' confidence or gets discarded
    }

    /// Farmer corrected the inferred value — send the corrected value.
    func handleVerificationCorrection(messageId: UUID, correction: String) {
        guard let message = messages.first(where: { $0.id == messageId }),
              case .verificationPrompt(let data) = message.cardData else { return }

        Task {
            await sendVerificationResponse(
                threadId: data.threadId,
                dataType: data.dataType,
                grain: data.grain,
                confirmed: true,
                value: correction
            )
        }
    }

    /// Post verification result back to the chat-completion Edge Function.
    private func sendVerificationResponse(threadId: String?, dataType: String,
                                          grain: String, confirmed: Bool,
                                          value: String) async {
        guard let session = try? await supabase.auth.session else { return }

        // Send as a hidden user message — the backend parses it and calls save_local_intel
        // with confidence='verified'. This keeps the data exchange in the chat flow.
        let verificationMessage = confirmed
            ? "[VERIFIED] \(dataType) for \(grain): \(value)"
            : "[SKIPPED] \(dataType) for \(grain)"

        await sseClient.stream(
            message: verificationMessage,
            threadId: threadId,
            accessToken: session.accessToken
        ) { _ in
            // Verification responses may generate follow-up comparison data
            // (the "I'll tell you theirs" part). We'll handle that normally.
        }
    }

    // MARK: - Helpers

    private func removeStatus(_ id: UUID) {
        messages.removeAll { $0.id == id }
    }

    private func appendError(_ text: String) {
        messages.append(ChatMessage(
            id: UUID(), role: .analyst,
            content: text, timestamp: Date(),
            cardData: .plainText(text)
        ))
    }

    private func toolCallStatusLine(_ name: String) -> String {
        switch name {
        case "save_local_intel": return "Saving your local intel..."
        case "update_farmer_memory": return "Noting that for next time..."
        case "get_area_stance": return "Checking your area..."
        case "search_market": return "Pulling market data..."
        case "create_crop_plan": return "Updating your crop plan..."
        default: return "Working on it..."
        }
    }

    private func statusLineForMessage(_ message: String) -> String {
        let lower = message.lowercased()
        if lower.contains("wheat") { return "Checking wheat in your area..." }
        if lower.contains("canola") { return "Pulling canola data..." }
        if lower.contains("barley") { return "Looking at barley..." }
        if lower.contains("basis") { return "Checking local basis..." }
        if lower.contains("area") { return "Scanning your area..." }
        return "Checking the market..."
    }
}

// MARK: - Supabase Row Decoders

private struct CropPlanRow: Decodable {
    let grain: String
}

// MARK: - Chat Message Model

struct ChatMessage: Identifiable {
    let id: UUID
    let role: MessageRole
    let content: String
    let timestamp: Date
    var cardData: MessageContent?

    enum MessageRole {
        case user
        case analyst
        case status  // "Checking wheat in your area..."
    }
}

/// Typed message content — rendered as SwiftUI cards, NOT markdown.
enum MessageContent {
    case plainText(String)
    case marketSummary(MarketSummaryData)
    case recommendation(RecommendationData)
    case verificationPrompt(VerificationPromptData)
    case statusLine(String)
}

/// Verification prompt: gamified data exchange.
/// "Tell me yours and I'll tell you theirs" pattern.
/// Verified data points upgrade confidence to 'verified'; unverified stay at 'reported'.
struct VerificationPromptData {
    let grain: String
    let dataType: String          // "basis", "elevator_price", etc.
    let inferredValue: String     // "-28" or "dry conditions"
    let elevatorName: String?
    let confirmLabel: String      // Gamified: "This is what I actually paid"
    let denyLabel: String         // Gamified: "I'm just kidding around"
    let threadId: String?

    /// Factory: gamified labels based on data type (from design doc Section 4.3)
    static func gamifiedLabels(for dataType: String) -> (confirm: String, deny: String) {
        switch dataType {
        case "basis", "elevator_price", "input_price":
            return ("This is what I actually paid", "I'm just kidding around")
        case "acres_planned", "crop_condition":
            return ("That's my real number", "Ballpark guess")
        case "yield_estimate":
            return ("Actual weigh-up", "Rough estimate")
        case "seeding_progress", "harvest_progress":
            return ("That's where I'm at", "Just guessing")
        default:
            return ("Yep, that's right", "Not quite")
        }
    }
}

struct MarketSummaryData {
    let grain: String
    let stanceBadge: String           // "Bullish +20"
    let takeaway: String              // one-line summary
    let reasons: [ReasonBullet]
    let recommendation: String
    let followUpAsk: String?
    let trustFooter: TrustFooterData
}

struct ReasonBullet {
    let text: String
    let sourceTag: SourceTag
}

enum SourceTag: String {
    case yourHistory = "your history"
    case localReports = "local reports"
    case postedPricing = "posted pricing"
    case nationalMarket = "national market"
    case sponsored = "sponsored"
}

struct RecommendationData {
    let headline: String
    let explanation: String
    let actions: [QuickAction]
    let trustFooter: TrustFooterData
}

struct QuickAction {
    let label: String    // "Log my basis", "Compare elevators", "Set alert"
    let icon: String     // SF Symbol name
}

struct TrustFooterData {
    let cgcFreshness: String
    let futuresFreshness: String
    let localReportCount: Int
    let localReportFreshness: String
    let elevatorPricing: String?
    let confidence: ConfidenceLevel
}
