import Foundation
import WidgetKit

// MARK: - App Group Constants

/// Shared App Group for data exchange between main app and widget extension.
/// Configure in Xcode: Signing & Capabilities → App Groups for both targets.
enum AppGroupConstants {
    static let suiteName = "group.com.bushels.bushelboard"
    static let grainStanceKey = "widget_grain_stance"
    static let cropPlanGrainsKey = "widget_crop_plan_grains"
    static let lastUpdatedKey = "widget_last_updated"
}

// MARK: - Widget Data Models

/// A single grain's stance snapshot for widget display.
struct GrainStanceEntry: Codable, Identifiable {
    let grain: String
    let stanceBadge: String       // "Bullish +15", "Bearish -8"
    let stanceScore: Int          // -100 to +100
    let trendDirection: String    // "up", "down", "flat"
    let sparklinePrices: [Double] // Last 7 data points for mini chart
    let updatedAt: Date

    var id: String { grain }

    /// SF Symbol for trend arrow
    var trendSymbol: String {
        switch trendDirection {
        case "up": return "arrow.up.right"
        case "down": return "arrow.down.right"
        default: return "arrow.right"
        }
    }

    /// Whether stance is bullish (positive score)
    var isBullish: Bool { stanceScore > 0 }
}

/// Timeline entry for the small single-grain widget
struct SingleGrainEntry: TimelineEntry {
    let date: Date
    let grain: GrainStanceEntry?
    let isPlaceholder: Bool

    static var placeholder: SingleGrainEntry {
        SingleGrainEntry(
            date: .now,
            grain: GrainStanceEntry(
                grain: "Canola",
                stanceBadge: "Bullish +15",
                stanceScore: 15,
                trendDirection: "up",
                sparklinePrices: [580, 585, 590, 588, 592, 595, 598],
                updatedAt: .now
            ),
            isPlaceholder: true
        )
    }
}

/// Timeline entry for the medium multi-grain widget
struct MultiGrainEntry: TimelineEntry {
    let date: Date
    let grains: [GrainStanceEntry]
    let isPlaceholder: Bool

    static var placeholder: MultiGrainEntry {
        MultiGrainEntry(
            date: .now,
            grains: [
                GrainStanceEntry(grain: "Canola", stanceBadge: "Bullish +15", stanceScore: 15, trendDirection: "up", sparklinePrices: [580, 585, 590, 588, 592, 595, 598], updatedAt: .now),
                GrainStanceEntry(grain: "Wheat", stanceBadge: "Neutral +3", stanceScore: 3, trendDirection: "flat", sparklinePrices: [320, 318, 322, 319, 321, 320, 322], updatedAt: .now),
                GrainStanceEntry(grain: "Barley", stanceBadge: "Bearish -8", stanceScore: -8, trendDirection: "down", sparklinePrices: [280, 278, 275, 272, 270, 268, 265], updatedAt: .now),
            ],
            isPlaceholder: true
        )
    }
}

/// Timeline entry for lock screen inline accessory widget
struct LockScreenEntry: TimelineEntry {
    let date: Date
    let grain: String
    let stanceScore: Int
    let isPlaceholder: Bool

    static var placeholder: LockScreenEntry {
        LockScreenEntry(date: .now, grain: "Canola", stanceScore: 15, isPlaceholder: true)
    }
}

// MARK: - Data Provider

/// Fetches grain stance data from Supabase and caches in App Group UserDefaults.
/// Used by all widget TimelineProviders.
enum WidgetDataProvider {

    /// Read cached grain stances from App Group shared storage.
    static func cachedGrainStances() -> [GrainStanceEntry] {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
              let data = defaults.data(forKey: AppGroupConstants.grainStanceKey),
              let entries = try? JSONDecoder().decode([GrainStanceEntry].self, from: data) else {
            return []
        }
        return entries
    }

    /// Read cached crop plan grain names (ordered by farmer priority).
    static func cachedCropPlanGrains() -> [String] {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
              let grains = defaults.stringArray(forKey: AppGroupConstants.cropPlanGrainsKey) else {
            return ["Canola", "Wheat", "Barley"] // sensible prairie defaults
        }
        return grains
    }

