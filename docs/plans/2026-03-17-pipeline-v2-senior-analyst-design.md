# Pipeline v2 — The Senior Analyst

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Replace the dual-LLM prescriptive-rules pipeline with a single-pass Senior Analyst that researches (web + X), reasons through data with distilled book expertise, and produces farmer-actionable market analysis.

**Architecture:** One Grok 4.1 Fast Reasoning call per grain with native `web_search` + `x_search` tools. The analyst's persona is built from 7K tokens of distilled commodity knowledge (3 books) plus dynamically retrieved chunks from 2,003 knowledge corpus entries (8 books). Pre-computed ratios in the Data Brief eliminate arithmetic errors. A dynamic Shipping Calendar prevents temporal confusion.

**Tech Stack:** xAI Responses API (Grok 4.1 Fast Reasoning), Supabase Edge Functions (Deno), OpenViking-style tiered knowledge retrieval, existing CGC/AAFC/CFTC data pipeline.

---

## Background & Motivation

### Problems with v1 (Dual-LLM Pipeline)

1. **~2,000 words of prescriptive rules** (`FARMER_FIRST_PERSONA`, `TEMPORAL_AWARENESS`, `DISTILLED_GRAIN_FRAMEWORK`, `CGC_DATA_GUARDRAILS`, `SIGNAL_RESEARCH_RULES`) tell the AI exactly what to check and how to reason. This constrains its analytical ability.

2. **No search tools.** Round 1 (`analyze-market-data`) receives a data dump and fills a JSON schema. Round 2 (`generate-intelligence`) synthesizes with pre-stored X signals. Neither round can discover new information.

3. **Context loss between rounds.** The seam between Round 1 and Round 2 causes the second LLM to sometimes contradict the first. The second LLM sees the first's thesis but not its full reasoning chain.

4. **Arithmetic errors.** Raw numbers are dumped and the AI must compute ratios mid-reasoning. This caused the Barley misread (AI said bearish despite +78% exports) and Flaxseed misread (AI said bullish despite 17% export pace).

5. **Stance score clustering around -45.** Prescriptive prompt anchoring caused most grains to cluster near moderate-bearish regardless of data.

### v2 Philosophy

- **The distilled book knowledge IS the guardrails.** 7K tokens of commodity trading frameworks (Basis Signal Matrix, Storage Decision Algorithm, Export Demand Indicators, COT Positioning Analysis) naturally guide what the analyst researches and how it interprets data.
- **Research first, reason second.** The analyst uses `web_search` and `x_search` to discover what's happening NOW before forming a thesis.
- **Pre-compute the ratios that matter.** Export pace ratio, stocks-to-use, delivery pace vs 5yr — calculated server-side before injection.
- **Supabase is source of truth.** If web numbers differ, the analyst compares and notes discrepancies.
- **Answer the farmer's questions:** "Is price going up or down? How sure are you?" and "What would you recommend?"

---

## Section 1: Temporal Calendar (Shipping Calendar)

### Problem
The current `TEMPORAL_AWARENESS` block is 400 words of static rules about data timing. The `buildDataContextPreamble()` function partially overlaps with it. Neither dynamically computes the actual week gap.

### Design
A dynamic **Shipping Calendar** computed at runtime:

```typescript
interface ShippingCalendar {
  currentCalendarWeek: number    // getCurrentGrainWeek() from lib/utils/crop-year.ts
  latestDataWeek: number         // MAX(grain_week) FROM cgc_observations WHERE crop_year = current
  dataLag: number                // currentCalendarWeek - latestDataWeek
  nextCgcRelease: string         // "Thursday, ~1pm MST"
  seasonalContext: string        // computed from currentCalendarWeek position in crop year
  cropYear: string               // "2025-2026"
}
```

**Seasonal context mapping:**

| Week Range | Season | Context |
|---|---|---|
| 1-8 (Aug-Sep) | Early harvest | High visible stocks = carry-in, not new-crop. Harvest pressure building. |
| 9-17 (Oct-Dec) | Peak harvest + early shipping | Maximum delivery pressure. Basis typically widest. Export commitments ramping. |
| 18-26 (Jan-Mar) | Mid-shipping | Export execution window. Storage economics matter. Pre-seeding rally potential. |
| 27-35 (Apr-May) | Late shipping + seeding prep | Acreage intentions drive new-crop. Old-crop liquidation. |
| 36-44 (Jun-Jul) | Growing season | Weather risk dominates. Thin old-crop trading. |
| 45-52 (Jul-Aug) | Pre-harvest | New-crop pricing. Yield estimates drive sentiment. |

