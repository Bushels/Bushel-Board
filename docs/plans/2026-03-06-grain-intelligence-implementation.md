# Grain Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-generated market intelligence (thesis narratives, insight cards, supply pipeline, YoY comparisons) to every grain detail page, triggered weekly after CGC data import.

**Architecture:** Edge Function pipeline — after Thursday data import, a second Edge Function calls Claude Sonnet per grain, stores structured intelligence in `grain_intelligence` table. Dashboard reads pre-computed intelligence at page load (no AI calls at render time). Prior year data enables YoY comparisons.

**Tech Stack:** Supabase Edge Functions (Deno), Claude Sonnet API, PostgreSQL views, Next.js Server Components, Tailwind CSS.

**Design Doc:** `docs/plans/2026-03-06-grain-intelligence-design.md`

**Existing Reference:** Bushels Energy Canola Week 30 HTML prototype in project root (visual/UX target).

**Agent Team:** Use agents as defined in `.claude/agents/`. Each task notes the responsible agent.

---

## Agent Swarm Assignments

| Agent | Tasks | Role |
|-------|-------|------|
| **db-architect** | 1-4, 7-9 | Data foundation, migrations, Edge Functions |
| **innovation-agent** | 5-6 | Prompt engineering, signal taxonomy |
| **ui-agent** | 10-13 | Component design and implementation |
| **frontend-dev** | 14-16 | Data wiring, page integration |
| **ux-agent** | 17 | Mobile responsiveness, information hierarchy |
| **ultra-agent** | 18 | Quality review of entire implementation |
| **documentation-agent** | 19 | Architecture docs, handover, memory update |
| **auth-engineer** | (Task 3) | RLS policy review |

---

## Phase 1: Data Foundation

### Task 1: Fix CSV Parser for Quoted Fields

**Agent:** db-architect
**Why:** The 2024-2025 CSV has quoted fields (`"2024-2025",1,"11/08/2024",...`) while the 2025-2026 CSV doesn't. The parser must handle both formats before we can backfill prior year data.

**Files:**
- Modify: `lib/cgc/parser.ts`
- Modify: `supabase/functions/import-cgc-weekly/index.ts` (duplicated parser)

**Step 1: Update the shared parser**

In `lib/cgc/parser.ts`, add quote stripping to the parsing loop. Replace the destructuring block (lines 44-55) and the push block to strip quotes from every field:

```typescript
// After: const parts = line.split(",");
// Add this helper at the top of parseCgcCsv:
const strip = (s: string) => s.trim().replace(/^"|"$/g, "");

// Then use strip() on each part:
const cropYear = strip(parts[0]);
const grainWeek = strip(parts[1]);
const dateStr = strip(parts[2]);
const worksheet = strip(parts[3]);
const metric = strip(parts[4]);
const period = strip(parts[5]);
const grain = strip(parts[6]);
const grade = strip(parts[7] || "");
const region = strip(parts[8]);
const ktonnes = strip(parts[9]);
```

And update the push to use the cleaned variables:

```typescript
rows.push({
  crop_year: cropYear,
  grain_week: parseInt(grainWeek, 10),
  week_ending_date: isoDate,  // isoDate computed from dateStr as before
  worksheet,
  metric,
  period,
  grain,
  grade,
  region,
  ktonnes: parseFloat(ktonnes) || 0,
});
```

**Step 2: Apply the same fix to the Edge Function's duplicated parser**

In `supabase/functions/import-cgc-weekly/index.ts`, apply the identical `strip()` helper and field cleaning to the `parseCgcCsv` function (lines 41-87).

**Step 3: Verify the parser still works for 2025-2026 data**

Run:
```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npx tsx scripts/backfill.ts --dry-run
```

Expected: `"rows_parsed": 118378` — same count as before.

**Step 4: Verify the parser works for 2024-2025 data**

Temporarily point the backfill script at the 2024 CSV and do a dry run. Or create a quick test:

```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npx tsx -e "
  const { parseCgcCsv } = require('./lib/cgc/parser');
  const { readFileSync } = require('fs');
  const csv = readFileSync('data/CGC Weekly/2024gsw-shg-en.csv', 'utf-8');
  const rows = parseCgcCsv(csv);
  console.log('Rows:', rows.length);
  console.log('Sample:', JSON.stringify(rows[0], null, 2));
  console.log('Crop year has quotes:', rows[0].crop_year.includes('\"'));
"
```

Expected: Rows count ~219183, crop_year is `2024-2025` (no quotes), grain_week is a number.

**Step 5: Commit**

```bash
git add lib/cgc/parser.ts supabase/functions/import-cgc-weekly/index.ts
git commit -m "fix: handle quoted CSV fields in CGC parser for prior year data"
```

---

### Task 2: Backfill 2024-2025 CGC Data

**Agent:** db-architect
**Why:** Year-over-year comparisons require prior crop year data in `cgc_observations`.

**Files:**
- Create: `scripts/backfill-2024.ts` (or modify backfill.ts to accept a path argument)

**Step 1: Create a backfill script variant that accepts a CSV path**

The simplest approach: modify the existing `scripts/backfill.ts` to accept `--csv <path>` flag. Add after the CLI flags section:

```typescript
const csvArgIndex = args.indexOf("--csv");
const csvOverride = csvArgIndex !== -1 ? args[csvArgIndex + 1] : null;
```

Then in the main function, use:
```typescript
const csvPath = csvOverride
  ? resolve(csvOverride)
  : resolve(process.cwd(), "data/CGC Weekly/gsw-shg-en.csv");
```

**Step 2: Dry run the 2024-2025 backfill**

Run:
```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npx tsx scripts/backfill.ts --csv "data/CGC Weekly/2024gsw-shg-en.csv" --dry-run
```

