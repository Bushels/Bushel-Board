# Hermes Chat Agent — Tiered Memory Architecture

**Date:** 2026-04-15
**Status:** Approved
**Author:** Kyle + Claude
**Replaces:** `chat-completion` Edge Function (stateless)
**Related:** `2026-03-28-hermes-pipeline-design.md`, `2026-04-13-chat-first-ios-design.md`, `2026-04-14-web-alpha-bushy-chat-design.md`

---

## Summary

Hermes becomes the persistent chat backend for Bushy, replacing the stateless `chat-completion` Edge Function. A tiered memory architecture (Ephemeral → Working Memory → Long-Term Patterns) enables intelligent data capture, supersession-based aging, and daily/weekly compression cycles. Direct X API v2 integration replaces Grok's `x_search` for tweet discovery, reserving Grok tokens for chat reasoning.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat backend | Hermes persistent agent on GCP VM | Stateful memory, smarter data capture, compression cycles |
| LLM for chat | Grok via xAI Responses API | Existing integration, `x_search` still available as fallback |
| X data source | Direct X API v2 (Bearer Token) | Decouples tweet discovery from LLM, saves tokens |
| Memory model | Tiered (Ephemeral → Working → Long-term) | Natural knowledge flow, clean supersession |
| Data aging | Supersession-based, not fixed expiry | Smarter — new info replaces old when contradicted |
| Compression | Daily (10 PM MST) + Weekly (Friday 9 PM MST) | Daily keeps brain clean, weekly merges macro/micro thesis |
| State persistence | All state in Supabase, never in-process | Hermes can crash and recover by reading DB |

## Architecture Overview

```
Farmer (iOS/Web)
    ↓ message
Vercel API Route (thin proxy, JWT validation)
    ↓ forwards to
Hermes on GCP VM (persistent agent)
    ├── Conversation Manager (concurrent farmer chats)
    ├── Knowledge Engine (three-tier memory)
    ├── Tool Executor (X API, Supabase queries, posted prices)
    └── Compression Scheduler (daily + weekly)
    ↓ streams response
Vercel API Route
    ↓ SSE stream
Farmer sees Bushy's response
```

Vercel API route (`app/api/advisor/chat/route.ts`) stays as the thin proxy. Auth (Supabase JWT) validated at the Vercel layer. Farmers never connect directly to GCP.

---

## Section 1: Tiered Memory Data Model

### Tier 1: Ephemeral Extractions — `chat_extractions`

Raw data points Hermes notices during conversations. Unvalidated. Processed during end-of-day compression.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `user_id` | uuid FK → profiles | Who said it |
| `thread_id` | uuid FK → chat_threads | Which conversation |
| `message_id` | uuid FK → chat_messages | Exact message |
| `fsa_code` | text | Farmer's area (from profile) |
| `category` | text | `market`, `agronomic`, `weather`, `intent`, `logistics`, `input_cost` |
| `data_type` | text | Specific type within category |
| `grain` | text | nullable — not all extractions are grain-specific |
| `value_numeric` | numeric | For quantifiable data |
| `value_text` | text | For qualitative data |
| `location_detail` | text | Elevator name, field location, town |
| `confidence` | text | `reported`, `inferred` |
| `extracted_at` | timestamptz | |
| `promoted` | boolean DEFAULT false | Promoted to working memory? |
| `discarded` | boolean DEFAULT false | Discarded during compression? |
| `discard_reason` | text | Why discarded |

### Tier 2: Working Memory — `knowledge_state`

What Hermes currently believes to be true. Promoted from ephemeral, superseded when contradicted.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `fsa_code` | text | Area this applies to |
| `category` | text | Same categories as ephemeral |
| `data_type` | text | Specific type |
| `grain` | text | nullable |
| `value_numeric` | numeric | |
| `value_text` | text | |
| `location_detail` | text | |
| `source_count` | int | How many farmers contributed |
| `confidence_level` | text | `single_report`, `corroborated`, `consensus` |
| `first_reported_at` | timestamptz | |
| `last_updated_at` | timestamptz | |
| `status` | text | `active`, `superseded`, `expired` |
| `superseded_by` | uuid FK → self | What replaced this |
| `supersession_reason` | text | Why replaced |
| `source_extraction_ids` | uuid[] | Which extractions built this |

### Tier 3: Long-Term Memory — `knowledge_patterns`

