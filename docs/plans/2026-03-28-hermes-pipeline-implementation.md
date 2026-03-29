# Hermes Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the paused Edge Function pipeline with a persistent Hermes agent that scrapes data, debates Grok, and publishes nuanced multi-dimensional market theses.

**Architecture:** Hermes agent on GCP VM writes directly to Supabase via service role. Calls Grok via xAI API for X/web-enriched counter-analysis. Two new Supabase tables. 13 Hermes skills. Cron-scheduled Thursday/Friday pipeline + M-F pulse scans.

**Tech Stack:** Hermes Agent (Python), Supabase (PostgreSQL), xAI Responses API (Grok 4.20), Yahoo Finance API, USDA FAS OpenData API, Barchart/TradingCharts (scrape)

**Design Doc:** `docs/plans/2026-03-28-hermes-pipeline-design.md`

---

## Phase 1: Database Foundation (Supabase)

These tasks run in the Bushel Board repo. Apply migrations via `npx supabase db push` or Supabase MCP.

### Task 1: Create `usda_export_sales` table

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_usda_export_sales.sql`

**Step 1: Write the migration**

```sql
-- Create USDA FAS weekly export sales table
CREATE TABLE usda_export_sales (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity       text NOT NULL,
  cgc_grain       text NOT NULL,
  market_year     text NOT NULL,
  week_ending     date NOT NULL,
  net_sales_mt    numeric,
  exports_mt      numeric,
  outstanding_mt  numeric,
  top_buyers      jsonb,
  source          text DEFAULT 'USDA-FAS',
  imported_at     timestamptz DEFAULT now(),
  UNIQUE (commodity, market_year, week_ending)
);

COMMENT ON TABLE usda_export_sales IS 'USDA FAS weekly export sales data. US exports used as global demand signal for Canadian grain thesis.';
COMMENT ON COLUMN usda_export_sales.cgc_grain IS 'Mapped CGC grain name for joining with cgc_observations.';
COMMENT ON COLUMN usda_export_sales.net_sales_mt IS 'Net new export sales in metric tonnes for the reporting week.';
COMMENT ON COLUMN usda_export_sales.exports_mt IS 'Actual shipments (inspections) in metric tonnes.';
COMMENT ON COLUMN usda_export_sales.outstanding_mt IS 'Cumulative unshipped commitments (sold but not yet exported).';
COMMENT ON COLUMN usda_export_sales.top_buyers IS 'Top 3 destination countries as [{country, mt}].';

-- RLS: read-only for authenticated users, write via service role
ALTER TABLE usda_export_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read USDA export sales"
  ON usda_export_sales FOR SELECT
  TO authenticated
  USING (true);
```

**Step 2: Apply migration**

Run: `npx supabase db push` or use Supabase MCP `apply_migration`
Expected: Table created successfully

**Step 3: Verify table exists**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'usda_export_sales' ORDER BY ordinal_position;
```

Expected: 11 columns matching the schema

**Step 4: Commit**

```bash
git add supabase/migrations/*usda_export_sales*
git commit -m "feat: create usda_export_sales table for USDA FAS weekly export data"
```

---

### Task 2: Create `score_trajectory` table

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_score_trajectory.sql`

**Step 1: Write the migration**

```sql
-- Create score trajectory table for intra-week stance tracking
CREATE TABLE score_trajectory (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grain             text NOT NULL,
  crop_year         text NOT NULL,
  grain_week        smallint NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  scan_type         text NOT NULL CHECK (scan_type IN ('weekly_debate', 'pulse_am', 'pulse_pm')),

  -- Multi-dimensional stance
  stance_score      smallint NOT NULL CHECK (stance_score BETWEEN -100 AND 100),
  conviction_pct    smallint CHECK (conviction_pct BETWEEN 0 AND 100),
  near_term         text CHECK (near_term IN ('bearish', 'neutral', 'bullish')),
  medium_term       text CHECK (medium_term IN ('bearish', 'neutral', 'bullish')),
  recommendation    text NOT NULL CHECK (recommendation IN (
    'PATIENCE', 'WATCH', 'SCALE_IN', 'ACCELERATE', 'HOLD_FIRM', 'PRICE'
  )),

  -- What would change the call
  reversal_triggers jsonb,
  risk_triggers     jsonb,

  -- Trajectory tracking
  score_delta       smallint,
  trigger           text,
  evidence          text,

  -- Data freshness at time of analysis
  data_freshness    jsonb NOT NULL,

  model_source      text NOT NULL,

  UNIQUE (grain, crop_year, grain_week, recorded_at)
);