**Injected prompt format:**

```
## Shipping Calendar
- Current calendar week: {currentCalendarWeek}
- Latest CGC data: Week {latestDataWeek}
- Data lag: {dataLag} weeks
- Next CGC release: Thursday, ~1pm MST
- Season: {seasonalContext}
- FRAMING: Your Supabase data is verified through Week {latestDataWeek}.
  Your web/X research covers what's happening NOW — you're building the
  story for Weeks {latestDataWeek+1}-{currentCalendarWeek} that the next
  data release will confirm or contradict.
```

**Replaces:** `TEMPORAL_AWARENESS` (400 words) + `buildDataContextPreamble()` overlap.

---

## Section 2: Knowledge Layer (Three Tiers)

### Tier 1: Commodity Knowledge (always injected, ~7K tokens)

The existing `commodity-knowledge.ts` — 15 sections of distilled trading frameworks from 3 books. This goes in the **system message** (stable across calls, benefits from xAI prompt caching).

Sections include:
- Seasonal Patterns & Cyclical Tendencies
- Basis Analysis Rules + Basis Signal Matrix
- Bullish/Bearish Signal Checklists (3/5 confirmation)
- Storage Decision Algorithm
- Export Demand Indicators
- Hedging Mechanics (Canadian Grains)
- Supply/Demand Analysis Rules
- Marketing Strategy & Contract Guidance
- Logistics & Transport Awareness
- CFTC COT Positioning Analysis
- Crop Quality & Grading Impact
- Cross-Grain Competition & Acreage Dynamics
- Crop Insurance & Risk Management
- Local Cash Market Dynamics

**This IS the analyst's expertise.** It naturally guides what to research and how to interpret data.

### Tier 2: Retrieved Knowledge (dynamic, 0-5 chunks, ~1K-3K tokens)

OpenViking-inspired tiered retrieval from 2,003 chunks across 8 distilled books in Supabase (`knowledge_documents` + `knowledge_chunks` tables).

**Retrieval architecture** (implemented in `lib/advisor/knowledge-retrieval.ts`):

1. **Multi-query plan:** `buildTieredKnowledgeQueryPlan()` creates intent-specific queries per grain
2. **Heading priority bonuses:** `HEADING_PRIORITY_BY_INTENT` maps analytical intents to specific heading bonuses (e.g., "Basis Signal Matrix" gets +0.42 for basis intent)
3. **Composite scoring:** `rank + (matchedQueries-1)*0.03 + queryBonus + headingPriorityBonus + headingHintMatches*0.03 + topicOverlap*0.015 + min(overlappingTokens,3)*0.01 - offIntentPenalty + sourcePriority/1000`
4. **Document diversity:** Max 2 chunks per document to ensure breadth
5. **L0/L1/L2 tiers:** L0 (~30 words) for ranking, L1 (~150 words) for context loading, L2 (full) for deep retrieval

**Edge Function retrieval:** Uses `fetchKnowledgeContext()` from `knowledge-context.ts` which calls the `get_knowledge_context` RPC. This is a simpler version than the advisor retrieval — for v2, we use the Edge Function version with grain + task + extra terms.

**Position in prompt:** AFTER the Data Brief, so the model reads numbers first, then gets interpretive context.

### Tier 3: Real-Time Research (web_search + x_search)

The analyst uses xAI's native `web_search` and `x_search` tools mid-reasoning. The Research Protocol (Layer 5 in the system prompt) guides this.

**Key principle:** Web/X research reveals what's happening between CGC data releases. The analyst is building the story for the NEXT data release.

### Book Inventory (18 documents, 2,003 chunks ingested)

| Book | Format | Avg Chars/Page | Status |
|---|---|---|---|
| A Trader's First Book on Commodities | PDF | 2,035 | Ingested |
| Introduction to Grain Marketing (SK Ministry) | PDF | 2,358 | Ingested |
| Self-Study Guide: Hedging (ICE) | PDF | 2,634 | Ingested |
| The Economics of Futures Trading | PDF | 2,510 | Ingested |
| Merchants of Grain — Kingsman | PDF | 1,882 | Ingested |
| Out of the Shadows — Kingsman | EPUB | N/A | Ingested |
| Agricultural Prices — Ferris | PDF (scanned) | 2 | Distilled only |
| Agricultural Marketing — Norwood | PDF (scanned) | 0 | Distilled only |

