# Dual-LLM Intelligence Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Step 3.5 Flash as an analytical workhorse in a 2-round debate with Grok, backed by 5-year historical CGC data and commodity book knowledge.

**Architecture:** New `analyze-market-data` Edge Function calls Step 3.5 Flash via OpenRouter, stores structured analysis in `market_analysis` table. Modified `generate-intelligence` feeds Step 3.5's analysis to Grok for cross-validation. New RPC functions provide 5-year historical aggregations. UI adds bull/bear case cards and historical context.

**Tech Stack:** Supabase Edge Functions (Deno), OpenRouter API, PostgreSQL RPC functions, Next.js React components, Tailwind CSS

**Design Doc:** `docs/plans/2026-03-12-dual-llm-intelligence-design.md`

---

### Task 1: Create `market_analysis` table migration

**Files:**
- Create: `supabase/migrations/20260312120000_create_market_analysis.sql`

**Step 1: Write the migration**

```sql
-- Create market_analysis table for Step 3.5 Flash round-1 output
CREATE TABLE IF NOT EXISTS market_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  initial_thesis text NOT NULL,
  bull_case text NOT NULL,
  bear_case text NOT NULL,
  historical_context jsonb NOT NULL DEFAULT '{}',
  data_confidence text NOT NULL DEFAULT 'medium',
  key_signals jsonb NOT NULL DEFAULT '[]',
  model_used text NOT NULL,
  llm_metadata jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(grain, crop_year, grain_week)
);

-- RLS: read-only for authenticated users, service role for writes
ALTER TABLE market_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read market analysis"
  ON market_analysis FOR SELECT
  TO authenticated
  USING (true);

-- Index for common query pattern
CREATE INDEX idx_market_analysis_grain_week
  ON market_analysis (grain, crop_year, grain_week DESC);

COMMENT ON TABLE market_analysis IS 'Step 3.5 Flash round-1 market analysis output per grain per week';
```

**Step 2: Apply the migration**

Run: `npx supabase db push` or use the Supabase MCP `apply_migration` tool.

**Step 3: Verify**

Query: `SELECT * FROM market_analysis LIMIT 1;` — should return empty result, no error.

**Step 4: Commit**

```bash
git add supabase/migrations/20260312120000_create_market_analysis.sql
git commit -m "feat: add market_analysis table for dual-LLM pipeline"
```

---

### Task 2: Create historical RPC functions

**Files:**
- Create: `supabase/migrations/20260312120001_historical_rpc_functions.sql`

**Step 1: Write the migration with 3 RPC functions**

