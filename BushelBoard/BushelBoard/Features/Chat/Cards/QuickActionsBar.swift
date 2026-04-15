import SwiftUI

/// Horizontal strip of quick action chips shown below certain analyst replies.
/// Provides one-tap access to follow-up actions.
struct QuickActionsBar: View {
    let actions: [QuickAction]
    var onAction: ((QuickAction) -> Void)?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(actions.enumerated()), id: \.offset) { _, action in
                    Button {
                        onAction?(action)
                    } label: {
                        Label(action.label, systemImage: action.icon)
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.canola.opacity(0.1))
                            .foregroundStyle(Color.canola)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 14)
        }
    }
}