Expected: `"rows_parsed": 219183` (or similar), no errors, crop_year shows `2024-2025`.

**Step 3: Run the actual backfill**

Run:
```bash
npx tsx scripts/backfill.ts --csv "data/CGC Weekly/2024gsw-shg-en.csv"
```

Expected: All rows inserted, zero skips, ~45-60 seconds.

**Step 4: Verify data in Supabase**

```sql
SELECT crop_year, count(*) as rows, count(DISTINCT grain_week) as weeks
FROM cgc_observations
GROUP BY crop_year
ORDER BY crop_year;
```

Expected: Two rows — `2024-2025` with ~219k rows and `2025-2026` with 118k rows.

**Step 5: Commit**

```bash
git add scripts/backfill.ts
git commit -m "feat: add --csv flag to backfill script, load 2024-2025 prior year data"
```

---

### Task 3: Create grain_intelligence Table + RLS

**Agent:** db-architect (auth-engineer reviews RLS)
**Why:** Stores AI-generated thesis, insights, and pre-computed KPIs per grain per week.

**Files:**
- Create: `supabase/migrations/20260306100000_grain_intelligence.sql`

**Step 1: Write the migration**

```sql
-- AI-generated market intelligence per grain per week
CREATE TABLE grain_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week int NOT NULL,

  -- Thesis narrative
  thesis_title text,
  thesis_body text,

  -- Insight cards (JSONB array)
  -- Each: { "signal": "bullish"|"bearish"|"watch", "title": "...", "body": "..." }
  insights jsonb DEFAULT '[]'::jsonb,

  -- Pre-computed KPI display values
  kpi_data jsonb DEFAULT '{}'::jsonb,

  generated_at timestamptz DEFAULT now(),
  model_used text DEFAULT 'claude-sonnet-4-5-20250514',

  UNIQUE(grain, crop_year, grain_week)
);

-- Performance indexes
CREATE INDEX idx_intelligence_grain_week ON grain_intelligence(grain, crop_year, grain_week);

-- RLS: publicly readable (same as cgc_observations), only service_role writes
ALTER TABLE grain_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Intelligence is publicly readable"
  ON grain_intelligence FOR SELECT USING (true);

CREATE POLICY "Only service role can insert intelligence"
  ON grain_intelligence FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update intelligence"
  ON grain_intelligence FOR UPDATE
  USING (auth.role() = 'service_role');
```

**Step 2: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with project_id `ibgsloyjxdopkvwqcqwh`.

**Step 3: Verify the table exists**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'grain_intelligence' ORDER BY ordinal_position;
```

**Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260306100000_grain_intelligence.sql
git commit -m "feat: add grain_intelligence table for AI-generated market narratives"
```

---

### Task 4: Create YoY Comparison and Supply Pipeline Views

**Agent:** db-architect
**Why:** Dashboard needs side-by-side current vs. prior year metrics, and supply-minus-deliveries pipeline.

**Files:**
- Create: `supabase/migrations/20260306100100_intelligence_views.sql`

**Step 1: Write the views migration**

