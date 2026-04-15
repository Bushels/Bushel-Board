# Claude Agent Desk — Design Doc

**Date:** 2026-04-15
**Status:** Approved
**Author:** Kyle + Claude (brainstorming)
**Track:** 41 — Claude Agent Desk
**Depends on:** Track 40 (Parallel Pipeline Orchestrator)
**Replaces:** Grok-only analysis pipeline (analyze-grain-market Edge Function)

---

## Problem

The current intelligence pipeline runs Grok as a single-pass analyst per grain. One model, one perspective, no internal challenge. When Grok misses a signal or over-indexes on one data point, there's no safety net — the thesis goes straight to farmers. The parallel-debate script proved that multi-model analysis catches errors (Canola Week 31: Grok revised from -20 to +10 after terminal flow evidence was surfaced), but it required manual orchestration.

Farmers are making real delivery decisions based on these stances. The thesis needs to be built from multiple independent perspectives, challenged internally, and resolved with conviction.

## Solution

A **Claude-powered agent swarm** that runs every Friday evening as a Claude Code scheduled task. Six scout agents extract data in parallel, three specialist agents synthesize independent theses, and one desk chief resolves divergence and produces the final stance. All agents are Claude. xAI API provides `web_search` and `x_search` as data retrieval tools for fresh market intelligence. Grok stays in the Bushy chat application only.

Daily data collector tasks run throughout the week so that by Friday, all source data is current in Supabase.

---

## 1. Two-Layer Architecture

### Layer 1: Daily Data Collectors

Lightweight Claude Code scheduled tasks that wake on release days, fetch fresh data, and write to Supabase. Each is a standalone task — not a team, not a swarm.

```
MON  4:30 PM ET — USDA Crop Progress (Apr-Nov only)
WED  varies     — Government Grain Monitor (grainmonitor.ca)
THU  9:00 AM ET — USDA Export Sales
THU  2:30 PM ET — CGC Weekly Grain Stats (import-cgc pipeline)
FRI 12:30 PM ET — USDA WASDE (monthly only, ~10th-12th)
FRI  4:00 PM ET — CFTC COT
FRI  5:00 PM ET — Grain Monitor (if not published Wednesday)
```

Collectors are responsible for:
1. Fetching data from known URL or API
2. Parsing into structured rows
3. Writing to Supabase via MCP
4. Logging data freshness metadata (source date, grain_week, shipping_week)
5. Flagging stale data: "Grain Monitor showing shipping Week 33, CGC is at Week 35"

Stats Canada Field Crop Survey releases 3x/year (March, June, December) — handled as a special collector when scheduled.

### Layer 2: Friday Swarm

The full agent desk runs Friday evening (~7:00 PM ET) after all the week's data has landed in Supabase. The swarm does NOT fetch external data — it only reads what the collectors already stored. This separation means:

- Scouts are fast and deterministic (Supabase queries only)
- If a collector fails Tuesday, you know before Friday
- The swarm can re-run without re-fetching anything
- The macro-scout is the one exception: it uses xAI web_search/x_search for breaking news that may not be in any structured source

---

## 2. Data Release Calendar

| Day | Time (ET) | Report | Source | Supabase Table | Collector |
|-----|-----------|--------|--------|----------------|-----------|
| Mon | 4:00 PM | USDA Crop Progress | nass.usda.gov | `usda_crop_progress` | `collect-crop-progress` |
| Wed | varies | Government Grain Monitor | grainmonitor.ca | `grain_monitor_snapshots` | `collect-grain-monitor` |
| Thu | 8:30 AM | USDA Export Sales | fas.usda.gov | `usda_export_sales` | `collect-export-sales` |
| Thu | ~2:00 PM | CGC Weekly Grain Stats | grainscanada.gc.ca | `cgc_observations` | existing `/api/pipeline/run` |
| Fri | 12:00 PM | USDA WASDE (monthly) | usda.gov | `usda_wasde_estimates` | `collect-wasde` |
| Fri | 3:30 PM | CFTC COT | cftc.gov | `cftc_cot_positions` | existing `import-cftc-cot` |
| 3x/yr | varies | Stats Canada Field Crop | statcan.gc.ca | (new table or manual) | `collect-statcan` |

