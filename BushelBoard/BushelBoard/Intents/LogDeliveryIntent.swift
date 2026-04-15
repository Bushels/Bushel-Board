import AppIntents
import Foundation

/// "Hey Siri, log a canola delivery of 50 tonnes"
/// Creates a delivery record via Supabase without opening the app.
struct LogDeliveryIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Grain Delivery"
    static var description = IntentDescription("Log a grain delivery to your crop plan in Bushels.")

    @Parameter(title: "Grain", description: "Which grain was delivered")
    var grain: GrainEntity

    @Parameter(title: "Tonnes", description: "How many tonnes delivered")
    var tonnes: Double

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$tonnes) tonnes of \(\.$grain)")
    }

    /// Delivery logging can happen without opening the app.
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let grainName = grain.name

        guard tonnes > 0, tonnes < 10_000 else {
            return .result(dialog: "That doesn't sound right — \(Int(tonnes)) tonnes? Try again with the actual amount.")
        }

        // Need authenticated session
        guard let session = try? await SupabaseManager.shared.client.auth.session else {
            return .result(dialog: "You need to be signed in to Bushels to log deliveries. Open the app and sign in first.")
        }

        let cropYear = WidgetDataProvider.currentCropYear()

        // Insert delivery record into crop_plan_deliveries
        let payload: [String: Any] = [
            "user_id": session.user.id.uuidString,
            "grain": grainName,
            "crop_year": cropYear,
            "delivered_kt": tonnes / 1000.0,  // Convert tonnes to kilotonnes
            "delivery_date": ISO8601DateFormatter().string(from: Date()),
            "source": "siri",
        ]

        do {
            // Use the Supabase REST API directly since supabase-swift
            // may not be available in the Intents extension context
            let supabaseURL = SupabaseManager.supabaseURL
            let anonKey = SupabaseManager.shared.anonKey

            guard let url = URL(string: "\(supabaseURL)/rest/v1/crop_plan_deliveries") else {
                return .result(dialog: "Something went wrong. Try logging it in the app.")
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
            request.timeoutInterval = 10

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                return .result(dialog: "Couldn't save that delivery. Try again in the app.")
            }

            // Update widget data to reflect new delivery
            WidgetCacheWriter.updateCropPlanGrains(
                WidgetDataProvider.cachedCropPlanGrains()
            )

            return .result(dialog: "Done — logged \(Int(tonnes)) tonnes of \(grainName.lowercased()). Nice haul!")

        } catch {
            return .result(dialog: "Something went wrong saving that delivery. Try logging it in the app.")
        }
    }
}
