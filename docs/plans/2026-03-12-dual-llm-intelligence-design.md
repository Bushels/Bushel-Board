# Dual-LLM Intelligence Pipeline — Design Document

**Date:** 2026-03-12
**Status:** Approved
**Feature Track:** #17 — Dual-LLM Market Intelligence

## Problem Statement

The current intelligence pipeline relies on a single LLM (Grok) for all market analysis. This means:
- No cross-validation of thesis quality
- Limited historical context (current year + prior year only)
- No commodity trading domain expertise baked into prompts
- Grok bears all analytical load (paid API cost)

## Solution: Dual-LLM Debate Architecture

Add Step 3.5 Flash (free via OpenRouter) as an analytical workhorse that produces a structured market analysis. Grok then reviews, challenges, and synthesizes the final farmer-facing thesis using real-time X/Twitter signals.

### Model Selection

**Step 3.5 Flash** (stepfun/step-3.5-flash:free) was chosen over Nemotron 3 Super based on a benchmark using real Week 30 wheat data:

| Factor | Step 3.5 Flash | Nemotron 3 Super |
|--------|---------------|-----------------|
| Reasoning depth | 1,585 tokens (self-correcting) | 496 tokens |
| Thesis nuance | Short-term vs medium-term distinction | Single directional call |
| JSON compliance | Perfect | Perfect |
| Context window | 256K | 262K |
| Architecture | 196B MoE, 11B active | 120B MoE, 12B active |
| Rate limit | 50 RPM | Not specified |

Step 3.5 Flash's mandatory reasoning produces meaningfully better commodity analysis through self-correcting deliberation.

**Model is configurable** — stored as a constant in the Edge Function. Can swap to Nemotron or any future free OpenRouter model.

## Architecture

### Pipeline Chain (Updated)

```
Current:
  import-cgc-weekly → validate-import → search-x-intelligence
    → generate-intelligence (Grok) → generate-farm-summary (Grok)

New:
  import-cgc-weekly → validate-import → search-x-intelligence
    → analyze-market-data (Step 3.5 Flash, NEW)
    → generate-intelligence (Grok, MODIFIED — debates Step 3.5's analysis)
    → generate-farm-summary (Grok)
```

### Round 1: Step 3.5 Flash (analyze-market-data)

**Inputs:**
- CGC data for current week (same as current pipeline)
- 5-year historical averages via new RPC functions
- Pre-extracted commodity book knowledge (~5K tokens)
- AAFC supply balance
- Anonymized community stats (delivery analytics, sentiment)