```sql
-- get_historical_average: 5-year average for a metric at a given grain week
CREATE OR REPLACE FUNCTION get_historical_average(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_grain_week integer,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH recent_years AS (
    SELECT DISTINCT crop_year
    FROM cgc_observations
    WHERE grain = p_grain
      AND metric = p_metric
      AND worksheet = p_worksheet
      AND grain_week = p_grain_week
      AND period = 'Crop Year'
      AND grade = ''
    ORDER BY crop_year DESC
    LIMIT p_years_back
  ),
  week_values AS (
    SELECT
      o.crop_year,
      SUM(o.ktonnes) AS value_kt
    FROM cgc_observations o
    JOIN recent_years ry ON ry.crop_year = o.crop_year
    WHERE o.grain = p_grain
      AND o.metric = p_metric
      AND o.worksheet = p_worksheet
      AND o.grain_week = p_grain_week
      AND o.period = 'Crop Year'
      AND o.grade = ''
    GROUP BY o.crop_year
  )
  SELECT jsonb_build_object(
    'grain', p_grain,
    'metric', p_metric,
    'worksheet', p_worksheet,
    'grain_week', p_grain_week,
    'years_included', (SELECT count(*) FROM week_values),
    'avg_value', ROUND((SELECT avg(value_kt) FROM week_values)::numeric, 1),
    'min_value', ROUND((SELECT min(value_kt) FROM week_values)::numeric, 1),
    'max_value', ROUND((SELECT max(value_kt) FROM week_values)::numeric, 1),
    'stddev', ROUND((SELECT stddev(value_kt) FROM week_values)::numeric, 1),
    'values_by_year', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('crop_year', crop_year, 'value_kt', ROUND(value_kt::numeric, 1)) ORDER BY crop_year)
       FROM week_values),
      '[]'::jsonb
    )
  );
$$;

-- get_seasonal_pattern: metric values across all 52 weeks (multi-year average)
CREATE OR REPLACE FUNCTION get_seasonal_pattern(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH recent_years AS (
    SELECT DISTINCT crop_year
    FROM cgc_observations
    WHERE grain = p_grain
      AND metric = p_metric
      AND worksheet = p_worksheet
    ORDER BY crop_year DESC
    LIMIT p_years_back
  ),
  weekly_values AS (
    SELECT
      o.grain_week,
      o.crop_year,
      SUM(o.ktonnes) AS value_kt
    FROM cgc_observations o
    JOIN recent_years ry ON ry.crop_year = o.crop_year
    WHERE o.grain = p_grain
      AND o.metric = p_metric
      AND o.worksheet = p_worksheet
      AND o.period = 'Crop Year'
      AND o.grade = ''
    GROUP BY o.grain_week, o.crop_year
  ),
  weekly_agg AS (
    SELECT
      grain_week,
      ROUND(avg(value_kt)::numeric, 1) AS avg_value,
      ROUND(min(value_kt)::numeric, 1) AS min_value,
      ROUND(max(value_kt)::numeric, 1) AS max_value,
      count(*) AS year_count
    FROM weekly_values
    GROUP BY grain_week
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'grain_week', grain_week,
        'avg_value', avg_value,
        'min_value', min_value,
        'max_value', max_value,
        'year_count', year_count
      ) ORDER BY grain_week
    ),
    '[]'::jsonb
  )
  FROM weekly_agg;
$$;

-- get_week_percentile: where does a current value rank vs history
CREATE OR REPLACE FUNCTION get_week_percentile(
  p_grain text,
  p_metric text,
  p_worksheet text,
  p_grain_week integer,
  p_current_value numeric,
  p_years_back integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH recent_years AS (
    SELECT DISTINCT crop_year
    FROM cgc_observations
    WHERE grain = p_grain
      AND metric = p_metric
      AND worksheet = p_worksheet
      AND grain_week = p_grain_week
      AND period = 'Crop Year'
      AND grade = ''
    ORDER BY crop_year DESC
    LIMIT p_years_back
  ),
  week_values AS (
    SELECT
      o.crop_year,
      SUM(o.ktonnes) AS value_kt
    FROM cgc_observations o
    JOIN recent_years ry ON ry.crop_year = o.crop_year
    WHERE o.grain = p_grain
      AND o.metric = p_metric
      AND o.worksheet = p_worksheet
      AND o.grain_week = p_grain_week
      AND o.period = 'Crop Year'
      AND o.grade = ''
    GROUP BY o.crop_year
  ),
  stats AS (
    SELECT
      count(*) AS total_years,
      count(*) FILTER (WHERE value_kt < p_current_value) AS years_below,
      count(*) FILTER (WHERE value_kt > p_current_value) AS years_above,
      ROUND(avg(value_kt)::numeric, 1) AS avg_value
    FROM week_values
  )
  SELECT jsonb_build_object(
    'grain', p_grain,
    'metric', p_metric,
    'grain_week', p_grain_week,
    'current_value', p_current_value,
    'percentile', CASE WHEN total_years > 0
      THEN ROUND((years_below::numeric / total_years * 100)::numeric, 0)
      ELSE NULL END,
    'years_above', years_above,
    'years_below', years_below,
    'total_years', total_years,
    'avg_value', avg_value,
    'current_vs_avg_pct', CASE WHEN avg_value > 0
      THEN ROUND(((p_current_value - avg_value) / avg_value * 100)::numeric, 1)
      ELSE NULL END
  )
  FROM stats;
$$;
```

