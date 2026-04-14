---
name: ios-development
description: Swift/SwiftUI patterns, project structure, Supabase SDK integration, design tokens, and typed chat models for the Bushel Board iOS app.
---

# iOS Development — Bushel Board

## Project Structure

Feature-based organization. Each feature is self-contained with its own views, view models, and models.

```
BushelBoard/
  App/
    BushelBoardApp.swift          # @main entry, tab setup, environment
    AppState.swift                # Global app state (auth, active grain, etc.)

  Core/
    Supabase/
      SupabaseClient.swift        # Singleton client init
      AuthManager.swift           # Sign in with Apple, session refresh
      RealtimeManager.swift       # Channel subscriptions
    Design/
      Colors.swift                # Color extensions (wheat, canola, prairie, provinces)
      Typography.swift            # DM Sans + Fraunces font registration
      Tokens.swift                # Spacing, radius, shadow constants
      GlassModifier.swift         # Glassmorphism view modifier
    Extensions/
      Date+CropYear.swift         # Crop year utilities
      Number+Formatting.swift     # Ktonnes, bushels, currency formatting
      View+Conditional.swift      # Conditional view modifiers

  Features/
    Chat/
      ChatView.swift              # Primary chat interface (Tab 1)
      ChatViewModel.swift         # Message handling, streaming, tool dispatch
      MessageBubble.swift         # Renders MessageContent variants
      ChatCardView.swift          # Typed card rendering (summary, rec, status)
      TrustFooterView.swift       # Confidence + sources footer
    GrainDetail/
      GrainDetailSheet.swift      # Full grain dashboard (presented as sheet)
      StanceSpectrumView.swift    # Bull/bear gradient bar
      DeliveryGapChart.swift      # YoY delivery gap (SwiftUI Charts)
      TerminalFlowChart.swift     # Diverging net flow bars
    MyFarm/
      MyFarmView.swift            # Farm dashboard (Tab 2 — Me)
      CropPlanCard.swift          # Per-grain plan with progress bar
      DeliveryTracker.swift       # Delivery log and percentile badges
      SentimentPollView.swift     # Holding/Hauling vote UI
    Onboarding/
      OnboardingFlow.swift        # Sign in with Apple + grain selection
      GrainPickerView.swift       # Multi-select grain grid
      FarmSetupView.swift         # Acres, province, preferred elevator
    Elevator/
      ElevatorPricingSheet.swift  # Nearby elevator prices
      BasisComparisonView.swift   # Basis heat map

  Intelligence/
    IntelligenceService.swift     # Fetch grain_intelligence, market_analysis
    SignalService.swift           # X signal feed + voting
    SentimentService.swift        # Sentiment aggregates + vote submission

  Intents/
    GrainPriceIntent.swift        # Siri/Shortcuts: "What's canola at?"
    MarketBriefIntent.swift       # Siri/Shortcuts: morning market summary

  BushelBoardWidget/
    GrainWidget.swift             # Home screen widget — stance badge + price
    WidgetTimelineProvider.swift  # Background refresh timeline

  BushelBoardWatch/
    WatchApp.swift                # watchOS companion
    GrainGlance.swift             # Complication: stance + price

  Tests/
    UnitTests/
      CropYearTests.swift
      FormattingTests.swift
      ChatViewModelTests.swift
    UITests/
      OnboardingUITests.swift
      ChatFlowUITests.swift
```

## Supabase Swift SDK Patterns

### Client Initialization

```swift
import Supabase

let supabase = SupabaseClient(
    supabaseURL: URL(string: "https://ibgsloyjxdopkvwqcqwh.supabase.co")!,
    supabaseKey: Secrets.supabaseAnonKey
)
```

### Auth — Sign in with Apple

```swift
import AuthenticationServices

func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
    guard let identityToken = credential.identityToken,
          let tokenString = String(data: identityToken, encoding: .utf8) else {
        throw AuthError.missingToken
    }

    try await supabase.auth.signInWithIdToken(
        credentials: .init(
            provider: .apple,
            idToken: tokenString
        )
    )
}

func signOut() async throws {
    try await supabase.auth.signOut()
}

// Session observation
func observeAuthState() -> AsyncStream<AuthChangeEvent> {
    supabase.auth.authStateChanges
}
```

