import SwiftUI
import WidgetKit

/// Widget extension entry point.
/// Registers all Bushels widgets: home screen (small + medium), lock screen, and Live Activities.
@main
struct BushelBoardWidgetBundle: WidgetBundle {
    var body: some Widget {
        GrainStanceWidget()          // Small: single grain stance badge
        MultiGrainWidget()           // Medium: top 3 grains with sparklines
        LockScreenWidget()           // Lock screen: inline/circular/rectangular
        PriceAlertLiveActivity()     // Dynamic Island + lock screen price alerts
    }
}
