import SwiftUI
import WidgetKit

// MARK: - Timeline Provider

struct LockScreenProvider: TimelineProvider {
    func placeholder(in context: Context) -> LockScreenEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (LockScreenEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
            return
        }

        let cached = WidgetDataProvider.cachedGrainStances()
        let primaryGrain = WidgetDataProvider.cachedCropPlanGrains().first ?? "Canola"
        let entry = cached.first(where: { $0.grain == primaryGrain })

        completion(LockScreenEntry(
            date: .now,
            grain: entry?.grain ?? primaryGrain,
            stanceScore: entry?.stanceScore ?? 0,
            isPlaceholder: false
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LockScreenEntry>) -> Void) {
        Task {
            let stances = await WidgetDataProvider.fetchAndCacheStances()
            let primaryGrain = WidgetDataProvider.cachedCropPlanGrains().first ?? "Canola"
            let match = stances.first(where: { $0.grain == primaryGrain }) ?? stances.first

            let entry = LockScreenEntry(
                date: .now,
                grain: match?.grain ?? primaryGrain,
                stanceScore: match?.stanceScore ?? 0,
                isPlaceholder: false
            )

            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 60, to: .now) ?? .now
            let timeline = Timeline(entries: [entry], policy: .after(nextRefresh))
            completion(timeline)
        }
    }
}

// MARK: - Lock Screen Widget Views

struct LockScreenInlineView: View {
    var entry: LockScreenEntry

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "leaf.fill")
                .font(.caption2)

            Text(entry.grain)
                .font(.system(.caption2, design: .rounded))
                .fontWeight(.medium)

            Text(scoreText(entry.stanceScore))
                .font(.system(.caption2, design: .rounded))
                .fontWeight(.bold)
        }
        .widgetURL(WidgetDeepLink.chatURL(grain: entry.grain))
    }

    private func scoreText(_ score: Int) -> String {
        let sign = score >= 0 ? "+" : ""
        return "\(sign)\(score)"
    }
}

struct LockScreenCircularView: View {
    var entry: LockScreenEntry

    var body: some View {
        Gauge(value: Double(entry.stanceScore), in: -100...100) {
            Image(systemName: "leaf.fill")
        } currentValueLabel: {
            Text(shortScore(entry.stanceScore))
                .font(.system(.caption2, design: .rounded))
                .fontWeight(.bold)
        }
        .gaugeStyle(.accessoryCircular)
        .widgetURL(WidgetDeepLink.chatURL(grain: entry.grain))
    }

    private func shortScore(_ score: Int) -> String {
        let sign = score >= 0 ? "+" : ""
        return "\(sign)\(score)"
    }
}

struct LockScreenRectangularView: View {
    var entry: LockScreenEntry

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "leaf.fill")
                .font(.body)

            VStack(alignment: .leading, spacing: 1) {
                Text(entry.grain)
                    .font(.system(.caption, design: .rounded))
                    .fontWeight(.semibold)

                Text(WidgetDataProvider.formatStanceBadge(score: entry.stanceScore))
                    .font(.system(.caption2, design: .rounded))
                    .fontWeight(.medium)
            }
        }
        .widgetURL(WidgetDeepLink.chatURL(grain: entry.grain))
    }
}

// MARK: - Widget Configuration

struct LockScreenWidget: Widget {
    let kind: String = "LockScreenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LockScreenProvider()) { entry in
            LockScreenWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Grain Stance")
        .description("See your primary grain's stance on the lock screen.")
        .supportedFamilies([
            .accessoryInline,
            .accessoryCircular,
            .accessoryRectangular,
        ])
    }
}

// MARK: - Lock Screen Widget with Family-Specific Views

struct LockScreenWidgetEntryView: View {
    var entry: LockScreenEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryInline:
            LockScreenInlineView(entry: entry)
        case .accessoryCircular:
            LockScreenCircularView(entry: entry)
        case .accessoryRectangular:
            LockScreenRectangularView(entry: entry)
        default:
            LockScreenInlineView(entry: entry)
        }
    }
}
