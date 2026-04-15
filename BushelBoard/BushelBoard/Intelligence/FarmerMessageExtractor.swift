import Foundation

// MARK: - Entity Extraction via Apple Foundation Models
//
// On iPhone 15 Pro+ (A17 Pro / A18), Apple's on-device language model
// extracts structured entities from farmer messages in <100ms at zero cost.
// This happens BEFORE the message hits the cloud LLM, enabling:
// 1. Pre-filtered context loading (only fetch relevant grains/data)
// 2. Faster response times (Edge Function skips extraction step)
// 3. Lower cloud costs (shorter prompts)
//
// On older devices, this is gracefully skipped — the Edge Function
// handles extraction via the cloud LLM as a fallback.

#if canImport(FoundationModels)
import FoundationModels

/// Structured output from on-device entity extraction.
/// @Generable requires simple types: String, Int, Bool, arrays of these.
@available(iOS 26.0, *)
@Generable
struct FarmerMessageEntities {
    /// Grain names mentioned in the message (e.g., "wheat", "canola")
    var mentionedGrains: [String]

    /// Price strings mentioned (e.g., "$8.50/bu", "-$40 basis", "585")
    var pricesMentioned: [String]

    /// Elevator or company name if mentioned (e.g., "Richardson", "Cargill")
    var elevatorMentioned: String?

    /// Crop condition description if mentioned (e.g., "looking dry", "good stand")
    var cropCondition: String?

    /// The farmer's primary intent for this message
    var intent: String  // "price_check", "storage_decision", "area_outlook", "delivery_log", "equipment", "input_price", "general"
}
#endif

// MARK: - Extractor

/// Extracts entities from farmer messages using on-device Foundation Models
/// when available, with a graceful no-op fallback on older devices.
enum FarmerMessageExtractor {

    /// Extracted entities to pass as metadata alongside the chat message.
    struct ExtractionResult: Codable {
        let mentionedGrains: [String]
        let pricesMentioned: [String]
        let elevatorMentioned: String?
        let cropCondition: String?
        let intent: String
        let extractedOnDevice: Bool  // true = Foundation Models, false = fallback

        /// Empty result for when extraction is unavailable or unnecessary.
        static let empty = ExtractionResult(
            mentionedGrains: [],
            pricesMentioned: [],
            elevatorMentioned: nil,
            cropCondition: nil,
            intent: "general",
            extractedOnDevice: false
        )
    }

    /// Check if on-device extraction is available (iPhone 15 Pro+).
    static var isAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.isAvailable
        }
        #endif
        return false
    }

    /// Extract entities from a farmer's message.
    /// Returns immediately with empty result on unsupported devices.
    static func extract(from message: String) async -> ExtractionResult {
        // Skip extraction for very short messages (quick chips, greetings)
        guard message.count > 10 else {
            return quickExtract(from: message)
        }

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.isAvailable {
            return await extractWithFoundationModels(message)
        }
        #endif

        // Fallback: simple keyword-based extraction (no ML, instant)
        return quickExtract(from: message)
    }

    // MARK: - Foundation Models Extraction

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func extractWithFoundationModels(_ message: String) async -> ExtractionResult {
        do {
            let model = SystemLanguageModel.default
            let session = LanguageModelSession(model: model)

            let prompt = """
            Extract entities from this Canadian farmer's message about grain markets:
            "\(message)"

            Identify: grain names, prices/basis mentioned, elevator names, crop conditions, and the farmer's intent (price_check, storage_decision, area_outlook, delivery_log, equipment, input_price, or general).
            """

            let response = try await session.respond(
                to: prompt,
                generating: FarmerMessageEntities.self
            )

            return ExtractionResult(
                mentionedGrains: response.mentionedGrains,
                pricesMentioned: response.pricesMentioned,
                elevatorMentioned: response.elevatorMentioned,
                cropCondition: response.cropCondition,
                intent: response.intent,
                extractedOnDevice: true
            )
        } catch {
            // Foundation Models failed — fall back to keyword extraction
            return quickExtract(from: message)
        }
    }
    #endif

    // MARK: - Quick Keyword Extraction (Fallback)

    /// Fast, zero-cost keyword extraction for older devices.
    /// Not as accurate as Foundation Models but catches common patterns.
    private static func quickExtract(from message: String) -> ExtractionResult {
        let lower = message.lowercased()

        // Grain detection
        let grainKeywords: [String: String] = [
            "wheat": "Wheat", "canola": "Canola", "barley": "Barley",
            "oats": "Oats", "durum": "Durum", "flax": "Flax",
            "peas": "Peas", "lentils": "Lentils", "soybeans": "Soybeans",
            "corn": "Corn", "rye": "Rye", "mustard": "Mustard",
            "canary": "Canary Seed", "sunflower": "Sunflower",
            "chickpeas": "Chickpeas", "fababeans": "Fababeans",
        ]

        let mentionedGrains = grainKeywords
            .filter { lower.contains($0.key) }
            .map(\.value)

        // Price detection (simple regex-like patterns)
        var prices: [String] = []
        // Match $X.XX patterns
        let words = message.components(separatedBy: .whitespacesAndNewlines)
        for word in words {
            if word.hasPrefix("$") || word.hasPrefix("-$") || word.hasSuffix("/bu") || word.hasSuffix("/t") {
                prices.append(word)
            }
            // Match basis patterns like "-28" or "+15"
            if let first = word.first, (first == "+" || first == "-"),
               word.dropFirst().allSatisfy(\.isNumber), word.count <= 4 {
                prices.append(word)
            }
        }

        // Elevator detection
        let elevatorKeywords = [
            "richardson", "viterra", "cargill", "glencore", "p&h",
            "parrish", "paterson", "ldc", "bunge", "agp", "pioneer",
        ]
        let elevatorMentioned = elevatorKeywords.first { lower.contains($0) }?.capitalized

        // Crop condition detection
        var cropCondition: String?
        let conditionKeywords = ["dry", "wet", "frost", "hail", "excellent", "poor", "good stand", "thin", "lodging"]
        if conditionKeywords.contains(where: { lower.contains($0) }) {
            cropCondition = message // Pass full message — cloud LLM will refine
        }

        // Intent detection
        let intent: String
        if lower.contains("basis") || lower.contains("price") || lower.contains("quote") || lower.contains("bid") {
            intent = "price_check"
        } else if lower.contains("haul") || lower.contains("hold") || lower.contains("sell") || lower.contains("store") || lower.contains("bin") {
            intent = "storage_decision"
        } else if lower.contains("area") || lower.contains("neighbor") || lower.contains("around here") {
            intent = "area_outlook"
        } else if lower.contains("deliver") || lower.contains("hauled") || lower.contains("dropped off") || lower.contains("tonnes") {
            intent = "delivery_log"
        } else if lower.contains("fertilizer") || lower.contains("chemical") || lower.contains("seed cost") || lower.contains("fuel") {
            intent = "input_price"
        } else {
            intent = "general"
        }

        return ExtractionResult(
            mentionedGrains: mentionedGrains,
            pricesMentioned: prices,
            elevatorMentioned: elevatorMentioned,
            cropCondition: cropCondition,
            intent: intent,
            extractedOnDevice: false
        )
    }
}
