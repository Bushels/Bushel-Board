import Foundation
import UserNotifications
import UIKit

/// Manages push notification registration, token storage, and deep link handling.
/// Notifications are **conversation starters** — every one deep-links to a pre-filled chat prompt.
@Observable
final class PushManager: NSObject {
    static let shared = PushManager()

    private(set) var isRegistered = false
    private(set) var permissionGranted = false

    private let supabase = SupabaseManager.shared.client

    // MARK: - Registration

    /// Request notification permission and register for remote notifications.
    /// Call this after the user is authenticated (we need a user_id to store the token).
    func requestPermissionAndRegister() async {
        let center = UNUserNotificationCenter.current()

        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            permissionGranted = granted

            if granted {
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        } catch {
            permissionGranted = false
        }
    }

    /// Called by AppDelegate when APNs returns a device token.
    /// Stores the token in Supabase `push_tokens` table.
    func didRegisterForRemoteNotifications(deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()

        Task {
            await storeDeviceToken(tokenString)
            isRegistered = true
        }
    }

    /// Called by AppDelegate when APNs registration fails.
    func didFailToRegisterForRemoteNotifications(error: Error) {
        isRegistered = false
    }

    // MARK: - Token Storage

    /// Upsert the device token in Supabase.
    /// Uses ON CONFLICT (user_id, device_token) to avoid duplicates.
    private func storeDeviceToken(_ token: String) async {
        guard let session = try? await supabase.auth.session else { return }

        let payload: [String: String] = [
            "user_id": session.user.id.uuidString,
            "device_token": token,
            "platform": "ios",
        ]

        do {
            try await supabase
                .from("push_tokens")
                .upsert(payload, onConflict: "user_id,device_token")
                .execute()
        } catch {
            // Token storage failure — non-fatal, will retry on next app launch
        }
    }

    /// Remove the current device's token (e.g., on sign out).
    func removeDeviceToken() async {
        guard let session = try? await supabase.auth.session else { return }

        do {
            try await supabase
                .from("push_tokens")
                .delete()
                .eq("user_id", value: session.user.id.uuidString)
                .execute()
        } catch {
            // Non-fatal
        }
        isRegistered = false
    }

    // MARK: - Notification Handling

    /// Parse a push notification payload into a deep link prompt.
    /// Every Bushels notification carries a `deep_link_prompt` field.
    ///
    /// Notification payload format:
    /// ```json
    /// {
    ///   "aps": { "alert": { "title": "...", "body": "..." }, "sound": "default" },
    ///   "deep_link_prompt": "Give me a canola update",
    ///   "notification_type": "grain_intelligence"
    /// }
    /// ```
    static func deepLinkPrompt(from userInfo: [AnyHashable: Any]) -> String? {
        userInfo["deep_link_prompt"] as? String
    }

    /// Extract notification type for analytics.
    static func notificationType(from userInfo: [AnyHashable: Any]) -> String? {
        userInfo["notification_type"] as? String
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension PushManager: UNUserNotificationCenterDelegate {
    /// Called when notification tapped (app in background or terminated).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo

        if let prompt = Self.deepLinkPrompt(from: userInfo) {
            // Post notification for the app to pick up
            NotificationCenter.default.post(
                name: .pushNotificationDeepLink,
                object: nil,
                userInfo: ["prompt": prompt]
            )
        }

        completionHandler()
    }

    /// Called when notification arrives while app is in foreground.
    /// Show a banner so the farmer sees it even when chatting.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}

// MARK: - Notification Name

extension Notification.Name {
    /// Posted when a push notification tap should navigate to chat with a pre-filled prompt.
    static let pushNotificationDeepLink = Notification.Name("pushNotificationDeepLink")
}
