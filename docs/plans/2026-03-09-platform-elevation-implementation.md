# Platform Elevation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate Bushel Board from functional MVP to a premium grain intelligence platform — fixing data integrity issues, building a targeted X search pipeline, adding AI transparency, normalizing peer metrics, creating custom visualizations, and adding community social proof.

**Architecture:** Eight phases sequenced by dependency: data integrity first (unblocks everything), then X search pipeline (feeds transparency), then AI transparency + percentiles + community metrics (parallel), then motion system + custom visualizations + layout (parallel, builds on all prior work).

**Tech Stack:** Next.js 16, Supabase (PostgreSQL + Edge Functions + pg_cron), xAI Grok Responses API with x_search, Framer Motion 12, Recharts 3, custom SVG, Tailwind CSS v4.

**Design Doc:** `docs/plans/2026-03-09-platform-elevation-design.md`

---

## Phase 1: Supply Truth Consolidation (Tasks 1-3)

Fixes the fundamental data integrity issue: three conflicting supply sources → one canonical source.

### Task 1: Remove macro_estimates from Grain Detail Page

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx:45-50` (remove macro_estimates query)
- Modify: `app/(dashboard)/grain/[slug]/page.tsx:130-145` (remove SupplyWidget usage)
- Delete usage: `components/dashboard/supply-widget.tsx` (no longer referenced)

**Step 1: Read and understand current data flow**

Read `app/(dashboard)/grain/[slug]/page.tsx`. Lines 45-50 query `macro_estimates`. Lines ~130 pass this to `<SupplyWidget>`. Lines ~141-149 also pass `intelligence.kpi_data.cy_deliveries_kt` to `<SupplyPipeline>`.

**Step 2: Remove macro_estimates query from grain page**

In `app/(dashboard)/grain/[slug]/page.tsx`, remove the macro_estimates Supabase query (lines 45-50) and its corresponding variable. Remove the `<SupplyWidget>` component render and its import.

**Step 3: Remove SupplyWidget import**

Delete the import of `SupplyWidget` from the grain detail page. The component file `components/dashboard/supply-widget.tsx` can remain but is now unused — verify no other pages import it. If unused, delete it.

**Step 4: Verify build**

Run: `npm run build`
Expected: PASS (SupplyWidget was only used on grain detail page)

**Step 5: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "refactor: remove macro_estimates from grain detail, single supply source

Supply truth consolidation: AAFC supply_disposition is now the sole
source for balance sheet numbers. macro_estimates was duplicating
with older StatsCan data."
```

---

### Task 2: Fix SupplyPipeline to Use Only AAFC Data

**Files:**
- Modify: `components/dashboard/supply-pipeline.tsx` (remove cy_deliveries_kt prop dependency)
- Modify: `app/(dashboard)/grain/[slug]/page.tsx` (update SupplyPipeline props)
- Modify: `lib/queries/intelligence.ts:38-54` (getSupplyPipeline — ensure it returns all needed fields)

**Step 1: Read current SupplyPipeline props and rendering**

Read `components/dashboard/supply-pipeline.tsx`. Currently receives `cy_deliveries_kt` from `grain_intelligence.kpi_data` (AI-synthesized, prairie-scoped CGC data) and subtracts it from `total_supply_kt` (national AAFC data) — scope mismatch.

**Step 2: Update SupplyPipeline to remove "On-Farm" calculation**

In `components/dashboard/supply-pipeline.tsx`:
- Remove `cy_deliveries_kt` from the props interface
- Remove the "Remaining On-Farm" row that computes `total_supply_kt - cy_deliveries_kt`
- Add a new "Delivered %" callout: `(exports_kt + food_industrial_kt) / total_supply_kt * 100`
- Label it "Disposition % of Total Supply" — uses only AAFC data (consistent scope)

New props interface:
```typescript
interface SupplyPipelineProps {
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
  exports_kt?: number;
  food_industrial_kt?: number;
  feed_waste_kt?: number;
  carry_out_kt?: number;
  grain: string;
}
```

**Step 3: Update grain detail page to pass AAFC-only props**

In `app/(dashboard)/grain/[slug]/page.tsx`, update the `<SupplyPipeline>` call to pass fields from `supplyData` (the `getSupplyPipeline()` result) directly — stop extracting `cy_deliveries_kt` from `intelligence.kpi_data`.

```typescript
{supplyData && (
  <SupplyPipeline
    carry_in_kt={supplyData.carry_in_kt}
    production_kt={supplyData.production_kt}
    total_supply_kt={supplyData.total_supply_kt}
    exports_kt={supplyData.exports_kt}
    food_industrial_kt={supplyData.food_industrial_kt}
    feed_waste_kt={supplyData.feed_waste_kt}
    carry_out_kt={supplyData.carry_out_kt}
    grain={grain.name}
  />
)}
```

**Step 4: Update getSupplyPipeline query to return all disposition fields**

In `lib/queries/intelligence.ts`, update `getSupplyPipeline()` to select additional columns from `v_supply_pipeline`: `exports_kt`, `food_industrial_kt`, `feed_waste_kt`, `carry_out_kt`. Update the return type accordingly.

**Step 5: Run tests and build**

Run: `npm run test -- --run && npm run build`
Expected: All 31 tests pass, build succeeds

**Step 6: Commit**

```bash
git add components/dashboard/supply-pipeline.tsx app/(dashboard)/grain/[slug]/page.tsx lib/queries/intelligence.ts
git commit -m "fix: supply pipeline uses only AAFC data, remove On-Farm calculation

Eliminates scope mismatch: was subtracting prairie-only CGC deliveries
from national AAFC total supply. Now shows AAFC disposition breakdown
with 'Disposition % of Total Supply' as the summary metric."
```

