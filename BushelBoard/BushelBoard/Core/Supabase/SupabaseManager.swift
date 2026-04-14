import Foundation
import Supabase

/// Singleton Supabase client for the Bushel Board iOS app.
/// Uses anon key (safe with RLS) — no secrets embedded.
@Observable
final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: URL(string: "https://ibgsloyjxdopkvwqcqwh.supabase.co")!,
            supabaseKey: ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? ""
        )
    }
}
