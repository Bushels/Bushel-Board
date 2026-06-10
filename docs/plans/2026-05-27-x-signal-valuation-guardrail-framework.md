# X Signal Valuation & Guardrail Framework
**Design Proposal for Bushel Board X Pulse Scout + Claude Agent Desk Integration**

**Date:** 2026-05-27
**Author:** Grok (X Pulse Scout role, per CLAUDE.md policy)
**Status:** Proposed for review and iteration — **no implementation yet**
**Related:**
- `lib/x-api/farming-filter.ts` (current guardrails)
- `lib/queries/x-signals.ts` (current schema + queries)
- `supabase/functions/search-x-intelligence/index.ts` (tombstoned V1)
- `docs/plans/2026-04-18-x-api-v2-wire-in-design.md` (intended direct X API v2 gateway)
- CLAUDE.md (explicit "Grok/xAI analysis is retired", "Claude-only by policy — NO xAI, NO Grok anywhere in the V2 loop", "Skip LLM scoring for background mode — that happens in the Friday swarm")
- User's curated 36-account list (2026-05 conversation)
- Recent live North American Wheat pulse scan (mid-May 2026 US HRW drought + Canada planting signals)

---

## Executive Summary

The recent live X pulse scan for North American Wheat demonstrated that native Grok X tools + the user's high-quality Tier 1 accounts can surface timely, high-relevance prairie grain signals (e.g., US HRW crop collapse during grain fill, @LeftFieldCR planting lag data). This has "real value" for the thesis board, overview signal tape, Bushy chat, and farmer "haul or hold" decisions.

However, **the current guardrails and valuation system are insufficient** for production "grain by grain" use at scale.

Current state (verified via exploration):
- `farming-filter.ts:110` — purely keyword-based (`isFarmingRelevant` requires ≥2 FARMING_SIGNALS regex matches + negative keyword hard rejects). No dates, no authors, no seasons, no credibility, no cross-grain, no weather/catalyst awareness.
- `x_market_signals` (from `lib/queries/x-signals.ts:5-20` and queries) — stores `relevance_score` (display gate ≥60), `sentiment`, `category`, `post_summary`, `confidence_score`, `search_mode` (pulse/deep), `searched_at`, `post_author`, `grain`/`crop_year`/`grain_week`. Farmer votes in `signal_feedback`. Legacy `v_signal_relevance_scores` view has primitive -5pts/day recency decay.
- V2 architecture (CLAUDE.md + 2026-04-18 design doc): Direct X API v2 gateway/collector does **deterministic** relevance only. LLM synthesis, bull/bear impact, and thesis weighting happens exclusively in the **Claude Agent Desk** (sentiment-scout Haiku + specialists + Opus desk chief). No Grok analysis in the loop.

The user's 10 questions expose exactly the missing production-grade system:
> "Do we have the proper guardrails... When is some info outdated? How does the date affect the impact...? How credible is the source? Can we cross reference? Does this only affect 1 grain...? What part in the growing or harvest season...? Are there other factors that could compound this impact? Is there upcoming weather systems...? How is potential impact valued? How can we attribute some sort of a system or ranking/rating system... categorize them properly? What areas do they also affect?"

**This document proposes a multi-dimensional X Signal Valuation & Guardrail Framework** that answers every question with concrete rubrics, formulas, examples, and a strict **Scout (Grok discovery + deterministic tagging) vs. Claude (synthesis + final valuation)** boundary that respects project policy 100%.

The goal: every signal stored in `x_market_signals` carries rich, queryable, auditable metadata that makes the Claude sentiment-scout dramatically more accurate, while the Grok X Pulse Scout remains a pure high-fidelity observation layer.

---

## 1. Gap Analysis — Current System vs. User's 10 Questions