**Data freshness rules for agents:**
- CGC data uses `grain_week` dating — may be 1-2 weeks behind calendar
- Grain Monitor uses shipping weeks — may lag CGC grain_week
- USDA weekly data aligns to US marketing year (Jun-May for wheat)
- Agents MUST flag when working with stale data in their briefs

---

## 3. Friday Swarm: Agent Architecture

### Phase 1: Scout Dispatch (6 agents, parallel)

All scouts read from Supabase. Each produces a structured JSON brief per grain.

| Scout | Question It Answers | Data Sources (Supabase) | External Tools |
|-------|-------------------|------------------------|----------------|
| **supply-scout** | "How much grain is moving into the system?" | `v_country_producer_deliveries`, `v_grain_yoy_comparison`, `get_pipeline_velocity` RPC | None |
| **demand-scout** | "Who's buying and at what pace?" | `cgc_observations` (exports, crush), `usda_export_sales`, `get_usda_export_context` RPC | None |
| **basis-scout** | "What are prices telling us?" | `grain_prices`, `posted_prices`, `get_area_prices` RPC | None |
| **sentiment-scout** | "What are farmers and funds doing?" | `grain_sentiment_votes`, `cftc_cot_positions`, `x_market_signals`, `get_cot_positioning` RPC | None |
| **logistics-scout** | "Can the system physically move grain?" | `grain_monitor_snapshots`, `producer_car_allocations`, `get_weekly_terminal_flow` RPC | None |
| **macro-scout** | "What's happening globally that affects price?" | `usda_wasde_estimates`, `usda_crop_progress` | xAI `web_search`, xAI `x_search` |

**Scout output format** (per grain):
```json
{
  "grain": "Canola",
  "data_week": 35,
  "data_freshness": "CGC Week 35, Grain Monitor shipping Week 33 (2 weeks lag)",
  "findings": [
    { "metric": "deliveries_yoy_pct", "value": -12.5, "signal": "bullish", "note": "Farmer withholding" },
    { "metric": "stocks_wow_change_kt", "value": -95, "signal": "bullish", "note": "System absorbing" }
  ],
  "summary": "Supply tightening — deliveries down, stocks drawing, system in net absorption mode."
}
```

### Phase 2: Specialist Synthesis (3 agents, parallel)

Each specialist reads ALL 6 scout briefs. Produces per-grain thesis with stance_score recommendation.

| Specialist | Synthesis Focus | Viking Knowledge | Key Rules |
|-----------|----------------|-----------------|-----------|
| **export-analyst** | "Should farmers sell into the export pipeline?" | L0 + L1 (logistics_exports, market_structure) + L2 queries | Rule 3 (export lag + stock draw = logistics), Rule 7 (logistics weight) |
| **domestic-analyst** | "Is domestic demand absorbing supply?" | L0 + L1 (basis_pricing, storage_carry, grain_specifics) + L2 queries | Rule 1 (stock direction trumps YTD), Rule 2 (absorption rate) |
| **risk-analyst** | "What could break this thesis?" | L0 + L1 (risk_management, hedging_contracts, market_structure) + L2 queries | Rule 4 (2-of-3 confirmation), Rule 8 (producer car divergence) |

**Specialist output format** (per grain):
```json
{
  "grain": "Canola",
  "stance_score": 25,
  "confidence": 70,
  "thesis": "Crush margins strong and stocks drawing. Export pace lagging but logistics constrained, not demand.",
  "bull_factors": ["Stock draw -95 Kt WoW", "Crush utilization 87%", "Basis narrowing at Moose Jaw"],
  "bear_factors": ["Exports -25% YoY", "CFTC managed money reducing longs"],
  "risk_flag": "If vessel queue clears and exports don't pick up in 2 weeks, the logistics excuse expires."
}
```

### Phase 3: Desk Chief Resolution (team lead)

The desk chief reads all 3 specialist briefs per grain. It has the most complete context:

**Viking knowledge:** L0 (always) + ALL L1 topics + L2 (targeted queries per grain for specific book passages)

**Debate rules:** All 15 rules from `docs/reference/agent-debate-rules.md` baked into prompt

