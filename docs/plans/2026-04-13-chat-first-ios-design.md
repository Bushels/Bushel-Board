# Chat-First Predictive Pricing — iOS App Design

**Date:** 2026-04-13
**Status:** Approved
**Author:** Kyle + Claude (brainstorming session)
**Track:** 36 — Chat-First iOS Pivot

---

## Executive Summary

Bushel Board pivots from a dashboard-first web app to a **chat-first predictive pricing app** for iPhone. Farmers interact with a conversational "Grain Analyst" that provides hyper-local market predictions, naturally collects local market data through dialogue, and gets smarter with every conversation.

**Core loop:** Farmer asks about local market → Analyst responds with phased "thinking aloud" → naturally collects local data (elevator prices, basis, crop conditions) → uses data + existing CGC/CFTC/USDA pipeline to give area-adjusted bullish/bearish predictions → flywheel improves predictions for all farmers in that area.

**Platform:** Native iOS (Swift 6 + SwiftUI) with Apple Watch companion. Apple Intelligence integration (on-device Foundation Models, Siri, Widgets, Live Activities). Backend stays on Supabase. LLM-agnostic architecture with Grok 4.20-reasoning as primary model.

**Separate from:** USA/Hermes expansion (feat/us-thesis-lane-hardening branch).

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary interface | Chat IS the app | Maximizes engagement, every conversation generates data |
| Area definition | Postal FSA prefix (3 chars, e.g., T0L) | Already collected at signup, maps to rural delivery zones |
| Data collection style | Natural conversation first | Answer fully, weave in max 1 follow-up ask per response |
| Architecture approach | B: Local Market Intelligence | Structured data layer + tool-calling extraction + area stance modifier |
| iOS framework | Swift Native + SwiftUI | Required for Apple Intelligence, Siri, Widgets, Live Activities |
| LLM | Grok 4.20 primary, model-agnostic | Best persona + native X search + cheapest ($0.006/conv) |
| Apple Watch | Yes, companion app | Grain complications, haptic alerts, Siri relay |

---

## 1. Platform Architecture

### Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| iOS App | Swift 6 + SwiftUI | First-class Apple Intelligence, Siri, Widgets, Live Activities |
| watchOS Companion | WatchKit + WatchConnectivity | Grain price complications, haptic alerts, Siri relay |
| Backend | Supabase (existing) | PostgreSQL, Auth, Edge Functions, Realtime — all stay |
| API Layer | Supabase REST + Edge Functions | `supabase-swift` SDK for native iOS integration |
| Chat LLM | Grok 4.20 (primary, swappable) | Best persona + X search + cost; architecture stays model-agnostic |
| On-Device AI | Apple Foundation Models | Pre-process messages, extract entities before cloud call |
| Web Dashboard | Vercel (Next.js, existing) | Secondary companion, not primary interface |

### System Topology

```
EXISTING (Supabase + Vercel)          NEW (Xcode + Swift)
┌──────────────────────────┐          ┌──────────────────────────┐
│ Supabase PostgreSQL      │◄────────►│ iOS App (SwiftUI)        │
│ - cgc_observations       │  REST/   │ - Chat-first UI          │
│ - grain_intelligence     │  Realtime│ - Apple Intelligence     │
│ - market_analysis        │          │ - Siri App Intents       │
│ - crop_plans             │          │ - Widgets + Live Activity│
│ - chat_threads/messages  │          │ - On-device pre-process  │
│ - local_market_intel NEW │          ├──────────────────────────┤
│ - farmer_memory NEW      │          │ watchOS Companion        │
├──────────────────────────┤          │ - Price complications    │
│ Edge Functions           │          │ - Haptic alerts          │
│ - analyze-grain-market   │          │ - Siri relay             │
│ - generate-farm-summary  │          └──────────────────────────┘
│ - chat-completion NEW    │
├──────────────────────────┤
│ Vercel (Next.js)         │
│ - Web dashboard (secondary)│
│ - API cron routes        │
└──────────────────────────┘
```

### Chat Backend Decision