    /// Fetch fresh grain stance data from Supabase and update the cache.
    /// Called by widget timeline providers during getTimeline().
    static func fetchAndCacheStances() async -> [GrainStanceEntry] {
        // Build the Supabase REST URL for grain_intelligence + market_analysis
        let supabaseURL = "https://ibgsloyjxdopkvwqcqwh.supabase.co"
        let anonKey = ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? ""

        // Fetch latest market_analysis for stance scores
        guard var urlComponents = URLComponents(string: "\(supabaseURL)/rest/v1/market_analysis") else {
            return cachedGrainStances()
        }

        let cropYear = currentCropYear()

        // Get the latest grain week's analysis for each grain
        urlComponents.queryItems = [
            URLQueryItem(name: "select", value: "grain,stance_score,generated_at"),
            URLQueryItem(name: "crop_year", value: "eq.\(cropYear)"),
            URLQueryItem(name: "order", value: "generated_at.desc"),
            URLQueryItem(name: "limit", value: "16"), // one per grain, latest
        ]

        var request = URLRequest(url: urlComponents.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return cachedGrainStances()
            }

            let rows = try JSONDecoder().decode([MarketAnalysisRow].self, from: data)

            // Deduplicate: keep only the latest per grain
            var latestByGrain: [String: MarketAnalysisRow] = [:]
            for row in rows {
                if latestByGrain[row.grain] == nil {
                    latestByGrain[row.grain] = row
                }
            }

            // Also fetch recent prices for sparklines
            let pricesByGrain = await fetchRecentPrices(supabaseURL: supabaseURL, anonKey: anonKey)

            let entries = latestByGrain.values.map { row in
                let score = row.stance_score ?? 0
                let prices = pricesByGrain[row.grain] ?? []
                let trend: String
                if score > 5 { trend = "up" }
                else if score < -5 { trend = "down" }
                else { trend = "flat" }

                return GrainStanceEntry(
                    grain: row.grain,
                    stanceBadge: formatStanceBadge(score: score),
                    stanceScore: score,
                    trendDirection: trend,
                    sparklinePrices: prices,
                    updatedAt: row.parsedDate ?? .now
                )
            }
            .sorted { $0.grain < $1.grain }

            // Cache to App Group
            if let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
               let encoded = try? JSONEncoder().encode(entries) {
                defaults.set(encoded, forKey: AppGroupConstants.grainStanceKey)
                defaults.set(Date().timeIntervalSince1970, forKey: AppGroupConstants.lastUpdatedKey)
            }

            return entries

        } catch {
            return cachedGrainStances()
        }
    }

    /// Fetch recent grain prices for sparkline display (last 7 data points per grain).
    private static func fetchRecentPrices(supabaseURL: String, anonKey: String) async -> [String: [Double]] {
        guard var urlComponents = URLComponents(string: "\(supabaseURL)/rest/v1/grain_prices") else {
            return [:]
        }

        urlComponents.queryItems = [
            URLQueryItem(name: "select", value: "grain,settlement_price,price_date"),
            URLQueryItem(name: "order", value: "price_date.desc"),
            URLQueryItem(name: "limit", value: "112"), // ~7 days × 16 grains
        ]

        var request = URLRequest(url: urlComponents.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let rows = try JSONDecoder().decode([GrainPriceRow].self, from: data)

            var byGrain: [String: [Double]] = [:]
            for row in rows {
                let price = Double(row.settlement_price) ?? 0
                if price > 0 {
                    byGrain[row.grain, default: []].append(price)
                }
            }

            // Reverse each array (oldest first for sparkline) and cap at 7
            return byGrain.mapValues { Array($0.reversed().suffix(7)) }
        } catch {
            return [:]
        }
    }

    // MARK: - Helpers

    static func formatStanceBadge(score: Int) -> String {
        let label: String
        if score >= 20 { label = "Bullish" }
        else if score >= 5 { label = "Leaning Bull" }
        else if score <= -20 { label = "Bearish" }
        else if score <= -5 { label = "Leaning Bear" }
        else { label = "Neutral" }

        let sign = score >= 0 ? "+" : ""
        return "\(label) \(sign)\(score)"
    }

    /// CGC crop year: August 1 to July 31
    static func currentCropYear() -> String {
        let cal = Calendar.current
        let now = Date()
        let year = cal.component(.year, from: now)
        let month = cal.component(.month, from: now)
        if month >= 8 { return "\(year)-\(year + 1)" }
        return "\(year - 1)-\(year)"
    }
}

// MARK: - Main App Cache Writer

/// Call from the main app after receiving new grain intelligence to update widget data.
/// The main app has authenticated access; widgets use the cached snapshot.
enum WidgetCacheWriter {

    /// Write grain stance entries to the shared App Group for widget consumption.
    static func updateGrainStances(_ entries: [GrainStanceEntry]) {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName),
              let encoded = try? JSONEncoder().encode(entries) else { return }
        defaults.set(encoded, forKey: AppGroupConstants.grainStanceKey)
        defaults.set(Date().timeIntervalSince1970, forKey: AppGroupConstants.lastUpdatedKey)

        // Tell WidgetKit to refresh
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Write the farmer's crop plan grain list (ordered) for the multi-grain widget.
    static func updateCropPlanGrains(_ grains: [String]) {
        guard let defaults = UserDefaults(suiteName: AppGroupConstants.suiteName) else { return }
        defaults.set(grains, forKey: AppGroupConstants.cropPlanGrainsKey)
        WidgetCenter.shared.reloadTimelines(ofKind: "MultiGrainWidget")
    }
}

// MARK: - Deep Link

/// URL scheme for widget tap → chat with pre-filled prompt.
/// Handled in BushelBoardApp.swift via .onOpenURL().
enum WidgetDeepLink {
    static func chatURL(grain: String) -> URL {
        let prompt = "Give me a \(grain.lowercased()) update"
        let encoded = prompt.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? prompt
        return URL(string: "bushels://chat?prompt=\(encoded)")!
    }

    static func overviewURL() -> URL {
        URL(string: "bushels://chat?prompt=What%27s+the+market+looking+like+today%3F")!
    }
}

// MARK: - Supabase Row Decoders (Widget-local)

private struct MarketAnalysisRow: Decodable {
    let grain: String
    let stance_score: Int?
    let generated_at: String?

    var parsedDate: Date? {
        guard let str = generated_at else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: str)
    }
}

private struct GrainPriceRow: Decodable {
    let grain: String
    let settlement_price: String
    let price_date: String?
}