CREATE INDEX idx_score_trajectory_grain_week
  ON score_trajectory (grain, crop_year, grain_week);

CREATE INDEX idx_score_trajectory_latest
  ON score_trajectory (grain, crop_year, recorded_at DESC);

COMMENT ON TABLE score_trajectory IS 'Intra-week stance score trajectory. Weekly anchor from Friday debate + pulse adjustments M-F.';
COMMENT ON COLUMN score_trajectory.data_freshness IS 'Age of each data source at analysis time: {cgc_age_days, cot_age_days, usda_age_days, prices_delay, monitor_age_days}.';
COMMENT ON COLUMN score_trajectory.reversal_triggers IS 'Conditions that would flip the call: [{trigger, likelihood}].';
COMMENT ON COLUMN score_trajectory.recommendation IS 'PATIENCE=hold+monitor, WATCH=uncertain+wait, SCALE_IN=begin delivering, ACCELERATE=deliver now, HOLD_FIRM=confident bullish, PRICE=hedge/forward contract.';

-- RLS: read-only for authenticated users, write via service role
ALTER TABLE score_trajectory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read score trajectory"
  ON score_trajectory FOR SELECT
  TO authenticated
  USING (true);
```

**Step 2: Apply migration**

Run: `npx supabase db push` or use Supabase MCP `apply_migration`
Expected: Table + 2 indexes created successfully

**Step 3: Verify with test insert + query**

```sql
INSERT INTO score_trajectory (grain, crop_year, grain_week, scan_type, stance_score, conviction_pct, near_term, medium_term, recommendation, data_freshness, model_source)
VALUES ('Wheat', '2025-2026', 33, 'weekly_debate', -25, 55, 'bearish', 'neutral', 'PATIENCE', '{"cgc_age_days": 8, "cot_age_days": 3}', 'hermes_opus');

SELECT * FROM score_trajectory WHERE grain = 'Wheat';
-- Expected: 1 row with all fields populated