### Queries

```swift
// Fetch grain intelligence
let intelligence: [GrainIntelligence] = try await supabase
    .from("grain_intelligence")
    .select()
    .eq("grain", value: grain)
    .eq("crop_year", value: "2025-2026")
    .order("grain_week", ascending: false)
    .limit(1)
    .execute()
    .value

// Fetch observations with filters
let observations: [CgcObservation] = try await supabase
    .from("cgc_observations")
    .select()
    .eq("grain", value: grain)
    .eq("worksheet", value: "Primary")
    .eq("metric", value: "Deliveries")
    .eq("period", value: "Current Week")
    .eq("crop_year", value: cropYear)
    .execute()
    .value
```

### RPC Calls

```swift
// Call server-side RPC function
struct PipelineVelocityParams: Encodable {
    let p_grain: String
    let p_crop_year: String
}

let velocity: [PipelineVelocityRow] = try await supabase
    .rpc("get_pipeline_velocity", params: PipelineVelocityParams(
        p_grain: "Wheat",
        p_crop_year: "2025-2026"
    ))
    .execute()
    .value

// COT positioning
struct CotParams: Encodable {
    let p_grain: String
    let p_crop_year: String
    let p_weeks_back: Int
}

let cotData: [CotPositionRow] = try await supabase
    .rpc("get_cot_positioning", params: CotParams(
        p_grain: "Canola",
        p_crop_year: "2025-2026",
        p_weeks_back: 8
    ))
    .execute()
    .value
```

### Realtime

```swift
// Subscribe to sentiment vote changes
let channel = supabase.realtime.channel("sentiment-updates")

let subscription = channel.onPostgresChange(
    event: .insert,
    schema: "public",
    table: "grain_sentiment_votes"
) { change in
    // Handle new vote
}

await channel.subscribe()

// Unsubscribe
await supabase.realtime.removeChannel(channel)
```

## Design Tokens in Swift

```swift
import SwiftUI

extension Color {
    // -- Backgrounds --
    static let wheat50  = Color(hex: "f5f3ee")
    static let wheat100 = Color(hex: "e8e4db")
    static let wheat200 = Color(hex: "d4cfc3")
    static let wheat900 = Color(hex: "2a261e")

    // -- Primary --
    static let canola   = Color(hex: "c17f24")

    // -- Semantic --
    static let prairie  = Color(hex: "437a22")
    static let warning  = Color(hex: "d97706")

    // -- Province --
    static let provinceAB = Color(hex: "2e6b9e")
    static let provinceBC = Color(hex: "2f8f83")
    static let provinceSK = Color(hex: "6d9e3a")
    static let provinceMB = Color(hex: "b37d24")
}

extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgb: UInt64 = 0
        scanner.scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255.0,
            green: Double((rgb >> 8) & 0xFF) / 255.0,
            blue: Double(rgb & 0xFF) / 255.0
        )
    }
}

// -- Animation --
enum BushelAnimation {
    static let easeOutExpo = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.4)
    static let staggerDelay: Double = 0.04  // 40ms between siblings
}

// -- Shadows (light mode) --
extension View {
    func glassShadowSm() -> some View {
        self.shadow(color: .black.opacity(0.04), radius: 4, x: 0, y: 2)
    }
    func glassShadowMd() -> some View {
        self.shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 4)
            .shadow(color: .black.opacity(0.04), radius: 1.5, x: 0, y: 1)
    }
    func glassShadowLg() -> some View {
        self.shadow(color: .black.opacity(0.08), radius: 16, x: 0, y: 8)
            .shadow(color: .black.opacity(0.04), radius: 4, x: 0, y: 2)
    }
}
```

## Typed Chat Card Models