The iOS app calls a **new Supabase Edge Function** (`chat-completion`) directly via `supabase-swift`. This avoids Vercel serverless cold starts and keeps the chat on the same network as the database. The existing Vercel chat route stays for the web dashboard.

### Navigation Model

| Route (iOS) | What | Priority |
|-------------|------|----------|
| Chat (root) | Full-screen conversation | Primary |
| Grain Detail | Dashboard view per grain | Secondary — linked from chat |
| My Farm | Crop plans, deliveries | Secondary — linked from chat |
| Overview | Market overview | Tertiary — power users |

---

## 2. Apple Intelligence Integration

### 2.1 On-Device Foundation Models — Message Pre-Processing

Before a farmer's message hits the cloud LLM, Apple's on-device model extracts structured entities in <100ms at zero cost:

```swift
@Generable
struct FarmerMessageEntities {
    var mentionedGrains: [String]       // "wheat", "canola"
    var pricesMentioned: [PriceEntity]  // "$8.50/bu", "-$40 basis"
    var locationMentioned: String?      // "near Lethbridge"
    var elevatorMentioned: String?      // "Cargill", "Richardson"
    var cropCondition: String?          // "looking dry", "good stand"
    var intent: MessageIntent           // .priceCheck, .storageDecision, .areaOutlook
}
```

**Device requirement:** iPhone 15 Pro+ (A17 Pro / A18 chips). Older devices fall back to cloud-side parsing by the LLM.

### 2.2 Siri App Intents

| Voice command | Action |
|---------------|--------|
| "Hey Siri, ask Bushel Board about wheat" | Opens app, pre-fills chat with wheat outlook query |
| "Hey Siri, what's my grain analyst saying?" | Returns last chat summary as spoken response |
| "Hey Siri, log a canola delivery of 50 tonnes" | Creates delivery entry directly via App Intent |
| "Hey Siri, what's canola basis in my area?" | Returns area stance + latest basis reports |

### 2.3 WidgetKit — Home Screen & Lock Screen

| Size | Content |
|------|---------|
| Small | Single grain stance badge (e.g., "Canola: Bullish +15") with trend arrow |
| Medium | Top 3 grains from crop plan with stance + 7-day price sparkline |
| Lock screen | Compact price + stance for primary grain |

Widgets update hourly via background refresh, pulling from cached grain intelligence.

### 2.4 Live Activities — Dynamic Island & Lock Screen

Triggered by push notification from Supabase Edge Function when:
- Grain price moves >2% intraday
- Basis narrows past user-set threshold
- New grain intelligence published (weekly)

```
┌─────────────────────────────────────┐
│ 🌾 Wheat basis narrowed to -$28    │
│    Your analyst says: worth a look  │
│              [Open Chat]            │
└─────────────────────────────────────┘
```

Live Activities last up to 12 hours, perfect for market-day tracking.

### 2.5 Apple Watch

| Feature | Implementation |
|---------|----------------|
| Complication | Grain stance badge on watch face (updates hourly) |
| Haptic alert | Tap when basis crosses user-set threshold |
| Siri relay | Same App Intents work on watch |
| Glance view | Top 3 grains + stance + sparkline |

---

## 3. Local Market Intelligence Data Model

This is the flywheel engine — where farmer conversations become area-level predictions.

### 3.1 New Table: `local_market_intel`

```sql
CREATE TABLE local_market_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  fsa_code text NOT NULL,              -- first 3 chars of postal code (e.g., "T0L")
  grain text NOT NULL,
  data_type text NOT NULL,             -- 'basis', 'elevator_price', 'crop_condition', 'yield_estimate', 'quality'
  value_numeric numeric,               -- for prices/basis/yields
  value_text text,                     -- for conditions ("dry", "excellent stand")
  elevator_name text,                  -- optional: which elevator
  confidence text DEFAULT 'reported',  -- 'reported' vs 'inferred'
  reported_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,     -- auto-calculated based on data_type
  source_thread_id uuid REFERENCES chat_threads,
  extracted_by text DEFAULT 'chat',    -- 'chat', 'manual_entry', 'siri'
  CONSTRAINT valid_data_type CHECK (
    data_type IN ('basis', 'elevator_price', 'crop_condition', 'yield_estimate', 'quality')
  )
);

CREATE INDEX idx_local_intel_area ON local_market_intel(fsa_code, grain, data_type, reported_at DESC);
CREATE INDEX idx_local_intel_active ON local_market_intel(fsa_code, grain) WHERE expires_at > now();

-- RLS: users see own reports; area aggregates via RPC (never raw data from other users)
ALTER TABLE local_market_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own intel" ON local_market_intel
  FOR ALL USING (auth.uid() = user_id);
```

