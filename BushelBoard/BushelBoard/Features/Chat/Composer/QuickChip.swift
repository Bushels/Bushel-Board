import SwiftUI

/// Tappable chip above the keyboard for quick prompts.
/// Populated from crop plan grains + common questions.
struct QuickChip: View {
    let label: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(label)
                .font(.caption)
                .fontWeight(.medium)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Color.wheat100)
                .foregroundStyle(Color.wheat900)
                .clipShape(Capsule())
        }
    }
}
