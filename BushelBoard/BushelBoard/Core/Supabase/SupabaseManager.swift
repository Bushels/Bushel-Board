import Foundation
import Supabase

/// Singleton Supabase client for the Bushel Board iOS app.
/// Uses anon key (safe with RLS) — no secrets embedded.
@Observable
final class SupabaseManager {
    static let shared = SupabaseManager()

    static let supabaseURL = "https://ibgsloyjxdopkvwqcqwh.supabase.co"

    let client: SupabaseClient
    let anonKey: String

    private init() {
        let key = ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? ""
        anonKey = key
        client = SupabaseClient(
            supabaseURL: URL(string: Self.supabaseURL)!,
            supabaseKey: key
        )
    }
}
