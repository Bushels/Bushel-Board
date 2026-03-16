# Wave 4: Advanced Intelligence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add processor self-sufficiency signals, YoY comparison overlays on Pipeline Velocity chart, processor crush utilization gauge, and grain futures price infrastructure.

**Architecture:** Four independent feature threads: (1) Self-sufficiency ratio from Process.Other Deliveries feeds into the AI thesis pipeline; (2) YoY toggle on Pipeline Velocity chart re-uses existing `get_pipeline_velocity` RPC with prior year + new 5yr-avg RPC; (3) Processor capacity reference table with seeded AAFC data drives a utilization gauge; (4) `grain_prices` table with Edge Function stub for future API integration + price sparkline UI.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL RPCs, migrations, Edge Functions), Recharts, Tailwind CSS, shadcn/ui

---

## Context for Implementer

**Codebase orientation:**
- Grain detail page: `app/(dashboard)/grain/[slug]/page.tsx` — Server Component, data fetched in `Promise.all` with `safeQuery()` wrappers
- Pipeline Velocity chart: `components/dashboard/gamified-grain-chart.tsx` — Recharts `ComposedChart` consuming `CumulativeWeekRow[]` from `getCumulativeTimeSeries()` in `lib/queries/observations.ts`
- Cumulative data RPC: `get_pipeline_velocity(p_grain, p_crop_year)` returns `{grain_week, week_ending_date, producer_deliveries_kt, terminal_receipts_kt, exports_kt, processing_kt}`
- AI thesis Edge Function: `supabase/functions/analyze-market-data/index.ts` — `buildDataPrompt()` assembles all market data for Step 3.5 Flash
- Process worksheet data exists in `cgc_observations` with `worksheet='Process'`, `metric='Other Deliveries'`, `region=''` (national)
- Design tokens: wheat palette, canola primary (#c17f24), prairie success (#437a22), Fraunces display + DM Sans body
- Key pattern: `SectionBoundary` wraps every data section, `SectionHeader` for section titles, `GlassCard` for containers

**Critical rules:**
- Crop year format: always `"2025-2026"` (long format) in DB/code
- PostgREST max_rows=1000 — use RPCs for aggregations
- `numeric` columns return as strings from PostgREST — always `Number()` wrap
- No `any` escape hatches without justification
- `"use client"` only when needed (event handlers, hooks, browser APIs)
- Forward-fill cumulative series — carry last known value, never default to 0

---

### Task 1: Processor Self-Sufficiency RPC

**Purpose:** Compute the ratio of direct producer deliveries to total processor intake. When processors source less grain directly from farmers (ratio drops), it signals farmer pricing power (bullish). `Process.Other Deliveries` is imported but currently unqueried.

**Files:**
- Create: `supabase/migrations/20260314500000_processor_self_sufficiency_rpc.sql`
- Modify: `lib/queries/observations.ts` (add query function)

**Step 1: Create the migration with RPC function**

```sql
-- supabase/migrations/20260314500000_processor_self_sufficiency_rpc.sql

-- RPC: get_processor_self_sufficiency
-- Returns per-week self-sufficiency ratio for a grain:
--   self_sufficiency_pct = producer_deliveries / (producer_deliveries + other_deliveries) × 100
-- Both metrics come from the Process worksheet (national total, region='').
-- Returns weekly and crop-year-to-date ratios.

CREATE OR REPLACE FUNCTION get_processor_self_sufficiency(
  p_grain text,
  p_crop_year text
)
RETURNS TABLE (
  grain_week int,
  cw_producer_kt numeric,
  cw_other_kt numeric,
  cw_self_sufficiency_pct numeric,
  cy_producer_kt numeric,
  cy_other_kt numeric,
  cy_self_sufficiency_pct numeric
)
LANGUAGE sql STABLE
AS $$
  WITH weekly AS (
    SELECT
      o.grain_week,
      o.metric,
      o.period,
      o.ktonnes
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year = p_crop_year
      AND o.worksheet = 'Process'
      AND o.metric IN ('Producer Deliveries', 'Other Deliveries')
      AND o.region = ''
      AND o.grade = ''
  ),
  pivoted AS (
    SELECT
      w.grain_week,
      MAX(CASE WHEN w.metric = 'Producer Deliveries' AND w.period = 'Current Week' THEN w.ktonnes ELSE 0 END) AS cw_producer,
      MAX(CASE WHEN w.metric = 'Other Deliveries' AND w.period = 'Current Week' THEN w.ktonnes ELSE 0 END) AS cw_other,
      MAX(CASE WHEN w.metric = 'Producer Deliveries' AND w.period = 'Crop Year' THEN w.ktonnes ELSE 0 END) AS cy_producer,
      MAX(CASE WHEN w.metric = 'Other Deliveries' AND w.period = 'Crop Year' THEN w.ktonnes ELSE 0 END) AS cy_other
    FROM weekly w
    GROUP BY w.grain_week
  )
  SELECT
    p.grain_week::int,
    p.cw_producer,
    p.cw_other,
    CASE WHEN (p.cw_producer + p.cw_other) > 0
      THEN ROUND((p.cw_producer / (p.cw_producer + p.cw_other) * 100)::numeric, 1)
      ELSE NULL
    END AS cw_self_sufficiency_pct,
    p.cy_producer,
    p.cy_other,
    CASE WHEN (p.cy_producer + p.cy_other) > 0
      THEN ROUND((p.cy_producer / (p.cy_producer + p.cy_other) * 100)::numeric, 1)
      ELSE NULL
    END AS cy_self_sufficiency_pct
  FROM pivoted p
  ORDER BY p.grain_week;
$$;
```

**Step 2: Add query function in observations.ts**

Add to `lib/queries/observations.ts`:

```typescript
export interface ProcessorSelfSufficiency {
  grain_week: number;
  cw_producer_kt: number;
  cw_other_kt: number;
  cw_self_sufficiency_pct: number | null;
  cy_producer_kt: number;
  cy_other_kt: number;
  cy_self_sufficiency_pct: number | null;
}

export async function getProcessorSelfSufficiency(
  grainName: string,
  cropYear?: string
): Promise<ProcessorSelfSufficiency[]> {
  const supabase = await createClient();
  const year = cropYear ?? CURRENT_CROP_YEAR;

  const { data, error } = await supabase.rpc("get_processor_self_sufficiency", {
    p_grain: grainName,
    p_crop_year: year,
  });

  if (error) {
    console.error("getProcessorSelfSufficiency error:", error.message);
    return [];
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    grain_week: Number(r.grain_week),
    cw_producer_kt: Number(r.cw_producer_kt),
    cw_other_kt: Number(r.cw_other_kt),
    cw_self_sufficiency_pct: r.cw_self_sufficiency_pct != null ? Number(r.cw_self_sufficiency_pct) : null,
    cy_producer_kt: Number(r.cy_producer_kt),
    cy_other_kt: Number(r.cy_other_kt),
    cy_self_sufficiency_pct: r.cy_self_sufficiency_pct != null ? Number(r.cy_self_sufficiency_pct) : null,
  }));
}
```

**Step 3: Run build to verify**

Run: `npm run build`
Expected: PASS (no new UI yet, just data layer)

**Step 4: Commit**

```bash
git add supabase/migrations/20260314500000_processor_self_sufficiency_rpc.sql lib/queries/observations.ts
git commit -m "feat: add processor self-sufficiency RPC and query function"
```

---

### Task 2: Inject Self-Sufficiency into AI Thesis Pipeline

**Purpose:** Feed the self-sufficiency ratio into the `analyze-market-data` Edge Function so Step 3.5 Flash can cite it in bull/bear analysis.

**Files:**
- Modify: `supabase/functions/analyze-market-data/index.ts`

**Step 1: Add self-sufficiency data fetch**

In the per-grain data gathering section (around line 139-164 in the `for (const grainName of grainNames)` loop), add a new query alongside the historical averages:

```typescript
// After the existing historical average queries and COT positioning fetch:

// 8. Processor self-sufficiency (Process.Producer vs Other Deliveries)
const { data: selfSufficiencyData } = await supabase.rpc("get_processor_self_sufficiency", {
  p_grain: grainName,
  p_crop_year: cropYear,
});
```

**Step 2: Pass self-sufficiency to buildDataPrompt**

Update `buildDataPrompt` signature to accept `selfSufficiency`:

```typescript
function buildDataPrompt(
  // ... existing params ...
  cotData: Array<Record<string, unknown>> | null = null,
  selfSufficiency: Array<Record<string, unknown>> | null = null, // NEW
): string {
```

Call site update:

```typescript
const dataPrompt = buildDataPrompt(
  grainName, cropYear, grainWeek,
  yoy, supply, sentiment, delivery,
  deliveriesHist, exportsHist, stocksHist,
  knowledgeContext.contextText,
  logisticsSnapshot,
  cotPositioning,
  selfSufficiencyData, // NEW
);
```

**Step 3: Add self-sufficiency section to the data prompt**

Insert before the `## Task` section at the end of `buildDataPrompt()`:

```typescript
### Processor Self-Sufficiency (Process worksheet — producer vs non-producer intake)
${formatSelfSufficiencySection(selfSufficiency, grainWeek)}
```

Add formatter function:

```typescript
function formatSelfSufficiencySection(
  data: Array<Record<string, unknown>> | null,
  currentWeek: number
): string {
  if (!data || data.length === 0) return "No processor self-sufficiency data available.";

  const latest = data.find((r) => Number(r.grain_week) === currentWeek)
    ?? data[data.length - 1];

  if (!latest) return "No processor self-sufficiency data available.";

  const cyPct = latest.cy_self_sufficiency_pct != null
    ? `${Number(latest.cy_self_sufficiency_pct).toFixed(1)}%`
    : "N/A";
  const cwProducer = Number(latest.cw_producer_kt || 0).toFixed(1);
  const cwOther = Number(latest.cw_other_kt || 0).toFixed(1);
  const cyProducer = Number(latest.cy_producer_kt || 0).toFixed(1);
  const cyOther = Number(latest.cy_other_kt || 0).toFixed(1);

  // Calculate trend from last 4 weeks
  const recentWeeks = data
    .filter((r) => Number(r.grain_week) >= currentWeek - 3 && Number(r.grain_week) <= currentWeek)
    .sort((a, b) => Number(a.grain_week) - Number(b.grain_week));

  let trend = "stable";
  if (recentWeeks.length >= 2) {
    const first = Number(recentWeeks[0].cy_self_sufficiency_pct ?? 0);
    const last = Number(recentWeeks[recentWeeks.length - 1].cy_self_sufficiency_pct ?? 0);
    if (last - first > 2) trend = "rising (processors sourcing more from farmers)";
    if (first - last > 2) trend = "falling (processors sourcing more from non-farmer channels)";
  }

  return `- CY Self-Sufficiency: ${cyPct} of processor intake comes directly from producers
- This Week: Producer ${cwProducer} Kt, Other ${cwOther} Kt
- CY Total: Producer ${cyProducer} Kt, Other ${cyOther} Kt
- 4-Week Trend: ${trend}
- SIGNAL: When self-sufficiency drops below ~65%, processors are drawing more from intermediaries/imports — this can signal tighter farm-gate supply (bullish for farmer pricing). When above ~75%, ample direct supply may limit upside.`;
}
```

**Step 4: Run build to verify**

This is an Edge Function (Deno), so verify syntax:
Run: `npx supabase functions serve analyze-market-data --no-verify-jwt` (verify it starts without errors, then Ctrl+C)

**Step 5: Commit**

```bash
git add supabase/functions/analyze-market-data/index.ts
git commit -m "feat: inject processor self-sufficiency signal into AI thesis pipeline"
```

---

### Task 3: Processor Capacity Reference Table + Seed Data

**Purpose:** Store known annual processing capacity per grain (from AAFC/industry reports). Used to calculate crush utilization rate: `weekly_processing × 52 / annual_capacity`.

**Files:**
- Create: `supabase/migrations/20260314510000_create_processor_capacity.sql`
- Create: `scripts/seed-processor-capacity.ts`
- Modify: `package.json` (add seed script)

**Step 1: Create the migration**

```sql
-- supabase/migrations/20260314510000_create_processor_capacity.sql

CREATE TABLE IF NOT EXISTS processor_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grain TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  annual_capacity_kt NUMERIC NOT NULL,
  source TEXT NOT NULL,         -- e.g. "AAFC Feb 2026", "Industry estimate"
  is_approximate BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grain, crop_year)
);

-- RLS: read-only for authenticated users
ALTER TABLE processor_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read processor capacity"
  ON processor_capacity FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE processor_capacity IS 'Annual crush/processing capacity per grain. Seeded from AAFC and industry reports.';
```

**Step 2: Create the seed script**

```typescript
// scripts/seed-processor-capacity.ts
//
// Seeds processor_capacity with known Canadian processing capacities.
// Source: AAFC Supply & Disposition, Canola Council, Pulse Canada reports.
// Run: npx tsx scripts/seed-processor-capacity.ts
// Idempotent: uses upsert on (grain, crop_year).

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (process.argv.includes("--help")) {
  console.error("Usage: npx tsx scripts/seed-processor-capacity.ts");
  console.error("Seeds processor_capacity table with AAFC/industry capacity data.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Annual Canadian processing capacity estimates (Kt/year)
// Sources:
//   - Canola: Canola Council crush capacity ~12,000 Kt/yr (2025 estimate, expansions ongoing)
//   - Wheat: Flour mills ~4,200 Kt/yr (Canadian National Millers Association)
//   - Barley: Malt + feed ~2,800 Kt/yr
//   - Oats: ~1,200 Kt/yr (Richardson, Grain Millers)
//   - Soybeans: ~2,500 Kt/yr (Bunge, Viterra ON plants)
//   - Corn: ~5,000 Kt/yr (ethanol + starch + feed)
//   - Peas: ~800 Kt/yr (fractionation + food)
//   - Lentils: ~400 Kt/yr (pulse processing)
//   - Flaxseed: ~200 Kt/yr
//   - Amber Durum: ~1,800 Kt/yr (semolina mills)
//   - Rye: ~150 Kt/yr
//   - Mustard Seed: ~80 Kt/yr
//   - Others: approximate or not applicable

const CAPACITIES: {
  grain: string;
  annual_capacity_kt: number;
  source: string;
  is_approximate: boolean;
  notes: string | null;
}[] = [
  { grain: "Canola", annual_capacity_kt: 12000, source: "Canola Council 2025", is_approximate: false, notes: "Domestic crush. Expansions at Regina, Yorkton ongoing." },
  { grain: "Wheat", annual_capacity_kt: 4200, source: "AAFC Feb 2026", is_approximate: false, notes: "Flour milling capacity. Food/industrial use." },
  { grain: "Amber Durum", annual_capacity_kt: 1800, source: "AAFC Feb 2026", is_approximate: false, notes: "Semolina milling for pasta." },
  { grain: "Barley", annual_capacity_kt: 2800, source: "AAFC Feb 2026", is_approximate: false, notes: "Malt + feed processing combined." },
  { grain: "Oats", annual_capacity_kt: 1200, source: "Industry estimate 2025", is_approximate: true, notes: "Richardson, Grain Millers. Growing demand." },
  { grain: "Soybeans", annual_capacity_kt: 2500, source: "AAFC Feb 2026", is_approximate: false, notes: "Bunge Hamilton, Viterra ON crush plants." },
  { grain: "Corn", annual_capacity_kt: 5000, source: "AAFC Feb 2026", is_approximate: false, notes: "Ethanol, starch, sweetener, feed." },
  { grain: "Peas", annual_capacity_kt: 800, source: "Pulse Canada 2025", is_approximate: true, notes: "Protein fractionation + food processing." },
  { grain: "Lentils", annual_capacity_kt: 400, source: "Pulse Canada 2025", is_approximate: true, notes: "Splitting and food processing." },
  { grain: "Flaxseed", annual_capacity_kt: 200, source: "Industry estimate 2025", is_approximate: true, notes: "Oil pressing, food use." },
  { grain: "Rye", annual_capacity_kt: 150, source: "Industry estimate 2025", is_approximate: true, notes: "Distilling, flour, animal feed." },
  { grain: "Mustard Seed", annual_capacity_kt: 80, source: "Industry estimate 2025", is_approximate: true, notes: "Condiment manufacturing." },
];

async function main() {
  const cropYear = "2025-2026";

  const rows = CAPACITIES.map((c) => ({
    grain: c.grain,
    crop_year: cropYear,
    annual_capacity_kt: c.annual_capacity_kt,
    source: c.source,
    is_approximate: c.is_approximate,
    notes: c.notes,
  }));

  const { data, error } = await supabase
    .from("processor_capacity")
    .upsert(rows, { onConflict: "grain,crop_year" })
    .select("grain");

  if (error) {
    console.error("Seed error:", error.message);
    process.exit(1);
  }

  const result = { seeded: (data ?? []).length, crop_year: cropYear };
  console.log(JSON.stringify(result));
}

main();
```

**Step 3: Add script to package.json**

Add to `scripts` in `package.json`:
```json
"seed-capacity": "tsx scripts/seed-processor-capacity.ts"
```

**Step 4: Run build to verify**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/20260314510000_create_processor_capacity.sql scripts/seed-processor-capacity.ts package.json
git commit -m "feat: add processor capacity reference table with seed data"
```

---

### Task 4: YoY Toggle on Pipeline Velocity Chart

**Purpose:** Let farmers compare this year's cumulative pipeline flow against last year and the 5-year average. This is the biggest UI change in Wave 4 — modifying `GamifiedGrainChart` to accept optional overlay series with toggle buttons.

**Files:**
- Create: `supabase/migrations/20260314520000_historical_pipeline_avg_rpc.sql`
- Modify: `lib/queries/observations.ts` (add historical avg query)
- Modify: `components/dashboard/gamified-grain-chart.tsx` (add toggle + overlay lines)
- Modify: `app/(dashboard)/grain/[slug]/page.tsx` (fetch prior year + avg data)

**Step 1: Create RPC for historical pipeline averages**

The existing `get_pipeline_velocity` returns one crop year at a time. For the 5yr average, we need an RPC that averages across multiple prior years per grain week.

```sql
-- supabase/migrations/20260314520000_historical_pipeline_avg_rpc.sql

-- Returns the N-year average cumulative pipeline metrics per grain week.
-- Averages producer_deliveries, terminal_receipts, exports, processing across
-- the N crop years preceding the given crop year.

CREATE OR REPLACE FUNCTION get_pipeline_velocity_avg(
  p_grain text,
  p_crop_year text,
  p_years_back int DEFAULT 5
)
RETURNS TABLE (
  grain_week int,
  avg_deliveries_kt numeric,
  avg_receipts_kt numeric,
  avg_exports_kt numeric,
  avg_processing_kt numeric,
  years_count int
)
LANGUAGE sql STABLE
AS $$
  WITH crop_year_start AS (
    -- Extract the start year from crop year format "YYYY-YYYY"
    SELECT LEFT(p_crop_year, 4)::int AS start_year
  ),
  prior_years AS (
    -- Generate N prior crop year strings
    SELECT
      (cys.start_year - g.n)::text || '-' || (cys.start_year - g.n + 1)::text AS crop_year
    FROM crop_year_start cys,
         generate_series(1, p_years_back) AS g(n)
  ),
  -- Get pipeline velocity for each prior year using the same logic as get_pipeline_velocity
  -- Primary deliveries (prairie provinces, grade='', Crop Year cumulative)
  deliveries AS (
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Primary'
      AND o.metric = 'Deliveries'
      AND o.period = 'Crop Year'
      AND o.grade = ''
      AND o.region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    GROUP BY o.crop_year, o.grain_week
  ),
  -- Process deliveries (national, Crop Year cumulative)
  proc_deliveries AS (
    SELECT o.crop_year, o.grain_week, o.ktonnes AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Process'
      AND o.metric = 'Producer Deliveries'
      AND o.period = 'Crop Year'
      AND o.region = ''
      AND o.grade = ''
  ),
  -- Combined deliveries per year/week
  combined_deliveries AS (
    SELECT
      COALESCE(d.crop_year, pd.crop_year) AS crop_year,
      COALESCE(d.grain_week, pd.grain_week) AS grain_week,
      COALESCE(d.kt, 0) + COALESCE(pd.kt, 0) AS kt
    FROM deliveries d
    FULL OUTER JOIN proc_deliveries pd
      ON d.crop_year = pd.crop_year AND d.grain_week = pd.grain_week
  ),
  -- Terminal receipts (all grades summed, Crop Year)
  receipts AS (
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Terminal Receipts'
      AND o.metric = 'Receipts'
      AND o.period = 'Crop Year'
    GROUP BY o.crop_year, o.grain_week
  ),
  -- Terminal exports (all grades summed, Crop Year)
  exports AS (
    SELECT o.crop_year, o.grain_week, SUM(o.ktonnes) AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Terminal Exports'
      AND o.metric = 'Exports'
      AND o.period = 'Crop Year'
    GROUP BY o.crop_year, o.grain_week
  ),
  -- Processing / Milled grain (Crop Year)
  processing AS (
    SELECT o.crop_year, o.grain_week, o.ktonnes AS kt
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year IN (SELECT py.crop_year FROM prior_years py)
      AND o.worksheet = 'Process'
      AND o.metric = 'Milled/Mfg Grain'
      AND o.period = 'Crop Year'
      AND o.region = ''
      AND o.grade = ''
  ),
  -- Combine all metrics per year/week
  all_weeks AS (
    SELECT DISTINCT grain_week FROM (
      SELECT grain_week FROM combined_deliveries
      UNION SELECT grain_week FROM receipts
      UNION SELECT grain_week FROM exports
      UNION SELECT grain_week FROM processing
    ) AS w
  ),
  all_years AS (
    SELECT crop_year FROM prior_years
  ),
  grid AS (
    SELECT ay.crop_year, aw.grain_week
    FROM all_years ay CROSS JOIN all_weeks aw
  ),
  merged AS (
    SELECT
      g.crop_year,
      g.grain_week,
      COALESCE(cd.kt, 0) AS deliveries_kt,
      COALESCE(r.kt, 0) AS receipts_kt,
      COALESCE(e.kt, 0) AS exports_kt,
      COALESCE(p.kt, 0) AS processing_kt
    FROM grid g
    LEFT JOIN combined_deliveries cd ON g.crop_year = cd.crop_year AND g.grain_week = cd.grain_week
    LEFT JOIN receipts r ON g.crop_year = r.crop_year AND g.grain_week = r.grain_week
    LEFT JOIN exports e ON g.crop_year = e.crop_year AND g.grain_week = e.grain_week
    LEFT JOIN processing p ON g.crop_year = p.crop_year AND g.grain_week = p.grain_week
  )
  SELECT
    m.grain_week::int,
    ROUND(AVG(m.deliveries_kt)::numeric, 1) AS avg_deliveries_kt,
    ROUND(AVG(m.receipts_kt)::numeric, 1) AS avg_receipts_kt,
    ROUND(AVG(m.exports_kt)::numeric, 1) AS avg_exports_kt,
    ROUND(AVG(m.processing_kt)::numeric, 1) AS avg_processing_kt,
    COUNT(DISTINCT m.crop_year)::int AS years_count
  FROM merged m
  GROUP BY m.grain_week
  ORDER BY m.grain_week;
$$;
```

**Step 2: Add query functions**

Add to `lib/queries/observations.ts`:

```typescript
export interface HistoricalPipelineAvg {
  grain_week: number;
  avg_deliveries_kt: number;
  avg_receipts_kt: number;
  avg_exports_kt: number;
  avg_processing_kt: number;
  years_count: number;
}

/**
 * Get N-year average pipeline velocity per grain week.
 * Used for "5yr Avg" overlay on the Pipeline Velocity chart.
 */
export async function getHistoricalPipelineAvg(
  grainName: string,
  cropYear?: string,
  yearsBack = 5
): Promise<HistoricalPipelineAvg[]> {
  const supabase = await createClient();
  const year = cropYear ?? CURRENT_CROP_YEAR;

  const { data, error } = await supabase.rpc("get_pipeline_velocity_avg", {
    p_grain: grainName,
    p_crop_year: year,
    p_years_back: yearsBack,
  });

  if (error) {
    console.error("getHistoricalPipelineAvg error:", error.message);
    return [];
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    grain_week: Number(r.grain_week),
    avg_deliveries_kt: Number(r.avg_deliveries_kt),
    avg_receipts_kt: Number(r.avg_receipts_kt),
    avg_exports_kt: Number(r.avg_exports_kt),
    avg_processing_kt: Number(r.avg_processing_kt),
    years_count: Number(r.years_count),
  }));
}
```

**Step 3: Fetch prior year + 5yr avg on grain detail page**

In `app/(dashboard)/grain/[slug]/page.tsx`, add to the `Promise.all`:

```typescript
// Add import at top:
import {
  // ... existing imports ...
  getHistoricalPipelineAvg,
  type HistoricalPipelineAvg,
} from "@/lib/queries/observations";
import { getPriorCropYear } from "@/lib/utils/crop-year";

