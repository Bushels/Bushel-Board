# CFTC COT Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate CFTC Commitments of Traders data into Bushel Board's intelligence pipeline — new Supabase table, RPC, Edge Function for automated Friday imports, skill for manual imports, COT context in both Step 3.5 Flash and Grok prompts, and Grok model upgrade to 4.20.

**Architecture:** New `cftc_cot_positions` table stores weekly COT data per commodity. A Vercel cron triggers a Supabase Edge Function every Friday at 1:30pm MST to fetch and parse the CFTC HTML page. Both `analyze-market-data` (Step 3.5 Flash) and `generate-intelligence` (Grok) query COT data and inject it into their prompts. A Claude Code skill provides manual import and querying.

**Tech Stack:** Supabase (PostgreSQL, Edge Functions/Deno), Next.js (Vercel cron route), TypeScript, HTML parsing (regex on `<pre>` blocks)

**Design Doc:** `docs/plans/2026-03-13-cftc-cot-integration-design.md`

---

## Task 1: Create `cftc_cot_positions` table migration

**Files:**
- Create: `supabase/migrations/20260313200000_create_cftc_cot_positions.sql`

**Step 1: Write the migration SQL**

```sql
-- CFTC Commitments of Traders — Disaggregated Options+Futures Combined
-- Source: https://www.cftc.gov/dea/options/ag_lof.htm
-- Updated every Friday ~1:30pm MST (data as of prior Tuesday)

CREATE TABLE cftc_cot_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  commodity text NOT NULL,
  contract_market_name text NOT NULL,
  exchange text NOT NULL,

  -- Open Interest
  open_interest numeric NOT NULL,
  change_open_interest numeric,

  -- Producer/Merchant/Processor/User (Commercial hedgers)
  prod_merc_long numeric NOT NULL,
  prod_merc_short numeric NOT NULL,

  -- Swap Dealers
  swap_long numeric NOT NULL,
  swap_short numeric NOT NULL,
  swap_spread numeric,

  -- Managed Money (Speculators — hedge funds, CTAs)
  managed_money_long numeric NOT NULL,
  managed_money_short numeric NOT NULL,
  managed_money_spread numeric,

  -- Other Reportables
  other_long numeric NOT NULL,
  other_short numeric NOT NULL,
  other_spread numeric,

  -- Non-Reportable (small traders)
  nonreportable_long numeric NOT NULL,
  nonreportable_short numeric NOT NULL,

  -- WoW changes (key categories)
  change_prod_merc_long numeric,
  change_prod_merc_short numeric,
  change_swap_long numeric,
  change_swap_short numeric,
  change_managed_money_long numeric,
  change_managed_money_short numeric,
  change_other_long numeric,
  change_other_short numeric,
  change_nonreportable_long numeric,
  change_nonreportable_short numeric,

  -- Percent of Open Interest
  pct_prod_merc_long numeric,
  pct_prod_merc_short numeric,
  pct_swap_long numeric,
  pct_swap_short numeric,
  pct_managed_money_long numeric,
  pct_managed_money_short numeric,
  pct_other_long numeric,
  pct_other_short numeric,
  pct_nonreportable_long numeric,
  pct_nonreportable_short numeric,

  -- Number of traders
  traders_prod_merc_long smallint,
  traders_prod_merc_short smallint,
  traders_swap_long smallint,
  traders_swap_short smallint,
  traders_swap_spread smallint,
  traders_managed_money_long smallint,
  traders_managed_money_short smallint,
  traders_managed_money_spread smallint,
  traders_other_long smallint,
  traders_other_short smallint,
  traders_other_spread smallint,
  traders_total smallint,

  -- Concentration (top 4/8 traders)
  concentration_gross_4_long numeric,
  concentration_gross_4_short numeric,
  concentration_gross_8_long numeric,
  concentration_gross_8_short numeric,
  concentration_net_4_long numeric,
  concentration_net_4_short numeric,
  concentration_net_8_long numeric,
  concentration_net_8_short numeric,

  -- Bushel Board mapping
  cgc_grain text,
  mapping_type text DEFAULT 'primary',
  crop_year text,
  grain_week smallint,

  -- Metadata
  imported_at timestamptz DEFAULT now(),
  import_source text DEFAULT 'manual',

  UNIQUE(report_date, commodity)
);

-- Index for grain lookups in intelligence pipeline
CREATE INDEX idx_cftc_cot_cgc_grain ON cftc_cot_positions(cgc_grain, report_date DESC);
CREATE INDEX idx_cftc_cot_crop_year ON cftc_cot_positions(crop_year, grain_week DESC);

-- RLS: authenticated users can read
ALTER TABLE cftc_cot_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read COT data"
  ON cftc_cot_positions FOR SELECT
  TO authenticated
  USING (true);

-- Service role can insert (for Edge Function and manual imports)
CREATE POLICY "Service role can insert COT data"
  ON cftc_cot_positions FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE cftc_cot_positions IS 'CFTC Disaggregated COT data — weekly trader positioning for grain futures. Source: cftc.gov/dea/options/ag_lof.htm';
```