| User's Question | Current Implementation (as of exploration) | Gap Severity | Example Failure Mode |
|-----------------|-------------------------------------------|--------------|----------------------|
| When is info outdated? Date impact on news? | `searched_at` + `post_date` exist; legacy view has crude -5pts/day; display just orders by `relevance_score` or `searched_at`. No per-type staleness rules. | High | A 4-day-old "farmer turnin or burnin" report during grain fill treated same as fresh weather alert. |
| How credible is the source? | `post_author` stored as free text. No tiers, no boosts in `farming-filter.ts` or queries. Author bonus only vaguely planned in 2026-04-18 design doc. | High | @GrainsGorilla (Tier 1) and random account with same keyword match get identical base treatment. |
| Can we cross reference? | None at ingest. Claude scouts are expected to do it manually from raw text. | Medium-High | No flag that "3 Tier 1 accounts + CGC timing align on this fact." |
| 1 grain or multi-impact? | `grain` column (single). No `grain_tags[]` or secondary impact. | Medium | US HRW drought signal tagged only "Wheat" — misses basis ripple to Spring Wheat / logistics for Canola. |
| Growing/harvest season phase? | None. Keywords like "harvest" exist but no phase classifier or weighting. | High | Drought during grain fill (high yield impact) scored same as same conditions in winter dormancy. |
| Compounding factors? Upcoming weather? | Keyword capture only (frost/drought/rain in FARMING_SIGNALS). No structured flags or forecast awareness. | High | No "compounds with upcoming WASDE + Argentina tax cut" or "NOAA shows heat dome next 10d". |
| How is potential impact valued? Ranking/rating system? | Single `relevance_score` (0-100-ish) + `confidence_score` + simple category string. No multi-factor rubric. Farmer votes are post-hoc. | Critical | "Critical supply shock during grain fill from trusted source" looks the same numerically as low-stakes basis chatter. |
| Categorization? Affected areas? | `category` (free-form or limited: weather/analyst_commentary/farmer_report from live scan). No controlled taxonomy, no `affected_regions[]`, no `affected_decisions[]`. | High | Hard to query "all supply-shock signals affecting prairie haul/hold this week". |

**Root cause:** The V1 Grok pipeline (now tombstoned) did LLM scoring at discovery time. The V2 design intentionally moved that to Claude but never built the rich deterministic pre-tagging layer the gateway/collector needs. `farming-filter.ts` and the current `relevance_score` gate are the only production guardrails — and they are 2026-era keyword lists.

---

## 2. Test Case: North American Wheat Mid-May 2026 Live Scan (Applied to All 10 Questions)