**Step 2: Apply the migration**

**Step 3: Verify each function**

```sql
-- Test with existing data (2024-2025 + 2025-2026 = 2 years)
SELECT get_historical_average('Wheat', 'Deliveries', 'Primary', 20, 5);
SELECT get_seasonal_pattern('Wheat', 'Deliveries', 'Primary', 5);
SELECT get_week_percentile('Wheat', 'Deliveries', 'Primary', 20, 500.0, 5);
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260312120001_historical_rpc_functions.sql
git commit -m "feat: add historical RPC functions for 5-year grain analysis"
```

---

### Task 3: Backfill 5 years of historical CGC data

**Files:**
- Download: CGC CSV files for crop years 2020-2021 through 2023-2024
- Use existing: `scripts/backfill.ts`

**Step 1: Download historical CSV files**

CGC archives are at `https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/`. Navigate the archive links to find CSVs for each crop year. Save to `data/` directory with naming pattern `{year}gsw-shg-en.csv`.

Needed files:
- `data/2020gsw-shg-en.csv` (crop year 2020-2021)
- `data/2021gsw-shg-en.csv` (crop year 2021-2022)
- `data/2022gsw-shg-en.csv` (crop year 2022-2023)
- `data/2023gsw-shg-en.csv` (crop year 2023-2024)

Note: We already have `data/2024gsw-shg-en.csv` (2024-2025, 219K rows) and `data/gsw-shg-en.csv` (2025-2026 current).

**Step 2: Run backfill for each file**

```bash
npm run backfill -- --csv data/2020gsw-shg-en.csv
npm run backfill -- --csv data/2021gsw-shg-en.csv
npm run backfill -- --csv data/2022gsw-shg-en.csv
npm run backfill -- --csv data/2023gsw-shg-en.csv
```

**Step 3: Verify row counts**

```sql
SELECT crop_year, COUNT(*) as rows, COUNT(DISTINCT grain_week) as weeks
FROM cgc_observations
GROUP BY crop_year
ORDER BY crop_year;
```

Expected: 6 crop years, each with ~200K rows and ~52 weeks (except current year).

**Step 4: Re-test historical RPC functions with real 5-year data**

```sql
SELECT get_historical_average('Wheat', 'Deliveries', 'Primary', 20, 5);
```

Should now show 5 years of data in `values_by_year`.

**Step 5: Commit data files (or .gitignore them if too large)**

If CSVs are >50MB each, add to `.gitignore` and document the download process. Otherwise:
```bash
git add data/20*gsw-shg-en.csv
git commit -m "data: add historical CGC CSVs for 5-year backfill (2020-2024)"
```

---

### Task 4: Extract commodity book knowledge

**Files:**
- Create: `supabase/functions/_shared/commodity-knowledge.ts`
- Read: `data/A traders first book on commodities.pdf`
- Read: `data/Introduction_to_Grain_Marketing.pdf`
- Read: `data/pm255_self-study-guide_hedging_en_2018.pdf`

**Step 1: Read the 3 PDFs and distill key frameworks**

Use the PDF reading tools to extract the key analytical frameworks, then distill into a ~5K token TypeScript module. The focus areas are:

1. **Seasonal price patterns** for Canadian grains (when prices typically peak/trough)
2. **Basis analysis rules** (what causes basis to widen/narrow)
3. **Bullish vs bearish signal checklist** (supply/demand indicators)
4. **Hedging decision framework** (when to consider hedging)
5. **Carry charge analysis** (storage cost vs price appreciation)
6. **Export demand indicators** (vessel lineups, country demand patterns)

**Step 2: Write the knowledge module**

