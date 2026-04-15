import SwiftUI

/// Specific action card — when the analyst has a concrete recommendation.
/// Contains headline, explanation, quick action buttons, and trust footer.
struct RecommendationCard: View {
    let data: RecommendationData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Headline
            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill")
                    .foregroundStyle(Color.canola)
                Text(data.headline)
                    .font(.headline)
                    .fontWeight(.bold)
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 8)

            Divider()
                .padding(.horizontal, 14)

            // Explanation
            Text(data.explanation)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .padding(.horizontal, 14)
                .padding(.top, 10)

            // Quick actions
            if !data.actions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(data.actions.enumerated()), id: \.offset) { _, action in
                            QuickActionButton(action: action)
                        }
                    }
                    .padding(.horizontal, 14)
                }
                .padding(.top, 10)
            }

            // Trust footer
            TrustFooter(data: data.trustFooter)
                .padding(14)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .glassShadowMd()
    }
}

// MARK: - Quick Action Button

struct QuickActionButton: View {
    let action: QuickAction

    var body: some View {
        Button {
            // Action handling wired in Phase 2
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