// Add to Promise.all (after existing entries):
safeQuery("Prior year pipeline", () =>
  getCumulativeTimeSeries(grain.name, getPriorCropYear())
),
safeQuery("5yr avg pipeline", () =>
  getHistoricalPipelineAvg(grain.name)
),
```

**Note:** You'll also need to add `getPriorCropYear()` to `lib/utils/crop-year.ts`:

```typescript
/** Returns the crop year before the current one, e.g. "2024-2025" */
export function getPriorCropYear(): string {
  const start = parseInt(CURRENT_CROP_YEAR.split("-")[0], 10);
  return `${start - 1}-${start}`;
}
```

Destructure the new results:

```typescript
const [
  // ... existing destructured results ...
  priorYearPipelineResult,
  fiveYrAvgPipelineResult,
] = await Promise.all([...]);
```

Pass them to the chart:

```typescript
<GamifiedGrainChart
  weeklyData={pipelineVelocityResult.data ?? []}
  userDeliveries={userDeliveries}
  priorYearData={priorYearPipelineResult.error ? undefined : priorYearPipelineResult.data ?? undefined}
  fiveYrAvgData={fiveYrAvgPipelineResult.error ? undefined : fiveYrAvgPipelineResult.data ?? undefined}
/>
```

**Step 4: Modify GamifiedGrainChart to support YoY toggle**

This is the biggest change. The chart needs:
1. Toggle buttons: `[This Year] [Last Year ─ ─] [5yr Avg ···]`
2. When "Last Year" is active, render dashed `deliveries` line from prior year data
3. When "5yr Avg" is active, render dotted `deliveries` line from avg data
4. Initially only "This Year" is active

Since `GamifiedGrainChart` currently uses `"use client"`, we can add `useState` for toggle state.

Updated component (key changes only — full code in implementation):

```typescript
import { useState } from "react";
// ... existing imports ...
import type { HistoricalPipelineAvg } from "@/lib/queries/observations";