Trends, patterns, and historical context. Not individual facts but intelligence.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `fsa_code` | text | nullable — some patterns are regional |
| `pattern_type` | text | `trend`, `seasonal`, `correlation`, `anomaly`, `area_shift` |
| `category` | text | |
| `grain` | text | nullable |
| `title` | text | Short label |
| `description` | text | What Hermes observed |
| `supporting_data` | jsonb | Working memory IDs + dates |
| `confidence_score` | smallint | 0-100 |
| `detected_at` | timestamptz | |
| `last_validated_at` | timestamptz | |
| `status` | text | `active`, `invalidated`, `archived` |
| `season` | text | nullable — `seeding`, `growing`, `harvest`, `marketing` |

### Compression Summaries — `compression_summaries`

Daily and weekly compression output. The reviewable audit log.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `period` | text | `daily` or `weekly` |
| `compression_date` | date | Day (daily) or Friday (weekly) |
| `conversations_processed` | int | |
| `extractions_total` | int | |
| `promoted` | int | |
| `corroborated` | int | |
| `superseded` | int | |
| `discarded` | int | |
| `deferred` | int | |
| `summary` | jsonb | Full structured summary |
| `patterns_detected` | int | |
| `flags_for_review` | int | |
| `macro_micro_alignment` | jsonb | Weekly only |
| `completed_at` | timestamptz | |

### Weekly Farmer Briefs — `weekly_farmer_briefs`

Personalized weekly intelligence combining macro thesis + local data.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `user_id` | uuid FK → profiles | |
| `fsa_code` | text | |
| `week_ending` | date | Friday date |
| `crop_year` | text | |
| `grain_week` | smallint | |
| `grains_covered` | text[] | Which grains covered |
| `macro_micro_alignment` | jsonb | Per-grain: confirms/contradicts/no_data |
| `personal_insights` | jsonb | Actionable insights |
| `area_intelligence_summary` | text | Local activity narrative |
| `weather_context` | text | Area weather summary |
| `recommended_actions` | jsonb | Suggestions tied to position |
| `pipeline_stance_scores` | jsonb | Stance scores from Friday analysis |
| `generated_at` | timestamptz | |

### X API Query Log — `x_api_query_log`

Tracks every X API call for deduplication and budget optimization.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `query_text` | text | Exact query sent |
| `query_hash` | text | Fast dedup lookup |
| `mode` | text | `background` or `chat_realtime` |
| `triggered_by_user` | uuid | nullable |
| `tweets_returned` | int | |
| `tweets_relevant` | int | |
| `extractions_created` | int | |
| `value_score` | smallint | 0-100, self-assessed |
| `searched_at` | timestamptz | |

---

## Section 2: Classification Taxonomy

### Six Categories

**1. `market`** — basis, cash_price, contract_price, premium_discount, demand_signal

**2. `agronomic`** — crop_condition, yield_estimate, seeding_progress, harvest_progress, quality, pest_disease, acres

**3. `weather`** (first-class) — precipitation, frost_event, drought_observation, heat_stress, flood_excess_moisture, growing_conditions

**4. `intent`** (predictive market signals) — rotation_plan, marketing_plan, expansion_contraction, input_decision, equipment_plan, storage_plan

**5. `logistics`** — elevator_wait_time, trucking_availability, rail_car_status, road_conditions, elevator_capacity

**6. `input_cost`** — fertilizer_price, chemical_price, seed_cost, fuel_price, custom_work_rate

### Extraction Confidence

| Level | Meaning |
|-------|---------|
| `reported` | Farmer explicitly stated a fact |
| `inferred` | Hermes interpreted from context |
| `corroborated` | Multiple farmers in same area reporting similar |

### What Gets Discarded

- Personal/family conversation
- General small talk
- Questions TO Bushy (input, not data)
- Hypotheticals without intent
- Recycled information Bushy itself provided

---

## Section 3: Supersession Logic

### Core Principle

New data supersedes old when it **contradicts or updates** the same fact. No fixed expiry timers. Hermes makes the call in real-time for high-confidence cases, defers ambiguous cases to daily compression.

### Rules by Category

**Market:** Supersede on newer report for same location. Conflicting reports from different farmers → hold both, flag in daily summary.

**Agronomic:** Supersede on progression (seeding → growing → harvest) or correction (revised yield estimate). Natural season progression archives previous stage data.

**Weather:** Most aggressive supersession. New observation in same area replaces old. Forecasts superseded by actuals. Cumulative updates aggregate into moisture status.

**Intent:** Supersede ONLY on explicit change of plan. "Thinking about lentils" stays active until farmer says otherwise or the season passes. Intent that firms up ("ordered lentil seed") upgrades confidence.

**Logistics:** Supersede on situation change (elevator full → accepting again, wait time update).