### 3.2 Data Decay Rules

| Data type | Expires after | Rationale |
|-----------|---------------|-----------|
| Basis | 7 days | Changes weekly |
| Elevator price | 3 days | Can change daily |
| Crop condition | 14 days | Evolves slowly |
| Yield estimate | 30 days | Season-long signal |
| Quality report | 30 days | Post-harvest, stable |

### 3.3 New Table: `farmer_memory`

Persistent context the analyst remembers across conversations:

```sql
CREATE TABLE farmer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  memory_key text NOT NULL,             -- 'preferred_elevator', 'local_basis_last_known', etc.
  memory_value text NOT NULL,
  grain text,                           -- optional grain scope
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_thread_id uuid REFERENCES chat_threads,
  UNIQUE(user_id, memory_key, grain)
);

ALTER TABLE farmer_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own memory" ON farmer_memory
  FOR ALL USING (auth.uid() = user_id);
```

Powers: "Last time you mentioned your local elevator was only offering -$40 basis on canola — want me to check if that's moved?"

### 3.4 Area Stance Modifier RPC

```sql
-- get_area_stance_modifier(p_fsa_code text, p_grain text)
-- Returns: integer adjustment to national stance score
-- Logic:
--   basis_signal: If local basis narrowing → positive modifier
--   condition_signal: If conditions poor (supply concern) → positive modifier
--   price_signal: If elevator prices above regional avg → positive modifier
--   Weighted by recency and report count
--   Capped at ±30 points
--   Returns NULL if <3 active reports (cold start protection)
```

Chat output: "We put wheat at Bullish +5 nationally, but in your area (T0L) it's closer to +20 — here's why..."

### 3.5 Privacy Thresholds

| Reports in FSA | Behavior |
|----------------|----------|
| 0 | National stance only. "Your area is new to me — help me build it." |
| 1-2 | National stance + vague: "I've heard from a couple farmers nearby..." |
| 3-4 | Area modifier shown with low confidence: "Early reads suggest..." |
| 5+ | Full area stance: "Your area is running at +20, here's why..." |

Adjacent FSA blending: If neighboring FSAs have data, borrow with 50% decay weight.

---

## 4. The Conversation Flow

### 4.1 Phased Response ("Thinking Aloud")

Every analyst response streams in 4 phases to build credibility:

| Phase | Timing | Purpose | Example |
|-------|--------|---------|---------|
| 1. Acknowledgment | Instant (<1s) | Show you heard them | "Good question — let me pull up what I'm seeing..." |
| 2. Data scan | 1-2s | Show you're checking data | "Nationally we've got wheat at +5. Your area's running hotter though..." |
| 3. Analysis | 2-4s | Walk through reasoning | "Terminal receipts are lagging, elevators competing harder, specs still long..." |
| 4. Recommendation + ask | Final | Actionable + 1 follow-up | "At -28 basis, worth a look. What are conditions like in your area?" |

Implementation: System prompt instructs the LLM to structure responses this way. Streaming SSE handles the pacing naturally.

### 4.2 Tool-Calling for Data Extraction

The LLM has structured tools it invokes mid-conversation:

| Tool | Trigger | Storage |
|------|---------|---------|
| `save_local_intel` | Farmer mentions basis, price, conditions | `local_market_intel` |
| `update_farmer_memory` | Farmer reveals elevator, preference, farm detail | `farmer_memory` |
| `get_area_stance` | Analyst compares national vs local | Returns modifier |
| `search_market` | Real-time price/news verification | X/web search (Grok native) |
| `create_crop_plan` | New farmer describes their operation | `crop_plans` |