```typescript
// supabase/functions/_shared/commodity-knowledge.ts

/**
 * Distilled commodity trading knowledge for grain market analysis.
 * Extracted from:
 * - "A Trader's First Book on Commodities"
 * - "Introduction to Grain Marketing" (SK Ministry of Agriculture)
 * - "Self-Study Guide: Hedging" (ICE Futures Canada)
 *
 * Used as system prompt context for Step 3.5 Flash in analyze-market-data.
 */

export const COMMODITY_KNOWLEDGE = `
## Commodity Market Analysis Framework

### Seasonal Patterns — Canadian Grains
[Extracted seasonal content — when wheat/canola/barley prices typically move]

### Basis Analysis
[Extracted basis rules — cash minus futures, widening/narrowing factors]

### Bullish Signals Checklist
[Extracted from books — declining carry-out, strong export pace, etc.]

### Bearish Signals Checklist
[Extracted from books — rising stocks, weak basis, farmer holding, etc.]

### Hedging Decision Framework
[When and how farmers should consider forward pricing]

### Carry Charge Analysis
[Storage costs vs anticipated price appreciation]

### Export Demand Indicators
[What signals strong/weak export demand]
`;
```

The actual content must be extracted from the PDFs — this is a placeholder structure. The implementing agent should read each PDF and synthesize the relevant sections.

**Step 3: Commit**

```bash
git add supabase/functions/_shared/commodity-knowledge.ts
git commit -m "feat: add distilled commodity knowledge base from trading books"
```

---

### Task 5: Create `analyze-market-data` Edge Function

**Files:**
- Create: `supabase/functions/analyze-market-data/index.ts`

**Dependencies:**
- Task 1 (market_analysis table)
- Task 2 (historical RPC functions)
- Task 4 (commodity knowledge)
- Existing: `supabase/functions/_shared/internal-auth.ts`

**Step 1: Write the Edge Function**

The function must:
1. Accept internal-only requests (same auth pattern as other functions)
2. Batch-process 4 grains per invocation (self-trigger for remaining)
3. For each grain:
   a. Query `v_grain_yoy_comparison` for current week data
   b. Query `v_supply_pipeline` for AAFC data
   c. Call `get_historical_average()` for key metrics (deliveries, exports, stocks)
   d. Call `get_sentiment_overview()` for farmer sentiment
   e. Call `get_delivery_analytics()` for anonymized community stats
   f. Build prompt with commodity knowledge + all data
   g. Call OpenRouter API (Step 3.5 Flash)
   h. Parse JSON response
   i. Upsert into `market_analysis` table
4. After final batch, chain-trigger `generate-intelligence`

**API pattern:**
```typescript
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "stepfun/step-3.5-flash:free";
```

**Headers:**
```typescript
headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${openRouterKey}`,
  "HTTP-Referer": "https://bushelboard.ca",
  "X-Title": "Bushel Board"
}
```

**Response format:** `response_format: { type: "json_object" }`

**Structured output schema (in prompt, not API-level):**
```json
{
  "initial_thesis": "string",
  "bull_case": "string (2-3 bullets as text)",
  "bear_case": "string (2-3 bullets as text)",
  "historical_context": {
    "deliveries_vs_5yr_avg_pct": "number|null",
    "exports_vs_5yr_avg_pct": "number|null",
    "seasonal_observation": "string",
    "notable_patterns": ["string"]
  },
  "data_confidence": "high|medium|low",
  "key_signals": [
    { "signal": "bullish|bearish|watch", "title": "string", "body": "string", "confidence": "high|medium|low" }
  ]
}
```

**Environment variables needed:**
- `OPENROUTER_API_KEY` — must be set in Supabase Edge Function secrets

**Step 2: Set the OpenRouter API key secret**

```bash
npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
```

Or via Supabase dashboard: Settings → Edge Functions → Secrets.

**Step 3: Deploy and test**

```bash
npx supabase functions deploy analyze-market-data
```

Test manually:
```bash
curl -X POST <SUPABASE_URL>/functions/v1/analyze-market-data \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: <secret>" \
  -d '{"grains": ["Wheat"]}'