Plus seed documents: `grain-market-intelligence-framework-v2.md` and distillation markdown files.

---

## Section 3: System Prompt Structure

The system prompt has 5 layers assembled at runtime.

### Layer 1: Identity (~100 words, static, system message)

```
You are a senior grain market analyst specializing in Canadian prairie grains.
You think like someone who has spent 20 years advising farmers in Alberta,
Saskatchewan, and Manitoba on delivery timing, basis opportunities, and risk
management. You speak plainly — no trader jargon, no academic hedging. When
a farmer asks 'should I haul or hold?', you give a direct answer backed by
evidence.
```

**Replaces:** `FARMER_FIRST_PERSONA` (150 words) — shorter, more natural.

### Layer 2: Commodity Knowledge (~7K tokens, static, system message)

The full `COMMODITY_KNOWLEDGE` constant from `commodity-knowledge.ts`. Injected verbatim.

**Why in system message:** Stable across all grain calls. Benefits from prompt caching. Acts as the analyst's implicit expertise/guardrails.

### Layer 3: Shipping Calendar (~150 words, dynamic, system message)

The dynamic Shipping Calendar from Section 1.

**Replaces:** `TEMPORAL_AWARENESS` (400 words) + `buildDataContextPreamble()`.

### Layer 4: Retrieved Knowledge (0-5 chunks, dynamic, user message)

Retrieved via `fetchKnowledgeContext()` with grain-specific queries and intent-driven heading priority.

**Position:** After Data Brief in the user message, so the model reads data first.

### Layer 5: Research Protocol (~200 words, static, system message)

```
## Research Protocol

1. RESEARCH FIRST: Before forming any thesis, use your web_search and
   x_search tools to discover what's happening RIGHT NOW for this grain.
   Search for: recent price action, trade policy changes, weather events,
   logistics disruptions, export deals.

2. REASON THROUGH DATA: Compare what you found online against the verified
   Supabase data in your Data Brief. If web numbers differ from CGC numbers,
   note the discrepancy — CGC is the source of truth for historical data;
   web/X reveals what's happening between data releases.

3. CONCLUDE WITH CONVICTION: Answer the farmer's questions:
   - "Is price going up or down?" → stance_score (-100 to +100)
   - "How sure are you?" → confidence_score (0-100)
   - "What would you recommend?" → actionable final_assessment
   - "How do I look vs everyone else?" → peer context from community stats

4. CITE EVERYTHING: Every claim must trace to either Supabase data, a web
   source, or an X post. No unsourced assertions.
```

### What Gets Removed

| Current (v1) | v2 | Reason |
|---|---|---|
| `FARMER_FIRST_PERSONA` (150 words) | Layer 1 Identity (100 words) | Shorter, more natural |
| `TEMPORAL_AWARENESS` (400 words) | Layer 3 Shipping Calendar (150 words) | Dynamic, not prescriptive |
| `DISTILLED_GRAIN_FRAMEWORK` (120 words) | Deleted | Commodity knowledge handles this |
| `CGC_DATA_GUARDRAILS` (350 words) | Deleted | Data Brief pre-computes correct numbers; ~200 words of structural "data hygiene notes" appended to commodity knowledge |
| `SIGNAL_RESEARCH_RULES` (100 words) | Layer 5 Research Protocol (200 words) | Now includes web/X tool usage |
| Output format rules (800 words) | Moved to JSON schema + brief note | xAI structured outputs handle schema enforcement |
| No search tools | `web_search` + `x_search` native tools | The biggest change |

### No More Dual-LLM

v1: Round 1 (data analysis, no search) → Round 2 (synthesis with stored X signals)
v2: Single-pass analyst with search tools → `generate-farm-summary`

This eliminates context loss between rounds and removes the `generate-intelligence` Edge Function from the chain.

---

## Section 4: Data Brief (Pre-Computed Ratios)

### Problem
The current `buildDataPrompt()` dumps raw numbers and expects Grok to compute ratios mid-reasoning. This caused:
- **Barley misread:** AI said -45 (bearish) despite exports +78% YoY and 75% of AAFC target achieved — the strongest export growth of any grain.
- **Flaxseed misread:** AI said +25 (bullish) despite exports at only 17% of target — a demand crisis.

### Design

