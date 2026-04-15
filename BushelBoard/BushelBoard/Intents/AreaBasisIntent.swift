import AppIntents
import Foundation

/// "Hey Siri, what's canola basis in my area?"
/// Fetches area stance + recent basis reports via Supabase RPC.
struct AreaBasisIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Area Basis"
    static var description = IntentDescription("Get the latest basis and area stance for a grain in your area.")

    @Parameter(title: "Grain", description: "Which grain to check")
    var grain: GrainEntity

    static var parameterSummary: some ParameterSummary {
        Summary("What's \(\.$grain) basis in my area?")
    }

    /// Open the app for full details after the spoken summary.
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let grainName = grain.name

        // Need authenticated session to get area-scoped data
        guard let session = try? await SupabaseManager.shared.client.auth.session else {
            return .result(dialog: "Sign in to Bushels first so I can check your area.")
        }

        // Fetch area stance via the RPC function
        let areaData = await fetchAreaStance(for: grainName, accessToken: session.accessToken)

        if let areaData {
            var response = "\(grainName) in your area: "

            if let basisDesc = areaData.basisDescription {
                response += basisDesc
            } else {
                response += "I don't have recent basis reports yet."
            }

            if let stanceSummary = areaData.stanceSummary {
                response += " \(stanceSummary)"
            }

            if areaData.reportCount > 0 {
                response += " Based on \(areaData.reportCount) local reports."
            } else {
                response += " No local reports in your area this week — you could be the first."
            }

            return .result(dialog: IntentDialog(stringLiteral: response))
        } else {
            return .result(dialog: "I couldn't pull area data right now. Open Bushels and ask me there.")
        }
    }

    // MARK: - Supabase Fetch

    private func fetchAreaStance(for grain: String, accessToken: String) async -> AreaStanceResult? {
        let supabaseURL = SupabaseManager.supabaseURL
        let anonKey = SupabaseManager.shared.anonKey

        // Call the get_area_stance_modifier RPC
        guard let url = URL(string: "\(supabaseURL)/rest/v1/rpc/get_area_stance_modifier") else {
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["p_grain": grain])
        request.timeoutInterval = 5

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return nil
            }

            // Parse the RPC response
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let reportCount = json["report_count"] as? Int ?? 0
                let avgBasis = json["avg_basis"] as? Double
                let holdingPct = json["holding_pct"] as? Double
                let haulingPct = json["hauling_pct"] as? Double

                var basisDesc: String?
                if let basis = avgBasis {
                    let sign = basis >= 0 ? "plus" : "minus"
                    basisDesc = "Average basis is \(sign) \(Int(abs(basis))) from nearby reports."
                }

                var stanceSummary: String?
                if let holding = holdingPct, let hauling = haulingPct {
                    if holding > hauling + 20 {
                        stanceSummary = "Farmers in your area are mostly holding."
                    } else if hauling > holding + 20 {
                        stanceSummary = "Farmers nearby are mostly hauling."
                    } else {
                        stanceSummary = "It's split about even between holding and hauling."
                    }
                }

                return AreaStanceResult(
                    reportCount: reportCount,
                    basisDescription: basisDesc,
                    stanceSummary: stanceSummary
                )
            }

            return nil
        } catch {
            return nil
        }
    }
}

private struct AreaStanceResult {
    let reportCount: Int
    let basisDescription: String?
    let stanceSummary: String?
}