interface GamifiedGrainChartProps {
  weeklyData: CumulativeWeekRow[];
  userDeliveries: DeliveryEntry[];
  cropYearStart?: number;
  priorYearData?: CumulativeWeekRow[];       // NEW
  fiveYrAvgData?: HistoricalPipelineAvg[];   // NEW
}

export function GamifiedGrainChart({
  weeklyData,
  userDeliveries,
  cropYearStart = 2025,
  priorYearData,
  fiveYrAvgData,
}: GamifiedGrainChartProps) {
  const [showPriorYear, setShowPriorYear] = useState(false);
  const [showFiveYrAvg, setShowFiveYrAvg] = useState(false);

  // ... existing chartData build logic ...

  // Merge overlay data by grain_week
  const chartDataWithOverlays = chartData.map((row) => {
    const py = priorYearData?.find((p) => p.grain_week === row.week);
    const avg = fiveYrAvgData?.find((a) => a.grain_week === row.week);
    return {
      ...row,
      pyDeliveries: py?.producer_deliveries_kt ?? undefined,
      avgDeliveries: avg?.avg_deliveries_kt ?? undefined,
    };
  });

  const hasOverlays = (priorYearData && priorYearData.length > 0) ||
                      (fiveYrAvgData && fiveYrAvgData.length > 0);

  return (
    <Card className="bg-card w-full border-border/40 p-4">
      {/* Toggle buttons */}
      {hasOverlays && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground mr-1">Compare:</span>
          {priorYearData && priorYearData.length > 0 && (
            <button
              onClick={() => setShowPriorYear(!showPriorYear)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                showPriorYear
                  ? "bg-muted-foreground/20 text-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
              }`}
            >
              <span className="inline-block w-4 border-t-2 border-dashed border-current" />
              Last Year
            </button>
          )}
          {fiveYrAvgData && fiveYrAvgData.length > 0 && (
            <button
              onClick={() => setShowFiveYrAvg(!showFiveYrAvg)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                showFiveYrAvg
                  ? "bg-muted-foreground/20 text-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
              }`}
            >
              <span className="inline-block w-4 border-t-2 border-dotted border-current" />
              5yr Avg
            </button>
          )}
        </div>
      )}

      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartDataWithOverlays} ...>
            {/* ... existing series ... */}

            {/* Prior year deliveries overlay */}
            {showPriorYear && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="pyDeliveries"
                name="Last Year Deliveries"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="8 4"
                dot={false}
                connectNulls
              />
            )}

            {/* 5yr average deliveries overlay */}
            {showFiveYrAvg && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="avgDeliveries"
                name="5yr Avg Deliveries"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                opacity={0.6}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

**Step 5: Run build, verify visually**

Run: `npm run build`
Run dev server and navigate to `/grain/wheat` — Pipeline Velocity section should show toggle buttons.

**Step 6: Commit**

```bash
git add supabase/migrations/20260314520000_historical_pipeline_avg_rpc.sql \
  lib/queries/observations.ts \
  lib/utils/crop-year.ts \
  components/dashboard/gamified-grain-chart.tsx \
  app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: add YoY toggle on Pipeline Velocity chart with prior year and 5yr avg overlays"
```

---

### Task 5: Crush Utilization Gauge Component

**Purpose:** Show how much of Canada's processing capacity is being used for each grain. Weekly processing rate × 52 weeks vs annual capacity = utilization percentage. High utilization + rising = bullish for basis.

**Files:**
- Create: `lib/queries/processor-capacity.ts`
- Create: `components/dashboard/crush-utilization-gauge.tsx`
- Modify: `app/(dashboard)/grain/[slug]/page.tsx` (add to grid alongside COT)

**Step 1: Create query function**

```typescript
// lib/queries/processor-capacity.ts

import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

export interface ProcessorCapacity {
  grain: string;
  annual_capacity_kt: number;
  source: string;
  is_approximate: boolean;
  notes: string | null;
}

export async function getProcessorCapacity(
  grainName: string,
  cropYear?: string
): Promise<ProcessorCapacity | null> {
  const supabase = await createClient();
  const year = cropYear ?? CURRENT_CROP_YEAR;

  const { data, error } = await supabase
    .from("processor_capacity")
    .select("grain, annual_capacity_kt, source, is_approximate, notes")
    .eq("grain", grainName)
    .eq("crop_year", year)
    .single();

  if (error || !data) return null;

  return {
    grain: String(data.grain),
    annual_capacity_kt: Number(data.annual_capacity_kt),
    source: String(data.source),
    is_approximate: Boolean(data.is_approximate),
    notes: data.notes ? String(data.notes) : null,
  };
}
```

**Step 2: Create the gauge component**

The gauge shows a semicircular arc with utilization percentage. Uses pure SVG (no Recharts needed).

```typescript
// components/dashboard/crush-utilization-gauge.tsx
"use client"

import { GlassCard } from "@/components/ui/glass-card";

interface CrushUtilizationGaugeProps {
  grainName: string;
  weeklyProcessingKt: number;    // Current week's processing (Milled/Mfg Grain)
  annualCapacityKt: number;       // From processor_capacity table
  isApproximate?: boolean;
  source?: string;
}

export function CrushUtilizationGauge({
  grainName,
  weeklyProcessingKt,
  annualCapacityKt,
  isApproximate,
  source,
}: CrushUtilizationGaugeProps) {
  // Annualized rate: weekly × 52
  const annualizedKt = weeklyProcessingKt * 52;
  const utilizationPct = annualCapacityKt > 0
    ? Math.min(100, (annualizedKt / annualCapacityKt) * 100)
    : 0;

  // Color based on utilization
  const color = utilizationPct >= 85
    ? "var(--color-prairie)"       // High utilization — bullish
    : utilizationPct >= 65
      ? "hsl(var(--primary))"      // canola/moderate
      : "hsl(var(--muted-foreground))"; // Low

  // Signal text
  const signal = utilizationPct >= 85
    ? "High crush demand — bullish for basis"
    : utilizationPct >= 65
      ? "Moderate crush pace"
      : "Below-average processing activity";

  // SVG arc params
  const cx = 100, cy = 90, r = 70;
  const startAngle = Math.PI;
  const endAngle = 0;
  const filledAngle = startAngle - (utilizationPct / 100) * Math.PI;

  const arcPath = (angle: number) => {
    const x = cx + r * Math.cos(angle);
    const y = cy - r * Math.sin(angle);
    return `${x} ${y}`;
  };

  const bgArc = `M ${arcPath(startAngle)} A ${r} ${r} 0 0 1 ${arcPath(endAngle)}`;
  const fillArc = `M ${arcPath(startAngle)} A ${r} ${r} 0 ${utilizationPct > 50 ? 1 : 0} 1 ${arcPath(filledAngle)}`;

  return (
    <GlassCard className="p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        Crush Utilization
      </p>

      <div className="flex justify-center">
        <svg viewBox="0 0 200 110" className="w-full max-w-[200px]">
          {/* Background arc */}
          <path
            d={bgArc}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {utilizationPct > 0 && (
            <path
              d={fillArc}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
            />
          )}
          {/* Center percentage */}
          <text
            x={cx}
            y={cy - 5}
            textAnchor="middle"
            className="fill-foreground font-display font-bold"
            fontSize="24"
          >
            {utilizationPct.toFixed(0)}%
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            of capacity
          </text>
        </svg>
      </div>

      <p className="text-xs text-center mt-1" style={{ color }}>
        {signal}
      </p>

      <div className="mt-3 border-t border-border/30 pt-2 space-y-1 text-xs text-muted-foreground/80">
        <p>Weekly rate: {weeklyProcessingKt.toFixed(1)} Kt × 52 = {annualizedKt.toFixed(0)} Kt/yr</p>
        <p>Capacity: {isApproximate ? "~" : ""}{annualCapacityKt.toLocaleString()} Kt/yr</p>
        {source && <p className="text-muted-foreground/50">Source: {source}</p>}
      </div>
    </GlassCard>
  );
}
```

**Step 3: Wire into grain detail page**

Add to the `Promise.all` data fetching in `page.tsx`:

```typescript
import { getProcessorCapacity } from "@/lib/queries/processor-capacity";
import { CrushUtilizationGauge } from "@/components/dashboard/crush-utilization-gauge";

// Add to Promise.all:
safeQuery("Processor capacity", () => getProcessorCapacity(grain.name)),
```

Place the gauge in the existing "Quality & Market Sentiment" 2-col grid, or create a new row. The most natural spot: replace the current 2-col grid with a 3-col grid (Grain Quality + COT + Crush Utilization) on large screens:

```typescript
{/* Quality, COT & Crush (3-col on lg) */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Grain Quality Donut */}
  {/* ... existing ... */}

  {/* Fund Sentiment (COT) */}
  {/* ... existing ... */}

  {/* Crush Utilization Gauge */}
  {!capacityResult.error && capacityResult.data && (
    <SectionBoundary title="Crush data unavailable" message="Processor utilization data is temporarily unavailable.">
      <CrushUtilizationGauge
        grainName={grain.name}
        weeklyProcessingKt={
          wowResult.error ? 0 :
          (wowResult.data?.metrics.find(m => m.metric === "Processing")?.thisWeek ?? 0)
        }
        annualCapacityKt={capacityResult.data.annual_capacity_kt}
        isApproximate={capacityResult.data.is_approximate}
        source={capacityResult.data.source}
      />
    </SectionBoundary>
  )}
</div>
```

**Step 4: Run build + verify visually**

Run: `npm run build`
Navigate to `/grain/canola` (Canola has the most processing activity).

**Step 5: Commit**

```bash
git add lib/queries/processor-capacity.ts \
  components/dashboard/crush-utilization-gauge.tsx \
  app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: add crush utilization gauge with processor capacity data"
```

---

### Task 6: Grain Prices Table + Migration

**Purpose:** Create the `grain_prices` table for daily futures settlement data. The actual API integration is deferred (needs research), but the schema and a manual seed script are ready.

**Files:**
- Create: `supabase/migrations/20260314530000_create_grain_prices.sql`
- Create: `scripts/seed-grain-prices.ts` (sample data for development)

**Step 1: Create the migration**

```sql
-- supabase/migrations/20260314530000_create_grain_prices.sql

CREATE TABLE IF NOT EXISTS grain_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grain TEXT NOT NULL,
  contract TEXT NOT NULL,          -- e.g. "CWR25" (ICE Canola May 2025), "WN25" (CBOT Wheat Jul 2025)
  exchange TEXT NOT NULL,          -- "ICE", "CBOT", "MGE"
  price_date DATE NOT NULL,
  settlement_price NUMERIC,       -- CAD/tonne for ICE, USD/bushel for CBOT
  change_amount NUMERIC,
  change_pct NUMERIC,
  volume INTEGER,
  open_interest INTEGER,
  currency TEXT NOT NULL DEFAULT 'CAD',
  source TEXT NOT NULL,            -- "manual", "barchart", "alpha_vantage"
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grain, contract, price_date)
);

-- RLS: read-only for authenticated users
ALTER TABLE grain_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read grain prices"
  ON grain_prices FOR SELECT
  TO authenticated
  USING (true);

-- Index for quick lookups by grain + recent dates
CREATE INDEX idx_grain_prices_grain_date
  ON grain_prices (grain, price_date DESC);

COMMENT ON TABLE grain_prices IS 'Daily futures settlement prices. Source: manual entry or delayed API.';

-- Convenience view: latest price per grain
CREATE OR REPLACE VIEW v_latest_grain_prices AS
SELECT DISTINCT ON (grain)
  grain,
  contract,
  exchange,
  price_date,
  settlement_price,
  change_amount,
  change_pct,
  currency,
  source
FROM grain_prices
ORDER BY grain, price_date DESC;
```

**Step 2: Create seed script with sample data**

```typescript
// scripts/seed-grain-prices.ts
//
// Seeds grain_prices with recent sample data for development/testing.
// In production, this will be replaced by an automated import Edge Function.
// Run: npx tsx scripts/seed-grain-prices.ts
// Idempotent: uses upsert on (grain, contract, price_date).

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (process.argv.includes("--help")) {
  console.error("Usage: npx tsx scripts/seed-grain-prices.ts");
  console.error("Seeds grain_prices with sample futures data.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Sample: nearby contract prices for key grains (March 2026)
// These are illustrative values for UI development only.
const SAMPLE_PRICES = [
  // Canola (ICE, CAD/tonne)
  { grain: "Canola", contract: "RSK26", exchange: "ICE", currency: "CAD",
    prices: [
      { date: "2026-03-10", price: 665.0, change: 3.2 },
      { date: "2026-03-11", price: 668.5, change: 3.5 },
      { date: "2026-03-12", price: 662.0, change: -6.5 },
      { date: "2026-03-13", price: 670.2, change: 8.2 },
      { date: "2026-03-14", price: 672.8, change: 2.6 },
    ]},
  // Wheat (CBOT, USD/bushel × 100 = cents)
  { grain: "Wheat", contract: "WK26", exchange: "CBOT", currency: "USD",
    prices: [
      { date: "2026-03-10", price: 548.0, change: -4.5 },
      { date: "2026-03-11", price: 552.25, change: 4.25 },
      { date: "2026-03-12", price: 549.5, change: -2.75 },
      { date: "2026-03-13", price: 555.0, change: 5.5 },
      { date: "2026-03-14", price: 557.75, change: 2.75 },
    ]},
  // Barley (ICE, CAD/tonne)
  { grain: "Barley", contract: "ABK26", exchange: "ICE", currency: "CAD",
    prices: [
      { date: "2026-03-10", price: 295.0, change: 1.0 },
      { date: "2026-03-11", price: 297.5, change: 2.5 },
      { date: "2026-03-12", price: 294.0, change: -3.5 },
      { date: "2026-03-13", price: 296.0, change: 2.0 },
      { date: "2026-03-14", price: 298.5, change: 2.5 },
    ]},
  // Oats (CBOT, USD/bushel × 100)
  { grain: "Oats", contract: "OK26", exchange: "CBOT", currency: "USD",
    prices: [
      { date: "2026-03-10", price: 362.0, change: -2.0 },
      { date: "2026-03-11", price: 365.5, change: 3.5 },
      { date: "2026-03-12", price: 364.0, change: -1.5 },
      { date: "2026-03-13", price: 368.0, change: 4.0 },
      { date: "2026-03-14", price: 367.0, change: -1.0 },
    ]},
];

async function main() {
  const rows = SAMPLE_PRICES.flatMap((g) =>
    g.prices.map((p) => ({
      grain: g.grain,
      contract: g.contract,
      exchange: g.exchange,
      currency: g.currency,
      price_date: p.date,
      settlement_price: p.price,
      change_amount: p.change,
      change_pct: Number(((p.change / (p.price - p.change)) * 100).toFixed(2)),
      source: "manual",
    }))
  );

  const { data, error } = await supabase
    .from("grain_prices")
    .upsert(rows, { onConflict: "grain,contract,price_date" })
    .select("grain, price_date");

  if (error) {
    console.error("Seed error:", error.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ seeded: (data ?? []).length }));
}

main();
```

**Step 3: Add script to package.json**

```json
"seed-prices": "tsx scripts/seed-grain-prices.ts"
```

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/20260314530000_create_grain_prices.sql \
  scripts/seed-grain-prices.ts \
  package.json
git commit -m "feat: add grain_prices table with sample seed data for futures"
```

---

### Task 7: Price Query + Sparkline UI

**Purpose:** Display a 5-day price sparkline on the grain detail page hero section. Small, informational — shows direction without being the focus.

**Files:**
- Create: `lib/queries/grain-prices.ts`
- Create: `components/dashboard/price-sparkline.tsx`
- Modify: `app/(dashboard)/grain/[slug]/page.tsx` (add to hero section)

**Step 1: Create query function**

```typescript
// lib/queries/grain-prices.ts

import { createClient } from "@/lib/supabase/server";

export interface GrainPrice {
  price_date: string;
  settlement_price: number;
  change_amount: number;
  change_pct: number;
  contract: string;
  exchange: string;
  currency: string;
}

/**
 * Get the most recent N days of settlement prices for a grain.
 * Returns latest first.
 */
export async function getRecentPrices(
  grainName: string,
  days = 10
): Promise<GrainPrice[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grain_prices")
    .select("price_date, settlement_price, change_amount, change_pct, contract, exchange, currency")
    .eq("grain", grainName)
    .order("price_date", { ascending: false })
    .limit(days);

  if (error) {
    console.error("getRecentPrices error:", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    price_date: String(r.price_date),
    settlement_price: Number(r.settlement_price),
    change_amount: Number(r.change_amount),
    change_pct: Number(r.change_pct),
    contract: String(r.contract),
    exchange: String(r.exchange),
    currency: String(r.currency),
  }));
}
```

**Step 2: Create sparkline component**

A compact SVG sparkline with latest price + daily change. No Recharts needed for something this simple.

```typescript
// components/dashboard/price-sparkline.tsx
"use client"