DELETE FROM score_trajectory WHERE grain = 'Wheat' AND grain_week = 33 AND scan_type = 'weekly_debate';
```

**Step 4: Commit**

```bash
git add supabase/migrations/*score_trajectory*
git commit -m "feat: create score_trajectory table for intra-week stance tracking"
```

---

### Task 3: Create RPC for latest score trajectory per grain

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_rpc_get_score_trajectory.sql`

**Step 1: Write the RPC function**

```sql
-- Returns the latest score trajectory entries per grain for a crop year/week
-- Used by the frontend to show "Weekly: +25 → Current: +35 ↑"
CREATE OR REPLACE FUNCTION get_score_trajectory(
  p_grain text,
  p_crop_year text,
  p_grain_week smallint
)
RETURNS TABLE (
  recorded_at     timestamptz,
  scan_type       text,
  stance_score    smallint,
  conviction_pct  smallint,
  near_term       text,
  medium_term     text,
  recommendation  text,
  score_delta     smallint,
  trigger         text,
  evidence        text,
  data_freshness  jsonb,
  model_source    text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    recorded_at, scan_type, stance_score, conviction_pct,
    near_term, medium_term, recommendation, score_delta,
    trigger, evidence, data_freshness, model_source
  FROM score_trajectory
  WHERE grain = p_grain
    AND crop_year = p_crop_year
    AND grain_week = p_grain_week
  ORDER BY recorded_at ASC;
$$;

COMMENT ON FUNCTION get_score_trajectory IS 'Returns all score trajectory entries for a grain/week, ordered chronologically. Shows weekly anchor + pulse adjustments.';
```

**Step 2: Apply and verify**

Run migration, then:
```sql
SELECT * FROM get_score_trajectory('Wheat', '2025-2026', 33::smallint);
```
Expected: empty result set (no data yet), no error

**Step 3: Commit**

```bash
git add supabase/migrations/*rpc_get_score_trajectory*
git commit -m "feat: add get_score_trajectory RPC for intra-week score display"
```

---

## Phase 2: Hermes VM Setup

These tasks run on the GCP VM via SSH (`ssh.cloud.google.com` or direct SSH).

### Task 4: Configure Hermes environment secrets

**Step 1: SSH into the VM**

Navigate to the Hermes SSH tab or run:
```bash
gcloud compute ssh hermes-agent --zone=us-central1-a --project=advance-river-390422
```

**Step 2: Set environment variables**

Create or edit `~/.hermes/.env` (or wherever Hermes loads env from):

```bash
# Supabase — direct writes via service role
export SUPABASE_URL="https://ibgsloyjxdopkvwqcqwh.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<paste from .env.local in Bushel Board repo>"

# xAI — Grok 4.20 for debate
export XAI_API_KEY="<paste from .env.local>"

# Internal function secret — fallback Edge Function trigger
export BUSHEL_INTERNAL_FUNCTION_SECRET="<paste from .env.local>"
```

**Step 3: Verify Supabase connectivity**

```bash
curl -s "$SUPABASE_URL/rest/v1/cgc_imports?select=grain_week&order=grain_week.desc&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: JSON array with latest grain_week number

**Step 4: Verify xAI connectivity**

```bash
curl -s "https://api.x.ai/v1/models" \
  -H "Authorization: Bearer $XAI_API_KEY" | head -20
```

Expected: JSON listing available models including `grok-4.20-reasoning`

---

### Task 5: Install Python dependencies on VM

**Step 1: Check Python environment**

```bash
cd ~/hermes-agent  # or wherever the Hermes repo lives
source hermes-env/bin/activate  # activate the venv shown in the SSH tab
python --version  # expect 3.11+
```

**Step 2: Install Supabase Python client + data dependencies**

```bash
pip install supabase-py requests beautifulsoup4 lxml
```

**Step 3: Verify imports**

```python
python -c "from supabase import create_client; print('supabase-py OK')"
python -c "import requests; print('requests OK')"
python -c "from bs4 import BeautifulSoup; print('bs4 OK')"
```

Expected: All print OK

---

### Task 6: Write SOUL.md for Hermes

**Files:**
- Create: `~/.hermes/SOUL.md` on the VM

**Step 1: Write the SOUL.md file**

This is the permanent personality that Hermes loads on every invocation. Content should be assembled from:
- Viking L0 principles (copy from `lib/knowledge/viking-l0.ts` in Bushel Board repo)
- Recommendation philosophy rules (Section 3.4 of design doc)
- Debate rules (copy from `docs/reference/agent-debate-rules.md`)
- Data freshness interpretation rules (Section 4.2 of design doc)
- Voice rules (copy from `lib/advisor/system-prompt.ts` lines 119-129)
- Self-improvement protocol (Section 10 of design doc)

Full SOUL.md content is specified in Section 10 of the design doc. Write it to `~/.hermes/SOUL.md`.

**Step 2: Verify Hermes loads it**

```bash
hermes chat "What are your core principles?"
```

Expected: Hermes references the 8 Viking principles and speaks in farmer-friendly voice

**Step 3: Verify recommendation philosophy**

```bash
hermes chat "If wheat is bearish at -30 but specs are historically short, what do you recommend?"
```

Expected: Hermes recommends PATIENCE (not "sell"), mentions reversal potential, names a specific trigger to watch

---

### Task 7: Write Viking L1 topic skills for Hermes

**Files:**
- Create: `~/.hermes/skills/basis-pricing.md`
- Create: `~/.hermes/skills/storage-carry.md`
- Create: `~/.hermes/skills/hedging-contracts.md`
- Create: `~/.hermes/skills/logistics-exports.md`
- Create: `~/.hermes/skills/market-structure.md`
- Create: `~/.hermes/skills/risk-management.md`
- Create: `~/.hermes/skills/grain-specifics.md`
- Create: `~/.hermes/skills/usda-export-signals.md`
- Create: `~/.hermes/skills/price-pattern-analysis.md`

**Step 1: Port Viking L1 topics to Hermes skill format**

Each skill follows the agentskills.io standard — a Markdown file with frontmatter. Content comes from `lib/knowledge/viking-l1.ts` in the Bushel Board repo. Each topic maps 1:1.

Example for `basis-pricing.md`:
```markdown
---
name: basis-pricing
description: Basis signals, bull/bear checklists, seasonal pricing patterns, price discovery frameworks
triggers:
  - basis
  - bullish
  - bearish
  - price
  - seasonal
  - spread
  - premium
---

[Full content of VIKING_L1.basis_pricing from lib/knowledge/viking-l1.ts]
```

**Step 2: Write the two NEW skills**

`usda-export-signals.md` — content to cover:
- How to interpret USDA weekly export sales (net sales vs shipments vs outstanding)
- What "above/below average pace" means for each commodity
- How US export demand correlates with Canadian basis and pricing
- Commodity code mapping (107=Wheat, 104=Corn, 201=Soybeans, etc.)

`price-pattern-analysis.md` — content to cover:
- Daily/weekly/monthly price pattern detection frameworks
- Mean reversion signals and seasonal tendencies by grain
- How to weight technical patterns alongside fundamental data
- CGC release day price impact patterns

**Step 3: Verify skills are discoverable**

```bash
hermes skills list
```

Expected: All 9 skills listed with names and descriptions

---

## Phase 3: Data Import Skills

### Task 8: Write `import-cgc` skill

**Files:**
- Create: `~/.hermes/skills/import-cgc.md`

This skill teaches Hermes how to fetch and parse the CGC weekly CSV. The logic mirrors `supabase/functions/import-cgc-weekly/index.ts` but in Python.

**Step 1: Write the skill file**

The skill should instruct Hermes to:
1. Fetch CSV from `https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/` (detect latest week URL)
2. Parse CSV (columns: Crop Year, Grain Week, Week Ending Date, worksheet, metric, period, grain, grade, Region, Ktonnes)
3. Convert date format DD/MM/YYYY → YYYY-MM-DD
4. Convert crop year to long format "2025-2026"
5. Upsert to `cgc_observations` via Supabase Python client (batch of 500, ON CONFLICT)
6. Log result to `cgc_imports` table
7. Run `validate-import` skill after completion

**Step 2: Test with a manual run**

```bash
hermes run import-cgc
```

Expected: Hermes fetches CSV, reports row count, upserts to Supabase, logs import

**Step 3: Verify data in Supabase**

```sql
SELECT grain_week, COUNT(*) FROM cgc_observations
WHERE crop_year = '2025-2026'
GROUP BY grain_week ORDER BY grain_week DESC LIMIT 5;
```

Expected: Latest grain_week matches what CGC published

---

### Task 9: Write `import-usda` skill

**Files:**
- Create: `~/.hermes/skills/import-usda.md`

**Step 1: Write the skill file**

The skill should instruct Hermes to:
1. For each mapped commodity (Wheat=107, Corn=104, Soybeans=201, Barley=101, Oats=105, plus Durum/Peas/Lentils codes TBD):
   - Call `https://apps.fas.usda.gov/OpenData/api/esr/exports/commodityCode/{code}/allCountries/marketYear/{year}`
   - Parse JSON response: extract net_sales, exports, outstanding_sales per week
   - Map commodity to `cgc_grain` name
   - Extract top 3 buyers per week
2. Upsert to `usda_export_sales` (ON CONFLICT commodity + market_year + week_ending)
3. Log summary: commodities fetched, weeks imported, any errors

**Step 2: Test with Wheat only**

```bash
hermes run import-usda --commodity Wheat
```

Expected: Hermes fetches Wheat export sales, reports weeks imported

**Step 3: Verify data in Supabase**

```sql
SELECT commodity, cgc_grain, week_ending, net_sales_mt, exports_mt
FROM usda_export_sales
WHERE cgc_grain = 'Wheat'
ORDER BY week_ending DESC LIMIT 5;
```

Expected: Recent weeks of USDA wheat export data

**Step 4: Run full import for all 8+1 commodities**

```bash
hermes run import-usda
```

---

### Task 10: Write `import-cftc-cot` skill

**Files:**
- Create: `~/.hermes/skills/import-cftc-cot.md`

Logic mirrors `supabase/functions/import-cftc-cot/index.ts` and `supabase/functions/_shared/cftc-cot-parser.ts`. The CFTC SODA API endpoint and commodity-to-CGC-grain mapping already exist in those files.

**Step 1: Write the skill — instruct Hermes to:**
1. Call CFTC SODA API (same endpoint as existing Edge Function)
2. Parse disaggregated positions per commodity
3. Map CFTC commodities to CGC grain names
4. Upsert to `cftc_cot_positions` (ON CONFLICT report_date + commodity)

**Step 2: Test and verify**

```bash
hermes run import-cftc-cot
```

```sql
SELECT commodity, report_date, managed_money_net, commercial_net
FROM cftc_cot_positions ORDER BY imported_at DESC LIMIT 5;
```

---

### Task 11: Write `import-prices` skill

**Files:**
- Create: `~/.hermes/skills/import-prices.md`

**Step 1: Write the skill — two price channels:**

**Channel A — Yahoo Finance (CBOT grains):**
Same logic as `scripts/import-grain-prices.ts`. Fetch from Yahoo Finance chart API for symbols: ZW=F, KE=F, ZC=F, ZS=F, ZO=F.

**Channel B — Barchart/TradingCharts scrape (ICE Canola + MGEX Spring Wheat):**
1. Fetch `https://futures.tradingcharts.com/marketquotes/RS.html` (Canola)
2. Parse the delayed settlement price from the page (data loads via Barchart JS API — Hermes may need to use `requests` to hit the underlying Barchart OnDemand endpoint directly, or use a headless browser)
3. Fetch MGEX Spring Wheat from Barchart or INO.com
4. Parse settlement prices

Upsert all prices to `grain_prices` (ON CONFLICT grain + contract + price_date).

**Step 2: Test and verify**

```bash
hermes run import-prices
```

```sql
SELECT grain, contract, exchange, settlement_price, price_date
FROM grain_prices ORDER BY price_date DESC LIMIT 10;
```

Expected: All 7 grains including Canola (ICE) and Spring Wheat (MGEX)

---

### Task 12: Write `scrape-grain-monitor` and `import-producer-cars` skills

**Files:**
- Create: `~/.hermes/skills/scrape-grain-monitor.md`
- Create: `~/.hermes/skills/import-producer-cars.md`

These follow the same pattern as existing Edge Functions. Port the scraping logic to Python skill instructions. Upsert to `grain_monitor_snapshots` and `producer_car_allocations` respectively.

Test each with a manual run and verify data in Supabase.

---

### Task 13: Write `validate-import` skill

**Files:**
- Create: `~/.hermes/skills/validate-import.md`

**Step 1: Write the skill — instruct Hermes to:**
1. Query latest grain_week from `cgc_observations`
2. Count rows per worksheet/metric for the latest week
3. Compare against expected counts (Primary should have ~16 grains × regions)
4. Check for `grade=''` aggregate rows in Primary (should exist)
5. Verify no `grade=''` rows in Terminal Receipts/Exports (should NOT exist)
6. Write results to `validation_reports` table
7. Flag any anomalies

**Step 2: Test after an import**

```bash
hermes run validate-import
```

```sql
SELECT * FROM validation_reports ORDER BY created_at DESC LIMIT 1;
```

---

## Phase 4: Analysis & Debate Skills

### Task 14: Write `analyze-grain` skill

**Files:**
- Create: `~/.hermes/skills/analyze-grain.md`

This is the core analytical skill. It instructs Hermes to produce a multi-dimensional thesis per grain.

**Step 1: Write the skill — instruct Hermes to:**
1. Load relevant L1 skills based on grain type (intent detection)
2. Query Supabase for all data inputs:
   - `v_grain_yoy_comparison` for CGC YoY metrics
   - `v_supply_pipeline` for AAFC balance sheet
   - `get_cot_positioning()` RPC for CFTC data
   - `get_logistics_snapshot()` RPC for port/rail data
   - `usda_export_sales` for USDA demand signal
   - `grain_prices` for recent price data
   - `get_historical_average()` RPC for 5-year comparisons
   - `get_sentiment_overview()` RPC for farmer sentiment
3. Build Data Freshness Card (calculate age of each source vs today)
4. Apply Viking L1 Bull/Bear checklist (count 3-of-5 signals)
5. Consider L3 memory for grain-specific calibration
6. Produce structured output:
   ```json
   {
     "grain": "Wheat",
     "stance_score": -25,
     "conviction_pct": 55,
     "near_term": "bearish",
     "medium_term": "neutral",
     "recommendation": "PATIENCE",
     "bull_case": "...",
     "bear_case": "...",
     "reversal_triggers": [{"trigger": "USDA sales >500K MT", "likelihood": "medium"}],
     "risk_triggers": [{"trigger": "South American harvest larger than expected", "likelihood": "medium"}],
     "review_date": "Week 35 or if reversal trigger fires",
     "data_freshness": {"cgc_age_days": 8, "cot_age_days": 3, ...}
   }
   ```

**Step 2: Test with a single grain**

```bash
hermes run analyze-grain --grain Wheat
```

Expected: Hermes produces a full multi-dimensional thesis following the recommendation philosophy

---

### Task 15: Write `debate-grok` skill

**Files:**
- Create: `~/.hermes/skills/debate-grok.md`

**Step 1: Write the skill — instruct Hermes to:**
1. After producing its own analysis (from `analyze-grain`), call xAI Responses API:
   ```
   POST https://api.x.ai/v1/responses
   {
     "model": "grok-4.20-reasoning",
     "max_output_tokens": 16384,
     "tools": [{"type": "web_search"}, {"type": "x_search"}],
     "input": [
       {"role": "system", "content": "<system prompt with Viking knowledge + debate rules>"},
       {"role": "user", "content": "<data brief + research guidance>"}
     ],
     "text": {
       "format": {
         "type": "json_schema",
         "name": "market_analysis_v2",
         "strict": true,
         "schema": { ... same schema as parallel-debate.ts OUTPUT_SCHEMA ... }
       }
     }
   }
   ```
2. Parse Grok's response — extract stance_score, bull_case, bear_case, key_signals, research_sources
3. Compare Hermes score vs Grok score
4. If divergence > threshold (default 15, check L3 memory for grain-specific adjustment):
   - Build debate prompt challenging Grok's position
   - Call xAI API again with `tools: [web_search, x_search]` — Grok fires more searches
   - Parse DEFEND or CONCEDE response
5. Compute consensus score:
   - If Grok conceded: use debate score
   - If Grok defended: weighted average (Grok 55% / Hermes 45% — Grok has search advantage)
   - If no debate needed: weighted average (Grok 55% / Hermes 45%)

**Step 2: Test with a single grain**

```bash
hermes run debate-grok --grain Wheat
```

Expected: Hermes calls Grok, reports divergence, runs debate if needed, produces consensus

---

### Task 16: Write `publish-thesis` skill

**Files:**
- Create: `~/.hermes/skills/publish-thesis.md`

**Step 1: Write the skill — instruct Hermes to:**
1. Take the consensus results from the debate and write to Supabase:
   - `market_analysis` — bull_case, bear_case, stance_score, key_signals, confidence_score, model_used
   - `grain_intelligence` — thesis_title, thesis_body, recommendation, kpi_data
   - `score_trajectory` — weekly_debate entry with all dimensions
2. After publishing all grains, write to `health_checks`
3. Update L3 memory with debate outcomes (what Hermes got wrong, what Grok found via X)

---

### Task 17: Write `generate-farm-summaries` skill

**Files:**
- Create: `~/.hermes/skills/generate-farm-summaries.md`

This can either instruct Hermes to call the existing `generate-farm-summary` Edge Function (it's marked "Active/reusable" in the transition plan), or replicate the logic directly. Recommend calling the Edge Function initially — it already handles per-user percentiles and contracted positions.

---

## Phase 5: Pulse Scans & Scheduling

### Task 18: Write `pulse-scan` skill

**Files:**
- Create: `~/.hermes/skills/pulse-scan.md`

**Step 1: Write the skill — instruct Hermes to:**
1. Determine which grains to scan (adaptive):
   - Always: Wheat, Canola, Amber Durum, Barley, Oats, Peas
   - Conditionally: check L3 memory for "hot" minor grains
2. Perform web search for grain market news, weather, policy changes
3. Call Grok with lightweight prompt + `x_search` for X/Twitter chatter:
   ```
   "Search X for any market-moving news on [grains] in the last 12 hours.
    Also report the current ICE Canola (RS) and MGEX Spring Wheat (MWE) futures prices."
   ```
4. Evaluate: does any finding justify a >5 point score shift?
   - YES: write to `score_trajectory` (pulse_am or pulse_pm), record trigger + evidence
   - NO: log "no material change" — no write to avoid noise
5. Store any X signals worth surfacing to `x_market_signals`

**Step 2: Test manually**

```bash
hermes run pulse-scan --time morning
```

Expected: Hermes scans web + X, reports findings, writes trajectory entry only if material

---

### Task 19: Write `analyze-price-patterns` skill

**Files:**
- Create: `~/.hermes/skills/analyze-price-patterns.md`

**Step 1: Write the skill — instruct Hermes to:**
1. Query recent `grain_prices` data (last 30/60/90 days)
2. Look for patterns:
   - Day-of-week effects (e.g., Thursday CGC release impact)
   - Weekly momentum (3+ consecutive days in same direction)
   - Monthly seasonal tendencies
   - Cross-grain correlations (e.g., Canola ↔ Soybean Oil spread)
3. Compare to L3 memory — are patterns persisting or breaking?
4. Write new observations to L3 memory if they meet a confidence threshold

This skill runs after `import-prices` daily.

---

### Task 20: Set up VM cron schedule

**Step 1: SSH into the VM and edit crontab**

```bash
crontab -e
```

Add the following entries (all times MST = UTC-7):

```cron
# Thursday 2pm MST (21:00 UTC) — Data scrape
0 21 * * 4 /path/to/hermes run import-cgc && /path/to/hermes run import-usda && /path/to/hermes run scrape-grain-monitor && /path/to/hermes run import-producer-cars && /path/to/hermes run validate-import

# Friday 4:30pm MST (23:30 UTC) — CFTC COT
30 23 * * 5 /path/to/hermes run import-cftc-cot

# Friday 5pm MST (00:00 UTC Saturday) — Full debate + publish
0 0 * * 6 /path/to/hermes run analyze-grain --all && /path/to/hermes run debate-grok --all && /path/to/hermes run publish-thesis && /path/to/hermes run generate-farm-summaries

# M-F 7am MST (14:00 UTC) — Morning pulse scan
0 14 * * 1-5 /path/to/hermes run pulse-scan --time morning

# M-F 1pm MST (20:00 UTC) — Afternoon pulse scan
0 20 * * 1-5 /path/to/hermes run pulse-scan --time afternoon

# M-F 5pm MST (00:00 UTC next day) — Daily price import + pattern analysis
0 0 * * 2-6 /path/to/hermes run import-prices && /path/to/hermes run analyze-price-patterns
```

**Step 2: Verify cron is active**

```bash
crontab -l
```

Expected: All 6 entries visible

**Step 3: Test Thursday pipeline manually first**

Before relying on cron, run the Thursday pipeline manually and verify all data lands correctly:

```bash
hermes run import-cgc
hermes run import-usda
hermes run scrape-grain-monitor
hermes run import-producer-cars
hermes run validate-import
```

Check each table in Supabase for fresh data.

---

### Task 21: End-to-end Friday pipeline test

**Step 1: Run the full Friday pipeline manually**

```bash
hermes run import-cftc-cot
hermes run analyze-grain --all
hermes run debate-grok --all
hermes run publish-thesis
hermes run generate-farm-summaries
```

**Step 2: Verify all outputs in Supabase**

```sql
-- Market analysis
SELECT grain, stance_score, data_confidence, model_used, generated_at
FROM market_analysis ORDER BY generated_at DESC LIMIT 5;

-- Score trajectory
SELECT grain, stance_score, conviction_pct, recommendation, scan_type
FROM score_trajectory WHERE scan_type = 'weekly_debate'
ORDER BY recorded_at DESC LIMIT 5;

-- Grain intelligence
SELECT grain, thesis_title, generated_at
FROM grain_intelligence ORDER BY generated_at DESC LIMIT 5;

-- Farm summaries
SELECT user_id, grain_week, generated_at
FROM farm_summaries ORDER BY generated_at DESC LIMIT 5;
```

Expected: All 16 grains have fresh analysis with multi-dimensional thesis data

**Step 3: Verify dashboard displays correctly**

Open the Bushel Board dashboard and check:
- Grain detail pages show updated thesis
- Stance spectrum bar reflects new score
- Bull/bear cards populated

---

### Task 22: Update CLAUDE.md and STATUS.md

**Files:**
- Modify: `CLAUDE.md` — add Hermes pipeline section, update Intelligence Pipeline section
- Modify: `docs/plans/STATUS.md` — add Track 35 for Hermes Pipeline
- Modify: `README.md` — add compressed log entry

**Step 1: Update CLAUDE.md Intelligence Pipeline section**

Add new subsection documenting:
- Hermes as primary pipeline (GCP VM)
- Edge Functions as fallback
- New tables (usda_export_sales, score_trajectory)
- Cron schedule
- Recommendation types

**Step 2: Update STATUS.md**

Add Track 35: Hermes Pipeline with all tasks marked complete

**Step 3: Update README.md**

Add compressed log entry for Track 35

**Step 4: Commit**

```bash
git add CLAUDE.md docs/plans/STATUS.md README.md
git commit -m "docs: Track 35 — Hermes pipeline replaces paused Edge Function chain"
```

---

## Implementation Order Summary

| Phase | Tasks | Depends On | Environment |
|-------|-------|-----------|-------------|
| 1. Database | 1-3 | Nothing | Bushel Board repo + Supabase |
| 2. VM Setup | 4-7 | Nothing (parallel with Phase 1) | GCP VM SSH |
| 3. Import Skills | 8-13 | Phase 1 (tables) + Phase 2 (VM) | GCP VM |
| 4. Analysis & Debate | 14-17 | Phase 3 (data available) | GCP VM |
| 5. Pulse & Scheduling | 18-22 | Phase 4 (debate working) | GCP VM + Bushel Board repo |

**Phases 1 and 2 can run in parallel.** Everything else is sequential.

**Estimated total:** 22 tasks across 5 phases.