```

**Step 4: Verify output in database**

```sql
SELECT grain, crop_year, grain_week, initial_thesis, data_confidence, model_used
FROM market_analysis
ORDER BY generated_at DESC LIMIT 5;
```

**Step 5: Commit**

```bash
git add supabase/functions/analyze-market-data/index.ts
git commit -m "feat: add analyze-market-data Edge Function (Step 3.5 Flash)"
```

---

### Task 6: Modify `search-x-intelligence` to chain to `analyze-market-data`

**Files:**
- Modify: `supabase/functions/search-x-intelligence/index.ts`

**Step 1: Update the chain trigger**

Currently, the last batch of `search-x-intelligence` (deep mode) triggers `generate-intelligence`. Change it to trigger `analyze-market-data` instead. The chain becomes:

```
search-x-intelligence → analyze-market-data → generate-intelligence
```

Find the chain trigger code (near the end of the function) and change the URL from:
```typescript
`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-intelligence`
```
to:
```typescript
`${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-market-data`
```

Only in deep mode. Pulse mode does not chain.

**Step 2: Deploy**

```bash
npx supabase functions deploy search-x-intelligence
```

**Step 3: Commit**

```bash
git add supabase/functions/search-x-intelligence/index.ts
git commit -m "feat: chain search-x-intelligence to analyze-market-data in deep mode"
```

---

### Task 7: Modify `generate-intelligence` to use Step 3.5 Flash analysis

**Files:**
- Modify: `supabase/functions/generate-intelligence/index.ts`
- Modify: `supabase/functions/generate-intelligence/prompt-template.ts`

**Step 1: Update prompt template to include Step 3.5 Flash analysis**

Add a new optional field to `GrainContext`:
```typescript
marketAnalysis?: {
  initial_thesis: string;
  bull_case: string;
  bear_case: string;
  historical_context: Record<string, unknown>;
  data_confidence: string;
  key_signals: Array<{ signal: string; title: string; body: string; confidence: string }>;
} | null;
```

Add a new section to the prompt in `buildIntelligencePrompt()`:
```
## Pre-Analysis (from data analyst — Step 3.5 Flash)

${ctx.marketAnalysis ? `
Thesis: "${ctx.marketAnalysis.initial_thesis}"
Bull case: ${ctx.marketAnalysis.bull_case}
Bear case: ${ctx.marketAnalysis.bear_case}
Historical context: ${JSON.stringify(ctx.marketAnalysis.historical_context)}
Confidence: ${ctx.marketAnalysis.data_confidence}
Key signals: ${ctx.marketAnalysis.key_signals.map(s => `- [${s.signal}] ${s.title}: ${s.body}`).join('\n')}

You are the senior editor reviewing this analysis. Cross-validate against X/Twitter signals.
Where data and social sentiment AGREE, increase confidence.
Where they DIVERGE, explain the tension and flag as a "watch" signal.
` : 'No pre-analysis available this week. Proceed with Grok-only analysis.'}
```

**Step 2: Update index.ts to fetch market_analysis**

Before processing each grain, query `market_analysis`:
```typescript
const { data: analysisData } = await supabase
  .from("market_analysis")
  .select("*")
  .eq("grain", grainName)
  .eq("crop_year", cropYear)
  .eq("grain_week", grainWeek)
  .single();
