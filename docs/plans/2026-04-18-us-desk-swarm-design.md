# US Desk Swarm — Design Doc

**Author:** Claude (Opus 4.7) • **Date:** 2026-04-18 • **Status:** approved, building this turn

## TL;DR

Mirror the Canadian grain-desk Friday swarm on the US side. **No Grok anywhere** — Claude (Haiku scouts + Sonnet specialists + Opus chief) end-to-end, with Anthropic native `web_search` and our planned X API v2 gateway replacing xAI search.

## Scope

- 4 markets: **Corn, Soybeans, Wheat, Oats** (same set as current single-pass Grok script)
- 5 scouts (no basis/logistics/farmer-sentiment scout — no US data for those yet)
- 4 specialists (export, domestic, price, risk — matches CAD shape)
- 1 desk chief (Opus) — own prompt, not the CAD one
- 1 weekly meta-reviewer (Opus, Saturday)

## Why a separate US swarm

- **Different data sources:** WASDE/PSD (monthly) + FAS Export Sales (weekly) + NASS Crop Progress (weekly Apr–Nov) + CFTC COT — no CGC, no AAFC, no producer cars.
- **Different grain list:** 4 vs 16; tier model collapses (all 4 are MAJOR equivalents).
- **Different target reader:** US grain producer asking "should I price corn this week?", not Canadian prairie farmer.
- **Different writing rules:** US farmers watch CBOT spreads, corn/ethanol, soy crush margin — a distinct rule set from Rule 13 basis on ICE Canola.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  us-desk-chief (Opus)                                            │
│  - Phase 0 freshness gate, Phase 1 scout dispatch in parallel    │
│  - Phase 2 specialist dispatch (4 Sonnet agents)                 │
│  - Phase 3 divergence resolution (>15pt internal debate)         │
│  - Phase 4 write us_market_analysis / us_grain_intelligence      │
│  - Phase 5 self meta-review (same as CAD)                        │
└─────────────────────────────────────────────────────────────────┘
         │                                      │
         │ (dispatch)                           │ (synthesize)
         ▼                                      ▼