```sql
-- Year-over-year comparison: current crop year vs. prior crop year
-- Returns latest-week CY totals and YoY % changes per grain
CREATE OR REPLACE VIEW v_grain_yoy_comparison AS
WITH latest AS (
  SELECT crop_year, MAX(grain_week) as max_week
  FROM cgc_observations
  WHERE crop_year = (
    SELECT crop_year FROM cgc_observations ORDER BY crop_year DESC LIMIT 1
  )
  GROUP BY crop_year
),
prior_year AS (
  SELECT DISTINCT crop_year
  FROM cgc_observations
  WHERE crop_year < (SELECT crop_year FROM latest)
  ORDER BY crop_year DESC
  LIMIT 1
),
-- Current year CY totals (deliveries, exports, crush)
current_deliveries AS (
  SELECT grain, SUM(ktonnes) as cy_deliveries
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
current_week_deliveries AS (
  SELECT grain, SUM(ktonnes) as cw_deliveries
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Current Week'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
prior_week_deliveries AS (
  SELECT grain, SUM(ktonnes) as pw_deliveries
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week - 1
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Current Week'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
current_exports AS (
  SELECT grain, SUM(ktonnes) as cy_exports
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Terminal Exports' AND metric = 'Exports' AND period = 'Crop Year'
    AND grade = 'All grades combined'
  GROUP BY grain
),
current_crush AS (
  SELECT grain, SUM(ktonnes) as cy_crush
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Process' AND metric = 'Milled/Mfg Grain' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
current_stocks AS (
  SELECT grain, SUM(ktonnes) as commercial_stocks
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Summary' AND metric = 'Stocks' AND period = 'Current Week'
    AND grade = ''
    AND region IN ('Primary Elevators', 'Process Elevators')
  GROUP BY grain
),
prior_stocks AS (
  SELECT grain, SUM(ktonnes) as prev_stocks
  FROM cgc_observations o, latest l
  WHERE o.crop_year = l.crop_year AND o.grain_week = l.max_week - 1
    AND worksheet = 'Summary' AND metric = 'Stocks' AND period = 'Current Week'
    AND grade = ''
    AND region IN ('Primary Elevators', 'Process Elevators')
  GROUP BY grain
),
-- Prior year same-week totals for YoY
prior_deliveries AS (
  SELECT grain, SUM(ktonnes) as py_deliveries
  FROM cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Primary' AND metric = 'Deliveries' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
),
prior_exports AS (
  SELECT grain, SUM(ktonnes) as py_exports
  FROM cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Terminal Exports' AND metric = 'Exports' AND period = 'Crop Year'
    AND grade = 'All grades combined'
  GROUP BY grain
),
prior_crush AS (
  SELECT grain, SUM(ktonnes) as py_crush
  FROM cgc_observations o, latest l, prior_year py
  WHERE o.crop_year = py.crop_year AND o.grain_week = l.max_week
    AND worksheet = 'Process' AND metric = 'Milled/Mfg Grain' AND period = 'Crop Year'
    AND region IN ('Alberta', 'Saskatchewan', 'Manitoba')
    AND grade = ''
  GROUP BY grain
)
SELECT
  cd.grain,
  (SELECT crop_year FROM latest) as crop_year,
  (SELECT max_week FROM latest) as grain_week,
  -- Current values
  COALESCE(cd.cy_deliveries, 0) as cy_deliveries_kt,
  COALESCE(cwd.cw_deliveries, 0) as cw_deliveries_kt,
  COALESCE(ce.cy_exports, 0) as cy_exports_kt,
  COALESCE(cc.cy_crush, 0) as cy_crush_kt,
  COALESCE(cs.commercial_stocks, 0) as commercial_stocks_kt,
  -- Week-over-week changes
  CASE WHEN COALESCE(pwd.pw_deliveries, 0) > 0
    THEN ROUND(((cwd.cw_deliveries - pwd.pw_deliveries) / pwd.pw_deliveries * 100)::numeric, 1)
    ELSE NULL END as wow_deliveries_pct,
  COALESCE(cs.commercial_stocks, 0) - COALESCE(ps.prev_stocks, 0) as wow_stocks_change_kt,
  -- Year-over-year
  COALESCE(pd.py_deliveries, 0) as py_deliveries_kt,
  COALESCE(pe.py_exports, 0) as py_exports_kt,
  COALESCE(pc.py_crush, 0) as py_crush_kt,
  CASE WHEN COALESCE(pd.py_deliveries, 0) > 0
    THEN ROUND(((cd.cy_deliveries - pd.py_deliveries) / pd.py_deliveries * 100)::numeric, 1)
    ELSE NULL END as yoy_deliveries_pct,
  CASE WHEN COALESCE(pe.py_exports, 0) > 0
    THEN ROUND(((ce.cy_exports - pe.py_exports) / pe.py_exports * 100)::numeric, 1)
    ELSE NULL END as yoy_exports_pct,
  CASE WHEN COALESCE(pc.py_crush, 0) > 0
    THEN ROUND(((cc.cy_crush - pc.py_crush) / pc.py_crush * 100)::numeric, 1)
    ELSE NULL END as yoy_crush_pct
FROM current_deliveries cd
LEFT JOIN current_week_deliveries cwd ON cd.grain = cwd.grain
LEFT JOIN prior_week_deliveries pwd ON cd.grain = pwd.grain
LEFT JOIN current_exports ce ON cd.grain = ce.grain
LEFT JOIN current_crush cc ON cd.grain = cc.grain
LEFT JOIN current_stocks cs ON cd.grain = cs.grain
LEFT JOIN prior_stocks ps ON cd.grain = ps.grain
LEFT JOIN prior_deliveries pd ON cd.grain = pd.grain
LEFT JOIN prior_exports pe ON cd.grain = pe.grain
LEFT JOIN prior_crush pc ON cd.grain = pc.grain;

-- Supply pipeline: AAFC supply minus CY deliveries = estimated on-farm
CREATE OR REPLACE VIEW v_supply_pipeline AS
SELECT
  sd.grain_slug,
  sd.crop_year,
  sd.production_kt,
  sd.carry_in_kt,
  COALESCE(sd.production_kt, 0) + COALESCE(sd.carry_in_kt, 0) + COALESCE(sd.imports_kt, 0) as total_supply_kt,
  sd.exports_kt as projected_exports_kt,
  sd.food_industrial_kt as projected_crush_kt,
  sd.carry_out_kt as projected_carry_out_kt,
  g.name as grain_name
FROM supply_disposition sd
JOIN grains g ON g.slug = sd.grain_slug;
```

**Step 2: Apply the migration via Supabase MCP**

**Step 3: Verify both views return data**

```sql
SELECT grain, cy_deliveries_kt, py_deliveries_kt, yoy_deliveries_pct
FROM v_grain_yoy_comparison
LIMIT 5;

SELECT grain_slug, total_supply_kt, production_kt
FROM v_supply_pipeline
LIMIT 5;
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260306100100_intelligence_views.sql
git commit -m "feat: add v_grain_yoy_comparison and v_supply_pipeline views"
```

---

## Phase 2: Intelligence Pipeline

### Task 5: Design Claude Prompt Template

**Agent:** innovation-agent
**Why:** The quality of AI-generated intelligence depends entirely on prompt engineering. This is not a coding task — it's a content design task.

**Files:**
- Create: `supabase/functions/generate-intelligence/prompt-template.ts`

**Step 1: Create the prompt template module**

```typescript
/**
 * Prompt template for generating grain market intelligence.
 *
 * Designed by: innovation-agent
 * Signal taxonomy:
 *   - bullish: data supports price strength / farmer holding thesis
 *   - bearish: data suggests price weakness / urgency to sell
 *   - watch: noteworthy but directionally ambiguous
 */

export interface GrainContext {
  grain: string;
  crop_year: string;
  grain_week: number;
  // Current year metrics
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  wow_deliveries_pct: number | null;
  cy_exports_kt: number;
  cy_crush_kt: number;
  commercial_stocks_kt: number;
  wow_stocks_change_kt: number;
  // Year-over-year
  py_deliveries_kt: number;
  yoy_deliveries_pct: number | null;
  py_exports_kt: number;
  yoy_exports_pct: number | null;
  py_crush_kt: number;
  yoy_crush_pct: number | null;
  // Supply balance (from AAFC)
  total_supply_kt: number | null;
  production_kt: number | null;
  carry_in_kt: number | null;
  projected_exports_kt: number | null;
  projected_crush_kt: number | null;
  projected_carry_out_kt: number | null;
}

export function buildIntelligencePrompt(ctx: GrainContext): string {
  const deliveredPct = ctx.total_supply_kt && ctx.total_supply_kt > 0
    ? ((ctx.cy_deliveries_kt / ctx.total_supply_kt) * 100).toFixed(1)
    : "N/A";
  const onFarmEst = ctx.total_supply_kt
    ? (ctx.total_supply_kt - ctx.cy_deliveries_kt).toFixed(0)
    : "N/A";

  return `You are a grain market analyst writing intelligence briefings for Canadian prairie farmers (Alberta, Saskatchewan, Manitoba). Your tone is direct, data-driven, and actionable — like a Bloomberg terminal meets a coffee shop conversation with a sharp grain buyer.