```swift
// -- Message content variants --
enum MessageContent {
    case plainText(String)
    case marketSummary(MarketSummaryData)
    case recommendation(RecommendationData)
    case statusLine(String)
}

// -- Market summary card data --
struct MarketSummaryData {
    let grain: String
    let stanceScore: Int              // -100 to +100
    let stanceLabel: String           // "Bullish", "Bearish", "Neutral"
    let takeaway: String              // 1-line headline
    let bullets: [SourcedBullet]      // Evidence with source tags
    let trustFooter: TrustFooterData
}

struct SourcedBullet {
    let text: String
    let sourceTag: SourceTag
}

enum SourceTag: String, Codable {
    case yourHistory    = "your history"
    case localReports   = "local reports"
    case postedPricing  = "posted pricing"
    case nationalMarket = "national market"
    case sponsored      = "sponsored"
}

// -- Recommendation card data --
struct RecommendationData {
    let grain: String
    let action: ActionType            // haul, hold, price, watch
    let confidence: ConfidenceLevel
    let reasoning: String
    let trustFooter: TrustFooterData
}

enum ActionType: String, Codable {
    case haul, hold, price, watch
}

// -- Trust footer --
struct TrustFooterData {
    let confidence: ConfidenceLevel
    let sourceCount: Int
    let asOf: Date
}

enum ConfidenceLevel: String, Codable {
    case earlyRead  = "Early read"
    case solidRead  = "Solid read"
    case strongRead = "Strong read"
}
```

## Testing Conventions

### Unit Tests (XCTest)

```swift
import XCTest
@testable import BushelBoard

final class CropYearTests: XCTestCase {
    func testCurrentCropYear_inSeptember_returnsNewCropYear() {
        // Crop year runs Aug 1 - Jul 31
        let sept2025 = makeDate(year: 2025, month: 9, day: 15)
        XCTAssertEqual(cropYear(for: sept2025), "2025-2026")
    }

    func testCurrentCropYear_inJuly_returnsPreviousCropYear() {
        let july2026 = makeDate(year: 2026, month: 7, day: 15)
        XCTAssertEqual(cropYear(for: july2026), "2025-2026")
    }
}
```

### UI Tests (XCUITest)

Cover these critical flows:

- **Onboarding:** Sign in with Apple -> grain selection -> farm setup -> lands on Chat tab
- **Chat send:** Type message -> receive streamed response -> card renders correctly
- **Sentiment vote:** Navigate to grain -> tap Holding/Hauling -> optimistic UI updates
- **Sheet navigation:** Tap grain mention in chat -> GrainDetailSheet presents -> swipe to dismiss

```swift
final class OnboardingUITests: XCUITestCase {
    func testOnboardingFlow_completesAndLandsOnChat() {
        let app = XCUIApplication()
        app.launch()

        // Sign in with Apple button exists
        XCTAssertTrue(app.buttons["Sign in with Apple"].exists)

        // After auth, grain picker appears
        // Select grains, continue, land on Chat tab
    }
}
```

## Navigation — 2-Tab Architecture

The app uses a minimal 2-tab layout. Everything else surfaces as sheets.

| Tab | Label | View | Purpose |
|-----|-------|------|---------|
| 1 | **Chat** | `ChatView` | Primary interface. All market queries, recommendations, and intel flow through conversation. |
| 2 | **Me** | `MyFarmView` | Farm dashboard: crop plans, deliveries, sentiment votes, percentile badges. |

### Sheet Presentation

All detail views present as sheets from either tab:

- **GrainDetailSheet** — full grain dashboard, presented when tapping a grain mention in chat or a grain card on Me tab.
- **ElevatorPricingSheet** — nearby elevator prices, presented from chat recommendation or Me tab.
- **OnboardingFlow** — full-screen cover on first launch, before tabs are visible.

```swift
@main
struct BushelBoardApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            if appState.isAuthenticated {
                TabView {
                    ChatView()
                        .tabItem { Label("Chat", systemImage: "message") }
                    MyFarmView()
                        .tabItem { Label("Me", systemImage: "person.crop.circle") }
                }
                .tint(.canola)
            } else {
                OnboardingFlow()
            }
        }
    }
}
```