---

### Task 3: Document Source Precedence Rule

**Files:**
- Create: `docs/data-sources.md`

**Step 1: Write source precedence document**

Create `docs/data-sources.md` with:

```markdown
# Bushel Board Data Source Precedence

## Canonical Sources

| Data Category | Canonical Source | Table/View | Scope |
|--------------|-----------------|------------|-------|
| Balance sheet (production, supply, exports, crush, carry-out) | AAFC | `supply_disposition` / `v_supply_pipeline` | National |
| Weekly deliveries, shipments, stocks | CGC | `cgc_observations` | Prairie (AB, SK, MB) |
| AI narratives + KPIs | Grok | `grain_intelligence` | Display-only — never use for calculations |
| X/Twitter social signals | Grok + x_search | `x_market_signals` | Pre-scored, farmer-relevant |

## Rules

1. AAFC `supply_disposition` is the sole source for balance sheet numbers
2. CGC `cgc_observations` is the sole source for weekly operational metrics
3. `grain_intelligence.kpi_data` is display-only narrative context — NEVER extract values for calculations
4. Never mix national-scope AAFC numbers with prairie-scope CGC numbers in the same calculation
5. `macro_estimates` is DEPRECATED — do not use
```

**Step 2: Commit**

```bash
git add docs/data-sources.md
git commit -m "docs: add data source precedence rules"
```

---

## Phase 2: X Search Intelligence Layer (Tasks 4-8)

Builds the dedicated X intelligence pipeline with targeted search, relevance scoring, and storage.

### Task 4: Create x_market_signals Migration

**Files:**
- Create: `supabase/migrations/20260309100000_x_market_signals.sql`

**Step 1: Write migration**

```sql
-- X Market Signals: scored social posts from x_search
CREATE TABLE x_market_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  post_summary text NOT NULL,
  post_author text,
  post_date timestamptz,
  relevance_score int NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  sentiment text NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  category text NOT NULL CHECK (category IN (
    'farmer_report', 'analyst_commentary', 'elevator_bid',
    'export_news', 'weather', 'policy', 'other'
  )),
  confidence_score int NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  search_query text NOT NULL,
  raw_context jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(grain, crop_year, grain_week, post_summary)
);

CREATE INDEX idx_xms_grain_week ON x_market_signals(grain, crop_year, grain_week);
CREATE INDEX idx_xms_relevance ON x_market_signals(relevance_score DESC);

-- RLS: public read, service_role write
ALTER TABLE x_market_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read x_market_signals"
  ON x_market_signals FOR SELECT
  USING (true);

CREATE POLICY "Service role manages x_market_signals"
  ON x_market_signals FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 2: Apply migration**

Run: `npx supabase db push`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/20260309100000_x_market_signals.sql
git commit -m "feat: add x_market_signals table for scored X/Twitter posts"
```

---

### Task 5: Build Search Query Builder Module

**Files:**
- Create: `supabase/functions/search-x-intelligence/search-queries.ts`

**Step 1: Create the search query builder**

This module exports:
- `GRAIN_HASHTAGS`: Record mapping grain names to hashtag arrays
- `SEASONAL_TOPICS`: Function returning topics based on current month
- `buildSearchQueries(grain: string, date: Date): string[]`: Returns 3-5 search queries

