import SwiftUI

/// Root view: 2-tab shell (Chat + Me)
/// Grain detail, My Farm, and other views open as sheets from chat.
struct ContentView: View {
    @Environment(AuthManager.self) private var auth
    @Binding var deepLinkPrompt: String?

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView(deepLinkPrompt: $deepLinkPrompt)
            } else {
                SignInView()
            }
        }
    }
}

struct MainTabView: View {
    @Binding var deepLinkPrompt: String?
    @State private var selectedTab: AppTab = .chat

    enum AppTab {
        case chat, me
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Chat", systemImage: "message.fill", value: .chat) {
                ChatView(deepLinkPrompt: $deepLinkPrompt)
            }

            Tab("Me", systemImage: "person.crop.circle", value: .me) {
                MeView()
            }
        }
        .tint(Color.canola)
        .onChange(of: deepLinkPrompt) {
            // When a deep link arrives, switch to chat tab
            if deepLinkPrompt != nil {
                selectedTab = .chat
            }
        }
    }
}
