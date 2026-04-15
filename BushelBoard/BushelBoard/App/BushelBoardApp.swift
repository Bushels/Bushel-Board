import SwiftUI
import UserNotifications

@main
struct BushelBoardApp: App {
    @State private var authManager = AuthManager.shared
    @State private var deepLinkPrompt: String?
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView(deepLinkPrompt: $deepLinkPrompt)
                .environment(authManager)
                .task {
                    await authManager.checkSession()
                    // Register for push after auth succeeds
                    if authManager.isAuthenticated {
                        await PushManager.shared.requestPermissionAndRegister()
                    }
                }
                .onOpenURL { url in
                    handleDeepLink(url)
                }
                .onReceive(NotificationCenter.default.publisher(for: .pushNotificationDeepLink)) { notification in
                    if let prompt = notification.userInfo?["prompt"] as? String {
                        deepLinkPrompt = prompt
                    }
                }
        }
    }

    /// Handle bushels:// deep links from widgets, push notifications, and Siri.
    /// Format: bushels://chat?prompt=Give+me+a+canola+update
    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "bushels",
              url.host == "chat" else { return }

        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let prompt = components.queryItems?.first(where: { $0.name == "prompt" })?.value {
            deepLinkPrompt = prompt
        }
    }
}

// MARK: - AppDelegate (for APNs token registration)

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set push notification delegate
        UNUserNotificationCenter.current().delegate = PushManager.shared
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushManager.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushManager.shared.didFailToRegisterForRemoteNotifications(error: error)
    }
}
