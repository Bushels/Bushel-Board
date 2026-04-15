import SwiftUI
import WidgetKit

// MARK: - Timeline Provider

struct MultiGrainProvider: TimelineProvider {
    func placeholder(in context: Context) -> MultiGrainEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (MultiGrainEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }

        let grains = topGrainsFromCache()
        completion(MultiGrainEntry(date: .now, grains: grains, isPlaceholder: false))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MultiGrainEntry>) -> Void) {
        Task {
            let allStances = await WidgetDataProvider.fetchAndCacheStances()
            let cropGrains = WidgetDataProvider.cachedCropPlanGrains()

            // Match farmer's crop plan grains, fall back to top 3 by abs(stance_score)
            let matched = cropGrains.compactMap { name in
                allStances.first(where: { $0.grain == name })
            }

            let grains: [GrainStanceEntry]
            if matched.count >= 3 {
                grains = Array(matched.prefix(3))
            } else if !matched.isEmpty {
                // Pad with highest-conviction grains not already shown
                let shownGrains = Set(matched.map(\.grain))
                let extras = allStances
                    .filter { !shownGrains.contains($0.grain) }
                    .sorted { abs($0.stanceScore) > abs($1.stanceScore) }
                grains = Array((matched + extras).prefix(3))
            } else {
                // No crop plan — show top 3 by conviction
                grains = Array(
                    allStances
                        .sorted { abs($0.stanceScore) > abs($1.stanceScore) }
                        .prefix(3)
                )
            }

            let entry = MultiGrainEntry(date: .now, grains: grains, isPlaceholder: false)
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 60, to: .now) ?? .now
            let timeline = Timeline(entries: [entry], policy: .after(nextRefresh))
            completion(timeline)
        }
    }

    private func topGrainsFromCache() -> [GrainStanceEntry] {
        let cached = WidgetDataProvider.cachedGrainStances()
        let cropGrains = WidgetDataProvider.cachedCropPlanGrains()

        let matched = cropGrains.compactMap { name in
            cached.first(where: { $0.grain == name })
        }

        if matched.count >= 3 { return Array(matched.prefix(3)) }
        return Array(cached.prefix(3))
    }
}

// MARK: - Widget View

struct MultiGrainWidgetView: View {
    var entry: MultiGrainEntry

    var body: some View {
        if entry.grains.isEmpty {
            emptyState
        } else {
            grainList
        }
    }

    private var grainList: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Image(systemName: "leaf.fill")
                    .font(.caption2)
                    .foregroundStyle(Color(hex: "c17f24"))

                Text("My Crops")
                    .font(.system(.caption, design: .rounded))
                    .fontWeight(.semibold)
                    .foregroundStyle(Color(hex: "2a261e"))

                Spacer()

                Text("Bushels")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(.tertiary)
            }
            .padding(.bottom, 6)

            // Grain rows
            ForEach(Array(entry.grains.enumerated()), id: \.element.id) { index, grain in
                if index > 0 {
                    Divider()
                        .padding(.vertical, 2)
                }

                GrainRow(grain: grain)
            }
        }
        .padding(12)
        .containerBackground(for: .widget) {
            Color(hex: "f5f3ee")
        }
        .widgetURL(WidgetDeepLink.overviewURL())
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "leaf.fill")
                .font(.title2)
                .foregroundStyle(Color(hex: "c17f24"))

            Text("Set up your crop plan")
                .font(.subheadline)
                .fontWeight(.medium)

            Text("Open Bushels to tell Bushy what you're growing")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .containerBackground(for: .widget) {
            Color(hex: "f5f3ee")
        }
        .widgetURL(WidgetDeepLink.overviewURL())
    }
}

// MARK: - Grain Row (for medium widget)

struct GrainRow: View {
    let grain: GrainStanceEntry

    var body: some View {
        Link(destination: WidgetDeepLink.chatURL(grain: grain.grain)) {
            HStack(spacing: 8) {
                // Grain name
                Text(grain.grain)
                    .font(.system(.subheadline, design: .rounded))
                    .fontWeight(.medium)
                    .foregroundStyle(Color(hex: "2a261e"))
                    .frame(width: 60, alignment: .leading)

                // Stance badge
                Text(compactBadge(grain.stanceScore))
                    .font(.system(.caption, design: .rounded))
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(badgeColor(grain.stanceScore))
                    )

                Spacer()

                // Sparkline
                if !grain.sparklinePrices.isEmpty {
                    MiniSparkline(prices: grain.sparklinePrices, isBullish: grain.isBullish)
                        .frame(width: 50, height: 16)
                }

                // Trend arrow
                Image(systemName: grain.trendSymbol)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(grain.isBullish ? Color(hex: "437a22") : Color(hex: "d97706"))
            }
        }
    }

    /// Compact badge: "+15" or "-8" (no label, just number)
    private func compactBadge(_ score: Int) -> String {
        let sign = score >= 0 ? "+" : ""
        return "\(sign)\(score)"
    }

    private func badgeColor(_ score: Int) -> Color {
        if score >= 10 { return Color(hex: "437a22") }      // prairie green
        if score <= -10 { return Color(hex: "d97706") }     // warning amber
        return Color(hex: "2a261e").opacity(0.5)             // neutral
    }
}

// MARK: - Widget Configuration

struct MultiGrainWidget: Widget {
    let kind: String = "MultiGrainWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MultiGrainProvider()) { entry in
            MultiGrainWidgetView(entry: entry)
        }
        .configurationDisplayName("My Crops")
        .description("Track your top 3 grains with stance badges and price sparklines.")
        .supportedFamilies([.systemMedium])
    }
}