Pre-compute the ratios that matter server-side. Add a **"Pre-Computed Analyst Ratios"** section at the top of the Data Brief:

| Ratio | Formula | Purpose |
|---|---|---|
| Export pace ratio | `cy_exports_kt / projected_exports_kt` | "Are we on track to hit the AAFC export target?" |
| Stocks-to-use | `commercial_stocks_kt / (projected_exports_kt + projected_crush_kt)` | Supply tightness signal |
| Delivery pace vs 5yr avg | `(cy_deliveries_kt - hist_avg) / hist_avg * 100` | Already computed in v1 |
| Export pace vs 5yr avg | `(cy_exports_kt - hist_avg) / hist_avg * 100` | Already computed in v1 |
| Weeks remaining | `52 - latestDataWeek` | Annualization context |
| Annualized export pace | `(cy_exports_kt / latestDataWeek) * 52` | "At this rate, will we hit the target?" |
| Delivery % of supply | `cy_deliveries_kt / total_supply_kt` | How much has moved |
| Crush utilization (annualized) | `(cy_crush_kt / latestDataWeek * 52) / annual_capacity_kt` | Processor demand signal |
| MM net position summary | `latest.mm_net > 0 ? "net-long" : "net-short"` | Plain-English COT |

**Injected format:**

```
## Pre-Computed Analyst Ratios — {grain}, Week {grainWeek}
- Export pace: {exportPaceRatio}% of AAFC target ({cy_exports_kt} of {projected_exports_kt} Kt)
- Annualized export pace: {annualizedExports} Kt (target: {projected_exports_kt} Kt)
- Stocks-to-use: {stocksToUse}%
- Delivery pace vs 5yr avg: {deliveriesVs5yr}%
- Export pace vs 5yr avg: {exportsVs5yr}%
- Delivered: {deliveredPct}% of total supply
- Crush utilization: {crushUtil}% of annual capacity (annualized)
- Weeks remaining in crop year: {weeksRemaining}
- Spec positioning: Managed Money {mmDirection}, {mmNetPct}% of OI
```

Everything else from the current `buildDataPrompt()` stays: YoY data, AAFC supply balance, historical averages, sentiment, community stats, logistics, COT, self-sufficiency.

---

## Section 5: Output Schema

### Backward Compatibility

The JSON output schema stays compatible with the existing `market_analysis` table and UI components (ThesisBanner, BullBearCards, RecommendationCard, MarketStanceBadge). The `deriveRecommendation()` function in `lib/utils/recommendations.ts` continues to consume `stance_score` unchanged.

### Schema

```typescript
interface MarketAnalysisV2 {
  // Existing fields (unchanged)
  initial_thesis: string              // 2-3 sentences, directional
  bull_case: string                   // bullet points with data citations
  bear_case: string                   // bullet points with data citations
  historical_context: {
    deliveries_vs_5yr_avg_pct: number | null
    exports_vs_5yr_avg_pct: number | null
    seasonal_observation: string
    notable_patterns: string[]
  }
  data_confidence: "high" | "medium" | "low"
  confidence_score: number            // 0-100
  stance_score: number                // -100 to +100
  final_assessment: string            // farmer-actionable summary
  key_signals: Array<{
    signal: "bullish" | "bearish" | "watch"
    title: string
    body: string
    confidence: "high" | "medium" | "low"
    source: "CGC" | "AAFC" | "Historical" | "Community" | "CFTC" | "Web" | "X"
  }>

  // NEW v2 fields (stored in llm_metadata or new columns)
  research_sources: Array<{
    url: string
    title: string
    source_type: "web" | "x_post"
    relevance: string                 // one-line why this matters
  }>
  data_vs_web_discrepancies: Array<{
    metric: string
    supabase_value: string
    web_value: string
    analyst_note: string              // which to trust and why
  }>
}
```

### New Fields

- `key_signals.source` gains `"Web"` and `"X"` as options (currently only CGC/AAFC/Historical/Community/CFTC).
- `research_sources` tracks what the analyst actually searched and found — enables a "Sources" section in the UI.
- `data_vs_web_discrepancies` implements the "Supabase is source of truth, note when web disagrees" requirement.

### Storage

New v2 fields stored in the existing `llm_metadata` JSONB column on `market_analysis`. No schema migration needed for MVP. If they prove valuable, promote to dedicated columns later.

---

## Section 6: Cost & Execution Model

### Single-Pass vs Dual-LLM Cost