(From the concrete multi-query scan using user's Tier 1 + semantic/keyword patterns, since:2026-05-08 filters, etc.)

**Dominant signal cluster (high value example):**
- US HRW / Southern & Central Plains winter wheat: Kansas 15% Good/Excellent, 58% Poor/Very Poor (worst conditions since 1972 per multiple analyst + regional sources). Grain fill stage. Futures spiking toward $7.50. Farmer voice: "turnin or burnin", "no point spraying anymore".
- Offsets: Strong old-crop export sales + Argentina tax cut announcement.
- Canada prairie signal: @LeftFieldCR — spring wheat planting progress 14% vs 53% YoY (significant lag).
- Sentiment in scan: overwhelmingly **Bullish on supply shock** for wheat complex.

**What current system would capture (weak):**
- Keyword hits on "drought", "wheat", "basis"?, "harvest", "prairie" → passes `isFarmingRelevant`.
- `relevance_score` (whatever legacy or simple value) ≥60 → surfaces.
- `category` ≈ "weather" or "analyst_commentary" or "farmer_report".
- `sentiment` = "bullish".
- No source tier boost for @GrainsGorilla / @ksetzergrains / @LeftFieldCR.
- No "grain_fill" phase tag → no extra weight.
- No "multi_grain: Wheat + basis ripple" flag.
- No "catalyst: Argentina policy + export sales" structured note.
- No "temporal: critical 48h fresh crop condition report during sensitive phenology" flag.
- No "affected_areas: KS, Central Plains, Prairie basis, farmer selling decisions".

**What the proposed framework would tag (strong, actionable):**
- `source_cred_tier: "tier1_prairie_grain_alpha"` (+30 boost or 1.4x multiplier; multiple Tier 1 voices).
- `seasonal_phase: "grain_fill"` (for US winter wheat) + "planting" (Canada spring) → 1.5x supply shock multiplier.
- `primary_grain: "Winter Wheat"`, `grain_tags: ["Wheat", "Spring Wheat", "Durum?"]`, `cross_impact: "high on NA wheat complex basis; medium logistics for canola"`.
- `temporal_flag: "critical_fresh"` (grain condition report <48-72h old during peak sensitivity).
- `catalyst_flags: ["upcoming_WASDE", "policy_Argentina_tax_cut", "export_pace_strong"]`.
- `compounding: true` (multiple factors aligning).
- `impact_valuation: 92` (Critical tier) — SupplyShock 38/40, Actionability (farmer sell pressure) 22/25, Timeliness 14/15, Source 10/10, Corroboration 8/10.
- `category: "weather-drought_supply-shock"`.
- `affected_regions: ["KS", "Southern Plains", "Central Plains", "Prairie (basis/planting lag)"]`.
- `affected_decisions: ["haul-hold", "forward-pricing", "seeding-intent-next-year"]`.
- `farmer_voice_strength: high` (direct "turnin or burnin" quotes from region).

Result: This surfaces at the very top of the overview tape, gets special highlighting in Bushy for wheat queries, and is injected into the Claude sentiment-scout + desk chief with rich structured context instead of raw text + weak score. Farmer votes then further refine over time.

This single real-world cluster proves why the 10 questions matter and why a multi-dimensional system is required before scaling the scout.

---

## 3. The X Signal Valuation & Guardrail Framework (v1)

### Core Principles
1. **Grain-by-grain first, then cross.** Every dimension evaluated per primary grain, with explicit cross-impact notes.
2. **Deterministic + observable at Scout layer.** Grok X tools + trusted accounts produce reliable, auditable tags (no "vibes").
3. **Claude owns valuation, synthesis, and thesis impact.** Scout provides the best possible raw + tagged candidate; sentiment-scout + desk chief do the hard thinking against CGC, CFTC, WASDE, crop progress, etc.
4. **Seasonal phase is king for impact.** Same weather event has 3x different weight depending on phenology.
5. **Source tiers from your list are first-class.** Your 36 accounts are the highest-signal feed for prairie farmers.
6. **Farmer votes (`signal_feedback`) are a powerful modifier and learning signal**, not the sole truth (especially early).
7. **Versioned, reviewable rules.** Rubrics live in docs + code constants so they can be audited and improved grain-by-grain.
8. **Transparency.** Metadata should be (optionally) visible to power users / in Bushy citations so farmers understand *why* a signal is ranked high.

### Dimension 1: Temporal Relevance & Staleness
- **Rules (initial proposal — tune per grain/season):**
  | Signal Type | 0-24h | 24-72h | 3-7d | 7-14d | >14d | Notes |
  |-------------|-------|--------|------|-------|------|-------|
  | Weather event / crop condition | Critical (no decay or +bonus) | High | Medium (decay starts) | Low | Stale unless structural | Grain fill / heading windows are hyper-sensitive |
  | Farmer selling pressure / basis | High | High | Medium | Low | Noise | Basis moves fast |
  | Analyst commentary / report surprise | High | High | Medium | Low | Context only | Good for historical |
  | Policy / tax / tariff | Medium | High | High | Medium | Medium | Slower moving but high impact |
  | Structural (seeding intent, acreage) | Low decay | ... | ... | ... | High value | Long shelf life |

- Formula sketch (deterministic in scout layer): `temporal_multiplier = base * (1 - decay_rate * days_old) + phase_sensitivity_bonus`
- Grain-week alignment check: flag if `post_date` is misaligned with current `grain_week` (data quality).

### Dimension 2: Source Credibility (Your Exact 36-Account List)
**Tier 1 — Prairie Grain Alpha (highest boost, author-boosted queries, "trusted_prairie" flag)**
`@realagriculture, @GrainsGorilla, @ksetzergrains, @GoddessofGrain, @StandardGrain, @LeftFieldCR, @ArlanFF101`

**Tier 2 — Strong Ag Media / Reporting**
`@AgNews, @agripulse, @AgriMarketing, @agritalk, @AgweekMagazine, @dtnpf, @FarmBureau, @FarmIndustryNew, @FarmJournal, @FarmsNews, @FertilizerWeek1, @profarmer, @ReutersAg, @RyanBonnett1, @sizov_andre, @SuccessfulFarm, @USFarmReport, @usgrainscouncil`

**Tier 3 — Policy / Weather / Official**
`@kannbwx, @NOAADrought, @USDA, @usdaFSA, @USDAFoodSafety, @FarmBureau`

**Tier 4 — Inputs / Tech / Seed / Equipment (lower base, still useful for context)**
`@Asgrow_DEKALB, @BayerTraits, @Case_IH, @JohnDeere, @PioneerSeeds, @gaurav_kochar`

**Boost Rules (Scout layer, deterministic):**
- Tier 1: +30 to base_relevance or 1.4x multiplier + strong `from:` operator preference in queries.
- Tier 2: +15
- Tier 3: +20 (official caveat noted in metadata: "gov_source — verify against raw data")
- Tier 4: +5
- Unlisted but farming-relevant: +0, lower priority in pulse scans.
- Future: per-author historical "precision" score from farmer votes + Claude corroboration (stored separately, not at discovery time).

### Dimension 3: Grain Scope & Cross-Commodity Impact
- Fields: `primary_grain`, `grain_tags: string[]`, `cross_impact_notes: string` (or structured JSON).
- Initial matrix (example for Wheat HRW drought):
  - Primary: Winter Wheat, Spring Wheat, Durum (high)
  - Secondary/ripple: Canola (basis/logistics pressure), Barley/Oats (moderate)
- Scout can do simple keyword + co-mention detection. Claude validates real economic linkage.

### Dimension 4: Seasonal / Phenological Phase
- Classifier (keywords + region + calendar window + known crop calendars):
  - Planting / Seeding (Apr–early Jun prairie)
  - Heading / Flowering
  - Grain Fill (critical for yield)
  - Harvest / Swathing / Combining
  - Post-harvest / Marketing Window / Binning decisions
- Weight table: Grain fill drought/frost = 1.5–2.0x multiplier on supply shock scores. Planting delay = high for next-year acreage/intent signals.
- Scout attaches best-guess phase from observable signals. Claude confirms with official crop progress data.

### Dimension 5: Compounding Factors & Catalysts (incl. Upcoming Weather)
- Structured `catalyst_flags: string[]` and `compounding: boolean`.
- Examples: `["upcoming_WASDE_3d", "policy_Argentina_tax_cut", "strong_old_crop_export_pace", "NOAA_heat_dome_forecast", "CFTC_positioning_shift"]`.
- Weather systems: Scout can surface posts that mention "next 7-10 days", "forecast", "heat", "rain". Full forecast integration is future (could use firecrawl or dedicated NOAA tool later).
- Bonus: +10–20 impact points when 2+ independent catalysts align with a core signal.

### Dimension 6: Impact Valuation, Ranking & Categorization
**Multi-factor Scorecard (0-100 total, tunable weights):**
- Supply / Yield / Stocks Shock Potential: 0–40
- Farmer Actionability (haul/hold, pricing, seeding decisions): 0–25
- Timeliness / Freshness (temporal + phase alignment): 0–15
- Source Quality & Corroboration: 0–10
- Cross-grain / Regional Breadth: 0–10

**Tiers (for UI surfacing, Bushy priority, scout alerting):**
- 90–100: **Critical** (auto-pin to top of tape, special Bushy treatment, immediate Claude review flag)
- 75–89: **High**
- 60–74: **Medium** (current display gate roughly aligns here)
- <60: **Low / Noise** (still stored for audit/learning, filtered from most surfaces)

**Controlled Category Taxonomy (expandable, versioned):**
`weather-drought`, `weather-frost`, `weather-excess-rain`, `supply-shock`, `demand-surprise`, `basis-local`, `farmer-selling-pressure`, `analyst-forecast`, `policy-tax-tariff`, `export-pace`, `logistics-rail-port`, `CFTC-positioning`, `report-WASDE-surprise`, `planting-progress`, `harvest-progress`, `protein-quality`, etc.

**Affected Areas (queryable arrays):**
- `affected_regions: string[]`
- `affected_grains: string[]`
- `affected_decisions: string[]` ("haul-hold", "forward-contract", "seeding-2027", "protein-blending", "elevator-bids")

---

## 4. Scout (Grok X Pulse) vs. Claude Agent Desk Boundary (Non-Negotiable)

**Grok X Pulse Scout responsibilities (what we build / run with native tools + trusted accounts):**
- High-recall, low-noise candidate discovery using author-boosted queries (Tier 1 heavy) + semantic + advanced keyword.
- Deterministic guardrails (enhanced `farming-filter` + new `signal-tagger`).
- Attach rich observable metadata (tiers, phases, flags, base scores).
- Persist raw post + metadata to `x_market_signals` (or via future gateway).
- **Never** perform cross-reference with CGC/CFTC/WASDE, never assign final "this moves the thesis stance +15", never write to `market_analysis` or thesis packets.

**Claude Agent Desk (sentiment-scout + specialists + desk chief) responsibilities:**
- Consume the enriched signals (via RPC or direct query on the new metadata columns/JSONB).
- Cross-reference with every official and derived source.
- Compute or adjust final impact valuation in context of the full thesis.
- Decide thesis-level implications ("this is the dominant bull driver for Wheat this week").
- Handle farmer feedback learning loop over time.

This split is exactly what the 2026-04-18 design doc and current CLAUDE.md intend. The framework makes the handoff *much* higher fidelity.

---

## 5. Storage & Config Recommendations

**Short-term (minimal migration, maximum flexibility):**
- Add to `x_market_signals`:
  - `source_cred_tier text` (or enum)
  - `signal_metadata jsonb` — all the rich tags (phases, catalysts, impact_breakdown, affected_*, etc.). Queryable with GIN indexes where needed.
  - `seasonal_phase text`, `primary_impact_grain text`, `cross_impact_grains text[]` (or keep mostly in JSONB initially).
- Keep `relevance_score` as the "Scout base + deterministic boosts" score. Add `final_impact_score` (or let Claude write an adjusted one) later if desired.
- New table (optional, nice for audit): `signal_scoring_rules` (version, dimension, grain, rules_json, effective_date).

**Config artifacts (first things to build after approval):**
1. `lib/x-api/trusted-accounts.ts` — typed export of your exact 36 accounts, 4 tiers, boost values, `getAuthorBoost(handle)`, `buildAuthorBoostedQueryFragment(grain, tierFilter?)`.
2. `lib/x-api/signal-valuation.ts` (or inside enhanced farming-filter) — pure deterministic functions for phase classification, catalyst detection, base scoring, temporal multiplier. No LLM calls. Fully testable.
3. Versioned rubric reference in `docs/reference/x-signal-scoring-rubrics-v1.md` (or in the plan doc itself).

**Future gateway/collector (per 2026-04-18 design):**
- The Edge Function and `collect-x-signals` scheduled task should import and use the trusted-accounts + valuation modules for query construction and initial metadata attachment.
- Rate limiting, dedup on post_url or (author, date, grain) hash, budget tracking remain critical.

---

## 6. Implementation Roadmap (Grain-by-Grain, Low Risk)

1. **Review & iterate this doc** (this session + next). Get sign-off on rubrics, tiers, boundary, and weights.
2. **Create `lib/x-api/trusted-accounts.ts`** + unit tests (exact user list, no behavior change yet).
3. **Enhance / extend farming-filter.ts** (or new sibling module) with deterministic tagging functions. Add tests using real wheat scan examples as fixtures.
4. **Add metadata columns/JSONB** via migration + `pre-commit-validator` + data-audit review.
5. **Backfill or re-scan** a recent high-signal period (e.g., the May 2026 Wheat drought cluster) with new tags for validation.
6. **Wire richer context** into Bushy advisor prompts and overview signal components (show key metadata badges: "Tier 1 • Grain Fill • Critical 92").
7. **Update sentiment-scout prompt / context builder** (in `.claude/agents/`) to expect and leverage the new structured fields.
8. **Grain-by-grain tuning passes** (start with Wheat + Canola, then the other 7 V1 thesis grains). Use farmer `signal_feedback` + Claude desk review as the tuning signal.
9. **Build the actual X API v2 gateway + collector** (only after the valuation layer is solid — otherwise we just store better noise faster).

---

## 7. Risks, Mitigations & Open Questions

**Risks:**
- Over-engineering at discovery layer (Scout starts doing light synthesis) → strict code review + tests + policy reminders in the modules.
- Source tier bias / echo chamber → keep Tier 3 official caveats, require multi-source corroboration for Critical tier, track vote outcomes by tier over time.
- Seasonal mis-classification on edge cases (late planting years) → make classifier conservative + overridable in metadata; Claude always has final say.
- JSONB query performance / complexity → start minimal, add specific columns only when query patterns prove the need. Use generated columns or views for common access paths.
- Farmer confusion if too many badges → progressive disclosure (compact view first, "why this score" expandable).

**Open Questions for Review:**
1. Exact numeric weights in the 0-100 scorecard — should SupplyShock be 50 pts for wheat during sensitive phases?
2. Should we persist a "Claude-adjusted final score" column, or keep it purely in the intelligence layer?
3. How visible should the rich metadata be to regular farmers vs. power users / in Bushy?
4. Do we want a `signal_scan_log` enhancement to record which rules fired for each batch (excellent for auditing the guardrails themselves)?
5. Phasing of the rubric: v1 (deterministic + basic cross flags) vs. v2 (historical precision per author + light ML on votes)?

---

## Next Steps

1. **You review this document** grain-by-grain. Flag anything too aggressive, too conservative, or missing.
2. Once aligned, the first concrete artifact is `lib/x-api/trusted-accounts.ts` (pure data + helpers, zero behavior change).
3. We then build the deterministic tagging layer and the minimal schema extension together, with full tests against the wheat drought cluster and future per-grain scans.
4. Only after that do we touch the gateway, collector, or prompt updates for the Claude side.

This framework turns the "good scout" you validated into a **production-grade, trustworthy intelligence input** that respects every architectural boundary in the project while directly answering the hard questions you raised.

Ready for your feedback, refinements, and grain-by-grain walkthrough.

---

*This proposal was generated after full codebase exploration of the current guardrails, schema, policy documents, consumption points, and the live wheat scan results. No code changes or new skills were implemented in the creation of this document.*
