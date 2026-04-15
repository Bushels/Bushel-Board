import SwiftUI

/// Trust footer attached to every substantive analyst reply.
/// Shows data freshness, local report count, and confidence level.
/// Tapping opens WhyThisReadSheet for full transparency.
struct TrustFooter: View {
    let data: TrustFooterData
    @State private var showWhySheet = false

    var body: some View {
        Button {
            showWhySheet = true
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                // Data freshness line
                HStack(spacing: 4) {
                    Image(systemName: "chart.bar.fill")
                        .font(.caption2)
                    Text(freshnessLine)
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)

                // Confidence + "Why this read?"
                HStack {
                    ConfidenceBadge(level: data.confidence)
                    Spacer()
                    HStack(spacing: 2) {
                        Text("Why this read?")
                            .font(.caption2)
                            .fontWeight(.medium)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 8, weight: .bold))
                    }
                    .foregroundStyle(Color.canola)
                }
            }
            .padding(10)
            .background(Color.wheat100.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showWhySheet) {
            WhyThisReadSheet(data: data)
                .presentationDetents([.medium])
        }
    }

    private var freshnessLine: String {
        var parts: [String] = []
        parts.append("CGC: \(data.cgcFreshness)")
        parts.append("Futures: \(data.futuresFreshness)")
        if data.localReportCount > 0 {
            parts.append("Local: \(data.localReportCount) reports, \(data.localReportFreshness)")
        }
        return parts.joined(separator: " \u{00B7} ")
    }
}

// MARK: - Confidence Badge

struct ConfidenceBadge: View {
    let level: ConfidenceLevel

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(level.color)
                .frame(width: 6, height: 6)
            Text(level.rawValue)
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(level.color)
        }
    }
}

extension ConfidenceLevel {
    var color: Color {
        switch self {
        case .earlyRead: return .warning
        case .solidRead: return .canola
        case .strongRead: return .prairie
        }
    }
}
