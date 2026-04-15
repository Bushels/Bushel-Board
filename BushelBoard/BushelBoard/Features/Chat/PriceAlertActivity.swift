import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Activity Attributes

/// Defines the static and dynamic content for grain price alert Live Activities.
/// Appears on Dynamic Island (compact + expanded) and lock screen.
///
/// Triggers:
/// - Grain price moves >2% intraday
/// - Basis narrows past user-set threshold
/// - New grain intelligence with stance change >5 points
struct PriceAlertAttributes: ActivityAttributes {
    /// Static content — set when the activity starts, doesn't change.
    struct ContentState: Codable, Hashable {
        let stanceBadge: String       // "Bullish +20"
        let priceChange: String       // "+$4.50/t" or "-2.3%"
        let basisChange: String?      // "Basis narrowed to -$28"
        let message: String           // "Worth a look" or "Basis working your way"
        let deepLinkPrompt: String    // Pre-filled chat prompt on tap
    }

    /// Grain name (static for the lifetime of the activity)
    let grain: String
}

// MARK: - Dynamic Island Views

/// Compact leading — shown in Dynamic Island pill (left side)
struct PriceAlertCompactLeading: View {
    let context: ActivityViewContext<PriceAlertAttributes>

    var body: some View {
        Image(systemName: "leaf.fill")
            .foregroundStyle(Color(hex: "c17f24"))
            .font(.caption2)
    }
}

/// Compact trailing — shown in Dynamic Island pill (right side)
struct PriceAlertCompactTrailing: View {
    let context: ActivityViewContext<PriceAlertAttributes>

    var body: some View {
        Text(context.state.priceChange)
            .font(.system(.caption2, design: .rounded))
            .fontWeight(.bold)
            .foregroundStyle(
                context.state.priceChange.hasPrefix("+")
                    ? Color(hex: "437a22")
                    : Color(hex: "d97706")
            )
    }
}

/// Expanded Dynamic Island — shown on long press
struct PriceAlertExpandedView: View {
    let context: ActivityViewContext<PriceAlertAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header: grain + stance
            HStack {
                Image(systemName: "leaf.fill")
                    .foregroundStyle(Color(hex: "c17f24"))

                Text(context.attributes.grain)
                    .font(.system(.headline, design: .rounded))
                    .fontWeight(.bold)

                Spacer()

                Text(context.state.stanceBadge)
                    .font(.system(.caption, design: .rounded))
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(badgeColor)
                    )
            }

            // Price change
            HStack(spacing: 12) {
                Label(context.state.priceChange, systemImage: priceIcon)
                    .font(.system(.subheadline, design: .rounded))
                    .fontWeight(.semibold)
                    .foregroundStyle(priceColor)

                if let basis = context.state.basisChange {
                    Text(basis)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Message + CTA
            HStack {
                Text(context.state.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Link(destination: chatDeepLink) {
                    Text("Open Bushy")
                        .font(.system(.caption, design: .rounded))
                        .fontWeight(.semibold)
                        .foregroundStyle(Color(hex: "c17f24"))
                }
            }
        }
        .padding()
    }

    private var priceIcon: String {
        context.state.priceChange.hasPrefix("+") ? "arrow.up.right" : "arrow.down.right"
    }

    private var priceColor: Color {
        context.state.priceChange.hasPrefix("+") ? Color(hex: "437a22") : Color(hex: "d97706")
    }

    private var badgeColor: Color {
        context.state.stanceBadge.lowercased().contains("bull") ? Color(hex: "437a22") : Color(hex: "d97706")
    }

    private var chatDeepLink: URL {
        WidgetDeepLink.chatURL(grain: context.attributes.grain)
    }
}

// MARK: - Lock Screen Banner

struct PriceAlertLockScreenView: View {
    let context: ActivityViewContext<PriceAlertAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "leaf.fill")
                    .foregroundStyle(Color(hex: "c17f24"))

                Text(context.attributes.grain)
                    .font(.system(.headline, design: .rounded))
                    .fontWeight(.bold)

                Text(context.state.priceChange)
                    .font(.system(.headline, design: .rounded))
                    .fontWeight(.bold)
                    .foregroundStyle(
                        context.state.priceChange.hasPrefix("+")
                            ? Color(hex: "437a22")
                            : Color(hex: "d97706")
                    )

                Spacer()

                Text(context.state.stanceBadge)
                    .font(.system(.caption, design: .rounded))
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
            }

            HStack {
                if let basis = context.state.basisChange {
                    Text(basis)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text(context.state.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

// MARK: - Live Activity Widget Configuration

struct PriceAlertLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PriceAlertAttributes.self) { context in
            // Lock screen / notification banner
            PriceAlertLockScreenView(context: context)
                .activityBackgroundTint(Color(hex: "f5f3ee"))
                .widgetURL(WidgetDeepLink.chatURL(grain: context.attributes.grain))
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded regions
                DynamicIslandExpandedRegion(.leading) {
                    PriceAlertCompactLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    PriceAlertCompactTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    PriceAlertExpandedView(context: context)
                }
            } compactLeading: {
                PriceAlertCompactLeading(context: context)
            } compactTrailing: {
                PriceAlertCompactTrailing(context: context)
            } minimal: {
                Image(systemName: "leaf.fill")
                    .foregroundStyle(Color(hex: "c17f24"))
            }
            .widgetURL(WidgetDeepLink.chatURL(grain: context.attributes.grain))
        }
    }
}

// MARK: - Activity Manager

/// Start, update, and end price alert Live Activities.
/// Called from PushManager when a price alert push arrives.
enum PriceAlertActivityManager {

    /// Start a new Live Activity for a grain price alert.
    @discardableResult
    static func start(
        grain: String,
        stanceBadge: String,
        priceChange: String,
        basisChange: String?,
        message: String,
        deepLinkPrompt: String
    ) -> Activity<PriceAlertAttributes>? {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

        let attributes = PriceAlertAttributes(grain: grain)
        let state = PriceAlertAttributes.ContentState(
            stanceBadge: stanceBadge,
            priceChange: priceChange,
            basisChange: basisChange,
            message: message,
            deepLinkPrompt: deepLinkPrompt
        )

        let content = ActivityContent(state: state, staleDate: Calendar.current.date(byAdding: .hour, value: 12, to: .now))

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: .token
            )
            return activity
        } catch {
            return nil
        }
    }

    /// Update an existing Live Activity with new price data.
    static func update(
        activity: Activity<PriceAlertAttributes>,
        stanceBadge: String,
        priceChange: String,
        basisChange: String?,
        message: String
    ) async {
        let state = PriceAlertAttributes.ContentState(
            stanceBadge: stanceBadge,
            priceChange: priceChange,
            basisChange: basisChange,
            message: message,
            deepLinkPrompt: "Give me a \(activity.attributes.grain.lowercased()) update"
        )

        let content = ActivityContent(state: state, staleDate: Calendar.current.date(byAdding: .hour, value: 12, to: .now))
        await activity.update(content)
    }

    /// End all active price alert activities (e.g., end of trading day).
    static func endAll() async {
        for activity in Activity<PriceAlertAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
