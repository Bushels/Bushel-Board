import Foundation
import Supabase
import AuthenticationServices
import CryptoKit

/// Manages authentication state for the Bushel Board iOS app.
/// Stores tokens in Keychain (never UserDefaults).
@Observable
final class AuthManager {
    static let shared = AuthManager()

    private(set) var isAuthenticated = false
    private(set) var userProfile: UserProfile?
    private(set) var authError: String?

    private let supabase = SupabaseManager.shared.client

    /// Current nonce for Sign in with Apple flow
    private var currentNonce: String?

    struct UserProfile: Sendable {
        let id: UUID
        let email: String
        let role: String          // "farmer", "elevator", "processor", "observer"
        let farmerName: String?
        let farmName: String?
        let postalCode: String?
        let province: String?
        // Operator-specific fields
        let companyName: String?
        let facilityName: String?
        let facilityType: String?
        let facilityPostalCode: String?

        var fsaCode: String? {
            guard let pc = postalCode ?? facilityPostalCode, pc.count >= 3 else { return nil }
            return String(pc.prefix(3)).uppercased()
        }

        var isOperator: Bool { role == "elevator" || role == "processor" }
    }

    // MARK: - Session

    func checkSession() async {
        do {
            let session = try await supabase.auth.session
            isAuthenticated = true
            await loadProfile(userId: session.user.id)
        } catch {
            isAuthenticated = false
        }
    }

    // MARK: - Sign in with Apple

    /// Generate a nonce for Apple Sign-In. Store the raw nonce, return the SHA256 hash.
    func generateNonce() -> String {
        let nonce = randomNonceString()
        currentNonce = nonce
        return sha256(nonce)
    }

    func signInWithApple(authorization: ASAuthorization) async throws {
        guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let idTokenData = appleCredential.identityToken,
              let idToken = String(data: idTokenData, encoding: .utf8),
              let nonce = currentNonce else {
            throw AuthError.missingCredential
        }

        try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: idToken, nonce: nonce)
        )
        isAuthenticated = true
        currentNonce = nil

        if let session = try? await supabase.auth.session {
            await loadProfile(userId: session.user.id)
        }
    }

    // MARK: - Email Auth

    func signUp(email: String, password: String, role: String, postalCode: String?,
                farmerName: String?, farmName: String?,
                companyName: String? = nil, facilityName: String? = nil,
                facilityType: String? = nil, facilityPostalCode: String? = nil) async throws {
        var metadata: [String: AnyJSON] = ["role": .string(role)]
        if let pc = postalCode { metadata["postal_code"] = .string(pc) }
        if let fn = farmerName { metadata["farmer_name"] = .string(fn) }
        if let fm = farmName { metadata["farm_name"] = .string(fm) }
        // Operator metadata
        if let cn = companyName { metadata["company_name"] = .string(cn) }
        if let fn = facilityName { metadata["facility_name"] = .string(fn) }
        if let ft = facilityType { metadata["facility_type"] = .string(ft) }
        if let fpc = facilityPostalCode { metadata["facility_postal_code"] = .string(fpc) }

        try await supabase.auth.signUp(
            email: email,
            password: password,
            data: metadata
        )
        isAuthenticated = true

        if let session = try? await supabase.auth.session {
            await loadProfile(userId: session.user.id)
        }
    }

    func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
        isAuthenticated = true

        if let session = try? await supabase.auth.session {
            await loadProfile(userId: session.user.id)
        }
    }

    func signOut() async throws {
        try await supabase.auth.signOut()
        isAuthenticated = false
        userProfile = nil
    }

    // MARK: - Profile

    private func loadProfile(userId: UUID) async {
        do {
            let response: [ProfileRow] = try await supabase
                .from("profiles")
                .select()
                .eq("id", value: userId.uuidString)
                .execute()
                .value

            if let row = response.first {
                userProfile = UserProfile(
                    id: userId,
                    email: row.email ?? "",
                    role: row.role ?? "farmer",
                    farmerName: row.farmer_name,
                    farmName: row.farm_name,
                    postalCode: row.postal_code,
                    province: row.province,
                    companyName: row.company_name,
                    facilityName: row.facility_name,
                    facilityType: row.facility_type,
                    facilityPostalCode: row.facility_postal_code
                )
            }
        } catch {
            // Profile load failed — user is still authenticated but profile data unavailable
            userProfile = UserProfile(
                id: userId, email: "", role: "farmer",
                farmerName: nil, farmName: nil, postalCode: nil, province: nil,
                companyName: nil, facilityName: nil, facilityType: nil, facilityPostalCode: nil
            )
        }
    }

    // MARK: - Helpers

    private func randomNonceString(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length
        while remainingLength > 0 {
            let randoms: [UInt8] = (0..<16).map { _ in
                var random: UInt8 = 0
                _ = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
                return random
            }
            for random in randoms {
                if remainingLength == 0 { break }
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }
        return result
    }

    private func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Error

enum AuthError: LocalizedError {
    case missingCredential

    var errorDescription: String? {
        switch self {
        case .missingCredential: return "Could not retrieve Apple ID credentials."
        }
    }
}

// MARK: - Supabase Profile Row (Decodable)

private struct ProfileRow: Decodable {
    let id: String
    let email: String?
    let role: String?
    let farmer_name: String?
    let farm_name: String?
    let postal_code: String?
    let province: String?
    let company_name: String?
    let facility_name: String?
    let facility_type: String?
    let facility_postal_code: String?
}