```typescript
// Grain → hashtag mappings (from design doc Section 1)
export const GRAIN_HASHTAGS: Record<string, string[]> = {
  "Wheat": ["#wheat", "#CWRS", "#westcdnag"],
  "Canola": ["#Canola", "#westcdnag", "#CanolaCouncil"],
  "Amber Durum": ["#durum", "#durumwheat", "#pasta"],
  "Barley": ["#barley", "#maltbarley", "#feedbarley"],
  "Oats": ["#oats", "#oatmarket"],
  "Peas": ["#peas", "#pulses", "#CDNpulses"],
  "Lentils": ["#lentils", "#pulses", "#CDNlentils"],
  "Flaxseed": ["#flax", "#flaxseed"],
  "Soybeans": ["#soybeans", "#CDNsoy"],
  "Mustard Seed": ["#mustard", "#mustardmarket"],
  "Corn": ["#corn", "#CDNcorn"],
  "Rye": ["#rye", "#ryemarket"],
  "Chick Peas": ["#chickpeas", "#desi", "#kabuli"],
  "Sunflower": ["#sunflower", "#sunflowermarket"],
  "Canaryseed": ["#canaryseed"],
  "Beans": ["#drybeans", "#CDNbeans"],
};

type Season = "seeding" | "growing" | "harvest" | "marketing";

export function getSeason(date: Date): Season {
  const month = date.getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return "seeding";   // Mar-May
  if (month >= 5 && month <= 7) return "growing";    // Jun-Aug
  if (month >= 8 && month <= 10) return "harvest";   // Sep-Nov
  return "marketing";                                  // Dec-Feb
}

const SEASONAL_TOPICS: Record<Season, string[]> = {
  seeding: ["soil moisture", "input costs", "seed availability", "acreage intentions", "spring planting"],
  growing: ["crop conditions", "weather stress", "yield estimates", "crop tour", "rainfall"],
  harvest: ["quality reports", "combines rolling", "elevator congestion", "basis levels", "grade"],
  marketing: ["carry-out projections", "export pace", "futures spreads", "farmer selling", "basis"],
};

export function buildSearchQueries(grain: string, date: Date): string[] {
  const hashtags = GRAIN_HASHTAGS[grain] ?? [`#${grain.toLowerCase().replace(/ /g, "")}`];
  const season = getSeason(date);
  const topics = SEASONAL_TOPICS[season];
  const geo = "Canada prairies western Canadian";

  const queries: string[] = [];

  // Query 1: Primary hashtags + geo
  queries.push(`${hashtags.slice(0, 2).join(" ")} ${geo}`);

  // Query 2: Grain name + seasonal topic + geo
  queries.push(`${grain} ${topics[0]} ${topics[1]} Canada`);

  // Query 3: Broader ag hashtag + grain
  queries.push(`#westcdnag ${grain.toLowerCase()} market`);

  // Query 4: Seasonal-specific (if topics exist)
  if (topics.length > 2) {
    queries.push(`${grain} ${topics[2]} prairie farmers`);
  }

  // Query 5: Export/trade context (for major export grains)
  const exportGrains = ["Wheat", "Canola", "Amber Durum", "Barley", "Peas", "Lentils"];
  if (exportGrains.includes(grain)) {
    queries.push(`${grain} export Canada shipping rail`);
  }

  return queries;
}
```

**Step 2: Commit**

```bash
git add supabase/functions/search-x-intelligence/search-queries.ts
git commit -m "feat: add search query builder with hashtag mappings and seasonal context"
```

---

### Task 6: Build search-x-intelligence Edge Function

**Files:**
- Create: `supabase/functions/search-x-intelligence/index.ts`

**Step 1: Create the Edge Function**

This function:
1. Accepts `{ crop_year, grain_week, grains?: string[] }` in request body
2. For each grain, builds search queries via `buildSearchQueries()`
3. Calls Grok with x_search tool using the targeted queries
4. Asks Grok to score each found post for relevance, sentiment, category, confidence
5. Stores posts with relevance ≥ 60 in `x_market_signals`
6. Self-triggers in batches of 4 grains (same pattern as generate-intelligence)
7. Last batch chains to `generate-intelligence`

Model the function structure after `generate-intelligence/index.ts`:
- Same Supabase client setup pattern (`createClient` from `@supabase/supabase-js`)
- Same xAI API call pattern (`https://api.x.ai/v1/responses` with Bearer token)
- Same self-trigger pattern (POST to self with remaining grains)
- Same chain trigger pattern (POST to next function on last batch)

The Grok prompt for scoring should be:
```
You are a Canadian prairie agriculture social media analyst.
Given the following X/Twitter posts found for "${grain}", score each post:
- relevance (0-100): Is this about Canadian prairie grain markets?
- sentiment: bullish / bearish / neutral
- category: farmer_report | analyst_commentary | elevator_bid | export_news | weather | policy | other
- confidence (0-100): How confident are you in the classification?

Only include posts scoring relevance >= 60.

Return JSON array: [{ post_summary, post_author, post_date, relevance_score, sentiment, category, confidence_score }]
```

Use structured output with `text.format` (Grok Responses API pattern).

x_search date range: 7 days (same `getXSearchDateRange()` helper from generate-intelligence).

**Step 2: Test locally**

Run: `npx supabase functions serve search-x-intelligence`
Then POST a test payload:
```bash
curl -X POST http://localhost:54321/functions/v1/search-x-intelligence \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"crop_year":"2025-26","grain_week":29,"grains":["Canola"]}'
```
Expected: 200 response with scored posts stored in x_market_signals

**Step 3: Commit**

```bash
git add supabase/functions/search-x-intelligence/
git commit -m "feat: add search-x-intelligence Edge Function

Dedicated X intelligence pipeline step with:
- Targeted search queries per grain (hashtags + seasonal context)
- Grok-powered relevance scoring (0-100)
- Sentiment classification (bullish/bearish/neutral)
- Category tagging (farmer_report, analyst, elevator_bid, etc.)
- Self-trigger batching (4 grains per batch)
- Chain trigger to generate-intelligence on completion"
```

---

### Task 7: Update generate-intelligence to Read from x_market_signals

**Files:**
- Modify: `supabase/functions/generate-intelligence/index.ts` (remove x_search tool, read from table)
- Modify: `supabase/functions/generate-intelligence/prompt-template.ts` (add social signals section to prompt)

**Step 1: Read current generate-intelligence implementation**

Read `supabase/functions/generate-intelligence/index.ts` fully. Note where `tools: [{ type: "x_search" }]` is passed to the Grok API call (~line 122). Also note how the prompt is built.

**Step 2: Add x_market_signals query**

Before the Grok API call, query `x_market_signals` for the current grain + crop_year + grain_week:

```typescript
const { data: socialSignals } = await supabase
  .from("x_market_signals")
  .select("*")
  .eq("grain", grainName)
  .eq("crop_year", cropYear)
  .eq("grain_week", grainWeek)
  .gte("relevance_score", 60)
  .order("relevance_score", { ascending: false })
  .limit(10);
```

**Step 3: Remove x_search tool from Grok API call**

In the fetch to `api.x.ai/v1/responses`, remove `tools: [{ type: "x_search", from_date, to_date }]`. The social context is now injected as text in the prompt.

**Step 4: Update prompt template to include social signals**

In `prompt-template.ts`, add a new section to `buildIntelligencePrompt()`:

Add a `socialSignals` parameter to `GrainContext`. In the prompt, after the data section, add:

