# CFTC Commitments of Traders (COT) Integration — Feature Design

**Date:** 2026-03-13
**Status:** Implemented
**Author:** Kyle + Claude
**Dependencies:** cftc_cot_positions table, analyze-market-data Edge Function, generate-intelligence Edge Function, commodity-knowledge.ts, agent-debate-rules.md

---

## Problem Statement

Bushel Board's intelligence pipeline currently ingests CGC grain flow data, AAFC supply/disposition, X/Twitter market signals, and farmer sentiment. But it lacks a critical dimension: **speculative positioning data** from U.S. futures markets.

Canadian grain prices are heavily influenced by Chicago (CBOT), Minneapolis (MIAX), and ICE futures. When managed money (hedge funds) piles into net-long wheat positions, it lifts futures — and Canadian basis follows. When specs bail, prices crash. Prairie farmers need to know *who* is holding positions and *how fast* that's changing to time their sales.

The CFTC Commitments of Traders report — published every Friday ~1:30pm MST — provides exactly this data. We need to integrate it.

---

## Design Philosophy

COT data is a **timing signal**, not a directional signal. It tells the farmer *when* to act, not *what* to do. The fundamentals (CGC flow, AAFC balance sheet) tell you direction; COT tells you whether the market is overcrowded in that direction.

**Mental model:** "The data says sell canola, but hedge funds are massively short — wait for the squeeze before locking in your price."

---

## Data Source

**URL:** https://www.cftc.gov/dea/options/ag_lof.htm
**Report:** Disaggregated Commitments of Traders — Options and Futures Combined
**Update frequency:** Every Friday ~1:30pm MST (data as of prior Tuesday)
**Format:** HTML tables, one per commodity

### Relevant Commodities (mapped to CGC grains)

| CFTC Commodity | Exchange | Contract Size | CGC Grain | Mapping Type |
|----------------|----------|---------------|-----------|--------------|
| WHEAT-SRW | CBOT | 5,000 bu | Wheat | Primary (soft red winter) |
| WHEAT-HRW | CBOT | 5,000 bu | Wheat | Primary (hard red winter) |
| WHEAT-HRSPRING | MIAX | 5,000 bu | Wheat | Primary (closest to CWRS) |
| CANOLA | ICE | 20 MT | Canola | Direct match |
| SOYBEANS | CBOT | 5,000 bu | Soybeans | Direct match |
| SOYBEAN OIL | CBOT | 60,000 lbs | Canola | Secondary (crush demand proxy) |
| SOYBEAN MEAL | CBOT | 100 tons | Canola | Secondary (crush demand proxy) |
| CORN | CBOT | 5,000 bu | Corn | Direct match |
| OATS | CBOT | 5,000 bu | Oats | Direct match (thin market) |

**Grains without CFTC futures:** Amber Durum, Barley, Peas, Lentils, Flaxseed, Rye, Mustard Seed, Canaryseed, Chick Peas, Sunflower, Beans. These receive a "No CFTC futures data" note in intelligence output.

### Key Data Fields Per Commodity

For each commodity, the report provides:
- **Open Interest** — total contracts outstanding
- **Producer/Merchant/Processor/User** — commercial hedgers (long + short)
- **Swap Dealers** — financial institutions hedging OTC positions
- **Managed Money** — hedge funds, CTAs, speculators (long + short)
- **Other Reportables** — large traders not in above categories
- **Nonreportable** — small traders below reporting threshold
- **Changes from prior week** — WoW position changes per category
- **Percent of Open Interest** — each category's share
- **Number of traders** — per category
- **Concentration** — top 4/8 traders' share

---

## Data Model

### New Table: `cftc_cot_positions`

