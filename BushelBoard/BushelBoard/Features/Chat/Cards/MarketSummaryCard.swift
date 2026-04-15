import SwiftUI

/// The primary analyst reply card — stance badge, takeaway, reason bullets with source tags,
/// recommendation, optional follow-up ask, and trust footer.
/// This is what the farmer sees for most substantive questions.
struct MarketSummaryCard: View {
    let data: MarketSummaryData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: grain icon + stance badge
            HStack {
                Image(systemName: "leaf.fill")
                    .foregroundStyle(Color.canola)
                Text(data.grain)
                    .font(.headline)
                    .fontWeight(.bold)
                Spacer()
                StanceBadge(text: data.stanceBadge)
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 8)

            Divider()
                .padding(.horizontal, 14)

            // Takeaway
            Text(data.takeaway)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .padding(.horizontal, 14)
                .padding(.top, 10)

            // Reason bullets
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(data.reasons.enumerated()), id: \.offset) { _, reason in
                    HStack(alignment: .top, spacing: 6) {
                        Circle()
                            .fill(Color.canola)
                            .frame(width: 5, height: 5)
                            .padding(.top, 6)

                        Text(reason.text)
                            .font(.subheadline)

                        SourceBadge(tag: reason.sourceTag)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)

            // Recommendation
            Text(data.recommendation)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(Color.wheat900)
                .padding(.horizontal, 14)
                .padding(.top, 10)

            // Follow-up ask (if any)
            if let ask = data.followUpAsk {
                Text(ask)
                    .font(.subheadline)
                    .italic()
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 14)
                    .padding(.top, 6)
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

// MARK: - Stance Badge

struct StanceBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .fontWeight(.bold)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(stanceColor.opacity(0.15))
            .foregroundStyle(stanceColor)
            .clipShape(Capsule())
    }

    private var stanceColor: Color {
        let lower = text.lowercased()
        if lower.contains("bullish") { return .prairie }
        if lower.contains("bearish") { return .red }
        return .canola
    }
}
