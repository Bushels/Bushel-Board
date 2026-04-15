import SwiftUI
import WidgetKit

// MARK: - Timeline Provider

struct GrainStanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> SingleGrainEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (SingleGrainEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }

        // Use cached data for snapshots (fast)
        let cached = WidgetDataProvider.cachedGrainStances()
        let primaryGrain = WidgetDataProvider.cachedCropPlanGrains().first ?? "Canola"
        let entry = cached.first(where: { $0.grain == primaryGrain }) ?? cached.first

        completion(SingleGrainEntry(date: .now, grain: entry, isPlaceholder: false))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SingleGrainEntry>) -> Void) {
        Task {
            let stances = await WidgetDataProvider.fetchAndCacheStances()
            let primaryGrain = WidgetDataProvider.cachedCropPlanGrains().first ?? "Canola"
            let entry = stances.first(where: { $0.grain == primaryGrain }) ?? stances.first

            let timelineEntry = SingleGrainEntry(
                date: .now,
                grain: entry,
                isPlaceholder: false
            )

            // Refresh in 60 minutes (system enforces 15-min minimum)
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 60, to: .now) ?? .now
            let timeline = Timeline(entries: [timelineEntry], policy: .after(nextRefresh))
            completion(timeline)
        }
    }
}

// MARK: - Widget View

struct GrainStanceWidgetView: View {
    var entry: SingleGrainEntry

    @Environment(\.widgetFamily) var family

    var body: some View {
        if let grain = entry.grain {
            widgetContent(grain: grain)
        } else {
            emptyState
        }
    }

    private func widgetContent(grain: GrainStanceEntry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Grain name + trend arrow
            HStack(spacing: 4) {
                Image(systemName: "leaf.fill")
                    .font(.caption2)
                    .foregroundStyle(Color(hex: "c17f24")) // canola

                Text(grain.grain)
                    .font(.system(.headline, design: .rounded))
                    .fontWeight(.semibold)
                    .foregroundStyle(Color(hex: "2a261e")) // wheat900

                Spacer()

                Image(systemName: grain.trendSymbol)
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(grain.isBullish ? Color(hex: "437a22") : Color(hex: "d97706"))
            }

            // Stance badge
            Text(grain.stanceBadge)
                .font(.system(.title3, design: .rounded))
                .fontWeight(.bold)
                .foregroundStyle(grain.isBullish ? Color(hex: "437a22") : Color(hex: "d97706"))

            Spacer()

            // Mini sparkline (if data available)
            if !grain.sparklinePrices.isEmpty {
                MiniSparkline(prices: grain.sparklinePrices, isBullish: grain.isBullish)
                    .frame(height: 24)
            }

            // Freshness hint
            Text(freshnessText(grain.updatedAt))
                .font(.system(.caption2))
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .containerBackground(for: .widget) {
            Color(hex: "f5f3ee") // wheat50
        }
        .widgetURL(WidgetDeepLink.chatURL(grain: grain.grain))
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "leaf.fill")
                .font(.title2)
                .foregroundStyle(Color(hex: "c17f24"))

            Text("Open Bushels")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("to set up your crops")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .containerBackground(for: .widget) {
            Color(hex: "f5f3ee")
        }
        .widgetURL(WidgetDeepLink.overviewURL())
    }

    private func freshnessText(_ date: Date) -> String {
        let hours = Int(-date.timeIntervalSinceNow / 3600)
        if hours < 1 { return "Updated just now" }
        if hours == 1 { return "Updated 1h ago" }
        if hours < 24 { return "Updated \(hours)h ago" }
        let days = hours / 24
        return "Updated \(days)d ago"
    }
}

// MARK: - Mini Sparkline (SwiftUI Charts alternative for widget)

/// Lightweight sparkline using Path — avoids importing Charts framework in widget.
struct MiniSparkline: View {
    let prices: [Double]
    let isBullish: Bool

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height

            guard prices.count >= 2 else { return AnyView(EmptyView()) }

            let minPrice = prices.min() ?? 0
            let maxPrice = prices.max() ?? 1
            let range = max(maxPrice - minPrice, 0.01) // avoid division by zero

            let points: [CGPoint] = prices.enumerated().map { i, price in
                let x = width * CGFloat(i) / CGFloat(prices.count - 1)
                let y = height - (height * CGFloat(price - minPrice) / CGFloat(range))
                return CGPoint(x: x, y: y)
            }

            return AnyView(
                Path { path in
                    path.move(to: points[0])
                    for point in points.dropFirst() {
                        path.addLine(to: point)
                    }
                }
                .stroke(
                    isBullish ? Color(hex: "437a22") : Color(hex: "d97706"),
                    style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round)
                )
            )
        }
    }
}

// MARK: - Widget Configuration

struct GrainStanceWidget: Widget {
    let kind: String = "GrainStanceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GrainStanceProvider()) { entry in
            GrainStanceWidgetView(entry: entry)
        }
        .configurationDisplayName("Grain Stance")
        .description("See your primary grain's market stance at a glance.")
        .supportedFamilies([.systemSmall])
    }
}