import type { GrainPrice } from "@/lib/queries/grain-prices";

interface PriceSparklineProps {
  prices: GrainPrice[];
}

export function PriceSparkline({ prices }: PriceSparklineProps) {
  if (prices.length === 0) return null;

  const latest = prices[0];
  const sorted = [...prices].reverse(); // oldest first for chart

  // SVG sparkline
  const width = 80;
  const height = 24;
  const padding = 2;

  const values = sorted.map((p) => p.settlement_price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const isUp = latest.change_amount >= 0;
  const color = isUp ? "var(--color-prairie)" : "#d91c1c";

  // Format price based on currency
  const formatPrice = (price: number, currency: string) => {
    if (currency === "CAD") return `$${price.toFixed(1)}/t`;
    return `${price.toFixed(1)}¢/bu`; // CBOT uses cents/bushel
  };

  return (
    <div className="inline-flex items-center gap-2">
      <svg width={width} height={height} className="shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="text-xs leading-tight">
        <span className="font-medium text-foreground">
          {formatPrice(latest.settlement_price, latest.currency)}
        </span>
        <span className="ml-1" style={{ color }}>
          {isUp ? "+" : ""}{latest.change_amount.toFixed(1)}
          <span className="text-muted-foreground/60 ml-0.5">
            ({isUp ? "+" : ""}{latest.change_pct.toFixed(1)}%)
          </span>
        </span>
      </div>
    </div>
  );
}
```

**Step 3: Wire into grain detail page hero**

Add price fetch to `Promise.all`:

```typescript
import { getRecentPrices } from "@/lib/queries/grain-prices";
import { PriceSparkline } from "@/components/dashboard/price-sparkline";

// In Promise.all:
safeQuery("Recent prices", () => getRecentPrices(grain.name)),
```

Place the sparkline in the hero section, next to the week badge:

```typescript
{/* In the hero section, after the week/date badges: */}
{!pricesResult.error && (pricesResult.data ?? []).length > 0 && (
  <PriceSparkline prices={pricesResult.data!} />
)}
```

**Step 4: Run build + verify visually**

Run: `npm run build`
Check `/grain/canola` — sparkline should appear in hero.

**Step 5: Commit**

```bash
git add lib/queries/grain-prices.ts \
  components/dashboard/price-sparkline.tsx \
  app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: add price sparkline to grain detail page hero"
```

---

### Task 8: Documentation + STATUS.md

**Files:**
- Modify: `docs/plans/STATUS.md`
- Modify: `components/dashboard/CLAUDE.md`
- Modify: `CLAUDE.md` (if new tables/RPCs need documenting)

**Step 1: Update STATUS.md**

Add Track 26: Wave 4 Advanced Intelligence with changelog entries for:
- Processor self-sufficiency RPC + AI thesis injection
- Processor capacity reference table + crush utilization gauge
- YoY toggle on Pipeline Velocity chart
- grain_prices table + sparkline UI

**Step 2: Update dashboard CLAUDE.md**

Add new components to the table:
- `crush-utilization-gauge.tsx` — Semicircle gauge showing annualized crush vs capacity
- `price-sparkline.tsx` — Compact SVG price trend in hero section

**Step 3: Update root CLAUDE.md**

Add to Intelligence Pipeline section:
- `get_processor_self_sufficiency(p_grain, p_crop_year)` RPC
- `get_pipeline_velocity_avg(p_grain, p_crop_year, p_years_back)` RPC
- `processor_capacity` table
- `grain_prices` table + `v_latest_grain_prices` view

**Step 4: Commit**

```bash
git add docs/plans/STATUS.md components/dashboard/CLAUDE.md CLAUDE.md
git commit -m "docs: document Wave 4 Advanced Intelligence features"
```

---

## Execution Order

Tasks 1-2 (self-sufficiency data + AI injection) can run before Tasks 3-5 (chart + gauge). Task 6-7 (prices) is independent. Task 8 is always last.

Recommended serial order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**

Tasks 1+6 could run in parallel (both are DB migrations with no shared state).
Tasks 3+5 could run in parallel (chart toggle is independent of gauge component).

## Deployment Checklist

After all tasks:
1. `npx supabase db push` — apply all 3 migrations
2. `npx supabase functions deploy analyze-market-data` — deploy updated Edge Function
3. `npm run seed-capacity` — seed processor capacity data
4. `npm run seed-prices` — seed sample price data (dev only)
5. Verify with `npm run build` and visual check of `/grain/canola`