```sql
CREATE TABLE cftc_cot_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,              -- CFTC report date (Tuesday)
  commodity text NOT NULL,                 -- e.g. 'WHEAT-SRW', 'CANOLA'
  contract_market_name text NOT NULL,      -- Full CFTC name
  exchange text NOT NULL,                  -- CBOT, ICE, MIAX, CME

  -- Open Interest
  open_interest numeric NOT NULL,
  change_open_interest numeric,            -- WoW change

  -- Producer/Merchant/Processor/User (Commercial)
  prod_merc_long numeric NOT NULL,
  prod_merc_short numeric NOT NULL,

  -- Swap Dealers
  swap_long numeric NOT NULL,
  swap_short numeric NOT NULL,
  swap_spread numeric,                     -- Spread positions

  -- Managed Money (Speculators)
  managed_money_long numeric NOT NULL,
  managed_money_short numeric NOT NULL,
  managed_money_spread numeric,            -- Spread positions

  -- Other Reportables
  other_long numeric NOT NULL,
  other_short numeric NOT NULL,
  other_spread numeric,

  -- Non-Reportable (derived: OI - all reportable)
  nonreportable_long numeric NOT NULL,
  nonreportable_short numeric NOT NULL,

  -- Changes from prior week (managed money focus)
  change_prod_merc_long numeric,
  change_prod_merc_short numeric,
  change_managed_money_long numeric,
  change_managed_money_short numeric,

  -- Percent of Open Interest
  pct_prod_merc_long numeric,
  pct_prod_merc_short numeric,
  pct_managed_money_long numeric,
  pct_managed_money_short numeric,

  -- Number of traders
  traders_prod_merc_long smallint,
  traders_prod_merc_short smallint,
  traders_managed_money_long smallint,
  traders_managed_money_short smallint,

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
  cgc_grain text,                          -- Mapped CGC grain name (nullable for non-grain commodities)
  mapping_type text DEFAULT 'primary',     -- 'primary' or 'secondary'
  crop_year text,                          -- Mapped to CGC crop year (e.g. '2025-2026')
  grain_week smallint,                     -- Mapped to nearest CGC grain week

  -- Metadata
  imported_at timestamptz DEFAULT now(),
  import_source text DEFAULT 'manual',     -- 'manual' | 'cron' | 'backfill'

  UNIQUE(report_date, commodity)
);

-- RLS: read-only for authenticated users
ALTER TABLE cftc_cot_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read COT data"
  ON cftc_cot_positions FOR SELECT
  TO authenticated
  USING (true);
```

### New RPC Function: `get_cot_positioning`

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
    report_date,
    commodity,
    exchange,
    mapping_type,
    open_interest,
    (managed_money_long - managed_money_short) AS managed_money_net,
    ROUND(((managed_money_long - managed_money_short) / NULLIF(open_interest, 0) * 100)::numeric, 1) AS managed_money_net_pct,
    (change_managed_money_long - change_managed_money_short) AS wow_net_change,
    (prod_merc_long - prod_merc_short) AS commercial_net,
    ROUND(((prod_merc_long - prod_merc_short) / NULLIF(open_interest, 0) * 100)::numeric, 1) AS commercial_net_pct,
    -- Divergence: specs net-long AND commercials net-short, or vice versa
    CASE
      WHEN (managed_money_long - managed_money_short) > 0
        AND (prod_merc_long - prod_merc_short) < 0 THEN true
      WHEN (managed_money_long - managed_money_short) < 0
        AND (prod_merc_long - prod_merc_short) > 0 THEN true
      ELSE false
    END AS spec_commercial_divergence,
    grain_week
  FROM cftc_cot_positions
  WHERE cgc_grain = p_grain
    AND (p_crop_year IS NULL OR crop_year = p_crop_year)
    AND mapping_type = 'primary'
  ORDER BY report_date DESC
  LIMIT p_weeks_back;
$$;
```

---

## Import Architecture

### Path 1: Manual Skill (`/cftc-cot`)

A Claude Code skill in `.claude/skills/cftc-cot/SKILL.md` that:

1. Fetches `https://www.cftc.gov/dea/options/ag_lof.htm`
2. Parses the HTML tables for target commodities
3. Extracts all position fields per commodity
4. Maps commodities to CGC grains using the mapping table
5. Computes `crop_year` and `grain_week` from the report date
6. Upserts into `cftc_cot_positions` via Supabase MCP
7. Displays import summary (grains imported, managed money net positions, notable changes)

**Trigger phrases:** "import COT", "CFTC data", "COT report", "check trader positioning", "spec positions"

### Path 2: Automated Edge Function (`import-cftc-cot`)

