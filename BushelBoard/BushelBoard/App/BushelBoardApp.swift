import SwiftUI

@main
struct BushelBoardApp: App {
    @State private var authManager = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authManager)
        }
    }
}