**Step 2: Apply the migration**

Use Supabase MCP `apply_migration` with project_id `ibgsloyjxdopkvwqcqwh`.

**Step 3: Verify**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'cftc_cot_positions' ORDER BY ordinal_position;
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260313200000_create_cftc_cot_positions.sql
git commit -m "feat: create cftc_cot_positions table for CFTC COT trader positioning data"
```

---

## Task 2: Create `get_cot_positioning` RPC function

**Files:**
- Create: `supabase/migrations/20260313200100_create_get_cot_positioning_rpc.sql`

**Step 1: Write the RPC migration**

```sql
CREATE OR REPLACE FUNCTION get_cot_positioning(
  p_grain text,
  p_crop_year text DEFAULT NULL,
  p_weeks_back int DEFAULT 4
)
RETURNS TABLE (
  report_date date,
  commodity text,
  exchange text,
  mapping_type text,
  open_interest numeric,
  managed_money_net numeric,
  managed_money_net_pct numeric,
  wow_net_change numeric,
  commercial_net numeric,
  commercial_net_pct numeric,
  spec_commercial_divergence boolean,
  grain_week smallint
) LANGUAGE sql STABLE AS $$
  SELECT
    c.report_date,
    c.commodity,
    c.exchange,
    c.mapping_type,
    c.open_interest,
    (c.managed_money_long - c.managed_money_short) AS managed_money_net,
    ROUND(((c.managed_money_long - c.managed_money_short)
      / NULLIF(c.open_interest, 0) * 100)::numeric, 1) AS managed_money_net_pct,
    COALESCE(c.change_managed_money_long, 0)
      - COALESCE(c.change_managed_money_short, 0) AS wow_net_change,
    (c.prod_merc_long - c.prod_merc_short) AS commercial_net,
    ROUND(((c.prod_merc_long - c.prod_merc_short)
      / NULLIF(c.open_interest, 0) * 100)::numeric, 1) AS commercial_net_pct,
    CASE
      WHEN (c.managed_money_long - c.managed_money_short) > 0
        AND (c.prod_merc_long - c.prod_merc_short) < 0 THEN true
      WHEN (c.managed_money_long - c.managed_money_short) < 0
        AND (c.prod_merc_long - c.prod_merc_short) > 0 THEN true
      ELSE false
    END AS spec_commercial_divergence,
    c.grain_week
  FROM cftc_cot_positions c
  WHERE c.cgc_grain = p_grain
    AND (p_crop_year IS NULL OR c.crop_year = p_crop_year)
    AND c.mapping_type = 'primary'
  ORDER BY c.report_date DESC
  LIMIT p_weeks_back;
$$;

