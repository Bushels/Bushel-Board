import SwiftUI

/// Sticky bottom composer: quick chips + text field + send button.
/// Designed for one-thumb use in the yard/truck/tractor.
struct ChatComposerView: View {
    @Binding var text: String
    let quickChips: [String]
    let isLoading: Bool
    let onSend: () -> Void
    let onChipTap: (String) -> Void

    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            // Quick chips — horizontal scroll above text field
            if !quickChips.isEmpty && text.isEmpty && !isLoading {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(quickChips, id: \.self) { chip in
                            QuickChip(label: chip) {
                                onChipTap(chip)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }

            // Text field + send
            HStack(spacing: 8) {
                TextField("Ask Bushy...", text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.wheat100.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .focused($isTextFieldFocused)
                    .onSubmit {
                        if canSend { onSend() }
                    }

                // Send button
                Button(action: onSend) {
                    Image(systemName: isLoading ? "stop.fill" : "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(canSend ? Color.canola : Color.gray.opacity(0.3))
                }
                .disabled(!canSend && !isLoading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color.wheat50)
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLoading
    }
}