A Supabase Edge Function triggered by Vercel cron every Friday at 1:30pm MST:

```
app/api/cron/import-cftc-cot/route.ts (Vercel cron ingress)
  → POST to import-cftc-cot Edge Function
    → Fetch CFTC HTML
    → Parse + map + upsert
    → Log to cftc_imports audit table
    → Chain-trigger: none (COT import is independent of CGC pipeline)
```

**Cron schedule:** `30 20 * * 5` (1:30pm MST = 8:30pm UTC, Fridays)

The Edge Function uses the same parsing logic as the skill but runs autonomously. It stores import metadata for monitoring.

### HTML Parsing Strategy

The CFTC page uses a consistent preformatted text layout (`<pre>` tags) with fixed-width columns. Each commodity block starts with the commodity name and exchange, followed by position data in a known column layout. Parsing approach:

1. Split page by commodity headers (regex: `/^[A-Z\- ]+\(.*\) - /m`)
2. For each target commodity, extract the fixed-width fields
3. Map column positions to field names
4. Validate: open_interest > 0, all positions sum correctly

---

## Intelligence Pipeline Integration

### Step 3.5 Flash (analyze-market-data) Enhancements

**New data source in prompt:**
```
## CFTC Commitments of Traders (as of {report_date})

{commodity}: Open Interest {oi} contracts
  Managed Money: {mm_net} net ({mm_net_pct}% of OI), WoW change {wow}
  Commercial: {comm_net} net ({comm_net_pct}% of OI)
  Spec/Commercial Divergence: {yes/no}

  4-week trend: {net positions for last 4 weeks}
```

**New source tag:** `"CFTC"` added to the allowed sources in `key_signals[]`

**System prompt addition (commodity-knowledge.ts):**
```
## COT Positioning Analysis Framework
- Managed Money net-long + rising → bullish spec pressure, but "weak hands" — vulnerable to liquidation
- Managed Money net-short + still falling → bearish momentum, but squeeze risk if fundamentals improve
- Commercial hedgers increasing shorts → producers/elevators locking in prices = fundamental bearish signal
- Spec/Commercial divergence → strongest timing signal:
  * Specs bullish + commercials bearish = caution, prices may be elevated beyond fundamentals
  * Specs bearish + commercials bullish = opportunity, prices may be depressed below value
- Extreme positioning (multi-year highs/lows in net position) → mean reversion risk within 2-4 weeks
- For wheat: combine SRW + HRW + HRSpring positioning for aggregate view; HRSpring most relevant to CWRS
- For canola: ICE canola is direct; soybean oil/meal are secondary crush demand signals
- COT is released Friday for Tuesday positions — there is a 3-day lag. Factor this into timing analysis.
```

### Grok (generate-intelligence) Enhancements

**Model upgrade:** `grok-4-1-fast-reasoning` → `grok-4-20`

**New context in prompt:** Same COT data block as Step 3.5, plus:
- Cross-reference with X signals about spec positioning
- Can use web_search to find recent COT analysis articles
- New instruction: "If X signals mention spec positioning, validate against actual COT data"

**New insight source:** `"CFTC"` added to allowed sources array in structured output schema

### Debate Rule Updates (agent-debate-rules.md)

**Rule 9: COT Positioning Informs Timing, Not Direction**
- COT tells you WHEN to act, not WHAT to do
- Fundamentals (CGC flow, AAFC balance) determine direction
- COT determines whether the market is overcrowded in that direction
- Anti-pattern: "Managed money net-long → bullish" (no — it means the bullish trade is already crowded)

**Rule 10: Flag Spec/Commercial Divergence**
- When Managed Money and Commercial are on opposite sides, ALWAYS flag as a watch item
- This is the highest-confidence timing signal in commodity markets
- Template: "Specs {long/short} {X contracts} while commercials {opposite} {Y contracts} — positioning divergence suggests {implication}"

**Rule 11: COT Lag Awareness**
- COT data reflects Tuesday positions, released Friday
- By Friday, positions may have already shifted
- Rule: "COT sets context for next week's thesis, not this week's action"
- Always pair with more recent X signals for current-week timing

### Grain-Specific COT Rules

