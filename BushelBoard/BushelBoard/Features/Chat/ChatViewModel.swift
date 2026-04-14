import Foundation

/// View model for the chat interface.
/// Manages message state, SSE streaming, and quick chips.
@Observable
final class ChatViewModel {
    var messages: [ChatMessage] = []
    var inputText = ""
    var isLoading = false
    var quickChips: [String] = ["Wheat", "Canola", "My area", "Haul or hold?"]

    private var threadId: UUID?
    private let supabase = SupabaseManager.shared.client

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

    private func streamResponse(for message: String) async {
        // Phase 1 implementation: call chat-completion Edge Function via SSE
        // For now, placeholder
        let response = ChatMessage(
            id: UUID(),
            role: .analyst,
            content: "Checking wheat in your area...",
            timestamp: Date()
        )
        messages.append(response)
    }
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
    case statusLine(String)
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
