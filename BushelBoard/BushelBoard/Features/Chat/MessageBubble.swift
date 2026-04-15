import SwiftUI

/// Renders a single chat message — dispatching to the correct card type.
/// User messages: right-aligned bubbles (wheat palette).
/// Analyst messages: left-aligned typed cards or plain text.
/// Status messages: centered, muted, compact.
struct MessageBubble: View {
    let message: ChatMessage
    var onVerificationConfirm: (() -> Void)?
    var onVerificationDeny: (() -> Void)?
    var onVerificationCorrect: ((String) -> Void)?

    var body: some View {
        HStack {
            switch message.role {
            case .user:
                Spacer(minLength: 60)
                userBubble
            case .analyst:
                analystContent
                Spacer(minLength: 40)
            case .status:
                Spacer()
                statusLine
                Spacer()
            }
        }
    }

    // MARK: - User Bubble

    private var userBubble: some View {
        Text(message.content)
            .font(.body)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.wheat200)
            .foregroundStyle(Color.wheat900)
            .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    // MARK: - Analyst Content

    @ViewBuilder
    private var analystContent: some View {
        if let cardData = message.cardData {
            switch cardData {
            case .plainText(let text):
                plainTextBubble(text)

            case .marketSummary(let data):
                MarketSummaryCard(data: data)

            case .recommendation(let data):
                RecommendationCard(data: data)

            case .verificationPrompt(let data):
                VerificationPromptCard(
                    data: data,
                    onConfirm: { onVerificationConfirm?() },
                    onDeny: { onVerificationDeny?() },
                    onCorrect: { correction in onVerificationCorrect?(correction) }
                )

            case .statusLine(let text):
                statusIndicator(text)
            }
        } else {
            // Fallback: render content as plain text
            plainTextBubble(message.content)
        }
    }

    private func plainTextBubble(_ text: String) -> some View {
        Text(text)
            .font(.body)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.white)
            .foregroundStyle(Color.wheat900)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .glassShadowSm()
    }

    private func statusIndicator(_ text: String) -> some View {
        HStack(spacing: 6) {
            ProgressView()
                .controlSize(.small)
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.wheat100.opacity(0.5))
        .clipShape(Capsule())
    }

    // MARK: - Status Line (role = .status)

    private var statusLine: some View {
        HStack(spacing: 6) {
            ProgressView()
                .controlSize(.small)
            Text(message.content)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }
}