## Data for ${ctx.grain} — Week ${ctx.grain_week}, Crop Year ${ctx.crop_year}

### Current Week
- Producer Deliveries: ${ctx.cw_deliveries_kt} Kt (WoW: ${ctx.wow_deliveries_pct !== null ? ctx.wow_deliveries_pct + "%" : "N/A"})
- Commercial Stocks: ${ctx.commercial_stocks_kt} Kt (WoW change: ${ctx.wow_stocks_change_kt > 0 ? "+" : ""}${ctx.wow_stocks_change_kt} Kt)

### Crop Year to Date
- CY Deliveries: ${ctx.cy_deliveries_kt} Kt (YoY: ${ctx.yoy_deliveries_pct !== null ? ctx.yoy_deliveries_pct + "%" : "N/A"}, Prior Year: ${ctx.py_deliveries_kt} Kt)
- CY Exports: ${ctx.cy_exports_kt} Kt (YoY: ${ctx.yoy_exports_pct !== null ? ctx.yoy_exports_pct + "%" : "N/A"}, Prior Year: ${ctx.py_exports_kt} Kt)
- CY Crush/Processing: ${ctx.cy_crush_kt} Kt (YoY: ${ctx.yoy_crush_pct !== null ? ctx.yoy_crush_pct + "%" : "N/A"}, Prior Year: ${ctx.py_crush_kt} Kt)

### Supply Balance (AAFC Estimate)
- Production: ${ctx.production_kt ?? "N/A"} Kt
- Carry-in: ${ctx.carry_in_kt ?? "N/A"} Kt
- Total Supply: ${ctx.total_supply_kt ?? "N/A"} Kt
- Projected Exports: ${ctx.projected_exports_kt ?? "N/A"} Kt
- Projected Crush: ${ctx.projected_crush_kt ?? "N/A"} Kt
- Projected Carry-out: ${ctx.projected_carry_out_kt ?? "N/A"} Kt
- Estimated Delivered: ${deliveredPct}% of total supply
- Estimated On-Farm: ${onFarmEst} Kt

## Your Task

Generate a JSON object with this exact structure:

{
  "thesis_title": "5-8 word market thesis title",
  "thesis_body": "2-3 sentences. Reference specific numbers. Explain the key dynamic at play for farmers deciding whether to hold or deliver. Be direct.",
  "insights": [
    {
      "signal": "bullish",
      "title": "4-8 word insight headline",
      "body": "2-3 sentences with specific data points. Explain WHY this is bullish/bearish/watch."
    }
  ],
  "kpi_data": {
    "cy_deliveries_kt": ${ctx.cy_deliveries_kt},
    "cw_deliveries_kt": ${ctx.cw_deliveries_kt},
    "wow_deliveries_pct": ${ctx.wow_deliveries_pct},
    "cy_exports_kt": ${ctx.cy_exports_kt},
    "yoy_exports_pct": ${ctx.yoy_exports_pct},
    "cy_crush_kt": ${ctx.cy_crush_kt},
    "yoy_crush_pct": ${ctx.yoy_crush_pct},
    "commercial_stocks_kt": ${ctx.commercial_stocks_kt},
    "wow_stocks_change_kt": ${ctx.wow_stocks_change_kt},
    "total_supply_kt": ${ctx.total_supply_kt ?? "null"},
    "delivered_pct": ${deliveredPct === "N/A" ? "null" : deliveredPct},
    "on_farm_estimate_kt": ${onFarmEst === "N/A" ? "null" : onFarmEst},
    "yoy_deliveries_pct": ${ctx.yoy_deliveries_pct}
  }
}

## Rules
- Generate 3-6 insight cards. At least one must be "watch" signal.
- Every insight MUST reference specific numbers from the data.
- If data is insufficient (e.g. N/A values), note the gap rather than speculating.
- Do NOT give financial advice. Frame insights as "data suggests" or "the numbers show".
- For grains with minimal data (low volumes, few regions), generate fewer insights (2-3).
- Return ONLY the JSON object, no markdown fences, no explanation.`;
}
```

**Step 2: Commit**

```bash
git add supabase/functions/generate-intelligence/prompt-template.ts
git commit -m "feat: design Claude prompt template for grain intelligence generation"
```

---

### Task 6: Store Anthropic API Key in Vault

**Agent:** db-architect
**Why:** The `generate-intelligence` Edge Function needs an Anthropic API key. Store it securely in Supabase Vault.

**Step 1: Add the API key as a Supabase secret**

The Edge Function needs the Anthropic API key as an environment variable. Set it using the Supabase CLI:

```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npx supabase secrets set ANTHROPIC_API_KEY=<key> --project-ref ibgsloyjxdopkvwqcqwh
```

(Kyle provides the actual API key.)

**Step 2: Verify the secret is set**

```bash
npx supabase secrets list --project-ref ibgsloyjxdopkvwqcqwh
```

Expected: `ANTHROPIC_API_KEY` appears in the list.

---

### Task 7: Build generate-intelligence Edge Function