**Outputs (stored in `market_analysis` table):**
- Initial thesis (1-2 sentences, directional)
- Bull case (2-3 data-backed bullet points)
- Bear case (2-3 data-backed bullet points)
- Historical context (5-year comparison, seasonal patterns)
- Key signals array (bullish/bearish/watch with confidence)
- Data gaps (what's missing that would change the thesis)

### Round 2: Grok (generate-intelligence, modified)

**Additional inputs (beyond current):**
- Step 3.5 Flash's round-1 analysis from `market_analysis` table

**Prompt framing:** Grok acts as "senior editor reviewing junior analyst's work":
- Cross-validates against real-time X/Twitter market chatter
- Where data and social sentiment AGREE → increase confidence
- Where they DIVERGE → flag as "watch" signal
- Produces final farmer-facing thesis synthesizing both views

### Fallback Behavior

If Step 3.5 Flash fails (down/rate-limited/timeout):
- `generate-intelligence` proceeds with Grok-only (current behavior)
- `market_analysis` row is absent for that week
- Thesis quality degrades gracefully — loses historical context and book knowledge

## Privacy Boundaries

Step 3.5 Flash free tier: `retainsPrompts: true, training: false`

| Data Type | Step 3.5 Flash | Grok |
|-----------|---------------|------|
| CGC aggregate data | Yes | Yes |
| AAFC supply balance | Yes | Yes |
| 5-year historical averages | Yes | Yes |
| Book knowledge (distilled) | Yes | Yes |
| Community sentiment (aggregate) | Yes | Yes |
| Anonymized delivery stats | Yes | Yes |
| X/Twitter signals | No | Yes (x_search) |
| Individual farmer crop plans | Never | Yes |
| User IDs / emails / names | Never | Yes |

## Data Model

### New Table: `market_analysis`

```sql
CREATE TABLE market_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  initial_thesis text NOT NULL,
  bull_case text NOT NULL,
  bear_case text NOT NULL,
  historical_context jsonb NOT NULL,
  data_confidence text NOT NULL,
  key_signals jsonb NOT NULL,
  model_used text NOT NULL,
  llm_metadata jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(grain, crop_year, grain_week)
);
```

### New RPC Functions (for 5-year historical analysis)

```sql
-- 5-year average for any metric at a given grain week
get_historical_average(p_grain, p_metric, p_worksheet, p_grain_week, p_years_back)
→ { avg_value, min_value, max_value, stddev, values_by_year[] }

-- Seasonal pattern across all 52 weeks
get_seasonal_pattern(p_grain, p_metric, p_worksheet, p_years_back)
→ [{ grain_week, avg_value, min_value, max_value }]

-- Current value vs historical percentile
get_week_percentile(p_grain, p_metric, p_worksheet, p_grain_week, p_value, p_years_back)
→ { percentile, years_above, years_below, current_vs_avg_pct }
```

### Historical Data Backfill

- Download CGC CSVs for crop years 2020-2021 through 2023-2024 from grainscanada.gc.ca archives
- Use existing `npm run backfill` script (already idempotent)
- Expected: ~800K additional rows (4 years × ~200K rows/year)
- Total after backfill: ~1.14M rows in `cgc_observations`

### Commodity Book Knowledge

Pre-extract key frameworks from 3 PDFs into `supabase/functions/_shared/commodity-knowledge.ts`:
- "A Trader's First Book on Commodities" (commodity trading fundamentals)
- "Introduction to Grain Marketing" (SK Ministry of Agriculture)
- "Self-Study Guide: Hedging" (ICE Futures Canada)

Distilled into ~5K tokens covering:
- Seasonal price patterns for Canadian grains
- Basis analysis rules (widening/narrowing drivers)
- Bullish vs bearish signal checklist
- Hedging decision framework
- Carry charge analysis
- Export demand indicators

## Edge Function: `analyze-market-data`

**API:** OpenRouter `/api/v1/chat/completions`
**Model:** `stepfun/step-3.5-flash:free` (configurable)
**Auth:** Internal-only (same `x-bushel-internal-secret` pattern)

**Prompt structure:**
1. System: Senior grain analyst persona + commodity knowledge base
2. User: Historical data (5yr) + current week data + AAFC + community stats + analysis task

**Batch processing:** 4 grains per invocation, self-trigger for remaining (same pattern as existing functions). At 50 RPM, 4 batches of 4 grains processes all 16 grains comfortably.

**API call pattern:**
```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${openRouterKey}`,
    "HTTP-Referer": "https://bushelboard.ca",
    "X-Title": "Bushel Board"
  },
  body: JSON.stringify({
    model: "stepfun/step-3.5-flash:free",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: dataPrompt }
    ],
    response_format: { type: "json_object" },
    max_tokens: 2048
  })
});
```

## UI Changes

### Enhanced ThesisBanner
Add expandable "Historical Context" section below thesis:
- 5-year average comparison lines
- Seasonal pattern observations

### Bull/Bear Case Cards (new component)
Two side-by-side cards on grain detail page in "Market Intelligence" section:
- Green bull case / Red bear case
- 2-3 bullet points each from Step 3.5 Flash analysis
- Data source badges (CGC, AAFC, Historical, Community)
- Confidence indicator

### Model Attribution
Small footer: "Analysis by Step 3.5 Flash + Grok" — builds transparency

### No New Pages
All changes fit existing grain detail page layout.

## Cost Impact

| Component | Current | New | Change |
|-----------|---------|-----|--------|
| Step 3.5 Flash (16 grains weekly) | $0 | $0 | Free |
| Grok intelligence | ~$2-3/wk | ~$2-3/wk | Same |
| Grok farm summaries | ~$1-2/wk | ~$1-2/wk | Same |
| Historical storage (800K rows) | N/A | ~$0 | Supabase free tier |
| **Total** | **~$5/month** | **~$5/month** | **Net zero** |

## API Key Storage

- `OPENROUTER_API_KEY` → Supabase Edge Function secret
- Never exposed to browser/client
- Used only in `analyze-market-data` Edge Function

## Future Considerations

- If Step 3.5 Flash free tier ends: swap to another free OpenRouter model or Nemotron
- Could add Nemotron as third opinion ("panel of analysts")
- `market_analysis` table enables A/B testing: weeks with vs without Step 3.5 Flash
- Dynamic data retrieval: Step 3.5 Flash could gain tool-calling to query more data mid-analysis (v2)
- Could expand to pulse-mode analysis (3x daily, not just weekly)
