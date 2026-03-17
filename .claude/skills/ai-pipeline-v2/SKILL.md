---
name: ai-pipeline-v2
description: Intelligence pipeline v2 architecture — Senior Analyst pattern, xAI Responses API, research tiers, grain_week resolution, self-batching chain. Reference when working on Edge Functions, intelligence generation, or pipeline debugging.
---

# AI Pipeline v2 — Senior Analyst Architecture

## Pipeline Chain (Current — Manual Trigger)

All crons disabled as of 2026-03-17. Trigger manually via curl or Vercel dashboard.

```
Manual GET /api/cron/import-cgc
  → validate-import
  → analyze-grain-market (v2, single-pass Senior Analyst)
  → generate-farm-summary
  → validate-site-health
```

**v1 legacy chain (retained for recovery):**
`validate-import → search-x-intelligence → analyze-market-data → generate-intelligence → generate-farm-summary`

## Senior Analyst Pattern

`analyze-grain-market` Edge Function replaces the dual-LLM chain (`analyze-market-data` + `generate-intelligence`).

### How It Works
1. **Model:** `grok-4-1-fast-reasoning` via xAI Responses API (`XAI_API_KEY` secret)
2. **Native tools:** Model autonomously uses `web_search` + `x_search` based on research tier
3. **Pre-computed analyst ratios** injected into prompt — LLM interprets, not calculates
   - Export pace, stocks-to-use, crush utilization
   - Delivery/export vs 5-year average
   - Source: `lib/data-brief.ts`
4. **Dynamic shipping calendar** provides temporal context
   - Data lag, seasonal framing
   - Source: `lib/shipping-calendar.ts`
5. **Commodity knowledge** (~7K tokens) injected as domain expertise
   - Trading frameworks from 3 PDF books
   - Marketing strategy, logistics, COT positioning analysis
   - Source: `supabase/functions/_shared/commodity-knowledge.ts`

### Research Tiers
| Tier | Grains | web_search | x_search |
|------|--------|------------|----------|
| Major | Wheat, Canola, Barley, Durum | 4 queries | 4 queries |
| Mid | Oats, Flax, Peas, Lentils | 2 queries | 2 queries |
| Minor | Others | 1 query | 1 query |

### Self-Batching
- BATCH_SIZE=1 (one grain at a time)
- Triggers next grain via `enqueue_internal_function` RPC (pg_net)
- Chains to `generate-farm-summary` when all grains complete
- Each grain runs independently — failure of one doesn't block others

### grain_week Resolution
Queries `MAX(grain_week) FROM cgc_observations` — NOT calendar week. This prevents ghost rows from masking current analysis.

### Output Tables
- **`market_analysis`** — primary: thesis, bull/bear cases, historical context, key signals, `stance_score` (-100 to +100)
- **`grain_intelligence`** — backward-compat wrapper

## Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/analyze-grain-market/index.ts` | Main Edge Function |
| `lib/data-brief.ts` | Pre-computed analyst ratios |
| `lib/shipping-calendar.ts` | Dynamic temporal context |
| `lib/analyst-prompt.ts` | System prompt builder |
| `supabase/functions/_shared/commodity-knowledge.ts` | Domain expertise (~7K tokens) |

## LLM Prompt Engineering Lessons

- **Lead with the actionable number.** LLMs anchor on the first numeric value. Put "5 Kt still in bins" before "of 10 Kt starting."
- **Pre-compute arithmetic.** Don't ask the LLM to calculate ratios — inject as pre-computed values.
- **Specify temporal context explicitly.** Tell the model which week each data source covers.

## Intraday Scanning (v1, Still Active When Crons Re-enabled)

`search-x-intelligence` runs in two modes:
- **Pulse:** 3x/day, 2 queries/grain, X-only, 2-day lookback, batch size 8
- **Deep:** Weekly Thursday, 6-8 queries/grain, X + web, 7-day lookback, batch size 4

Major grains scanned every pulse; minor grains morning only.

## CFTC COT Import (Independent Pipeline)

`GET /api/cron/import-cftc-cot` → `import-cftc-cot` Edge Function. Previously Friday 20:30 UTC. Now manual.

## Design Doc
`docs/plans/2026-03-17-pipeline-v2-senior-analyst-design.md`

## Debugging Reference
- `docs/lessons-learned/issues.md` — grain_week mismatch, 150s timeout risk, upsert failures
- `docs/reference/agent-debate-rules.md` — 11 rules for AI thesis quality