**Agent:** db-architect
**Why:** Core pipeline — queries data, calls Claude per grain, stores intelligence.

**Files:**
- Create: `supabase/functions/generate-intelligence/index.ts`

**Step 1: Create the Edge Function**

```typescript
/**
 * Supabase Edge Function: generate-intelligence
 *
 * After weekly CGC data import, generates AI market intelligence for each grain.
 * Calls Claude Sonnet API per grain, stores results in grain_intelligence table.
 *
 * Triggered by import-cgc-weekly on success, or manually via POST.
 *
 * Request body (optional):
 *   { "crop_year": "2025-2026", "grain_week": 29, "grains": ["Canola"] }
 *
 * If grains is omitted, generates for all 16 Canadian grains.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIntelligencePrompt, type GrainContext } from "./prompt-template.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const targetGrains: string[] | undefined = body.grains;

    console.log(`Generating intelligence for week ${grainWeek}, crop year ${cropYear}`);

    // Get the list of Canadian grains
    const { data: grains } = await supabase
      .from("grains")
      .select("name")
      .eq("category", "Canadian")
      .order("display_order");

    const grainNames = targetGrains || (grains ?? []).map((g: { name: string }) => g.name);

    // Get YoY comparison data for all grains
    const { data: yoyData } = await supabase
      .from("v_grain_yoy_comparison")
      .select("*");

    // Get supply pipeline data
    const { data: supplyData } = await supabase
      .from("v_supply_pipeline")
      .select("*");

    const yoyByGrain = new Map((yoyData ?? []).map((r: any) => [r.grain, r]));
    const supplyByGrain = new Map((supplyData ?? []).map((r: any) => [r.grain_name, r]));

    const results: { grain: string; status: string; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const yoy = yoyByGrain.get(grainName);
        const supply = supplyByGrain.get(grainName);

        if (!yoy) {
          results.push({ grain: grainName, status: "skipped", error: "no YoY data" });
          continue;
        }

        const ctx: GrainContext = {
          grain: grainName,
          crop_year: cropYear,
          grain_week: grainWeek,
          cy_deliveries_kt: yoy.cy_deliveries_kt ?? 0,
          cw_deliveries_kt: yoy.cw_deliveries_kt ?? 0,
          wow_deliveries_pct: yoy.wow_deliveries_pct,
          cy_exports_kt: yoy.cy_exports_kt ?? 0,
          cy_crush_kt: yoy.cy_crush_kt ?? 0,
          commercial_stocks_kt: yoy.commercial_stocks_kt ?? 0,
          wow_stocks_change_kt: yoy.wow_stocks_change_kt ?? 0,
          py_deliveries_kt: yoy.py_deliveries_kt ?? 0,
          yoy_deliveries_pct: yoy.yoy_deliveries_pct,
          py_exports_kt: yoy.py_exports_kt ?? 0,
          yoy_exports_pct: yoy.yoy_exports_pct,
          py_crush_kt: yoy.py_crush_kt ?? 0,
          yoy_crush_pct: yoy.yoy_crush_pct,
          total_supply_kt: supply?.total_supply_kt ?? null,
          production_kt: supply?.production_kt ?? null,
          carry_in_kt: supply?.carry_in_kt ?? null,
          projected_exports_kt: supply?.projected_exports_kt ?? null,
          projected_crush_kt: supply?.projected_crush_kt ?? null,
          projected_carry_out_kt: supply?.projected_carry_out_kt ?? null,
        };

        const prompt = buildIntelligencePrompt(ctx);

        // Call Claude Sonnet API
        const response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250514",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          results.push({ grain: grainName, status: "failed", error: `Claude API ${response.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        const aiResponse = await response.json();
        const content = aiResponse.content?.[0]?.text ?? "";

        // Parse the JSON response from Claude
        let intelligence;
        try {
          intelligence = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: "Failed to parse Claude response as JSON" });
          continue;
        }

        // Upsert into grain_intelligence
        const { error: upsertError } = await supabase
          .from("grain_intelligence")
          .upsert({
            grain: grainName,
            crop_year: cropYear,
            grain_week: grainWeek,
            thesis_title: intelligence.thesis_title,
            thesis_body: intelligence.thesis_body,
            insights: intelligence.insights,
            kpi_data: intelligence.kpi_data,
            generated_at: new Date().toISOString(),
            model_used: "claude-sonnet-4-5-20250514",
          }, {
            onConflict: "grain,crop_year,grain_week",
          });

        if (upsertError) {
          results.push({ grain: grainName, status: "failed", error: upsertError.message });
        } else {
          results.push({ grain: grainName, status: "success" });
        }
      } catch (err) {
        results.push({ grain: grainName, status: "failed", error: String(err).slice(0, 200) });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;
    const skipped = results.filter(r => r.status === "skipped").length;

    console.log(`Intelligence generation complete: ${succeeded} ok, ${failed} failed, ${skipped} skipped (${duration}ms)`);

    return new Response(
      JSON.stringify({ results, duration_ms: duration, succeeded, failed, skipped }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-intelligence error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// --- Helpers (same as import-cgc-weekly) ---

function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 7) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
}
```

**Step 2: Deploy the Edge Function**

```bash
cd "c:/Users/kyle/Agriculture/bushel-board-app"
npx supabase functions deploy generate-intelligence --project-ref ibgsloyjxdopkvwqcqwh
```

**Step 3: Commit**

```bash
git add supabase/functions/generate-intelligence/
git commit -m "feat: add generate-intelligence Edge Function for AI market narratives"
```

---

### Task 8: Chain import-cgc-weekly to Trigger Intelligence Generation

**Agent:** db-architect
**Why:** After successful data import, automatically generate intelligence.

**Files:**
- Modify: `supabase/functions/import-cgc-weekly/index.ts` (lines 186-198)

**Step 1: Add chain trigger after successful import**

After the import audit log insert (line 194), before the return statement, add:

```typescript
    // Chain-trigger intelligence generation
    if (skipped === 0) {
      try {
        console.log("Triggering intelligence generation...");
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-intelligence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ crop_year: cropYear, grain_week: targetWeek }),
          }
        );
      } catch (chainErr) {
        console.error("Intelligence chain-trigger failed:", chainErr);
        // Don't fail the import — intelligence generation is best-effort
      }
    }