```
## Recent X/Twitter Market Signals (pre-scored, relevance ≥ 60)

${signals.map(s => `- [${s.sentiment}/${s.category}] (relevance: ${s.relevance_score}, confidence: ${s.confidence_score}) ${s.post_summary}${s.post_author ? ` — @${s.post_author}` : ""}`).join("\n")}

Reference these signals when generating "social" insights. Cite the author handle when available.
```

**Step 5: Test and commit**

Run: `npx supabase functions serve generate-intelligence`
Test with a grain that has x_market_signals data.
Expected: Intelligence generated using pre-scored social signals instead of live x_search.

```bash
git add supabase/functions/generate-intelligence/
git commit -m "refactor: generate-intelligence reads from x_market_signals

Removes live x_search tool usage. Now reads pre-scored social
signals from x_market_signals table, injected as prompt context.
Deterministic, reproducible outputs."
```

---

### Task 8: Update Pipeline Chain Triggers

**Files:**
- Modify: `supabase/functions/import-cgc-weekly/index.ts` (chain to search-x-intelligence instead of generate-intelligence)

**Step 1: Read import-cgc-weekly chain trigger**

Find where `import-cgc-weekly` chains to `generate-intelligence` on success (look for the POST fetch call near the end of the function).

**Step 2: Update chain target**

Change the chain trigger to POST to `search-x-intelligence` instead of `generate-intelligence`. Pass the same `{ crop_year, grain_week }` payload.

The new chain is: `import-cgc-weekly → search-x-intelligence → generate-intelligence → generate-farm-summary`

**Step 3: Commit**

```bash
git add supabase/functions/import-cgc-weekly/index.ts
git commit -m "feat: chain import-cgc-weekly to search-x-intelligence

Updated pipeline: import → X search → intelligence → farm summary"
```

---

## Phase 3: AI Transparency Layer (Tasks 9-12)

Makes every AI insight auditable with source badges, confidence, and X citations.

### Task 9: Update Intelligence Schema for Sources + Confidence

**Files:**
- Create: `supabase/migrations/20260309200000_intelligence_sources.sql`

**Step 1: Write migration**

The `insights` JSONB in `grain_intelligence` already stores `[{ signal, title, body }]`. We need the prompt to also output `sources` and `confidence` per insight. No schema migration needed — JSONB is flexible. But we should add a comment migration for documentation:

```sql
-- Add sources and confidence to grain_intelligence insights format
-- insights JSONB array now includes:
--   { signal, title, body, sources: ["CGC"|"AAFC"|"X"|"Derived"], confidence: "high"|"medium"|"low" }
-- No schema change needed (JSONB), but documenting the contract

COMMENT ON COLUMN grain_intelligence.insights IS
  'Array of insight objects: { signal: bullish|bearish|watch|social, title: string, body: string, sources: ["CGC"|"AAFC"|"X"|"Derived"], confidence: "high"|"medium"|"low" }';
```

**Step 2: Apply and commit**

```bash
npx supabase db push
git add supabase/migrations/20260309200000_intelligence_sources.sql
git commit -m "docs: document sources + confidence in intelligence insights schema"
```

---

### Task 10: Update Intelligence Prompt for Sources + Confidence

**Files:**
- Modify: `supabase/functions/generate-intelligence/prompt-template.ts`
- Modify: `supabase/functions/generate-intelligence/index.ts` (update JSON schema)

**Step 1: Update the prompt rules**

In `prompt-template.ts`, add to the prompt rules section:

```
10. Each insight MUST include a "sources" array listing data provenance:
    - "CGC" for Canadian Grain Commission weekly data (deliveries, shipments, stocks)
    - "AAFC" for Agriculture & Agri-Food Canada balance sheet (production, supply, carry-out)
    - "X" for X/Twitter social signal (only if referencing social data)
    - "Derived" for calculated metrics (ratios, percentages, comparisons)
11. Each insight MUST include a "confidence" field:
    - "high" — based on official data with clear directional signal
    - "medium" — based on partial data or mixed signals
    - "low" — speculative or based primarily on social sentiment
```

**Step 2: Update the JSON schema in index.ts**

In `generate-intelligence/index.ts`, find the structured output schema definition. Add `sources` and `confidence` to the insight object schema:

```typescript
{
  signal: { type: "string", enum: ["bullish", "bearish", "watch", "social"] },
  title: { type: "string" },
  body: { type: "string" },
  sources: { type: "array", items: { type: "string", enum: ["CGC", "AAFC", "X", "Derived"] } },
  confidence: { type: "string", enum: ["high", "medium", "low"] }
}
```

**Step 3: Commit**

```bash
git add supabase/functions/generate-intelligence/
git commit -m "feat: intelligence prompt now outputs sources + confidence per insight"
```

---

### Task 11: Add Source Badges to InsightCards UI

**Files:**
- Modify: `components/dashboard/insight-cards.tsx`

**Step 1: Read current InsightCards implementation**

Read `components/dashboard/insight-cards.tsx`. Currently renders signal type, title, body for each insight.

**Step 2: Add source badges and confidence indicator**

Update the component to:
1. Display source badges below each insight title (small badges: CGC, AAFC, X, Derived)
2. Apply confidence-based border opacity (high=100%, medium=70%, low=40%)
3. Keep backward-compatible — if `sources` or `confidence` is missing, render without them

Badge color mapping:
```typescript
const SOURCE_COLORS: Record<string, string> = {
  CGC: "bg-wheat-200 text-wheat-800 dark:bg-wheat-800 dark:text-wheat-200",
  AAFC: "bg-prairie/10 text-prairie",
  X: "bg-canola/10 text-canola",
  Derived: "bg-muted text-muted-foreground",
};
```