**Input costs:** Supersede like market data — newer price for same product/location.

### Supersession Decision Record

Every supersession logs:
- `superseded_id`, `new_id`
- `reason` (human-readable)
- `decision_type`: `direct_contradiction`, `progression`, `corroboration_upgrade`, `context_staleness`
- `confidence`: `high`, `medium`, `low`
- `timestamp`

Low-confidence supersessions flagged in daily summary as "needs review" rather than auto-applied.

### What Hermes Does NOT Auto-Supersede

- Conflicting reports from different farmers on same day
- Unusual/outlier claims (90 bu/acre wheat)
- Cross-category tensions (crop looks great + no rain in 4 weeks)

---

## Section 4: Compression Cycles

### Daily Compression (10 PM MST)

**Phase 1 — Triage Ephemeral Extractions:**
- Promote: new knowledge → create/update `knowledge_state`
- Corroborate: matches existing → bump `source_count`, upgrade confidence
- Supersede: contradicts existing → mark old superseded, promote new
- Discard: noise/duplicates → mark with reason
- Defer: ambiguous → leave for tomorrow

**Phase 2 — Detect Patterns:**
- Trends across working memory (basis tightening at multiple elevators)
- Area shifts (multiple farmers mentioning same rotation)
- Seasonal markers (harvest reports arriving)
- Anomalies (outlier claims)
- Correlations (rain → basis loosening pattern)

**Phase 3 — Context Staleness Sweep:**
- Season transitions archive previous-stage data
- Market data >2 weeks without updates flagged as aging (not auto-superseded)

**Phase 4 — Generate Daily Summary:**
Stored in `compression_summaries` with counts, supersession decisions, flags for review, patterns detected, weather summary by area, area intelligence snapshot.

### Weekly Compression (Friday 9 PM MST)

Runs after the bullish/bearish pipeline analysis completes.

**Inputs:** 7 daily summaries, `market_analysis` (Friday thesis + stance scores), `grain_intelligence`, `cftc_cot_positions`, working memory, long-term patterns.

**Phase 1 — Macro ↔ Micro Reconciliation:**
For each grain, check: does local data confirm or contradict the national thesis?
- Confirms → "Local data corroborates bullish thesis"
- Contradicts → "Your local market is bucking the national trend"
- No local data → Fall back to national thesis only
- Local only → "Interesting local signal worth watching"

**Phase 2 — Per-Farmer Weekly Brief:**
For each active farmer, generate personalized brief combining: crop plan, area intelligence, national thesis, contracted position, intent signals, weather summary. Stored in `weekly_farmer_briefs`.

**Phase 3 — Weekly Pattern Promotion:**
- Daily patterns confirmed across multiple days → promote to higher-confidence long-term
- Invalidated long-term patterns → archive with reason
- Cross-area patterns (same signal from multiple FSAs) → regional pattern

**Phase 4 — Weekly Summary:**
Stored in `compression_summaries` with `period: 'weekly'`. Includes macro/micro alignment scorecard, farmer engagement stats, weekly pattern review.

---

## Section 5: X API v2 Integration

### Credentials

Stored in Vercel environment variables:
- `XAPI_CONSUMER_KEY`
- `XAPI_SECRET_KEY`
- `XAPI_BEARER_TOKEN`

### Mode 1: Background Collection

Scheduled 3x/day (6 AM, 1 PM, 6 PM MST). Query strategy by grain tier:
- Major grains (Wheat, Canola, Barley, Oats): 3-4 queries each
- Mid grains (Flax, Lentils, Peas, Soybeans): 2 queries each
- Minor grains (Mustard, Rye, Canaryseed, etc.): 1 query each

Pre-filtering via X API query operators: `-is:retweet`, `lang:en`, negative keywords (`-crypto -bitcoin -stock -forex -NFT`), geographic hints (`Saskatchewan OR Alberta OR Manitoba OR prairie OR elevator`).

Results → Hermes classifies farming relevance in batch → relevant tweets → `x_market_signals` with `source: 'x_api_background'`.

### Mode 2: Real-Time Chat Search

Triggered when Hermes detects a knowledge gap during conversation. Farmer explicitly asks for social signal, or asks about news/events not in working memory.

Results → farming filter → synthesize answer → save to `x_market_signals` with `source: 'x_api_chat_search'` → extract data points → ephemeral tier.

### Value Gate (3 rules before any X API call)

1. **Working memory first:** Check `knowledge_state` for a recent answer before searching
2. **Recency check:** Has this query (or close variant) run in last N hours? Check `x_api_query_log`
3. **Store-or-don't-search:** If results can't produce reusable extractions, skip the search