```

**Step 2: Redeploy import-cgc-weekly**

```bash
npx supabase functions deploy import-cgc-weekly --project-ref ibgsloyjxdopkvwqcqwh
```

**Step 3: Commit**

```bash
git add supabase/functions/import-cgc-weekly/index.ts
git commit -m "feat: chain-trigger intelligence generation after successful CGC import"
```

---

### Task 9: Test Intelligence Pipeline End-to-End

**Agent:** db-architect
**Why:** Verify the full pipeline works before building UI.

**Step 1: Manually trigger intelligence generation for a single grain**

```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/generate-intelligence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"crop_year": "2025-2026", "grain_week": 29, "grains": ["Canola"]}'
```

Expected: 200 response with `{"results": [{"grain": "Canola", "status": "success"}], ...}`

**Step 2: Verify data in grain_intelligence table**

```sql
SELECT grain, thesis_title, thesis_body, insights, generated_at
FROM grain_intelligence
WHERE grain = 'Canola' AND crop_year = '2025-2026' AND grain_week = 29;
```

Expected: One row with populated thesis_title, thesis_body, insights array, kpi_data.

**Step 3: Generate for all grains**

```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/generate-intelligence" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"crop_year": "2025-2026", "grain_week": 29}'
```

Expected: 16 results, most with status "success". Some low-volume grains may have limited data.

**Step 4: Verify row count**

```sql
SELECT count(*) FROM grain_intelligence WHERE grain_week = 29;
```

Expected: ~16 rows (one per Canadian grain).

---

## Phase 3: UI Components

### Task 10: Build Thesis Banner Component

**Agent:** ui-agent
**Reference:** Bushels Energy HTML — `.thesis-banner` section

**Files:**
- Create: `components/dashboard/thesis-banner.tsx`

**Step 1: Create the component**

```tsx
interface ThesisBannerProps {
  title: string;
  body: string;
}

export function ThesisBanner({ title, body }: ThesisBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-canola/20 bg-gradient-to-r from-canola/5 to-transparent p-5 pl-7">
      {/* Gold left accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-canola" />

      <p className="text-[0.65rem] font-semibold uppercase tracking-[3px] text-canola mb-1.5">
        Active Thesis
      </p>
      <h3 className="font-display text-lg font-semibold text-foreground mb-1">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/thesis-banner.tsx
git commit -m "feat: add thesis banner component for grain intelligence"
```

---

### Task 11: Build Enhanced KPI Cards Component

**Agent:** ui-agent
**Reference:** Bushels Energy HTML — `.kpi-grid` section

**Files:**
- Create: `components/dashboard/intelligence-kpis.tsx`

**Step 1: Create the component**

```tsx
interface KpiData {
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  wow_deliveries_pct: number | null;
  cy_exports_kt: number;
  yoy_exports_pct: number | null;
  cy_crush_kt: number;
  yoy_crush_pct: number | null;
  commercial_stocks_kt: number;
  wow_stocks_change_kt: number;
}

export function IntelligenceKpis({ data }: { data: KpiData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Producer Deliveries"
        value={`${data.cw_deliveries_kt.toFixed(1)}`}
        unit="Kt this week"
        change={data.wow_deliveries_pct}
        changeLabel="WoW"
        subtext={`CY: ${formatKt(data.cy_deliveries_kt)}`}
        highlight
      />
      <KpiCard
        label="Commercial Stocks"
        value={`${formatKt(data.commercial_stocks_kt)}`}
        unit="Kt total"
        changeKt={data.wow_stocks_change_kt}
        changeLabel="from last week"
      />
      <KpiCard
        label="CY Exports"
        value={`${formatKt(data.cy_exports_kt)}`}
        unit="Kt to date"
        change={data.yoy_exports_pct}
        changeLabel="YoY"
      />
      <KpiCard
        label="CY Crush"
        value={`${formatKt(data.cy_crush_kt)}`}
        unit="Kt to date"
        change={data.yoy_crush_pct}
        changeLabel="YoY"
      />
    </div>
  );
}

function KpiCard({
  label, value, unit, change, changeKt, changeLabel, subtext, highlight,
}: {
  label: string;
  value: string;
  unit: string;
  change?: number | null;
  changeKt?: number;
  changeLabel?: string;
  subtext?: string;
  highlight?: boolean;
}) {
  const changeColor = change != null
    ? change > 0 ? "text-prairie font-semibold" : change < 0 ? "text-error font-semibold" : ""
    : changeKt != null
      ? changeKt > 0 ? "text-prairie font-semibold" : changeKt < 0 ? "text-error font-semibold" : ""
      : "";

  const changeText = change != null
    ? `${change > 0 ? "+" : ""}${change}% ${changeLabel}`
    : changeKt != null
      ? `${changeKt > 0 ? "+" : ""}${changeKt.toFixed(1)} Kt ${changeLabel}`
      : null;

  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-canola/30 bg-canola/5" : "border-border bg-card"}`}>
      <p className="text-[0.6rem] font-medium uppercase tracking-[2px] text-muted-foreground mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${highlight ? "text-canola" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {unit}
        {changeText && (
          <> · <span className={changeColor}>{changeText}</span></>
        )}
      </p>
      {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  );
}

function formatKt(kt: number): string {
  if (kt >= 1000) return `${(kt / 1000).toFixed(1)}M`;
  return kt.toFixed(1);
}
```

**Step 2: Commit**

```bash
git add components/dashboard/intelligence-kpis.tsx
git commit -m "feat: add enhanced KPI cards component with YoY and WoW context"
```

---

### Task 12: Build Supply Pipeline Waterfall Component

**Agent:** ui-agent
**Reference:** Bushels Energy HTML — `.waterfall-container` section

**Files:**
- Create: `components/dashboard/supply-pipeline.tsx`

**Step 1: Create the component**

A custom horizontal bar visualization (no Recharts) showing:
- Carry-in (orange) + Production (green) = Total Supply (gold)
- Delivered to date (blue) vs. Remaining on-farm (red)

```tsx
interface SupplyPipelineProps {
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
  cy_deliveries_kt: number;
  grain: string;
}

export function SupplyPipeline({
  carry_in_kt, production_kt, total_supply_kt, cy_deliveries_kt, grain,
}: SupplyPipelineProps) {
  const onFarm = total_supply_kt - cy_deliveries_kt;
  const deliveredPct = ((cy_deliveries_kt / total_supply_kt) * 100).toFixed(1);
  const onFarmPct = ((onFarm / total_supply_kt) * 100).toFixed(1);
  const max = total_supply_kt * 1.05; // 5% padding

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-display text-base font-semibold">
          {grain} Supply Pipeline
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          AAFC balance sheet: {formatMmt(production_kt)} production, {formatMmt(carry_in_kt)} carry-in, {formatMmt(total_supply_kt)} total supply
        </p>
      </div>

      <div className="space-y-2.5">
        <WaterfallRow label="Carry-in" value={carry_in_kt} max={max} color="bg-orange-400" />
        <WaterfallRow label="Production" value={production_kt} max={max} color="bg-prairie" />

        <div className="border-t border-dashed border-canola/25 my-1" />

        <WaterfallRow label="= Total Supply" value={total_supply_kt} max={max} color="bg-canola/60 border border-canola" bold />

        <div className="border-t border-dashed border-border my-1" />

        <WaterfallRow label="Delivered to Date" value={cy_deliveries_kt} max={max} color="bg-blue-400" />
        <WaterfallRow
          label="Remaining On-Farm"
          value={onFarm}
          max={max}
          color="bg-red-400/60 border border-red-400"
          offset={cy_deliveries_kt / max}
        />
      </div>

      {/* Summary callouts */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Callout value={`${deliveredPct}%`} label="of supply delivered" color="text-blue-400 border-blue-400/20 bg-blue-400/5" />
        <Callout value={`${onFarmPct}%`} label="still on-farm" color="text-red-400 border-red-400/20 bg-red-400/5" />
      </div>
    </div>
  );
}

