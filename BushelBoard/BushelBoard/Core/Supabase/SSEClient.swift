import Foundation

/// SSE client for streaming chat-completion Edge Function responses.
/// Parses `data: {json}\n\n` events and dispatches to callbacks.
actor SSEClient {
    private let baseURL: URL
    private var activeTask: Task<Void, Never>?

    init(supabaseURL: String) {
        self.baseURL = URL(string: "\(supabaseURL)/functions/v1/chat-completion")!
    }

    /// Stream a chat message and receive events via the callback.
    /// Optionally includes on-device extracted entities to speed up server-side processing.
    func stream(
        message: String,
        threadId: String?,
        accessToken: String,
        entities: FarmerMessageExtractor.ExtractionResult? = nil,
        onEvent: @escaping @Sendable (SSEEvent) -> Void
    ) async {
        // Cancel any active stream
        activeTask?.cancel()

        activeTask = Task {
            var request = URLRequest(url: baseURL)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue(SupabaseManager.shared.anonKey, forHTTPHeaderField: "apikey")
            request.timeoutInterval = 60

            var body: [String: Any] = ["message": message]
            if let tid = threadId { body["thread_id"] = tid }

            // Include on-device extracted entities if available
            if let entities, entities.extractedOnDevice || !entities.mentionedGrains.isEmpty {
                var entityDict: [String: Any] = [
                    "mentioned_grains": entities.mentionedGrains,
                    "prices_mentioned": entities.pricesMentioned,
                    "intent": entities.intent,
                    "extracted_on_device": entities.extractedOnDevice,
                ]
                if let elevator = entities.elevatorMentioned { entityDict["elevator_mentioned"] = elevator }
                if let condition = entities.cropCondition { entityDict["crop_condition"] = condition }
                body["entities"] = entityDict
            }

            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            do {
                let (bytes, response) = try await URLSession.shared.bytes(for: request)

                guard let httpResponse = response as? HTTPURLResponse else {
                    onEvent(.error("No HTTP response"))
                    return
                }

                if httpResponse.statusCode != 200 {
                    // Read error body
                    var errorBody = ""
                    for try await line in bytes.lines {
                        errorBody += line
                    }
                    onEvent(.error("HTTP \(httpResponse.statusCode): \(errorBody)"))
                    return
                }

                // Parse SSE stream
                for try await line in bytes.lines {
                    if Task.isCancelled { break }

                    guard line.hasPrefix("data: ") else { continue }
                    let jsonString = String(line.dropFirst(6))

                    guard let data = jsonString.data(using: .utf8),
                          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let type = json["type"] as? String else { continue }

                    switch type {
                    case "delta":
                        if let text = json["text"] as? String {
                            onEvent(.textDelta(text))
                        }

                    case "tool_call":
                        if let name = json["name"] as? String {
                            onEvent(.toolCall(name))
                        }

                    case "tool_result":
                        if let name = json["name"] as? String,
                           let result = json["result"] as? String {
                            onEvent(.toolResult(name: name, result: result))
                        }

                    case "trust_footer":
                        let footer = TrustFooterData(
                            cgcFreshness: json["cgcFreshness"] as? String ?? "unknown",
                            futuresFreshness: json["futuresFreshness"] as? String ?? "unknown",
                            localReportCount: json["localReportCount"] as? Int ?? 0,
                            localReportFreshness: json["localReportFreshness"] as? String ?? "",
                            elevatorPricing: json["elevatorPricing"] as? String,
                            confidence: ConfidenceLevel(
                                rawValue: json["confidence"] as? String ?? "Early read"
                            ) ?? .earlyRead
                        )
                        onEvent(.trustFooter(footer))

                    case "done":
                        let threadId = json["thread_id"] as? String
                        let model = json["model"] as? String
                        let tokens = json["tokens"] as? Int
                        onEvent(.done(threadId: threadId, model: model, tokens: tokens))

                    case "verification_prompt":
                        if let promptData = json["data"] as? [String: Any] {
                            let prompt = promptData["prompt"] as? String ?? ""
                            let dataDesc = promptData["dataDescription"] as? String ?? ""
                            let grain = promptData["grain"] as? String ?? ""
                            let dataType = promptData["dataType"] as? String ?? ""
                            let rawOptions = promptData["options"] as? [[String: Any]] ?? []
                            let options = rawOptions.map { opt in
                                VerificationOption(
                                    label: opt["label"] as? String ?? "",
                                    icon: opt["icon"] as? String ?? "questionmark",
                                    confidence: opt["confidence"] as? String ?? "reported"
                                )
                            }
                            onEvent(.verificationPrompt(VerificationPromptFromServer(
                                prompt: prompt,
                                dataDescription: dataDesc,
                                grain: grain,
                                dataType: dataType,
                                options: options
                            )))
                        }

                    case "error":
                        let error = json["error"] as? String ?? "Unknown error"
                        onEvent(.error(error))

                    default:
                        break
                    }
                }
            } catch is CancellationError {
                // Stream cancelled — normal behavior
            } catch {
                onEvent(.error(error.localizedDescription))
            }
        }
    }

    /// Cancel the active stream.
    func cancel() {
        activeTask?.cancel()
        activeTask = nil
    }
}

// MARK: - SSE Event Types

enum SSEEvent: Sendable {
    case textDelta(String)
    case toolCall(String)
    case toolResult(name: String, result: String)
    case trustFooter(TrustFooterData)
    case verificationPrompt(VerificationPromptFromServer)
    case done(threadId: String?, model: String?, tokens: Int?)
    case error(String)
}

/// Server-sent verification prompt — parsed from SSE, converted to card in ChatViewModel.
struct VerificationPromptFromServer: Sendable {
    let prompt: String
    let dataDescription: String
    let grain: String
    let dataType: String
    let options: [VerificationOption]
}

struct VerificationOption: Sendable {
    let label: String
    let icon: String
    let confidence: String   // "verified" or "reported"
}
