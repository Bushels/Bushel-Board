import SwiftUI

/// Gamified verification card for the "tell me yours, I'll tell you theirs" exchange.
/// When Bushy infers a farmer-shared data point, this card confirms accuracy.
/// Tapping the confirm option saves with confidence='verified' and unlocks comparison data.
/// Tapping the deny option either skips logging or opens a correction field.
struct VerificationPromptCard: View {
    let data: VerificationPromptData
    let onConfirm: () -> Void
    let onDeny: () -> Void
    let onCorrect: (String) -> Void

    @State private var responded = false
    @State private var showCorrection = false
    @State private var correctionText = ""
    @State private var confirmPulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header with data type icon
            HStack(spacing: 8) {
                Image(systemName: iconForDataType(data.dataType))
                    .font(.caption)
                    .foregroundStyle(Color.canola)

                Text(headerText)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.canola)
            }

            // Inferred value display — Bushy's voice
            Text(promptText)
                .font(.body)
                .foregroundStyle(Color.wheat900)

            if !responded {
                // Gamified 2-button quick reply
                VStack(spacing: 8) {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            confirmPulse = true
                            responded = true
                        }
                        onConfirm()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                            Text(data.confirmLabel)
                        }
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.prairie.opacity(0.12))
                        .foregroundStyle(Color.prairie)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .scaleEffect(confirmPulse ? 0.95 : 1.0)

                    Button {
                        if shouldAllowCorrection {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                showCorrection = true
                            }
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                responded = true
                            }
                            onDeny()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: shouldAllowCorrection ? "pencil.circle" : "face.smiling")
                            Text(data.denyLabel)
                        }
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.wheat200.opacity(0.4))
                        .foregroundStyle(Color.wheat700)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }

                if showCorrection {
                    HStack {
                        TextField("What's the actual number?", text: $correctionText)
                            .textFieldStyle(.plain)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.wheat100)
                            .clipShape(RoundedRectangle(cornerRadius: 12))

                        Button {
                            withAnimation { responded = true }
                            onCorrect(correctionText)
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title3)
                                .foregroundStyle(Color.canola)
                        }
                        .disabled(correctionText.isEmpty)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            } else {
                // Confirmed state — with unlock tease
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.prairie)
                    Text(confirmedMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 8, x: 0, y: 2)
    }

    // MARK: - Text Generation

    /// Header varies by whether this is a price/condition/progress check
    private var headerText: String {
        switch data.dataType {
        case "basis", "elevator_price", "input_price":
            return "Quick check"
        case "yield_estimate":
            return "Yield check"
        case "seeding_progress", "harvest_progress":
            return "Progress check"
        default:
            return "Quick check"
        }
    }

    /// Bushy-voice prompt text — playful, conversational, never robotic
    private var promptText: String {
        let elevator = data.elevatorName.map { " at \($0)" } ?? ""
        switch data.dataType {
        case "basis":
            return "Sounds like basis is around \(data.inferredValue)\(elevator). That right?"
        case "elevator_price":
            return "So \(data.elevatorName ?? "the elevator") is quoting \(data.inferredValue)? Just want to make sure I heard you right."
        case "input_price":
            return "You paid \(data.inferredValue) for \(data.grain)? Tell me that's real and I'll tell you how your neighbors did."
        case "crop_condition":
            return "I'm picking up that conditions are \(data.inferredValue) in your area. Sound about right?"
        case "yield_estimate":
            return "Noted \(data.inferredValue) bu/acre for \(data.grain). Does that track?"
        case "seeding_progress":
            return "So you're about \(data.inferredValue)% done seeding \(data.grain)? Just confirming."
        case "harvest_progress":
            return "About \(data.inferredValue)% done on \(data.grain) harvest?"
        case "acres_planned":
            return "\(data.inferredValue) acres of \(data.grain) this year?"
        default:
            return "Just to confirm: \(data.inferredValue) for \(data.grain)\(elevator)?"
        }
    }

    /// Whether the deny button should open a correction field vs. just skip
    private var shouldAllowCorrection: Bool {
        // Price/numeric data types allow correction; "just kidding" types skip
        switch data.dataType {
        case "basis", "elevator_price", "input_price", "yield_estimate",
             "acres_planned", "seeding_progress", "harvest_progress":
            return false // "I'm just kidding around" — skip, don't log
        case "crop_condition":
            return false // Subjective, no correction needed
        default:
            return true // Generic — allow correction
        }
    }

    /// Post-confirmation message — teases the unlock of comparison data
    private var confirmedMessage: String {
        if showCorrection {
            return "Got it, updated."
        }
        switch data.dataType {
        case "basis", "elevator_price", "input_price":
            return "Logged — let me pull up how that compares..."
        case "yield_estimate":
            return "Thanks — I'll show you how that stacks up in your area."
        case "acres_planned":
            return "Noted — I'll remember that for your crop plan."
        default:
            return "Confirmed — thanks!"
        }
    }

    private func iconForDataType(_ type: String) -> String {
        switch type {
        case "basis": return "dollarsign.arrow.circlepath"
        case "elevator_price": return "building.2"
        case "input_price": return "cart"
        case "crop_condition": return "leaf"
        case "yield_estimate": return "chart.bar"
        case "seeding_progress": return "arrow.up.right"
        case "harvest_progress": return "scissors"
        case "acres_planned": return "map"
        default: return "questionmark.circle"
        }
    }
}