Confidence border:
```typescript
const CONFIDENCE_OPACITY: Record<string, string> = {
  high: "border-opacity-100",
  medium: "border-opacity-70",
  low: "border-opacity-40",
};
```

**Step 3: Update the Insight type**

Update the type/interface in the component or in `lib/queries/intelligence.ts`:

```typescript
interface Insight {
  signal: "bullish" | "bearish" | "watch" | "social";
  title: string;
  body: string;
  sources?: ("CGC" | "AAFC" | "X" | "Derived")[];
  confidence?: "high" | "medium" | "low";
}
```

**Step 4: Build and commit**

```bash
npm run build
git add components/dashboard/insight-cards.tsx lib/queries/intelligence.ts
git commit -m "feat: add source badges and confidence indicators to insight cards"
```

---

### Task 12: Build Evidence Drawer for X Citations

**Files:**
- Create: `components/dashboard/evidence-drawer.tsx`
- Modify: `components/dashboard/insight-cards.tsx` (add drawer trigger for social insights)
- Create: `lib/queries/x-signals.ts` (query x_market_signals)

**Step 1: Create x-signals query**

```typescript
// lib/queries/x-signals.ts
import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

export interface XMarketSignal {
  id: string;
  post_summary: string;
  post_author: string | null;
  post_date: string | null;
  relevance_score: number;
  sentiment: string;
  category: string;
  confidence_score: number;
  search_query: string;
}

export async function getXSignalsForGrain(
  grainName: string,
  grainWeek?: number
): Promise<XMarketSignal[]> {
  const supabase = await createClient();
  let query = supabase
    .from("x_market_signals")
    .select("*")
    .eq("grain", grainName)
    .eq("crop_year", CURRENT_CROP_YEAR)
    .gte("relevance_score", 60)
    .order("relevance_score", { ascending: false })
    .limit(20);

  if (grainWeek) {
    query = query.eq("grain_week", grainWeek);
  }

  const { data, error } = await query;
  if (error) return [];
  return data as XMarketSignal[];
}
```

**Step 2: Create EvidenceDrawer component**

```typescript
// components/dashboard/evidence-drawer.tsx
"use client";

import { useState } from "react";
import type { XMarketSignal } from "@/lib/queries/x-signals";

interface EvidenceDrawerProps {
  signals: XMarketSignal[];
  grainName: string;
}

// Expandable panel showing scored X posts behind social insights
// Renders: post summary, author handle, date, sentiment badge, relevance score
// Trigger: "View sources" link on social insight cards
```

Use shadcn `Sheet` component (already installed) for the drawer. Display each signal as a row with:
- Sentiment badge (bullish/bearish/neutral)
- Category tag
- Post summary text
- Author handle (if available)
- Relevance + confidence scores as small indicators

**Step 3: Integrate into grain detail page**

In `app/(dashboard)/grain/[slug]/page.tsx`, fetch X signals alongside intelligence data. Pass to InsightCards which opens the drawer for social insights.

**Step 4: Build and commit**

```bash
npm run build
git add lib/queries/x-signals.ts components/dashboard/evidence-drawer.tsx components/dashboard/insight-cards.tsx app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: evidence drawer showing X/Twitter citations for social insights"
```

---

## Phase 4: Percentile Normalization (Tasks 13-14)

### Task 13: Update Percentile SQL Function

**Files:**
- Create: `supabase/migrations/20260309300000_percentile_normalization.sql`

**Step 1: Write migration with updated function**

Replace `calculate_delivery_percentiles()` with the delivery-pace-based version from the design doc. The new function ranks by `total_delivered_kt / planned_volume_kt` (delivery pace %), falling back to `total_delivered_kt / acres_seeded` (t/acre) if no planned volume.

Use the exact SQL from the design doc Section 3. Add `CREATE OR REPLACE` to overwrite the existing function.

**Step 2: Apply and commit**

```bash
npx supabase db push
git add supabase/migrations/20260309300000_percentile_normalization.sql
git commit -m "feat: normalize percentiles by delivery pace instead of raw tonnage"
```

---

### Task 14: Update My Farm Percentile UI

**Files:**
- Modify: `app/(dashboard)/my-farm/client.tsx:105-114` (badge display)
- Modify: `supabase/functions/generate-farm-summary/index.ts` (LLM prompt context)

**Step 1: Update badge text in MyFarmClient**

Change from:
```tsx
<span>Top {100 - percentiles[plan.grain]}%</span>
<span>of farmers tracking {plan.grain}</span>
```

To:
```tsx
<span>{Math.round(percentiles[plan.grain])}th percentile</span>
<span>delivery pace for {plan.grain}</span>
```

Add a title attribute tooltip: "Ranked by % of planned volume delivered, not absolute tonnage"

**Step 2: Update farm summary prompt**

In `generate-farm-summary/index.ts`, update the percentile description in `buildFarmSummaryPrompt()` from "Percentile rank: Xth among all farmers for this grain" to "Delivery pace percentile: Xth (ranked by % of planned volume delivered)".

**Step 3: Build and commit**

```bash
npm run build
git add app/(dashboard)/my-farm/client.tsx supabase/functions/generate-farm-summary/index.ts
git commit -m "feat: update percentile badges to show delivery pace ranking"
```

---

## Phase 5: Community Metrics (Tasks 15-16)

### Task 15: Create Community Stats Materialized View

**Files:**
- Create: `supabase/migrations/20260309400000_community_stats.sql`
- Modify: `supabase/functions/import-cgc-weekly/index.ts` (add REFRESH call)

