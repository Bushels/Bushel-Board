import AppIntents

/// Registers Siri shortcuts with the system.
/// These phrases appear in Shortcuts app and respond to voice commands.
struct BushelsShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        // "Hey Siri, ask Bushels about wheat"
        AppShortcut(
            intent: GrainQueryIntent(),
            phrases: [
                "Ask \(.applicationName) about \(\.$grain)",
                "What's \(.applicationName) saying about \(\.$grain)",
                "How's \(\.$grain) looking on \(.applicationName)",
                "\(.applicationName) \(\.$grain) update",
            ],
            shortTitle: "Ask About a Grain",
            systemImageName: "leaf.fill"
        )

        // "Hey Siri, log a canola delivery of 50 tonnes"
        AppShortcut(
            intent: LogDeliveryIntent(),
            phrases: [
                "Log a \(\.$grain) delivery of \(\.$tonnes) tonnes with \(.applicationName)",
                "Record \(\.$tonnes) tonnes of \(\.$grain) on \(.applicationName)",
                "\(.applicationName) log \(\.$tonnes) \(\.$grain)",
            ],
            shortTitle: "Log a Delivery",
            systemImageName: "truck.box.fill"
        )

        // "Hey Siri, what's canola basis in my area?"
        AppShortcut(
            intent: AreaBasisIntent(),
            phrases: [
                "What's \(\.$grain) basis in my area on \(.applicationName)",
                "Check \(\.$grain) basis near me with \(.applicationName)",
                "\(.applicationName) area basis for \(\.$grain)",
            ],
            shortTitle: "Check Area Basis",
            systemImageName: "location.fill"
        )
    }
}