### 4.3 Natural Ask Pattern

System prompt rules:
- Answer the farmer's question FULLY first
- Max 1 follow-up ask per response, framed as helpful not transactional
- Priority: basis > elevator prices > crop conditions > yield estimates
- Skip ask if farmer already shared data this turn
- Skip if asked in last 2 turns
- Never ask for data already in `farmer_memory`

### 4.4 Example Conversation

**Farmer:** "What's it looking like for grain in my local area? Should I be hauling my wheat or saving it?"

**Behind the scenes:**
1. On-device Foundation Model: `{ grains: ["wheat"], intent: .storageDecision }`
2. Edge Function loads: profile, crop plans, farmer_memory, national stance (+5), area intel (T0L), Viking L0+L1, prices, COT, logistics, X signals

**Analyst (streamed):**
> "Hey Kyle — good timing on that question."
>
> "So nationally we've got wheat at Bullish +5 this week. But your area's been running hotter. Let me dig into why..."
>
> "Terminal receipts out of Thunder Bay are behind last year's pace — country elevators are competing harder for grain. Three farmers near you reported basis narrowing by $8-12 over the past two weeks. The specs haven't given up on this rally yet either — managed money still building longs."
>
> "For your neighborhood, I'd put wheat closer to +20. If your elevator is offering better than -$30 basis on #1 CWRS, that's worth looking at this week. Speaking of which — what's your local elevator quoting on wheat these days?"

**Farmer:** "Richardson is at -28 on the one hard, and Cargill is -32"

**Behind the scenes:** LLM calls `save_local_intel` twice + updates `farmer_memory`

**Analyst:**
> "Ok lemme think about this for a sec..."
>
> "-28 at Richardson is actually better than what most of the T0L area has been seeing. Two weeks ago the reports I had were in the -35 to -40 range. That's a $7-12 narrowing."
>
> "At -28 basis with futures where they are, you're looking at solid numbers. If you've got grain you were thinking of moving anyway, Richardson this week wouldn't be a bad call."
>
> "If you don't mind me asking — what are crops looking like in your area? I'm trying to build a picture of what supply looks like around Lethbridge."

---

## 5. Cold Start & Onboarding

### 5.1 First Open — No Account

```
┌─────────────────────────────────────────────┐
│                                             │
│          🌾 Bushel Board                    │
│                                             │
│    Your grain analyst for the prairies.     │
│                                             │
│    "Should I haul or hold this week?"       │
│    Let's figure it out together.            │
│                                             │
│    ┌───────────────────────────────────┐    │
│    │      Get Started (Apple ID)      │    │
│    └───────────────────────────────────┘    │
│    ┌───────────────────────────────────┐    │
│    │      Sign up with email          │    │
│    └───────────────────────────────────┘    │
│                                             │
│    Just browsing? Continue as observer ▸    │
│                                             │
└─────────────────────────────────────────────┘
```

Sign in with Apple is the primary path — one tap, zero friction.

### 5.2 First Conversation

After signup (collects postal code + role), farmer lands directly in chat:

> **Analyst:** "Hey! Welcome to Bushel Board. I'm your grain analyst — I keep tabs on 16 grains across the prairies using CGC data, futures markets, CFTC positioning, and what other farmers are seeing on the ground."
>
> "I see you're farming near [town from postal]. What are you growing this year?"

Farmer describes their operation → LLM creates crop plans via tool calls → gives national-level analysis → positions the cold start as a feature:

> "Your area is pretty fresh on my radar — you'd actually be one of the first farmers helping me build the local picture here. If you know what your elevator is quoting on canola basis, that'd be gold."

### 5.3 Returning Users

Dynamic greeting based on:
- Time of day
- Most relevant overnight market move
- Memory of last conversation topic
- Days since last visit (gentle re-engagement)

```
"Morning, Kyle. Canola futures jumped 2% overnight — 
the bulls are loud this morning. Want me to break it down?"

[🌻 Canola update] [🌾 Wheat check] [📊 My area]
```

Quick-action chips populated from crop plan grains + "my area" context.