```

Pass it to the context:
```typescript
const ctx: GrainContext = {
  // ... existing fields ...
  marketAnalysis: analysisData ?? null,
};
```

**Step 3: Deploy and test**

```bash
npx supabase functions deploy generate-intelligence
```

Test by calling `analyze-market-data` for Wheat, then `generate-intelligence` for Wheat. The Grok output should reference the Step 3.5 Flash analysis.

**Step 4: Commit**

```bash
git add supabase/functions/generate-intelligence/
git commit -m "feat: integrate Step 3.5 Flash pre-analysis into Grok intelligence prompt"
```

---

### Task 8: Add `getMarketAnalysis` query function

**Files:**
- Modify: `lib/queries/intelligence.ts`

**Step 1: Add the interface and query function**

```typescript
export interface MarketAnalysis {
  grain: string;
  crop_year: string;
  grain_week: number;
  initial_thesis: string;
  bull_case: string;
  bear_case: string;
  historical_context: {
    deliveries_vs_5yr_avg_pct?: number | null;
    exports_vs_5yr_avg_pct?: number | null;
    seasonal_observation?: string;
    notable_patterns?: string[];
  };
  data_confidence: "high" | "medium" | "low";
  key_signals: Array<{
    signal: "bullish" | "bearish" | "watch";
    title: string;
    body: string;
    confidence: "high" | "medium" | "low";
  }>;
  model_used: string;
  generated_at: string;
}

export async function getMarketAnalysis(
  grainName: string
): Promise<MarketAnalysis | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("market_analysis")
    .select("*")
    .eq("grain", grainName)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as MarketAnalysis;
}
```

**Step 2: Commit**

```bash
git add lib/queries/intelligence.ts
git commit -m "feat: add getMarketAnalysis query for bull/bear case data"
```

---

### Task 9: Create BullBearCards component

**Files:**
- Create: `components/dashboard/bull-bear-cards.tsx`

**Step 1: Build the component**

```typescript
// components/dashboard/bull-bear-cards.tsx
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface BullBearCardsProps {
  bullCase: string;
  bearCase: string;
  confidence: "high" | "medium" | "low";
  modelUsed?: string;
}