**Resolution protocol:**
1. Compare 3 specialist stance_scores per grain
2. If max divergence ≤15 points → average and weight by confidence
3. If max divergence >15 points → internal debate round:
   - Quote the divergent specialist positions
   - Apply debate rules to resolve (especially Rule 5: never publish contradictions)
   - Produce resolved score with explicit reasoning
4. For each grain, output the final thesis structure matching `market_analysis` schema

**Desk chief output** (per grain):
```json
{
  "grain": "Canola",
  "stance_score": 15,
  "confidence_score": 65,
  "data_confidence": "medium",
  "initial_thesis": "Crush demand provides floor but export pipeline must prove itself in next 2 weeks.",
  "bull_case": "Domestic crush absorbing supply at 87% utilization. Stocks drew 95 Kt WoW. Basis narrowing.",
  "bear_case": "Exports -25% YoY. Managed money reducing net longs. Vessel queue only 18 (below avg).",
  "final_assessment": "HOLD 2 WEEKS. Crush is doing the work but the export story needs proof. If terminal exports don't pick up by Week 37, the bearish case strengthens. Price a 20% slice if basis narrows further at your elevator.",
  "historical_context": { ... },
  "key_signals": [ ... ]
}
```

### Phase 4: Write Results + Downstream

1. Upsert 16 `market_analysis` rows via Supabase MCP
2. Insert `score_trajectory` rows for prediction tracking
3. Trigger `generate-farm-summary` (existing Edge Function, self-chains)
4. Run `validate-site-health`
5. Log swarm run metadata to `pipeline_runs` table

---

## 4. Viking Knowledge Per Agent Tier

| Tier | L0 (Worldview) | L1 (Topics) | L2 (Chunks) |
|------|---------------|-------------|-------------|
| **Scouts** | ✅ Always | ❌ Not needed — scouts extract data, not reason | ❌ |
| **Specialists** | ✅ Always | ✅ Role-matched topics (2-3 per specialist) | ✅ Query-matched chunks (up to 3 per grain) |
| **Desk Chief** | ✅ Always | ✅ ALL 7 topics loaded | ✅ Targeted queries per grain where divergence exists |

**L2 access:** Specialists and desk chief call `get_knowledge_context(p_query, p_grain, p_topics, p_limit)` RPC via Supabase MCP. 2,026 chunks currently populated from 8 books.

---

## 5. Agent Definitions

Each agent is a `.claude/agents/*.md` file with focused role, tools, and output schema.

### New agents to create:

| Agent File | Role | Model | Tools |
|-----------|------|-------|-------|
| `supply-scout.md` | Extract delivery, stock, and pipeline velocity data | Haiku | Supabase MCP |
| `demand-scout.md` | Extract export, crush, and domestic demand data | Haiku | Supabase MCP |
| `basis-scout.md` | Extract price, basis, and posted price data | Haiku | Supabase MCP |
| `sentiment-scout.md` | Extract farmer votes, CFTC COT, and X signals | Haiku | Supabase MCP |
| `logistics-scout.md` | Extract terminal flow, port, rail, and producer car data | Haiku | Supabase MCP |
| `macro-scout.md` | Extract USDA/global context + search for breaking news | Sonnet | Supabase MCP, xAI web_search, xAI x_search |
| `export-analyst.md` | Synthesize export pipeline thesis per grain | Sonnet | Supabase MCP (L2 queries) |
| `domestic-analyst.md` | Synthesize domestic demand thesis per grain | Sonnet | Supabase MCP (L2 queries) |
| `risk-analyst.md` | Challenge thesis, identify risks per grain | Sonnet | Supabase MCP (L2 queries) |

The **desk chief** role is played by the scheduled task's main Claude session (Opus-class). No separate agent definition needed — it IS the team lead.

### Agent count: "16 Agriculture Trained AI Agents"

Per the Overview badge:
- 6 scouts + 3 specialists + 1 desk chief = 10 distinct agent roles
- Running across 16 grains = 16 independent analyses
- The badge remains accurate — 16 grains, each analyzed by a trained agent team

---

## 6. Scheduled Task Configuration

### Daily collectors (6 tasks):