**Step 1: Write migration**

```sql
CREATE MATERIALIZED VIEW v_community_stats AS
SELECT
  COALESCE(SUM(acres_seeded), 0) AS total_acres,
  COALESCE(SUM(planned_volume_kt) * 1000, 0) AS total_tonnes,
  COUNT(DISTINCT grain) AS grain_count,
  COUNT(DISTINCT user_id) AS farmer_count
FROM crop_plans
WHERE crop_year = '2025-26';

-- Allow public read (no RLS on materialized views, use function wrapper)
CREATE OR REPLACE FUNCTION get_community_stats()
RETURNS TABLE (total_acres numeric, total_tonnes numeric, grain_count bigint, farmer_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT total_acres, total_tonnes, grain_count, farmer_count
  FROM v_community_stats;
$$;
```

**Step 2: Add REFRESH to import-cgc-weekly**

In `import-cgc-weekly/index.ts`, after successful import, add:

```typescript
await supabase.rpc("refresh_community_stats");
```

Or use raw SQL via the admin client:
```typescript
await supabase.from("v_community_stats").select("*"); // This won't work for REFRESH
// Instead, add a SQL function:
```

Better approach — add a refresh function in the migration:
```sql
CREATE OR REPLACE FUNCTION refresh_community_stats()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW v_community_stats;
$$;
```

Then call via RPC in the Edge Function.

**Step 3: Apply and commit**

```bash
npx supabase db push
git add supabase/migrations/20260309400000_community_stats.sql supabase/functions/import-cgc-weekly/index.ts
git commit -m "feat: community stats materialized view with weekly refresh"
```

---

### Task 16: Build Community Metrics Components

**Files:**
- Create: `lib/queries/community.ts`
- Create: `components/dashboard/community-stats.tsx`
- Modify: `app/page.tsx` (landing page hero)
- Modify: `app/(dashboard)/layout.tsx` (dashboard footer)

**Step 1: Create query**

```typescript
// lib/queries/community.ts
import { createClient } from "@/lib/supabase/server";

export interface CommunityStats {
  total_acres: number;
  total_tonnes: number;
  grain_count: number;
  farmer_count: number;
}

export async function getCommunityStats(): Promise<CommunityStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_community_stats").single();
  if (error || !data) return null;
  // Privacy threshold: don't display if fewer than 10 farmers
  if (data.farmer_count < 10) return null;
  return data as CommunityStats;
}
```

**Step 2: Create CommunityStats component**

A client component (needs CountUp animation) displaying:
- "Monitoring {total_tonnes} tonnes of grain across {total_acres} acres"
- Two variants: `hero` (large, animated CountUp) and `footer` (compact, static)

**Step 3: Integrate into landing page hero**

In `app/page.tsx`, fetch `getCommunityStats()` server-side and pass to the hero section. Display below the "Deliver with Data" headline with CountUp animation using framer-motion `useInView` trigger.

**Step 4: Integrate into dashboard footer**

In `app/(dashboard)/layout.tsx`, add a subtle footer bar with community stats.

**Step 5: Build and commit**

```bash
npm run build
git add lib/queries/community.ts components/dashboard/community-stats.tsx app/page.tsx app/(dashboard)/layout.tsx
git commit -m "feat: community metrics banner on landing page and dashboard footer

Shows aggregate acres + tonnes across all farmers as social proof.
Privacy: only displays when 10+ farmers exist, no individual data."
```

---

## Phase 6: Motion Design System (Tasks 17-19)

### Task 17: Create Animation Primitives

**Files:**
- Create: `components/motion/animated-card.tsx`
- Create: `components/motion/count-up.tsx`
- Create: `components/motion/stagger-group.tsx`

**Step 1: Create AnimatedCard**

```typescript
// components/motion/animated-card.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedCardProps {
  children: ReactNode;
  index?: number;
  className?: string;
}

// Spring-based reveal animation with:
// - initial: opacity 0, y +12px
// - animate: opacity 1, y 0
// - transition: spring with damping 20, stiffness 300
// - stagger: index * 40ms delay
// - hover: y -2px, shadow increase
// - Respects prefers-reduced-motion via framer-motion's built-in support
```

**Step 2: Create CountUp**

```typescript
// components/motion/count-up.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, useSpring, motion } from "framer-motion";

interface CountUpProps {
  target: number;
  duration?: number; // ms, default 800
  format?: (value: number) => string; // e.g., fmtKt
  className?: string;
}

// Animated number that counts from 0 to target when scrolled into view
// Uses useSpring for smooth interpolation
// Respects prefers-reduced-motion (shows final value immediately)
```

**Step 3: Create StaggerGroup**

```typescript
// components/motion/stagger-group.tsx
"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface StaggerGroupProps {
  children: ReactNode;
  delayMs?: number; // default 40ms
  className?: string;
}

// Wrapper that staggers children animations by delayMs
// Uses motion.div with variants for container + children
```

**Step 4: Commit**

```bash
git add components/motion/
git commit -m "feat: motion design system primitives (AnimatedCard, CountUp, StaggerGroup)"
```

---

### Task 18: Create PageTransition Component

**Files:**
- Create: `components/motion/page-transition.tsx`

**Step 1: Build PageTransition**

```typescript
// components/motion/page-transition.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

// Skeleton → data → reveal orchestration
// Uses AnimatePresence for mount/unmount transitions
// Fade + slide-up on enter, fade on exit
// 300ms duration with spring easing
```

**Step 2: Commit**

```bash
git add components/motion/page-transition.tsx
git commit -m "feat: add PageTransition component for route-level animations"
```