export function BullBearCards({ bullCase, bearCase, confidence, modelUsed }: BullBearCardsProps) {
  // Split bullet points (they come as text with line breaks or bullet markers)
  const bullPoints = bullCase.split(/\n|•|—/).map(s => s.trim()).filter(Boolean);
  const bearPoints = bearCase.split(/\n|•|—/).map(s => s.trim()).filter(Boolean);

  const confidenceColors = {
    high: "text-prairie",
    medium: "text-canola",
    low: "text-muted-foreground",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Bull Case */}
      <div className="rounded-lg border border-prairie/20 bg-prairie/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-prairie" />
          <span className="text-xs font-semibold uppercase tracking-wider text-prairie">
            Bull Case
          </span>
        </div>
        <ul className="space-y-1.5">
          {bullPoints.map((point, i) => (
            <li key={`bull-${i}`} className="text-sm text-muted-foreground leading-snug">
              • {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Bear Case */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="h-4 w-4 text-red-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-red-500">
            Bear Case
          </span>
        </div>
        <ul className="space-y-1.5">
          {bearPoints.map((point, i) => (
            <li key={`bear-${i}`} className="text-sm text-muted-foreground leading-snug">
              • {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Attribution footer */}
      <div className="col-span-full flex items-center justify-between text-[0.65rem] text-muted-foreground/60 px-1">
        <span className={confidenceColors[confidence]}>
          Confidence: {confidence}
        </span>
        {modelUsed && (
          <span>Analysis by {modelUsed} + Grok</span>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/bull-bear-cards.tsx
git commit -m "feat: add BullBearCards component for dual-LLM analysis display"
```

---

### Task 10: Wire BullBearCards into grain detail page

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Import and fetch market analysis**

Add import:
```typescript
import { BullBearCards } from "@/components/dashboard/bull-bear-cards";
import { getMarketAnalysis } from "@/lib/queries/intelligence";
```

Add to the parallel data fetches (in the `safeQuery` block alongside existing queries):
```typescript
const marketAnalysisResult = await safeQuery(() => getMarketAnalysis(grain.name));
```

**Step 2: Place BullBearCards in "Market Intelligence" section**

Inside the first section (Market Intelligence), after the ThesisBanner and before IntelligenceKpis, add:
```tsx
{marketAnalysisResult.data && (
  <AnimatedCard>
    <BullBearCards
      bullCase={marketAnalysisResult.data.bull_case}
      bearCase={marketAnalysisResult.data.bear_case}
      confidence={marketAnalysisResult.data.data_confidence}
      modelUsed={marketAnalysisResult.data.model_used}
    />
  </AnimatedCard>
)}
```

**Step 3: Build and verify**

```bash
npm run build
```

Check the grain detail page visually — the bull/bear cards should appear below the thesis banner when market_analysis data exists, and gracefully disappear when it doesn't.

**Step 4: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: wire BullBearCards into grain detail page"
```

---

### Task 11: Enhance ThesisBanner with historical context

**Files:**
- Modify: `components/dashboard/thesis-banner.tsx`

**Step 1: Add historical context prop and expandable section**

```typescript
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface ThesisBannerProps {
  title: string;
  body: string;
  historicalContext?: {
    deliveries_vs_5yr_avg_pct?: number | null;
    exports_vs_5yr_avg_pct?: number | null;
    seasonal_observation?: string;
    notable_patterns?: string[];
  } | null;
}
```

Add a collapsible "Historical Context" section below the thesis body when `historicalContext` is provided. Use the same expand/collapse pattern from `supply-pipeline.tsx` (useState + chevron rotation).

**Step 2: Update grain detail page to pass historicalContext**

In `app/(dashboard)/grain/[slug]/page.tsx`, update the ThesisBanner usage:
```tsx
<ThesisBanner
  title={intel.thesis_title ?? ""}
  body={intel.thesis_body ?? ""}
  historicalContext={marketAnalysisResult.data?.historical_context}
/>
```

**Step 3: Build and verify**

**Step 4: Commit**

```bash
git add components/dashboard/thesis-banner.tsx app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: add historical context to ThesisBanner from Step 3.5 Flash"
```

---

### Task 12: Update CLAUDE.md and STATUS.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/plans/STATUS.md`
- Modify: `components/dashboard/CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add to Intelligence Pipeline section:
- New Edge Function `analyze-market-data` in the chain
- `market_analysis` table description
- `OPENROUTER_API_KEY` secret
- Historical RPC functions
- Step 3.5 Flash model details

Add monitoring queries:
```
- Market analysis: `SELECT grain, grain_week, initial_thesis, data_confidence, model_used FROM market_analysis ORDER BY generated_at DESC LIMIT 5;`
- Historical check: `SELECT get_historical_average('Wheat', 'Deliveries', 'Primary', 30, 5);`
```

**Step 2: Update STATUS.md**

Add Track #17 — Dual-LLM Market Intelligence with all task statuses.

**Step 3: Update components/dashboard/CLAUDE.md**

Add `bull-bear-cards.tsx` to the component table.

**Step 4: Commit**

```bash
git add CLAUDE.md docs/plans/STATUS.md components/dashboard/CLAUDE.md
git commit -m "docs: update CLAUDE.md, STATUS.md for dual-LLM intelligence pipeline"
```

---

## Task Dependency Graph

```
Task 1 (market_analysis table) ──┐
Task 2 (historical RPCs) ────────┤
Task 3 (5yr data backfill) ──────┤
Task 4 (book knowledge) ─────────┤
                                  ├──→ Task 5 (analyze-market-data EF) ──→ Task 6 (chain update)
                                  │                                        ──→ Task 7 (Grok integration)
                                  │
                                  └──→ Task 8 (query function) ──→ Task 9 (BullBearCards) ──→ Task 10 (wire into page)
                                                                                              ──→ Task 11 (ThesisBanner)
                                                                                                   ──→ Task 12 (docs)
```

**Parallelizable groups:**
- Tasks 1, 2, 3, 4 — all independent, can run in parallel
- Tasks 5, 8, 9 — can run in parallel after their dependencies
- Tasks 6, 7, 10, 11 — sequential after Task 5

**Estimated total time:** 3-4 hours of implementation work