┌────────────────────────────┐    ┌────────────────────────────┐
│ 5 scouts (Haiku, parallel) │    │ 4 specialists (Sonnet)     │
│ • us-wasde-scout           │    │ • us-export-analyst        │
│ • us-export-scout          │    │ • us-domestic-analyst      │
│ • us-conditions-scout      │    │ • us-price-analyst         │
│ • us-price-scout           │    │ • us-risk-analyst          │
│ • us-cot-scout             │    │                            │
│ • us-macro-scout           │    │                            │
└────────────────────────────┘    └────────────────────────────┘
```

(6 scouts total — us-macro-scout is the 6th, split from the others because it uses web_search + X API.)

## Scout responsibilities

| Scout | Data source | Key signals extracted |
|---|---|---|
| **us-wasde-scout** | `usda_wasde_mapped`, `usda_wasde_estimates`, `get_usda_wasde_context` | Ending stocks, S/U ratio, MoM revision direction, production, exports, US vs World split |
| **us-export-scout** | `usda_export_sales`, `get_usda_export_context`, `get_usda_sales_pace` | Weekly net sales, shipped, outstanding commitments, pace vs USDA target, top buyers (China, Mexico, Japan) |
| **us-conditions-scout** | `usda_crop_progress`, `get_usda_crop_conditions` | G/E %, condition index, YoY delta, planted/emerged/harvested pace vs 5yr avg. Apr–Nov only |
| **us-price-scout** | `grain_prices` (CBOT ZC/ZS/ZW/ZO, KCBT KE, MGEX MW) + `v_latest_grain_prices` | Settles, 1W/4W % change, cross-market spreads (soy/corn ratio, wheat class spreads, soy complex crush) |
| **us-cot-scout** | `cftc_cot_positions`, `get_cot_positioning` | Managed money net long/short, commercial net, spec/commercial divergence, 4-week trajectory |
| **us-macro-scout** | Anthropic `web_search_20250305` + X API v2 gateway | Tariff/trade (China–US, Mexico), weather, South American harvest, Black Sea competing origin, ethanol mandate, biofuel tax credit |

**No Grok.** Macro-scout uses Anthropic's native web_search tool (server-side) and our new X API v2 `x-api-search` Edge Function (scoped 2026-04-18).

## Specialist responsibilities

| Specialist | Question answered | Primary Viking topics |
|---|---|---|
| **us-export-analyst** | "Is the US pipeline moving grain fast enough vs USDA target?" | logistics_exports, market_structure |
| **us-domestic-analyst** | "Is domestic usage (feed/ethanol/crush) absorbing supply?" | grain_specifics, storage_carry |
| **us-price-analyst** | "Is CBOT tape confirming or contradicting the fundamental story?" (enforces Rules 12–15 on US tape) | basis_pricing, market_structure |
| **us-risk-analyst** | "What breaks the thesis: China, weather, fund positioning extremes?" | risk_management, hedging_contracts |

All four read the 6 scout briefs, call `get_knowledge_context` for L2 Viking chunks, and output stance_score (-100…+100), confidence (0–100), thesis, bull/bear factors, recommendation with timeline/trigger/risk_if_wrong.

## Desk Chief (Opus)

New orchestrator file `docs/reference/us-desk-swarm-prompt.md`. Mirrors CAD structure:

- **Phase 0:** Verify Opus; freshness gate on WASDE (≤35 days), export sales (≤10 days), grain prices (≤4 days), crop progress (≤10 days Apr–Nov)
- **Phase 1:** Dispatch 6 scouts in parallel
- **Phase 2:** Dispatch 4 specialists (export, domestic, price, risk) in parallel with scout briefs
- **Phase 3:** Divergence resolution — if specialist stance scores span >15 pts, run internal debate round
- **Phase 4:** Write `us_market_analysis`, `us_grain_intelligence`, `us_score_trajectory` (scan_type='weekly_debate')
- **Phase 5:** Self meta-review (6 triggers: stale thesis, overconfident-thin-data, platitude padding, price-tape contradiction, sudden swing without catalyst, divergence)
- **Phase 6:** Emit summary to `pipeline_runs` with `source='claude-agent-us-desk'`

Tier model is flat — all 4 markets get MAJOR budget (up to 5 L2 chunks per query, 3 L2 queries if divergent, full phase 4.5 triggers).

## Meta-reviewer

`us-desk-meta-reviewer` runs Saturday, writes to new table `us_desk_performance_reviews`. Same audit framework (bias, calibration, evidence grounding, 2-weeks-prior scorecard) as the CAD reviewer, adapted for 4 markets. Because the sample size is small (4 markets), the directional_bias_score uses percentage skew not count; the accuracy scorecard threshold drops to "any 2 testable markets" before we can write a scorecard.

## Schema changes

**New table only:** `us_desk_performance_reviews` (parallel to `desk_performance_reviews`, with `reviewed_market_name`/`reviewed_market_year` instead of `reviewed_grain_week`/`reviewed_crop_year`).

Everything else reuses existing US tables (`us_market_analysis`, `us_grain_intelligence`, `us_score_trajectory`).

## Scheduling

- **us-desk-weekly** — scheduled task, Fri 7:30 PM ET (`30 19 * * 5`), 45 min after CAD swarm kickoff so they don't compete for MCP / budget. Same Supabase project, same X API gateway.
- **us-desk-meta-reviewer** — Sat 11:00 AM ET.

## Cost envelope (per week)

| Agent role | Model | Cost/run approx |
|---|---|---|
| 6 Haiku scouts × 4 markets worth of data | Haiku 4.5 | $0.02 |
| 4 Sonnet specialists × 4 markets | Sonnet 4.6 | $0.80 |
| Opus chief (Phase 0–6 + writes) | Opus 4.7 | $0.80 |
| Meta-reviewer (Saturday) | Opus 4.7 | $0.40 |
| **Weekly total** | | **~$2.00** |

Well under any practical budget. Less than the current Grok US thesis script in per-run cost, and with far better structure + auditability.

## Migration plan

**Status as of 2026-04-18: Phases 1–3 COMPLETE.** The swarm ran live on 2026-04-18 and wrote 4 market rows + 4 `us_score_trajectory` rows with `model_source='claude-opus-desk-chief-v2'`. Overview board renders from this data.

**Phase 1 ✅ (shipped):** Agent definitions, swarm prompt, migration for `us_desk_performance_reviews` applied. Wired to Claude Desktop Routines (not Vercel cron — V2 is triggered exclusively by Anthropic-native scheduled routines).

**Phase 2 ✅ (skipped the parallel-comparison step):** We elected to cut straight over once the swarm's first live run met the meta-reviewer's coverage gates. `scripts/generate-us-thesis.ts` was never re-scheduled and is retained as a recovery artifact only.

**Phase 3 ✅:** `scripts/generate-us-thesis.ts` is shelved. `XAI_API_KEY` remains in Vercel env purely to keep the legacy V1 CAD pipeline bootable as a last-resort fallback; the US chain no longer references it.

## What this does NOT include

- **US basis scout** — no public data source we've ingested. Add once DTN or Farmer's Advance feed is wired.
- **US logistics scout** — USDA Grain Transport Cost Indicator exists but isn't in our pipeline yet. Defer.
- **US farmer sentiment** — no US farmer users in Bushel Board. N/A.
- **CAD swarm xAI holdover** — CAD macro-scout historically used `scripts/xai-search.ts` for web/x search. V2 CAD swarm now uses Anthropic native `web_search_20250305` + the X API v2 gateway; xAI search is retired from the CAD chain.

## Definition of Done (Phase 1)

- [x] Design doc committed
- [ ] 6 US scout .md files in `.claude/agents/`
- [ ] 4 US specialist .md files in `.claude/agents/`
- [ ] `us-desk-meta-reviewer.md` in `.claude/agents/`
- [ ] `docs/reference/us-desk-swarm-prompt.md` authored
- [ ] Migration for `us_desk_performance_reviews` applied
- [ ] Scheduled task `us-desk-weekly` created (but not enabled until Kyle approves cutover)