---

### Task 19: Apply Motion Primitives to Existing Components

**Files:**
- Modify: `components/dashboard/intelligence-kpis.tsx` (wrap KPI values with CountUp)
- Modify: `components/dashboard/crop-summary-card.tsx` (wrap with AnimatedCard)
- Modify: `app/(dashboard)/overview/page.tsx` (wrap card grid with StaggerGroup)
- Modify: `app/(dashboard)/grain/[slug]/page.tsx` (add PageTransition wrapper)

**Step 1: Wrap KPI values with CountUp**

In `intelligence-kpis.tsx`, replace static number displays with `<CountUp target={value} format={fmtKt} />` for the main KPI values.

**Step 2: Wrap crop summary cards with AnimatedCard**

In `crop-summary-card.tsx`, wrap the outer card div with `<AnimatedCard index={index}>`.

**Step 3: Add StaggerGroup to overview page**

In `overview/page.tsx`, wrap the CropSummaryCard grid with `<StaggerGroup>`.

**Step 4: Add PageTransition to grain detail**

In `grain/[slug]/page.tsx`, wrap the main content area with `<PageTransition>`.

**Step 5: Build and commit**

```bash
npm run build
git add components/dashboard/intelligence-kpis.tsx components/dashboard/crop-summary-card.tsx app/(dashboard)/overview/page.tsx app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: apply motion primitives to dashboard cards, KPIs, and page transitions"
```

---

## Phase 7: Custom Visualizations (Tasks 20-23)

### Task 20: Build Animated Grain Elevator Component

**Files:**
- Create: `components/dashboard/grain-elevator.tsx`

**Step 1: Design the SVG grain elevator**

Create a client component that renders 3 SVG grain bins (Primary, Terminal, Process) that fill based on stock levels. Each bin:
- Outline: wheat-700 stroke
- Fill: animated from 0% to actual level using framer-motion `motion.rect`
- Color: Primary = prairie, Terminal = province-ab, Process = canola
- Label: bin type name + Kt value below

Props:
```typescript
interface GrainElevatorProps {
  storageData: Array<{
    storage_type: string; // Primary/Terminal/Process
    ktonnes: number;
  }>;
  maxCapacity?: number; // for scaling fill levels
}
```

The fill animation should use `useInView` to trigger when scrolled into viewport.

**Step 2: Build and commit**

```bash
npm run build
git add components/dashboard/grain-elevator.tsx
git commit -m "feat: animated grain elevator SVG visualization

Three bins (Primary/Terminal/Process) with animated fill levels.
Replaces StockMapWidget with a visual metaphor farmers understand."
```

---

### Task 21: Build Supply Flow Sankey Component

**Files:**
- Create: `components/dashboard/supply-sankey.tsx`

**Step 1: Build Sankey flow diagram**

Create a client component rendering an SVG Sankey diagram showing grain supply flow:
- Left nodes: Carry-in, Production (sources)
- Center: Total Supply (aggregation point)
- Right nodes: Exports, Food/Industrial, Feed/Waste, Carry-out (destinations)
- Flow paths: curved SVG paths connecting nodes, width proportional to Kt
- Animation: paths draw from left to right using framer-motion `pathLength`

Props:
```typescript
interface SupplySankeyProps {
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
  exports_kt: number;
  food_industrial_kt: number;
  feed_waste_kt: number;
  carry_out_kt: number;
  grain: string;
}
```

Color mapping: Use CSS variables (--color-prairie for sources, --color-error for exports, --color-canola for processing, --color-province-ab for carry-out).

Responsive: Calculate positions based on container width using `useRef` + `ResizeObserver`.

**Step 2: Build and commit**

```bash
npm run build
git add components/dashboard/supply-sankey.tsx
git commit -m "feat: supply flow Sankey diagram with animated path drawing

Shows grain flow: carry-in + production → exports/crush/feed → carry-out.
Replaces waterfall bar chart with a visual that shows flow, not just bars."
```

---

### Task 22: Build Prairie Pulse Map Component

**Files:**
- Create: `components/dashboard/prairie-pulse-map.tsx`

**Step 1: Build stylized map**

Create a client component rendering a simplified Canada map focusing on AB/SK/MB:
- SVG outline of the three prairie provinces (simplified polygons)
- Each province has a pulsing circle node:
  - Size = delivery volume (scaled to viewport)
  - Pulse rate = week-over-week change (faster pulse = bigger change)
  - Color = pace vs. last year (prairie green = ahead, warning amber = behind, error red = significantly behind)
- Pulse animation: `motion.circle` with `scale` oscillating between 1.0 and 1.15

Props:
```typescript
interface PrairiePulseMapProps {
  provinces: Array<{
    region: string; // "Alberta" | "Saskatchewan" | "Manitoba"
    ktonnes: number;
    wow_change_pct?: number;
    yoy_change_pct?: number;
  }>;
}
```

**Step 2: Build and commit**

```bash
npm run build
git add components/dashboard/prairie-pulse-map.tsx
git commit -m "feat: prairie pulse map with animated province nodes

AB/SK/MB provinces with pulsing delivery volume indicators.
Color-coded by pace vs last year. Replaces static provincial cards."
```

---

### Task 23: Build Signal Tape Component

**Files:**
- Create: `components/dashboard/signal-tape.tsx`
- Create: `lib/queries/x-signals.ts` (if not already created in Task 12)

**Step 1: Build horizontal scrolling ticker**

