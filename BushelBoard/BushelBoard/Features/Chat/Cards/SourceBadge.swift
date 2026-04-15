import SwiftUI

/// Inline pill badge showing the data source for a piece of analysis.
/// Tags appear next to reason bullets so the farmer always knows where info comes from.
struct SourceBadge: View {
    let tag: SourceTag

    var body: some View {
        Label(tag.rawValue, systemImage: tag.icon)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(tag.color.opacity(0.12))
            .foregroundStyle(tag.color)
            .clipShape(Capsule())
    }
}

extension SourceTag {
    var icon: String {
        switch self {
        case .yourHistory: return "person.fill"
        case .localReports: return "person.3.fill"
        case .postedPricing: return "building.2.fill"
        case .nationalMarket: return "globe.americas.fill"
        case .sponsored: return "star.fill"
        }
    }

    var color: Color {
        switch self {
        case .yourHistory: return .canola
        case .localReports: return .prairie
        case .postedPricing: return .provinceAB
        case .nationalMarket: return .secondary
        case .sponsored: return .warning
        }
    }
}