### Rate Limits (Basic tier, $100/month)

- 10,000 tweets read/month
- Budget: ~7,200 for background (3x/day × 30 days × ~16 queries × ~5 results), ~2,800 for real-time chat
- Real-time cap: 10 searches/day initially
- Query log tracks `value_score` per search for self-optimization

### Adaptive Query Tuning

During weekly compression, Hermes reviews query log:
- Low `value_score` queries → remove from background rotation
- High extraction-rate queries → increase frequency or add variants
- Unproductive grain tiers → drop to monthly scan

---

## Section 6: Hermes as Chat Backend

### Conversation Manager

Handles multiple farmers chatting simultaneously. Per-conversation context:
- Thread history (from `chat_messages`)
- Farmer card (profile, FSA, crop plan, role, contracted position)
- Working memory snapshot (relevant entries for farmer's area + grains)
- Active extractions (data points noticed in THIS conversation)

Concurrency: sequential per farmer, parallel across farmers. Context isolated per farmer.

### Knowledge Engine — Per-Message Flow

```
1. Read message
2. Extract farming data?
   → Yes: create chat_extraction (ephemeral)
   → Does this supersede working memory?
     → High confidence: supersede immediately
     → Low confidence: flag for daily compression
3. Formulate response using:
   → Conversation history
   → Farmer card + crop plan
   → Relevant working memory for area
   → Long-term patterns for area
   → Latest weekly thesis (from market_analysis)
4. External data needed?
   → Knowledge gap: X API search (if value gate passes)
   → Price question: query posted_prices / grain_prices
   → National data: CGC observations / pipeline velocity
5. Stream response
6. Save to chat_messages
```

### Tool Inventory

| Tool | Purpose |
|------|---------|
| `search_x` | X API v2 real-time search |
| `query_working_memory` | Read current beliefs for area/grain |
| `query_market_thesis` | Read latest bullish/bearish from pipeline |
| `save_extraction` | Store farming data point from conversation |
| `supersede_knowledge` | Replace working memory entry |
| `query_posted_prices` | Check posted prices for farmer's area |
| `update_farmer_memory` | Save persistent facts about farmer |
| `get_area_intelligence` | Aggregated area view for farmer's FSA |

### Reliability & Failover

| Failure mode | Mitigation |
|--------------|------------|
| Hermes process crashes | Auto-restart (systemd/Docker). All state in Supabase. |
| GCP VM goes down | Health check + alerting. Graceful fallback message. |
| Message lost in transit | Vercel saves message BEFORE forwarding. 30s timeout → fallback. |
| Compression fails | Idempotent — safe to re-run. Logged, retry next cycle. |
| Hermes overloaded | Rate limit per farmer (30 msgs/10 min). Queue if needed. |

**Critical principle:** All persistent state lives in Supabase, never in Hermes's process memory. If Hermes restarts, it recovers by reading the database.

### Migration from Edge Function

| Current (`chat-completion`) | Hermes |
|----------------------------|--------|
| Stateless, cold-starts every message | Persistent, always running |
| Rebuilds context every turn | Maintains loaded context per conversation |
| Tools: save_local_intel, update_farmer_memory, get_area_stance | Same + knowledge engine + X API + compression |
| Streams SSE via Edge Function | Streams SSE via Vercel proxy ← Hermes |
| Model: Grok via xAI Responses API | Same model |
| No data classification | Full tiered memory with classification |

---

## Weather as First-Class

Weather receives special treatment across all tiers:

| Stage | Ephemeral | Working Memory | Long-term Pattern |
|-------|-----------|---------------|-------------------|
| Precipitation | `weather/precipitation` | Area moisture status | "Southeast SK trending wet this spring" |
| Frost | `weather/frost_event` | Active frost risk flag | "Late frost 3 of last 5 years" |
| Drought | `weather/drought_observation` | Drought stress level | "This FSA prone to mid-season dry spells" |

Weather working memory supersedes more aggressively than other categories.

---

## X API Data Source (CLAUDE.md update)

Added to CLAUDE.md Intelligence Pipeline section:
- Credentials: `XAPI_CONSUMER_KEY`, `XAPI_SECRET_KEY`, `XAPI_BEARER_TOKEN` (Vercel env vars)
- Two modes: background collection (3x/day) + real-time chat search
- Replaces Grok `x_search` for tweet discovery
- Existing `x_market_signals` table extended with new `source` values: `x_api_background`, `x_api_chat_search`