Create a client component rendering a trading-terminal-style signal tape:
- Horizontal scrolling marquee (CSS animation, not JS interval)
- Each signal: colored dot (bullish=green, bearish=red, neutral=amber) + category tag + summary text
- Monospace font (Geist Mono)
- Pause on hover
- Repeating loop (duplicate content for seamless scroll)

Props:
```typescript
interface SignalTapeProps {
  signals: Array<{
    sentiment: string;
    category: string;
    post_summary: string;
    grain: string;
  }>;
}
```

CSS animation:
```css
@keyframes scroll-tape {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
```

**Step 2: Build and commit**

```bash
npm run build
git add components/dashboard/signal-tape.tsx
git commit -m "feat: signal tape ticker showing latest X market signals

Trading-terminal-style horizontal scroller with sentiment-colored
signals. Monospace font, pauses on hover."
```

---

## Phase 8: Dashboard Layout Restructure (Tasks 24-26)

### Task 24: Restructure Grain Detail Page

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Reorganize into three sections**

Restructure the grain detail page into three conceptual zones:

1. **Header + Signal Tape** (sticky thesis banner + signal tape)
2. **Market Signals** (KPIs with CountUp + insight cards with source badges + evidence drawer)
3. **Decision Window** (supply Sankey + prairie pulse map + grain elevator)
4. **Deep Dive** (existing charts: PaceChart, GamifiedGrainChart, DispositionBar — keep but wrapped in AnimatedCard)

**Step 2: Replace old components with new ones**

- Replace `<StockMapWidget>` with `<GrainElevator>`
- Replace `<WaterfallChart>` with `<SupplySankey>` (keep WaterfallChart file for now as fallback)
- Replace `<ProvincialCards>` with `<PrairiePulseMap>`
- Add `<SignalTape>` below thesis banner
- Wrap sections with `<StaggerGroup>`

**Step 3: Fetch X signals data**

Add `getXSignalsForGrain(grain.name)` to the parallel data fetches. Pass to SignalTape and EvidenceDrawer.

**Step 4: Build and commit**

```bash
npm run build
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: restructure grain detail page into position/signals/decision layout

Three-zone layout: Market Signals (KPIs + insights), Decision Window
(Sankey + pulse map + elevator), Deep Dive (charts). Signal tape
added below thesis banner."
```

---

### Task 25: Lint Fix and Build Verification

**Files:**
- Various (fix any remaining lint errors)

**Step 1: Run lint**

Run: `npm run lint`
Fix any new errors introduced by the changes.

**Step 2: Run tests**

Run: `npm run test -- --run`
Expected: All existing tests pass. Add new tests for:
- `buildSearchQueries()` — test hashtag generation and seasonal context
- `getSeason()` — test month-to-season mapping
- Community stats query — mock test for privacy threshold

**Step 3: Run build**

Run: `npm run build`
Expected: Production build succeeds with no errors.

**Step 4: Commit**

```bash
git add .
git commit -m "fix: lint errors and build verification for platform elevation"
```

---

### Task 26: Deploy Edge Functions

**Files:**
- None (deployment commands only)

**Step 1: Deploy new Edge Function**

Run: `npx supabase functions deploy search-x-intelligence`
Expected: Function deployed successfully

**Step 2: Deploy updated Edge Functions**

Run: `npx supabase functions deploy generate-intelligence`
Run: `npx supabase functions deploy generate-farm-summary`
Run: `npx supabase functions deploy import-cgc-weekly`
Expected: All functions deployed successfully

**Step 3: Verify pipeline**

Manually trigger the pipeline to verify the chain:
```bash
curl -X POST https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/search-x-intelligence \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"crop_year":"2025-26","grain_week":29,"grains":["Canola"]}'
```

Check `x_market_signals` table for scored posts. Verify `generate-intelligence` was chain-triggered and produced intelligence with source badges.

**Step 4: Commit any deploy config changes**

```bash
git add .
git commit -m "chore: deploy updated Edge Functions for X intelligence pipeline"
```

---

## Task Dependency Graph

```
Phase 1 (Supply Truth)     Phase 2 (X Search)
  T1 → T2 → T3              T4 → T5 → T6 → T7 → T8
                                          ↓
                              Phase 3 (AI Transparency)
                                T9 → T10 → T11 → T12
                                          ↓
Phase 4 (Percentiles)       Phase 5 (Community)
  T13 → T14                   T15 → T16
        ↓                          ↓
Phase 6 (Motion)             (can run in parallel)
  T17 → T18 → T19
        ↓
Phase 7 (Custom Viz)
  T20, T21, T22, T23  ←— all parallel
        ↓
Phase 8 (Layout + Deploy)
  T24 → T25 → T26
```

**Parallelizable work:**
- Phase 1 and Phase 2 can run in parallel
- Phase 4 and Phase 5 can run in parallel
- Tasks 20-23 (custom visualizations) are all independent
- Phase 6 can start as soon as framer-motion is confirmed installed (it is: v12.35.1)

---

## Testing Strategy

| Area | Test Type | Location |
|------|-----------|----------|
| Search query builder | Unit | `tests/lib/search-queries.test.ts` |
| Season detection | Unit | `tests/lib/search-queries.test.ts` |
| Community stats privacy | Unit | `tests/lib/community.test.ts` |
| Percentile normalization | Integration | Verify via Supabase SQL after migration |
| Pipeline chain | Manual | Trigger import-cgc-weekly, verify full chain |
| Source badges rendering | Visual | Load grain detail page, verify badges appear |
| Motion animations | Visual | Check reduced-motion media query respected |
| CountUp animation | Visual | Verify numbers animate on scroll into view |