---

## 6. LLM Architecture — Model-Agnostic Design

### 6.1 Abstraction Layer

```
iOS App ──► Supabase Edge Function ──► LLM Provider Adapter
                                           ├─ GrokAdapter (primary)
                                           ├─ OpenAIAdapter
                                           ├─ ClaudeAdapter
                                           └─ GeminiAdapter
```

All adapters implement the same contract:
- Accept: system prompt + messages + tools + streaming callback
- Return: streamed text deltas + tool calls
- Handle: provider-specific auth, rate limits, error codes

### 6.2 Model Comparison

| Criteria | Grok 4.20 | GPT-4o | Claude 4 | Gemini 2.5 |
|----------|-----------|--------|----------|------------|
| Persona voice | Best | Good w/ prompting | Excellent nuance | Safety clips market slang |
| Real-time search | Native X + web | Search API | Needs 3rd party | Google Grounding |
| Tool-calling | Good | Best | Good | Good |
| Cost/conversation | ~$0.006 | ~$0.018 | ~$0.025 | ~$0.04+ |
| Streaming | SSE | SSE | SSE | SSE |

**Decision:** Start with Grok 4.20. Plan A/B testing at 1,000 users.

### 6.3 A/B Testing Plan

At scale, run 10% of conversations through each alternative model. Measure:
- Farmer return rate (did they come back?)
- Data contributed per conversation (did they share local intel?)
- Conversation length (engagement depth)
- Extraction accuracy (did tool calls fire correctly?)

---

## 7. Elevator/Plant Operator Pricing

### 7.1 Overview

Elevators and crush/milling plants can sign in as operators and post their grain prices and basis. This creates a **two-sided marketplace flywheel**: operators get distribution (prices reach every farmer in their delivery zone), farmers get actionable local pricing without calling around.

### 7.2 New Role: `elevator` / `processor`

| Role | What they do | What they see |
|------|-------------|---------------|
| `elevator` | Post grain prices + basis for their delivery point | Own price history, area farmer engagement count |
| `processor` | Post crush/milling prices + basis | Same + processing capacity context |

Signup collects: company name, facility name, facility type (elevator/crusher/mill), facility postal code.

### 7.3 Three Input Methods

**Method 1: Chat paste** — Operator pastes their price sheet into chat. LLM + on-device Foundation Model parses it into structured entries:

```
Operator pastes:
"CWRS 1 $8.20/bu basis -28
 CWRS 2 $7.95/bu basis -33
 Canola $14.50/bu basis -18
 Feed barley $4.80/bu"

Analyst: "Got it — I've recorded 4 prices for Richardson Lethbridge.
Want me to send these to the T0L, T0K, and T1J areas?"
```

**Method 2: Photo of screen** — Operator snaps a photo of their pricing screen/board. Apple Vision framework (on-device OCR) extracts text, then LLM parses the structure. Analyst confirms before posting.

**Method 3: Quick-entry form** — Structured form for operators who prefer it: grain dropdown, price field, basis field, grade selection. Select up to 3 target FSA codes for distribution.

### 7.4 Data Model

```sql
CREATE TABLE elevator_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES auth.users NOT NULL,
  facility_name text NOT NULL,
  facility_type text NOT NULL CHECK (facility_type IN ('elevator', 'crusher', 'mill')),
  grain text NOT NULL,
  grade text,                        -- 'CWRS 1', '#1 Canola', etc.
  price_per_bushel numeric,
  price_per_tonne numeric,
  basis numeric,
  basis_reference text,              -- 'ICE Canola', 'CBOT Wheat'
  posted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,   -- 3 days for prices, 7 for basis
  source_method text DEFAULT 'chat', -- 'chat', 'photo', 'form'
  target_fsa_codes text[] NOT NULL,  -- max 3 elements
  CONSTRAINT max_three_fsa CHECK (array_length(target_fsa_codes, 1) <= 3)
);

CREATE INDEX idx_elevator_prices_area ON elevator_prices
  USING GIN (target_fsa_codes) WHERE expires_at > now();
```

