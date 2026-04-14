import SwiftUI

/// Root view: 2-tab shell (Chat + Me)
/// Grain detail, My Farm, and other views open as sheets from chat.
struct ContentView: View {
    @Environment(AuthManager.self) private var auth

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
            } else {
                SignInView()
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            Tab("Chat", systemImage: "message.fill") {
                ChatView()
            }

            Tab("Me", systemImage: "person.crop.circle") {
                MeView()
            }
        }
        .tint(Color.canola)
    }
}