function WaterfallRow({
  label, value, max, color, bold, offset,
}: {
  label: string; value: number; max: number; color: string; bold?: boolean; offset?: number;
}) {
  const widthPct = (value / max) * 100;
  const leftPct = offset ? offset * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className={`w-36 text-right text-xs shrink-0 ${bold ? "font-semibold text-canola" : "text-muted-foreground"}`}>
        {label}
      </span>
      <div className="flex-1 h-7 relative rounded bg-muted/30">
        <div
          className={`absolute top-0 h-full rounded ${color} transition-all duration-1000`}
          style={{ width: `${widthPct}%`, left: `${leftPct}%` }}
        />
      </div>
      <span className={`min-w-[70px] text-xs font-semibold ${bold ? "text-canola text-sm" : "text-foreground"}`}>
        {formatMmt(value)}
      </span>
    </div>
  );
}

function Callout({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className={`px-3 py-2 rounded-lg border ${color}`}>
      <p className="font-display text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[0.6rem] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function formatMmt(kt: number): string {
  if (kt >= 1000) return `${(kt / 1000).toFixed(1)} MMT`;
  return `${kt.toFixed(0)} Kt`;
}
```

**Step 2: Commit**

```bash
git add components/dashboard/supply-pipeline.tsx
git commit -m "feat: add supply pipeline waterfall component"
```

---

### Task 13: Build Insight Cards Component

**Agent:** ui-agent
**Reference:** Bushels Energy HTML — `.insight-grid` section

**Files:**
- Create: `components/dashboard/insight-cards.tsx`

**Step 1: Create the component**

```tsx
interface Insight {
  signal: "bullish" | "bearish" | "watch";
  title: string;
  body: string;
}

const signalConfig = {
  bullish: { icon: "🟢", border: "border-t-prairie", bg: "bg-prairie/5" },
  bearish: { icon: "🔴", border: "border-t-error", bg: "bg-error/5" },
  watch:   { icon: "🟡", border: "border-t-canola", bg: "bg-canola/5" },
};

export function InsightCards({ insights }: { insights: Insight[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {insights.map((insight, i) => {
        const cfg = signalConfig[insight.signal] ?? signalConfig.watch;
        return (
          <div
            key={i}
            className={`rounded-lg border border-border ${cfg.border} border-t-2 ${cfg.bg} p-4 space-y-2`}
          >
            <p className="text-lg">{cfg.icon}</p>
            <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/insight-cards.tsx
git commit -m "feat: add insight cards component with bullish/bearish/watch signals"
```

---

## Phase 4: Integration

### Task 14: Add Intelligence Query Layer

**Agent:** frontend-dev
**Why:** Server components need a clean data fetching function for grain_intelligence.

**Files:**
- Create: `lib/queries/intelligence.ts`

**Step 1: Create the query module**

```typescript
import { createClient } from "@/lib/supabase/server";

export interface GrainIntelligence {
  grain: string;
  crop_year: string;
  grain_week: number;
  thesis_title: string | null;
  thesis_body: string | null;
  insights: Array<{ signal: "bullish" | "bearish" | "watch"; title: string; body: string }>;
  kpi_data: Record<string, number | null>;
  generated_at: string;
}

/**
 * Get the latest intelligence for a grain (most recent grain_week).
 */
export async function getGrainIntelligence(
  grainName: string
): Promise<GrainIntelligence | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grain_intelligence")
    .select("*")
    .eq("grain", grainName)
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as GrainIntelligence;
}

/**
 * Get supply pipeline data for a grain.
 */
export async function getSupplyPipeline(
  grainSlug: string
): Promise<{
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_supply_pipeline")
    .select("carry_in_kt, production_kt, total_supply_kt")
    .eq("grain_slug", grainSlug)
    .single();

  return data;
}
```

**Step 2: Commit**

```bash
git add lib/queries/intelligence.ts
git commit -m "feat: add intelligence query layer for grain_intelligence table"
```

---

### Task 15: Wire Intelligence into Grain Detail Page

**Agent:** frontend-dev
**Why:** The grain detail page needs to display thesis, KPIs, pipeline, and insights.

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Add imports and data fetching**

Add to the top imports:
```typescript
import { getGrainIntelligence, getSupplyPipeline } from "@/lib/queries/intelligence";
import { ThesisBanner } from "@/components/dashboard/thesis-banner";
import { IntelligenceKpis } from "@/components/dashboard/intelligence-kpis";
import { SupplyPipeline } from "@/components/dashboard/supply-pipeline";
import { InsightCards } from "@/components/dashboard/insight-cards";
```

Add to the Promise.all on line 64 (after storageData):
```typescript
const [deliveries, provincial, distribution, weeklyData, storageData, intelligence, supplyPipeline] = await Promise.all([
  getDeliveryTimeSeries(grain.name),
  getProvincialDeliveries(grain.name),
  getShipmentDistribution(grain.name),
  getCumulativeTimeSeries(grain.name),
  getStorageBreakdown(grain.name),
  getGrainIntelligence(grain.name),
  getSupplyPipeline(grain.slug),
]);
```

**Step 2: Add intelligence sections to the JSX**

After the header section (line 99) and before the KPI grid, insert:

```tsx
      {/* AI Intelligence Section */}
      {intelligence?.thesis_title && (
        <ThesisBanner
          title={intelligence.thesis_title}
          body={intelligence.thesis_body ?? ""}
        />
      )}

      {intelligence?.kpi_data && (
        <IntelligenceKpis data={intelligence.kpi_data as any} />
      )}

      {supplyPipeline && intelligence?.kpi_data?.cy_deliveries_kt != null && (
        <SupplyPipeline
          carry_in_kt={supplyPipeline.carry_in_kt}
          production_kt={supplyPipeline.production_kt}
          total_supply_kt={supplyPipeline.total_supply_kt}
          cy_deliveries_kt={intelligence.kpi_data.cy_deliveries_kt as number}
          grain={grain.name}
        />
      )}

      {intelligence?.insights && intelligence.insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-display font-semibold">Market Signals</h2>
          <InsightCards insights={intelligence.insights} />
        </div>
      )}
```

**Step 3: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: integrate intelligence components into grain detail page"
```

---

### Task 16: Add Fallback UI When Intelligence Unavailable

**Agent:** frontend-dev
**Why:** Intelligence may not be generated yet (first deploy, new grain, API failure).

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Add a fallback banner**

Where the intelligence section starts, wrap with a fallback:

```tsx
      {!intelligence && (
        <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Market intelligence is being generated. Check back after the next Thursday data update.
          </p>
        </div>
      )}
```

**Step 2: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: add fallback UI when grain intelligence not yet available"
```

---

### Task 17: Mobile Responsiveness Pass

**Agent:** ux-agent
**Why:** Ensure all new components work on mobile screens.

**Files:**
- Review: All 4 new components for responsive breakpoints

**Step 1: Review and fix**

- KPI cards: `grid-cols-2 lg:grid-cols-4` — 2 columns on mobile, 4 on desktop ✓
- Insight cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` ✓
- Supply pipeline: Waterfall rows need `w-24 sm:w-36` on labels for mobile
- Thesis banner: Should collapse padding on mobile

Apply any needed Tailwind responsive fixes.

**Step 2: Commit**

```bash
git add components/dashboard/
git commit -m "fix: mobile responsiveness for intelligence components"
```

---

## Phase 5: Quality & Documentation

### Task 18: Ultra-Agent Quality Review

**Agent:** ultra-agent
**Why:** Final quality gate before shipping. Reviews all new code.

**Checklist:**
- [ ] `grain_intelligence` table schema is correct (types, constraints, RLS)
- [ ] `v_grain_yoy_comparison` view returns accurate YoY data
- [ ] `v_supply_pipeline` view joins correctly with `supply_disposition`
- [ ] Edge Function prompt produces quality output for at least 3 grains
- [ ] Components match Bushels Energy visual quality target
- [ ] No TypeScript errors (`npm run build` passes)
- [ ] No unused imports or dead code
- [ ] Dark mode works for all new components
- [ ] Mobile layout is clean at 375px viewport

---

### Task 19: Documentation Update

**Agent:** documentation-agent
**Why:** Capture all decisions, architecture, and operational details.

**Files:**
- Update: `docs/architecture/data-pipeline.md` — add intelligence pipeline section
- Create: `docs/handovers/2026-03-06-intelligence-sprint.md`
- Update: `CLAUDE.md` — add intelligence pipeline commands and monitoring
- Update: Memory file — add intelligence pipeline status

**Key items to document:**
- Intelligence generation pipeline (trigger chain, prompt template, cost)
- `grain_intelligence` table schema
- YoY comparison view logic
- How to manually regenerate intelligence
- How to update the prompt template
- Monitoring queries for intelligence generation