### 7.5 How Farmers Access Elevator Prices

When a farmer asks about pricing, the analyst checks `elevator_prices` for their FSA:

> **Farmer:** "What are elevators quoting on canola around here?"
>
> **Analyst:** "Richardson in Lethbridge posted -18 basis on #1 Canola yesterday — $14.50/bu. Cargill south of you is at -22. Richardson's tighter basis is worth the look."

Farmers see: facility name, price, basis, freshness. Never operator identity.

### 7.6 Two-Sided Flywheel

```
Elevators post prices (source of truth)
         ↓
Farmers see local pricing in chat
         ↓
Farmers engage more (data is valuable)
         ↓
Farmers share conditions, delivery plans
         ↓
Elevators see area farmer engagement metrics
         ↓
More elevators join to reach farmers
         ↓
Better predictions → more trust → repeat
```

---

## 8. What's NOT in Scope (v1)

| Feature | Why excluded | When to revisit |
|---------|-------------|-----------------|
| Android app | iOS-first to focus | After iOS proves product-market fit |
| USA market predictions | Separate Hermes track (feat/us-thesis-lane-hardening) | Runs in parallel, different branch |
| Web-first chat redesign | iOS app is the primary; web stays as companion | After iOS launch |
| Custom LLM fine-tuning | Prompt engineering + Viking knowledge sufficient initially | If persona quality drops at scale |
| Elevator price API integrations | Start with farmer-reported data | When >100 active farmers per FSA |
| iPad companion | iPhone + Watch first | Post-launch |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Weekly active chatters | 50+ farmers within 3 months | Supabase: distinct user_id in chat_messages per week |
| Local data points contributed | 5+ per active farmer per month | `local_market_intel` count per user |
| Area coverage | 20+ FSAs with ≥3 reports | Aggregate query on local_market_intel |
| Return rate | >60% weekly return | Users with ≥2 chat sessions per week |
| Conversation depth | >3 turns average | chat_messages count per thread |
| Data extraction accuracy | >90% successful tool calls | Edge Function logs |
| App Store rating | ≥4.5 stars | App Store Connect |
| Elevator operators onboarded | 10+ within 2 months | `profiles` WHERE role IN ('elevator','processor') |
| Elevator price freshness | >80% of prices <3 days old | `elevator_prices` WHERE expires_at > now() |
| Farmer price queries | >30% of conversations reference elevator prices | Tool call logs |

---

## 10. Implementation Phases

### Phase 1: Core Chat iOS App (Weeks 1-3)
- Xcode project setup with SwiftUI
- Supabase Swift SDK integration (auth, REST, realtime)
- Chat UI (Messages-like, streaming SSE)
- Port context-builder + system prompt to Edge Function
- Basic navigation (chat → grain detail → my farm)

### Phase 2: Local Intelligence Flywheel (Weeks 3-5)
- `local_market_intel` + `farmer_memory` migrations
- Tool-calling integration (save_local_intel, update_farmer_memory, get_area_stance)
- Area stance modifier RPC
- Cold start / onboarding flow

### Phase 3: Elevator/Processor Pricing (Weeks 5-6)
- `elevator_prices` migration + RLS
- Operator signup flow (elevator/crusher/mill role)
- Chat-paste price parsing (LLM tool-calling)
- Photo-to-price pipeline (Vision OCR + Foundation Model)
- Quick-entry form fallback
- FSA targeting (max 3 areas per post)
- Farmer-side: analyst queries elevator_prices when asked about local pricing

### Phase 4: Apple Intelligence (Weeks 6-8)
- On-device Foundation Models for entity extraction
- Siri App Intents (grain query, delivery logging)
- WidgetKit (small, medium, lock screen)
- Live Activities for price alerts

### Phase 5: Apple Watch + Polish (Weeks 8-10)
- watchOS companion app
- Complications, haptic alerts, Siri relay
- Push notification infrastructure
- App Store submission prep

### Phase 6: Launch + Iterate (Week 10+)
- TestFlight beta with 10-20 farmers
- Iterate on analyst persona based on conversation logs
- A/B test LLM models
- Scale area coverage