- **Wheat:** Aggregate SRW + HRW + HRSpring for total wheat positioning. HRSpring (Minneapolis) most relevant to Canadian Western Red Spring (CWRS) pricing.
- **Canola:** ICE Canola is the direct hedge. Soybean oil + meal provide secondary crush demand signal — if soy crush margins strong AND specs long canola, crush demand confirmed.
- **Oats:** CBOT oats is very thin (~10-20K open interest). COT less reliable — flag as "low liquidity, use with caution."
- **Soybeans:** Most liquid market. Spec positioning highly reliable signal. Watch soybean/corn spread positioning for acreage switching signals.
- **Corn:** Second most liquid. Watch ethanol mandate policy signals alongside COT.

---

## Skill Design: `/cftc-cot`

### Location
`.claude/skills/cftc-cot/SKILL.md`

### Capabilities
1. **Import current week:** Fetch CFTC page, parse, insert into Supabase
2. **Show positioning:** Query `get_cot_positioning()` for a grain and display formatted summary
3. **Show all grains:** Overview of managed money net positions across all mapped grains
4. **Compare weeks:** Show WoW changes in managed money positioning
5. **Flag divergences:** Highlight any grains where spec/commercial divergence exists

### Trigger Phrases
- "import COT", "CFTC data", "COT report"
- "check trader positioning", "spec positions", "managed money"
- "who's long wheat?", "canola futures positioning"

---

## Monitoring Queries

```sql
-- Latest COT import
SELECT commodity, cgc_grain, report_date,
       (managed_money_long - managed_money_short) AS mm_net,
       open_interest
FROM cftc_cot_positions
ORDER BY imported_at DESC LIMIT 10;

-- Managed money net by grain (latest week)
SELECT cgc_grain, commodity,
       (managed_money_long - managed_money_short) AS mm_net,
       ROUND(((managed_money_long - managed_money_short) / NULLIF(open_interest, 0) * 100)::numeric, 1) AS mm_net_pct
FROM cftc_cot_positions
WHERE report_date = (SELECT MAX(report_date) FROM cftc_cot_positions)
  AND mapping_type = 'primary'
ORDER BY cgc_grain;

-- Spec/commercial divergence check
SELECT * FROM get_cot_positioning('Wheat', '2025-2026', 4);
SELECT * FROM get_cot_positioning('Canola', '2025-2026', 4);

-- WoW managed money shifts
SELECT cgc_grain, commodity, report_date,
       (change_managed_money_long - change_managed_money_short) AS wow_mm_net_change
FROM cftc_cot_positions
WHERE report_date >= (SELECT MAX(report_date) - INTERVAL '7 days' FROM cftc_cot_positions)
  AND mapping_type = 'primary'
ORDER BY ABS(change_managed_money_long - change_managed_money_short) DESC;
```

---

## Risk & Considerations

1. **HTML parsing fragility:** CFTC page format could change. The Edge Function should validate expected structure and fail loudly (log to `validation_reports`) rather than insert garbage data.
2. **COT lag:** 3-day lag (Tuesday data, Friday release). The intelligence pipeline must explicitly note this in all COT-informed analysis.
3. **Thin markets:** CBOT Oats has very low open interest (~10-20K contracts). COT positioning signals are less reliable. Flag in output.
4. **Wheat aggregation:** Combining 3 wheat classes loses nuance (SRW vs HRW vs HRSpring have different fundamentals). For v1, aggregate is sufficient. v2 could show per-class breakdown.
5. **Grok 4.20 migration:** Need to verify xAI API compatibility. If the model string or response format changed, the structured output schema may need adjustment. Test before deploying.
6. **Cost:** COT import itself is free (public data). The intelligence pipeline cost increase is negligible — same number of API calls, just slightly more context tokens.

---

## Out of Scope (v1)

- Historical COT backfill (multi-year data for percentile calculations)
- UI visualization of COT positioning (charts, graphs)
- Per-wheat-class breakdown (SRW vs HRW vs HRSpring)
- Non-grain commodities (cattle, cotton, dairy)
- COT-derived trading signals (e.g., "extreme positioning" alerts)

These can be added incrementally in future tracks.