COMMENT ON FUNCTION get_cot_positioning IS 'Returns managed money and commercial net positioning for a CGC grain from CFTC COT data, with spec/commercial divergence flag';
```

**Step 2: Apply the migration**

Use Supabase MCP `apply_migration`.

**Step 3: Verify the RPC exists**

```sql
SELECT proname FROM pg_proc WHERE proname = 'get_cot_positioning';
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260313200100_create_get_cot_positioning_rpc.sql
git commit -m "feat: add get_cot_positioning RPC for managed money and commercial net positions"
```

---

## Task 3: Create CFTC COT grain mapping and parser shared module

**Files:**
- Create: `supabase/functions/_shared/cftc-cot-parser.ts`

**Step 1: Write the shared parser**

This module will be used by both the Edge Function (automated) and referenced by the skill documentation (manual).

The parser needs to:
1. Define the CFTC → CGC grain mapping
2. Parse the CFTC HTML `<pre>` formatted text into structured data
3. Compute `crop_year` and `grain_week` from the report date
4. Return an array of row objects ready for Supabase upsert

**Key mapping:**
```typescript
export const CFTC_GRAIN_MAP: Record<string, { cgc_grain: string; mapping_type: "primary" | "secondary" }> = {
  "WHEAT-SRW": { cgc_grain: "Wheat", mapping_type: "primary" },
  "WHEAT-HRW": { cgc_grain: "Wheat", mapping_type: "primary" },
  "WHEAT-HRSpring": { cgc_grain: "Wheat", mapping_type: "primary" },
  "CANOLA": { cgc_grain: "Canola", mapping_type: "primary" },
  "SOYBEANS": { cgc_grain: "Soybeans", mapping_type: "primary" },
  "SOYBEAN OIL": { cgc_grain: "Canola", mapping_type: "secondary" },
  "SOYBEAN MEAL": { cgc_grain: "Canola", mapping_type: "secondary" },
  "CORN": { cgc_grain: "Corn", mapping_type: "primary" },
  "OATS": { cgc_grain: "Oats", mapping_type: "primary" },
};
```

The HTML parsing logic:
- The CFTC page uses `<pre>` tags with fixed-width preformatted text
- Each commodity block starts with a header line like: `WHEAT-SRW - CHICAGO BOARD OF TRADE`
- Data rows follow in fixed-width columns
- Must extract: report date (from page header), position data per category

**Step 2: Write the crop year / grain week mapper**

```typescript
export function reportDateToCropYear(reportDate: Date): string {
  const year = reportDate.getFullYear();
  const month = reportDate.getMonth(); // 0-indexed
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function reportDateToGrainWeek(reportDate: Date): number {
  const year = reportDate.getFullYear();
  const month = reportDate.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  const cropYearStart = new Date(startYear, 7, 1); // Aug 1
  return Math.max(1, Math.floor(
    (reportDate.getTime() - cropYearStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  ) + 1);
}
```

**Step 3: Commit**

```bash
git add supabase/functions/_shared/cftc-cot-parser.ts
git commit -m "feat: add CFTC COT HTML parser with grain mapping and crop year conversion"
```

---

## Task 4: Create `import-cftc-cot` Edge Function

**Files:**
- Create: `supabase/functions/import-cftc-cot/index.ts`

**Step 1: Write the Edge Function**

The function should:
1. Use `requireInternalRequest()` from `_shared/internal-auth.ts` for auth
2. Fetch `https://www.cftc.gov/dea/options/ag_lof.htm`
3. Parse using the shared parser from Task 3
4. Upsert rows into `cftc_cot_positions` (conflict on `report_date, commodity`)
5. Log import result
6. Return summary JSON

Pattern: Follow `analyze-market-data/index.ts` structure — `Deno.serve()`, `createClient()`, internal auth, structured response.

**Step 2: Deploy the Edge Function**

Use Supabase MCP `deploy_edge_function` with `verify_jwt: false` (internal-secret auth, same as other pipeline functions).

**Step 3: Test manually**

```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/import-cftc-cot" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{}'
```

**Step 4: Verify data landed**

```sql
SELECT commodity, cgc_grain, report_date, open_interest,
       (managed_money_long - managed_money_short) AS mm_net
FROM cftc_cot_positions ORDER BY imported_at DESC LIMIT 10;
```

**Step 5: Commit**

```bash
git add supabase/functions/import-cftc-cot/index.ts
git commit -m "feat: add import-cftc-cot Edge Function for automated CFTC COT import"
```

---

## Task 5: Create Vercel cron route for Friday automation

**Files:**
- Create: `app/api/cron/import-cftc-cot/route.ts`
- Modify: `vercel.json` — add cron entry

**Step 1: Write the Vercel cron route**

Pattern: Follow `app/api/cron/import-cgc/route.ts` — verify `CRON_SECRET`, call the Edge Function via internal secret, return result. Unlike the CGC route (which does all parsing in Vercel), this route simply proxies to the Supabase Edge Function since CFTC doesn't block Supabase IPs.

```typescript
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  if (!supabaseUrl || !internalSecret) {
    return Response.json({ error: "Missing env vars" }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/import-cftc-cot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bushel-internal-secret": internalSecret,
    },
    body: JSON.stringify({}),
  });

  const result = await response.json();

  return Response.json({
    source: "vercel-cron",
    edge_function_status: response.status,
    ...result,
  }, { status: response.ok ? 200 : 502 });
}
```

**Step 2: Add cron to vercel.json**

Add to the `crons` array:
```json
{
  "path": "/api/cron/import-cftc-cot",
  "schedule": "30 20 * * 5"
}
```

This is `30 20 * * 5` = 8:30pm UTC on Fridays = 1:30pm MST.

**Step 3: Commit**

```bash
git add app/api/cron/import-cftc-cot/route.ts vercel.json
git commit -m "feat: add Vercel cron for Friday CFTC COT import at 1:30pm MST"
```

---

## Task 6: Add COT positioning analysis to `commodity-knowledge.ts`

**Files:**
- Modify: `supabase/functions/_shared/commodity-knowledge.ts`

**Step 1: Add COT section**

Append to the end of the `COMMODITY_KNOWLEDGE` template string (before the closing backtick), after the "Logistics & Transport Awareness" section:

```
### CFTC COT Positioning Analysis

**Data Source:** CFTC Disaggregated Commitments of Traders (Options + Futures Combined), released Friday for prior Tuesday's positions. 3-day lag means Friday COT reflects Tuesday state — positions may have shifted.

**Key Categories:**
- Managed Money (hedge funds, CTAs): "weak hands" — amplify moves, exit quickly on adverse news
- Producer/Merchant (commercials): "smart money" — physical hedgers, their positioning reflects fundamental view
- Swap Dealers: financial intermediaries, less directionally informative

**Positioning Signals:**
- Managed Money net-long + rising: bullish spec pressure, prices elevated, but crowded-trade risk if fundamentals weaken
- Managed Money net-short + falling: bearish momentum, but squeeze potential if positive catalyst emerges
- Commercial net-short increasing: producers/elevators locking in prices = they expect lower prices ahead (bearish fundamental signal)
- Commercial net-long increasing: end-users securing supply = they expect higher prices ahead (bullish fundamental signal)

**Spec/Commercial Divergence (strongest timing signal):**
- Specs bullish + commercials bearish = prices likely elevated above fundamental value. Caution for farmers holding — consider incremental sales.
- Specs bearish + commercials bullish = prices likely depressed below fundamental value. Opportunity for patient farmers — consider holding or buying puts.

**Extreme Positioning:**
- When managed money net position reaches multi-year high/low, mean reversion risk increases within 2-4 weeks.
- Extreme net-long by specs + declining open interest = long liquidation risk.
- Extreme net-short by specs + rising open interest = new short selling (bearish conviction).

**Grain-Specific COT Notes:**
- Wheat: Combine SRW (CBOT) + HRW (CBOT) + HRSpring (MIAX) for aggregate view. HRSpring most relevant to CWRS pricing.
- Canola: ICE Canola is the direct hedge. Soybean oil + meal positioning provides secondary crush demand signal.
- Oats: Very thin open interest (~10-20K contracts). COT less reliable — flag "low liquidity" in analysis.
- Soybeans: Most liquid ag market. Spec positioning highly reliable. Watch soy/corn spread for acreage signals.
- Corn: Second most liquid. Monitor alongside ethanol mandate policy signals.

**Integration Rule:** COT informs TIMING, not DIRECTION. Fundamentals (CGC flow, AAFC balance) determine direction; COT tells you whether the market is overcrowded in that direction. Never use COT as standalone directional signal.
```

**Step 2: Update the comment at the top of the file**

Change `~4K tokens` to `~5.5K tokens` (or whatever the updated size is).

**Step 3: Commit**

```bash
git add supabase/functions/_shared/commodity-knowledge.ts
git commit -m "feat: add CFTC COT positioning analysis framework to commodity knowledge"
```

---

## Task 7: Inject COT data into `analyze-market-data` (Step 3.5 Flash)

**Files:**
- Modify: `supabase/functions/analyze-market-data/index.ts`

**Step 1: Add COT data query to batch data section**

After the logistics snapshot query (line ~105), add:

```typescript
// 6. CFTC COT positioning data (latest week for all grains)
const { data: cotData } = await supabase
  .rpc("get_cot_positioning", {
    p_grain: null,  // Will filter per-grain in the loop
    p_crop_year: cropYear,
    p_weeks_back: 4,
  });
```

Wait — `get_cot_positioning` takes a single grain. We need to query per-grain inside the loop, or create a bulk version. Since we already batch 1 grain at a time, query inside the per-grain loop:

Inside the `for (const grainName of grainNames)` loop, after the historical average queries, add:

```typescript
// CFTC COT positioning (last 4 weeks)
const { data: cotPositioning } = await supabase.rpc("get_cot_positioning", {
  p_grain: grainName,
  p_crop_year: cropYear,
  p_weeks_back: 4,
});
```

**Step 2: Add COT section to `buildDataPrompt`**

Add a new parameter `cotData` to `buildDataPrompt()`:

```typescript
function buildDataPrompt(
  grain: string,
  cropYear: string,
  grainWeek: number,
  yoy: Record<string, unknown>,
  supply: Record<string, unknown> | undefined,
  sentiment: { ... } | undefined,
  delivery: Record<string, unknown> | undefined,
  deliveriesHist: Record<string, unknown> | null,
  exportsHist: Record<string, unknown> | null,
  stocksHist: Record<string, unknown> | null,
  knowledgeContext: string | null,
  logisticsSnapshot: Record<string, unknown> | null = null,
  cotData: Array<Record<string, unknown>> | null = null,  // NEW
): string {
```

Then add to the prompt template, after the Logistics section and before Retrieved Knowledge:

```
### CFTC COT Positioning (Disaggregated, Options+Futures Combined — Tuesday positions, released Friday)
${formatCotSection(cotData, grain)}
```

**Step 3: Write `formatCotSection` helper**

```typescript
function formatCotSection(
  cotData: Array<Record<string, unknown>> | null,
  grain: string
): string {
  if (!cotData || cotData.length === 0) {
    return "No CFTC futures data available for this grain.";
  }

  const latest = cotData[0];
  const lines: string[] = [
    `**${latest.commodity} (${latest.exchange}) — Report date: ${latest.report_date}**`,
    `- Open Interest: ${Number(latest.open_interest).toLocaleString()} contracts`,
    `- Managed Money Net: ${Number(latest.managed_money_net).toLocaleString()} contracts (${latest.managed_money_net_pct}% of OI)`,
    `- WoW Managed Money Net Change: ${Number(latest.wow_net_change) > 0 ? "+" : ""}${Number(latest.wow_net_change).toLocaleString()} contracts`,
    `- Commercial (Prod/Merch) Net: ${Number(latest.commercial_net).toLocaleString()} contracts (${latest.commercial_net_pct}% of OI)`,
    `- Spec/Commercial Divergence: ${latest.spec_commercial_divergence ? "YES — specs and commercials on opposite sides" : "No"}`,
  ];

  if (cotData.length > 1) {
    lines.push(`\n**4-Week Managed Money Net Trend:**`);
    for (const week of cotData) {
      lines.push(`- ${week.report_date}: ${Number(week.managed_money_net).toLocaleString()} net (${week.managed_money_net_pct}% OI)`);
    }
  }

  lines.push(`\nNOTE: COT data reflects positions as of Tuesday, released Friday. There is a 3-day lag. Use as context for next week's thesis, not real-time signal.`);

  return lines.join("\n");
}
```

**Step 4: Pass cotData through the call chain**

Update the `buildDataPrompt(...)` call to include `cotPositioning`:

```typescript
const dataPrompt = buildDataPrompt(
  grainName, cropYear, grainWeek,
  yoy, supply, sentiment, delivery,
  deliveriesHist, exportsHist, stocksHist,
  knowledgeContext.contextText,
  logisticsSnapshot,
  cotPositioning,  // NEW
);
```

**Step 5: Add "CFTC" to allowed source tags**

In the system prompt output format description, add `"CFTC"` to the `source` enum:
```
- "source": "CGC" | "AAFC" | "Historical" | "Community" | "CFTC"
```

**Step 6: Commit**

```bash
git add supabase/functions/analyze-market-data/index.ts
git commit -m "feat: inject CFTC COT positioning data into Step 3.5 Flash analysis"
```

---

## Task 8: Inject COT data into `generate-intelligence` (Grok) + model upgrade

**Files:**
- Modify: `supabase/functions/generate-intelligence/index.ts`
- Modify: `supabase/functions/generate-intelligence/prompt-template.ts`

**Step 1: Upgrade Grok model**

In `index.ts`, change:
```typescript
const MODEL = "grok-4-1-fast-reasoning";
```
to:
```typescript
const MODEL = "grok-4-20";
```

**Step 2: Add COT to GrainContext interface**

In `prompt-template.ts`, add to the `GrainContext` interface:

```typescript
cotPositioning?: Array<{
  report_date: string;
  commodity: string;
  exchange: string;
  mapping_type: string;
  open_interest: number;
  managed_money_net: number;
  managed_money_net_pct: number;
  wow_net_change: number;
  commercial_net: number;
  commercial_net_pct: number;
  spec_commercial_divergence: boolean;
  grain_week: number;
}> | null;
```

**Step 3: Add COT query to index.ts**

Inside the per-grain loop in `index.ts`, after fetching `marketAnalysisData`, add:

```typescript
const { data: cotPositioning } = await supabase.rpc("get_cot_positioning", {
  p_grain: grainName,
  p_crop_year: cropYear,
  p_weeks_back: 4,
});
```

Pass it into the `GrainContext` object:

```typescript
cotPositioning: cotPositioning ?? null,
```

**Step 4: Add COT section to `buildIntelligencePrompt`**

In `prompt-template.ts`, add a new section after "### Logistics & Transport Snapshot" and before "## Retrieved Grain Knowledge":

```typescript
### CFTC COT Positioning (Tuesday data, released Friday — 3-day lag)
${formatCotForIntelligence(ctx)}
```

Write the formatter:

```typescript
function formatCotForIntelligence(ctx: GrainContext): string {
  if (!ctx.cotPositioning || ctx.cotPositioning.length === 0) {
    return "No CFTC futures data available for this grain.";
  }

  const latest = ctx.cotPositioning[0];
  const lines: string[] = [
    `**${latest.commodity} (${latest.exchange}) — as of ${latest.report_date}:**`,
    `- Managed Money Net: ${latest.managed_money_net.toLocaleString()} (${latest.managed_money_net_pct}% OI), WoW: ${latest.wow_net_change > 0 ? "+" : ""}${latest.wow_net_change.toLocaleString()}`,
    `- Commercial Net: ${latest.commercial_net.toLocaleString()} (${latest.commercial_net_pct}% OI)`,
    `- Divergence: ${latest.spec_commercial_divergence ? "YES" : "No"}`,
  ];

  if (ctx.cotPositioning.length > 1) {
    lines.push(`- 4-week MM net trend: ${ctx.cotPositioning.map(w =>
      `${w.report_date}: ${w.managed_money_net.toLocaleString()}`
    ).join(" → ")}`);
  }

  return lines.join("\n");
}
```

**Step 5: Add "CFTC" to Grok's structured output schema**

In the JSON schema for Grok's response (in `index.ts` where the xAI API call happens), add `"CFTC"` to the `sources` array enum:

```typescript
"sources": {
  "type": "array",
  "items": { "type": "string", "enum": ["CGC", "AAFC", "X", "Derived", "CFTC"] }
}
```

**Step 6: Commit**

```bash
git add supabase/functions/generate-intelligence/index.ts supabase/functions/generate-intelligence/prompt-template.ts
git commit -m "feat: inject COT data into Grok intelligence + upgrade to grok-4-20"
```

---

## Task 9: Update `buildDataContextPreamble` for COT timing

**Files:**
- Modify: `supabase/functions/_shared/market-intelligence-config.ts`

**Step 1: Add COT to the data context preamble**

In `buildDataContextPreamble()`, add after the AAFC line:

```typescript
- **CFTC COT:** Released Friday for prior Tuesday's positions. 3-day lag — by Friday the market may have already moved. Use as context for next week, not current-week timing.
```

**Step 2: Update version string**

Bump `analyzeMarketData` and `generateIntelligence` versions:
```typescript
analyzeMarketData: "analyze-market-data-v5",
generateIntelligence: "generate-intelligence-v5",
```

**Step 3: Commit**

```bash
git add supabase/functions/_shared/market-intelligence-config.ts
git commit -m "feat: add COT timing to data context preamble + bump prompt versions to v5"
```

---

## Task 10: Update `agent-debate-rules.md` with COT rules

**Files:**
- Modify: `docs/reference/agent-debate-rules.md`

**Step 1: Add Rules 9-11**

After Rule 8, add:

```markdown
---

## COT Positioning Rules

### Rule 9: COT Positioning Informs Timing, Not Direction
COT tells you WHEN to act, not WHAT to do. Fundamentals (CGC flow, AAFC balance sheet, logistics) determine direction; COT determines whether the market is overcrowded in that direction.

**Anti-pattern:** "Managed money net-long → bullish." Wrong — net-long means the bullish trade is already crowded. The question is: can latecomers still push prices higher, or is it a crowded exit?

**Test:** If thesis says "sell" and managed money is heavily short → wait for the squeeze first, then sell into the rally.

### Rule 10: Flag Spec/Commercial Divergence as Watch Signal
When Managed Money and Commercial (Producer/Merchant) are on opposite sides, ALWAYS flag as a watch item. This is the highest-confidence timing signal in commodity markets.

**Template:** "Specs {net-long/short} {X contracts} ({Y}% OI) while commercials {opposite} {Z contracts} — positioning divergence suggests {implication for farmer timing}."

### Rule 11: COT Lag Awareness
COT data reflects Tuesday positions, released Friday. By Friday, the market may have already moved. Rule:
- COT sets context for NEXT WEEK's thesis, not this week's action
- Always pair COT with more recent X signals for current-week timing
- If COT shows extreme positioning + X signals show momentum reversal → high-confidence inflection signal
```

**Step 2: Update validation checklist**

Add two new items:
```markdown
- [ ] **COT context included:** For grains with CFTC data, is managed money positioning referenced?
- [ ] **COT lag noted:** Is COT data attributed to its Tuesday snapshot date, not treated as real-time?
```

**Step 3: Commit**

```bash
git add docs/reference/agent-debate-rules.md
git commit -m "docs: add COT positioning rules (9-11) to agent debate rules"
```

---

## Task 11: Create `/cftc-cot` skill

**Files:**
- Create: `.claude/skills/cftc-cot/SKILL.md`

**Step 1: Write the skill file**

Follow the existing skill pattern from `cgc-import/SKILL.md`:

```markdown
---
name: cftc-cot
description: >
  Import, query, and analyze CFTC Commitment of Traders (COT) data for grain futures positioning.
  Use when the user says: 'import COT', 'CFTC data', 'COT report', 'check trader positioning',
  'spec positions', 'managed money', 'who is long wheat', 'canola futures positioning',
  'speculative positioning', 'commercial hedging data'.
  Do NOT use for: general Supabase queries (use Supabase MCP directly), deploying Edge Functions
  (use supabase-deploy skill), triggering CGC imports (use cgc-import skill), or generating
  intelligence narratives (those chain automatically from the pipeline).
---

# CFTC COT Skill — Bushel Board

Import and query CFTC Commitments of Traders data for grain futures positioning analysis.

## Project Context

- **Supabase project:** `ibgsloyjxdopkvwqcqwh`
- **Data source:** https://www.cftc.gov/dea/options/ag_lof.htm
- **Update schedule:** Every Friday ~1:30pm MST (data as of prior Tuesday)
- **Automated import:** Vercel cron `GET /api/cron/import-cftc-cot` at 8:30pm UTC Fridays
- **Table:** `cftc_cot_positions`
- **RPC:** `get_cot_positioning(p_grain, p_crop_year, p_weeks_back)`

## CFTC → CGC Grain Mapping

| CFTC Commodity | CGC Grain | Type |
|----------------|-----------|------|
| WHEAT-SRW (CBOT) | Wheat | primary |
| WHEAT-HRW (CBOT) | Wheat | primary |
| WHEAT-HRSpring (MIAX) | Wheat | primary |
| CANOLA (ICE) | Canola | primary |
| SOYBEANS (CBOT) | Soybeans | primary |
| SOYBEAN OIL (CBOT) | Canola | secondary |
| SOYBEAN MEAL (CBOT) | Canola | secondary |
| CORN (CBOT) | Corn | primary |
| OATS (CBOT) | Oats | primary |

Grains without CFTC match: Durum, Barley, Peas, Lentils, Flaxseed, Rye, Mustard Seed, Canaryseed, Chick Peas, Sunflower, Beans.

## Monitoring Queries

Run via Supabase MCP (`execute_sql` with project_id `ibgsloyjxdopkvwqcqwh`):

```sql
-- Latest COT import
SELECT commodity, cgc_grain, report_date, open_interest,
       (managed_money_long - managed_money_short) AS mm_net,
       import_source
FROM cftc_cot_positions ORDER BY imported_at DESC LIMIT 10;

-- Managed money net by grain (latest week)
SELECT cgc_grain, commodity, report_date,
       (managed_money_long - managed_money_short) AS mm_net,
       ROUND(((managed_money_long - managed_money_short) / NULLIF(open_interest, 0) * 100)::numeric, 1) AS mm_net_pct
FROM cftc_cot_positions
WHERE report_date = (SELECT MAX(report_date) FROM cftc_cot_positions)
  AND mapping_type = 'primary'
ORDER BY cgc_grain;

-- Per-grain positioning with divergence (uses RPC)
SELECT * FROM get_cot_positioning('Wheat', '2025-2026', 4);
SELECT * FROM get_cot_positioning('Canola', '2025-2026', 4);

-- Biggest WoW managed money shifts
SELECT cgc_grain, commodity, report_date,
       (COALESCE(change_managed_money_long, 0) - COALESCE(change_managed_money_short, 0)) AS wow_mm_net_change
FROM cftc_cot_positions
WHERE report_date = (SELECT MAX(report_date) FROM cftc_cot_positions)
  AND mapping_type = 'primary'
ORDER BY ABS(COALESCE(change_managed_money_long, 0) - COALESCE(change_managed_money_short, 0)) DESC;
```

## Manual Import

### Via Vercel cron proxy (preferred)
```bash
curl https://bushel-board-app.vercel.app/api/cron/import-cftc-cot \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Via Edge Function directly
```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/import-cftc-cot" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{}'
```

### Manual web extraction (fallback)
If automation is unavailable, manually extract from the CFTC page:
1. Fetch https://www.cftc.gov/dea/options/ag_lof.htm
2. For each target commodity (WHEAT-SRW, WHEAT-HRW, WHEAT-HRSpring, CANOLA, SOYBEANS, SOYBEAN OIL, SOYBEAN MEAL, CORN, OATS):
   - Extract: open_interest, all position data, changes, percentages, trader counts
3. Map to CGC grains using the table above
4. Insert via `execute_sql` or Supabase MCP upsert

## Workflow

### 1. Check data freshness
- Query latest `report_date` in `cftc_cot_positions`
- Compare against expected Friday release (today if Friday, last Friday otherwise)
- If stale, trigger import

### 2. Trigger import
- Prefer Vercel cron proxy, fall back to Edge Function direct
- Verify: check `imported_at` and row count

### 3. Analyze positioning
- Use `get_cot_positioning()` RPC for computed metrics
- Look for: extreme positioning, spec/commercial divergence, multi-week trends
- Report findings to user in plain language

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| No data for this week | CFTC not yet published (check after 1:30pm MST Friday) | Wait and retry |
| Empty Oats data | Very thin open interest, sometimes excluded from report | Normal for thinly-traded contracts |
| Canola shows 0 | ICE Futures sometimes reported separately | Check if commodity name differs |
| Stale data despite cron | Vercel cron failed or CFTC changed page format | Check Edge Function logs; manually import |
| Soybean Oil/Meal mapping | Secondary mapping to Canola | These are crush demand proxies, not direct canola positioning |
```

**Step 2: Commit**

```bash
git add .claude/skills/cftc-cot/SKILL.md
git commit -m "feat: add /cftc-cot skill for manual COT import and analysis"
```

---

## Task 12: Update documentation

**Files:**
- Modify: `docs/plans/STATUS.md` — add Track 20
- Modify: `docs/plans/2026-03-13-cftc-cot-integration-design.md` — update status to "Implemented"
- Modify: `CLAUDE.md` — add COT table, RPC, skill references

**Step 1: Add Track 20 to STATUS.md**

Add a new track entry for CFTC COT integration.

**Step 2: Update design doc status**

Change `Status: Proposed` to `Status: Implemented`.

**Step 3: Update CLAUDE.md**

Add to the Intelligence Pipeline tables list:
```
`cftc_cot_positions` (CFTC Disaggregated COT: trader positioning per commodity per week, mapped to CGC grains)
```

Add to RPC functions list:
```
`get_cot_positioning(p_grain, p_crop_year, p_weeks_back)` — managed money and commercial net positions with divergence flag
```

Add to Pipeline Monitoring:
```
- COT data freshness: `SELECT commodity, report_date, imported_at FROM cftc_cot_positions ORDER BY imported_at DESC LIMIT 5;`
- COT positioning: `SELECT * FROM get_cot_positioning('Wheat', '2025-2026', 4);`
```

Add `/cftc-cot` to the skill references.

Update Grok model reference from `grok-4-1-fast-reasoning` to `grok-4-20`.

Add cron entry documentation: `Vercel cron every Friday at 20:30 UTC (1:30pm MST) → import-cftc-cot`

**Step 4: Commit**

```bash
git add docs/plans/STATUS.md docs/plans/2026-03-13-cftc-cot-integration-design.md CLAUDE.md
git commit -m "docs: Track 20 — CFTC COT integration documentation complete"
```

---

## Task 13: Deploy Edge Functions and verify full pipeline

**Step 1: Deploy `import-cftc-cot` Edge Function**

```bash
npx supabase functions deploy import-cftc-cot
```

**Step 2: Deploy updated `analyze-market-data`**

```bash
npx supabase functions deploy analyze-market-data
```

**Step 3: Deploy updated `generate-intelligence`**

```bash
npx supabase functions deploy generate-intelligence
```

**Step 4: Run manual COT import**

```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/import-cftc-cot" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET"
```

**Step 5: Verify data**

```sql
SELECT commodity, cgc_grain, report_date,
       (managed_money_long - managed_money_short) AS mm_net,
       open_interest
FROM cftc_cot_positions
ORDER BY imported_at DESC LIMIT 10;
```

**Step 6: Test intelligence generation for one grain with COT data**

```bash
curl -X POST "https://ibgsloyjxdopkvwqcqwh.supabase.co/functions/v1/analyze-market-data" \
  -H "Content-Type: application/json" \
  -H "x-bushel-internal-secret: $BUSHEL_INTERNAL_FUNCTION_SECRET" \
  -d '{"grains": ["Canola"]}'
```

Then check the output for CFTC source references:
```sql
SELECT grain, initial_thesis, key_signals
FROM market_analysis
WHERE grain = 'Canola'
ORDER BY generated_at DESC LIMIT 1;
```

**Step 7: Build check**

```bash
npm run build
```

**Step 8: Final commit**

```bash
git add -A
git commit -m "feat: Track 20 — CFTC COT integration complete (deploy verified)"
```
