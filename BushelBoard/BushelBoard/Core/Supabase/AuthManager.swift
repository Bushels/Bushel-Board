import Foundation
import Supabase
import AuthenticationServices

/// Manages authentication state for the Bushel Board iOS app.
/// Stores tokens in Keychain (never UserDefaults).
@Observable
final class AuthManager {
    static let shared = AuthManager()

    private(set) var isAuthenticated = false
    private(set) var userProfile: UserProfile?

    private let supabase = SupabaseManager.shared.client

    struct UserProfile {
        let id: UUID
        let email: String
        let role: String          // "farmer", "elevator", "processor", "observer"
        let farmerName: String?
        let farmName: String?
        let postalCode: String?
        let province: String?
        var fsaCode: String? {
            guard let pc = postalCode, pc.count >= 3 else { return nil }
            return String(pc.prefix(3)).uppercased()
        }
    }

    func checkSession() async {
        do {
            let session = try await supabase.auth.session
            isAuthenticated = true
            await loadProfile(userId: session.user.id)
        } catch {
            isAuthenticated = false
        }
    }

    func signInWithApple(idToken: String, nonce: String) async throws {
        try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: idToken, nonce: nonce)
        )
        isAuthenticated = true
    }

    func signUp(email: String, password: String, metadata: [String: AnyJSON]) async throws {
        try await supabase.auth.signUp(
            email: email,
            password: password,
            data: metadata
        )
        isAuthenticated = true
    }

    func signOut() async throws {
        try await supabase.auth.signOut()
        isAuthenticated = false
        userProfile = nil
    }

    private func loadProfile(userId: UUID) async {
        // Load from profiles table after auth
    }
}