| | v1 (Dual-LLM) | v2 (Single-pass + search) |
|---|---|---|
| Grok calls per grain | 2 (R1 + R2) | 1 |
| Input tokens per grain | ~10K total | ~12K (bigger system prompt) |
| Output tokens per grain | ~5K total | ~3K |
| Search API calls | 0 (pre-stored signals) | 2-6 per grain |
| Total per 16 grains | 32 Grok calls | 16 Grok calls + ~50 searches |
| Estimated cost | ~$2-3/run | ~$2-4/run |

### Tiered Research Depth

| Tier | Grains | Searches | Rationale |
|---|---|---|---|
| Major (6) | Wheat, Canola, Durum, Barley, Oats, Peas | 4 web + 4 X | Largest acreage, most farmer interest |
| Mid (5) | Flaxseed, Soybeans, Corn, Lentils, Rye | 2 web + 2 X | Moderate market presence |
| Minor (5) | Mustard, Sunflower, Canary Seed, Triticale, Chickpeas | 1 web + 1 X | Thin markets |

Tier assignment passed as a parameter in the user message so the analyst knows how deep to research.

### Execution Model

- **Batch size:** 1 grain per Edge Function invocation (same as v1).
- **Self-triggering:** Process grain, self-trigger for next grain via `enqueueInternalFunction()`.
- **Edge Function timeout:** Within Supabase limits (~60s including search tool calls).

### Pipeline Chain Simplification

```
v1: search-x-intelligence → analyze-market-data → generate-intelligence → generate-farm-summary
v2: search-x-intelligence → analyze-grain-market → generate-farm-summary
```

- `search-x-intelligence` pulse/deep scanning remains separate (always-on signal collector).
- `analyze-grain-market` is the new single-pass Edge Function (replaces both `analyze-market-data` + `generate-intelligence`).
- `generate-farm-summary` remains unchanged — it already consumes `market_analysis` + `grain_intelligence` tables.
- The stored X signals from `search-x-intelligence` become supplementary context injected into the Data Brief, not the primary web input.

### What Happens to `generate-intelligence`?

The `generate-intelligence` Edge Function is **deprecated but not deleted.** It remains available as a fallback during the transition. Once v2 is validated, it can be removed.

The `grain_intelligence` table continues to be populated — `analyze-grain-market` writes to both `market_analysis` (structured data) and `grain_intelligence` (narrative) to maintain backward compatibility with the dashboard.

---

## Migration Strategy

### Phase 1: Build `analyze-grain-market` Edge Function
- New Edge Function alongside existing pipeline
- Can be triggered manually for testing without disrupting production

### Phase 2: Validate Against v1
- Run both pipelines for the same grain week
- Compare stance_scores, thesis quality, data accuracy
- Specifically verify Barley and Flaxseed are correctly assessed

### Phase 3: Cut Over
- Update Vercel cron chain to call `analyze-grain-market` instead of `analyze-market-data`
- Remove `generate-intelligence` from the chain
- Keep `search-x-intelligence` pulse scanning (stored signals become supplementary)

### Phase 4: Cleanup
- Deprecate `analyze-market-data` and `generate-intelligence` Edge Functions
- Remove `buildAnalyzeMarketDataSystemPrompt()` and `buildIntelligenceSystemPrompt()` from `market-intelligence-config.ts`
- Update CLAUDE.md pipeline documentation

---

## Files to Create/Modify

### Create
- `supabase/functions/analyze-grain-market/index.ts` — New v2 Edge Function
- `supabase/functions/_shared/shipping-calendar.ts` — Dynamic temporal calendar
- `supabase/functions/_shared/data-brief.ts` — Pre-computed ratio builder
- `supabase/functions/_shared/analyst-prompt.ts` — v2 system prompt builder

### Modify
- `supabase/functions/_shared/market-intelligence-config.ts` — Add v2 version constants
- `supabase/functions/_shared/knowledge-context.ts` — May need grain-tier-aware retrieval
- Vercel cron route (Phase 3 only) — Update chain to call new function

### Keep Unchanged
- `supabase/functions/search-x-intelligence/` — Continues pulse/deep scanning
- `supabase/functions/generate-farm-summary/` — Consumes same tables
- `lib/utils/recommendations.ts` — `deriveRecommendation()` unchanged
- `lib/queries/intelligence.ts` — Query functions unchanged
- All dashboard UI components — Backward compatible