```
collect-crop-progress   — cron: "32 16 * * 1" (Mon 4:32 PM ET, Apr-Nov)
collect-grain-monitor   — cron: "17 14 * * 3" (Wed 2:17 PM ET)
collect-export-sales    — cron: "3 9 * * 4"   (Thu 9:03 AM ET)
collect-cgc             — cron: "33 14 * * 4"  (Thu 2:33 PM ET) — triggers /api/pipeline/run import-only
collect-cftc-cot        — cron: "7 16 * * 5"   (Fri 4:07 PM ET)
collect-wasde           — cron: "33 12 10-14 * 5" (Fri 12:33 PM ET, 10th-14th only)
```

### Weekly swarm (1 task):

```
grain-desk-weekly       — cron: "47 18 * * 5"  (Fri 6:47 PM ET)
```

Note: Times are deliberately off-round to avoid API congestion (per cron scheduling best practices).

---

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| A scout fails for one grain | That grain's scout data is marked "unavailable". Specialists work with remaining 5 scouts. Desk chief notes reduced confidence. |
| A specialist diverges >15 pts from others | Desk chief runs debate round with explicit evidence chain (Rule 5). |
| xAI web_search fails | Macro-scout proceeds with Supabase data only. Flags "no real-time search available" in brief. |
| L2 knowledge query returns empty | Specialists proceed with L0+L1 only. Desk chief notes "no book-specific guidance found." |
| A daily collector fails | Logged. Friday swarm runs with stale data for that source. Desk chief flags freshness gap. |
| All scouts fail for a grain | Grain is skipped. Not scored. Previous week's score retained on dashboard. |

---

## 8. What Changes vs What Stays

| Component | Change |
|-----------|--------|
| `analyze-grain-market` Edge Function | Kept as fallback. Not the primary pipeline anymore. |
| `/api/pipeline/run` orchestrator | Kept for manual triggers and CGC import. |
| `generate-farm-summary` Edge Function | No changes — triggered by swarm Phase 4 |
| `validate-site-health` Edge Function | No changes — triggered by swarm Phase 4 |
| `market_analysis` table | No schema changes — swarm writes same columns |
| `pipeline_runs` table | Swarm writes run metadata here too |
| Overview page | No changes — already shows thesis + badge from Track 40 |
| **New:** 9 agent definitions in `.claude/agents/` | Scout + specialist agent files |
| **New:** 7 scheduled tasks | 6 daily collectors + 1 weekly swarm |
| **New:** xAI API key in `.env.local` | For macro-scout web_search/x_search |

---

## 9. Cost Estimate

| Component | Per Run | Frequency | Monthly Cost |
|-----------|---------|-----------|-------------|
| 6 Haiku scouts (16 grains each) | ~$0.50 | Weekly | ~$2 |
| 3 Sonnet specialists (16 grains each) | ~$1.50 | Weekly | ~$6 |
| 1 Opus desk chief (16 grains) | ~$2.00 | Weekly | ~$8 |
| L2 knowledge queries | negligible | Weekly | — |
| xAI web_search/x_search | ~$0.10 | Weekly | ~$0.40 |
| Daily collectors (6 tasks) | ~$0.05 each | 6x/week | ~$1.20 |
| **Total** | ~$4.15/week | | **~$17.60/month** |

Compared to Grok-only pipeline: ~$8-12/month (16 × grok-4.20 calls). The upgrade adds ~$6-10/month for dramatically better thesis quality.

---

## 10. Deferred

| Feature | Why defer |
|---------|-----------|
| Intra-week thesis updates (daily stance adjustments) | Weekly cadence sufficient for alpha. Collectors build the data; analysis stays weekly. |
| Automated retry for failed grains | Manual retry via `/api/pipeline/run?grains=X` sufficient |
| Farmer-visible agent names | "16 Agriculture Trained AI Agents" only. No model names. |
| Grok debate round (Claude vs Grok) | Replaced by internal specialist divergence resolution. Grok stays in Bushy chat only. |
| Claude Agent SDK (external agent spawning) | Claude Code team system is sufficient. SDK adds complexity without benefit for scheduled tasks. |

---

## 11. Migration Path

1. **Week 1:** Create agent definitions + daily collector tasks. Run collectors alongside existing pipeline.
2. **Week 2:** Run first Friday swarm. Compare output against existing Grok-only analysis.
3. **Week 3:** If swarm quality is equal or better, make swarm the primary. Keep Grok pipeline as fallback.
4. **Week 4:** Disable Grok pipeline. Swarm is production.
