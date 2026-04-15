import AppIntents
import Foundation

/// "Hey Siri, ask Bushels about wheat"
/// Opens Bushels chat with a grain-specific query pre-filled.
/// For quick Siri responses, fetches the latest stance directly via Supabase RPC
/// (chat-completion is too slow for Siri's timeout).
struct GrainQueryIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Bushels About a Grain"
    static var description = IntentDescription("Get the latest market stance for a grain from Bushy.")

    /// The grain to ask about. Siri resolves this from natural language.
    @Parameter(title: "Grain", description: "Which grain to ask about")
    var grain: GrainEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Bushels about \(\.$grain)")
    }

    /// When invoked via Siri, return a spoken response + open the app.
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & ProvidesDialog & OpensIntent {
        let grainName = grain.name

        // Fetch latest stance from Supabase (fast, direct RPC — no LLM call)
        let stance = await fetchLatestStance(for: grainName)

        if let stance {
            let dialog = IntentDialog(
                "Bushy says \(grainName.lowercased()) looks \(stance.stanceLabel.lowercased()) this week, with a score of \(stance.formattedScore)."
            )

            // Also set the deep link so the app opens with context
            let openChat = OpenChatIntent()
            openChat.prompt = "Give me a \(grainName.lowercased()) update"

            return .result(dialog: dialog, opensIntent: openChat)
        } else {
            let dialog = IntentDialog(
                "I don't have a fresh read on \(grainName.lowercased()) right now. Let me pull up the latest in chat."
            )

            let openChat = OpenChatIntent()
            openChat.prompt = "Give me a \(grainName.lowercased()) update"

            return .result(dialog: dialog, opensIntent: openChat)
        }
    }

    // MARK: - Supabase Fetch

    private func fetchLatestStance(for grain: String) async -> StanceResult? {
        let supabaseURL = SupabaseManager.supabaseURL
        let anonKey = SupabaseManager.shared.anonKey

        guard var components = URLComponents(string: "\(supabaseURL)/rest/v1/market_analysis") else {
            return nil
        }

        let cropYear = WidgetDataProvider.currentCropYear()

        components.queryItems = [
            URLQueryItem(name: "select", value: "grain,stance_score,generated_at"),
            URLQueryItem(name: "grain", value: "eq.\(grain)"),
            URLQueryItem(name: "crop_year", value: "eq.\(cropYear)"),
            URLQueryItem(name: "order", value: "generated_at.desc"),
            URLQueryItem(name: "limit", value: "1"),
        ]

        var request = URLRequest(url: components.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 5

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let rows = try JSONDecoder().decode([MarketAnalysisCompact].self, from: data)
            guard let row = rows.first, let score = row.stance_score else { return nil }

            return StanceResult(score: score)
        } catch {
            return nil
        }
    }
}

// MARK: - Stance Result

private struct StanceResult {
    let score: Int

    var stanceLabel: String {
        if score >= 20 { return "Bullish" }
        if score >= 5 { return "Leaning bullish" }
        if score <= -20 { return "Bearish" }
        if score <= -5 { return "Leaning bearish" }
        return "Neutral"
    }

    var formattedScore: String {
        let sign = score >= 0 ? "plus" : "minus"
        return "\(sign) \(abs(score))"
    }
}

private struct MarketAnalysisCompact: Decodable {
    let grain: String
    let stance_score: Int?
    let generated_at: String?
}

// MARK: - Grain Entity (for Siri parameter resolution)

struct GrainEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Grain")
    static var defaultQuery = GrainEntityQuery()

    var id: String
    var name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }

    /// Common prairie grains for Siri resolution
    static let allGrains: [GrainEntity] = [
        GrainEntity(id: "wheat", name: "Wheat"),
        GrainEntity(id: "canola", name: "Canola"),
        GrainEntity(id: "barley", name: "Barley"),
        GrainEntity(id: "oats", name: "Oats"),
        GrainEntity(id: "durum", name: "Durum"),
        GrainEntity(id: "flax", name: "Flax"),
        GrainEntity(id: "peas", name: "Peas"),
        GrainEntity(id: "lentils", name: "Lentils"),
        GrainEntity(id: "soybeans", name: "Soybeans"),
        GrainEntity(id: "corn", name: "Corn"),
        GrainEntity(id: "rye", name: "Rye"),
        GrainEntity(id: "mustard", name: "Mustard"),
        GrainEntity(id: "canary-seed", name: "Canary Seed"),
        GrainEntity(id: "sunflower", name: "Sunflower"),
        GrainEntity(id: "chickpeas", name: "Chickpeas"),
        GrainEntity(id: "fababeans", name: "Fababeans"),
    ]
}

struct GrainEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [GrainEntity] {
        GrainEntity.allGrains.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [GrainEntity] {
        GrainEntity.allGrains
    }
}

// MARK: - Helper Intent: Open Chat

/// Internal intent used to chain from query intents → app opening with prompt.
struct OpenChatIntent: OpenIntent {
    static var title: LocalizedStringResource = "Open Bushels Chat"

    @Parameter(title: "Prompt")
    var prompt: String?

    var target: OpenChatTarget {
        OpenChatTarget(prompt: prompt)
    }
}

struct OpenChatTarget: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Chat")
    static var defaultQuery = OpenChatTargetQuery()

    var id: String = "chat"
    var prompt: String?

    init(prompt: String? = nil) {
        self.prompt = prompt
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "Chat")
    }
}

struct OpenChatTargetQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [OpenChatTarget] {
        [OpenChatTarget()]
    }
}
