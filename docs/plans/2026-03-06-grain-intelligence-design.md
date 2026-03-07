# Grain Intelligence — AI-Powered Market Narratives

**Date:** 2026-03-06
**Status:** Approved
**Goal:** Transform each grain detail page from raw data display into AI-driven market intelligence with thesis narratives, bullish/bearish insight cards, supply pipeline visualizations, and year-over-year comparisons.

**Design Reference:** Bushels Energy Canola Week 30 report (vanilla HTML prototype in project root)

---

## Architecture Overview

```
Weekly Pipeline (Thursday):
pg_cron → import-cgc-weekly → generate-intelligence → grain_intelligence table
                                      ↓
                               Claude Sonnet API (×16 grains)
                                      ↓
                            Thesis + Insights + KPIs per grain

Dashboard reads grain_intelligence at page load (no AI calls at render time)
```

---

## Data Layer

### Prior Year Backfill
- Load `data/2024gsw-shg-en.csv` (219k rows, full 2024-2025 crop year) into `cgc_observations`
- Same table, different `crop_year` value — enables YoY queries with simple WHERE clauses

### New Table: `grain_intelligence`

```sql
CREATE TABLE grain_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week int NOT NULL,

  -- Thesis narrative
  thesis_title text,          -- e.g. "The Withholding Thesis"
  thesis_body text,           -- 2-3 sentence data-driven narrative

  -- Insight cards (JSONB array)
  insights jsonb DEFAULT '[]',
  -- Each element: { signal: "bullish"|"bearish"|"watch", title: string, body: string }

  -- Pre-computed KPI context for fast rendering
  kpi_data jsonb DEFAULT '{}',
  -- Keys: cy_deliveries_kt, yoy_deliveries_pct, cw_deliveries_kt, wow_deliveries_pct,
  --        cy_exports_kt, yoy_exports_pct, cy_crush_kt, yoy_crush_pct,
  --        commercial_stocks_kt, wow_stocks_change_kt,
  --        total_supply_mmt, delivered_pct, on_farm_estimate_mmt

  generated_at timestamptz DEFAULT now(),
  model_used text DEFAULT 'claude-sonnet-4-5-20250514',

  UNIQUE(grain, crop_year, grain_week)
);

-- RLS: publicly readable, only service_role can write
ALTER TABLE grain_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Intelligence is publicly readable" ON grain_intelligence FOR SELECT USING (true);
CREATE POLICY "Only service role can modify intelligence" ON grain_intelligence FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Only service role can update intelligence" ON grain_intelligence FOR UPDATE USING (auth.role() = 'service_role');
```

### New SQL Views

**`v_grain_yoy_comparison`** — Side-by-side current vs. prior year metrics:
- Joins current crop year with prior crop year on matching grain_week
- Returns: grain, grain_week, current/prior values for deliveries, exports, crush, stocks
- Computes YoY percentage changes

**`v_supply_pipeline`** — AAFC supply minus CY deliveries:
- Joins `supply_disposition` (production, carry_in) with CY cumulative deliveries
- Returns: grain, total_supply, cy_delivered, on_farm_estimate, pct_delivered

---

## Intelligence Generation Pipeline

### Edge Function: `generate-intelligence`

**Trigger:** Called by `import-cgc-weekly` on successful import via pg_net HTTP POST

**Process per grain (16 Canadian grains):**
1. Query `v_grain_yoy_comparison` for latest week
2. Query `v_supply_pipeline` for supply context
3. Query latest commercial stocks and storage breakdown
4. Call Claude Sonnet API with structured prompt + data JSON
5. Parse response and upsert into `grain_intelligence`

**Claude Prompt Template:**
```
You are a grain market analyst writing for Canadian prairie farmers.
Analyze the following data for {grain}, Week {week} of crop year {crop_year}.

DATA:
{structured JSON with all metrics, YoY comparisons, supply balance}

Generate a JSON response with:
1. thesis_title: 5-8 word market thesis (e.g. "The Withholding Thesis")
2. thesis_body: 2-3 sentences, data-driven, reference specific numbers
3. insights: Array of 3-6 objects, each with:
   - signal: "bullish" | "bearish" | "watch"
   - title: 4-8 word headline
   - body: 2-3 sentences with specific data points
4. kpi_data: Pre-formatted display values with context
```

**Cost:** ~$0.10-0.30/week (16 Sonnet calls, ~2.5k tokens each)

**Error Handling:** If Claude API fails for a grain, log to `cgc_imports` and skip — don't block other grains. Dashboard shows "Intelligence unavailable" fallback.

### Trigger Chain Addition

Update `import-cgc-weekly` Edge Function to call `generate-intelligence` after successful data import:
```typescript
// After successful import, trigger intelligence generation
await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-intelligence`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
  },
  body: JSON.stringify({ crop_year, grain_week: targetWeek }),
});
```

---

## UI Components

### 1. Thesis Banner (`components/dashboard/thesis-banner.tsx`)
- Full-width card at top of grain detail page
- Gold left-border accent (4px canola-colored bar)
- "ACTIVE THESIS" label in small caps
- `thesis_title` as heading, `thesis_body` as paragraph
- Subtle gradient background (canola-50 to transparent)

### 2. Enhanced KPI Cards (`components/dashboard/intelligence-kpis.tsx`)
4-card grid replacing current basic metrics:
- **Producer Deliveries**: This week Kt + WoW% + CY total + YoY%
- **Commercial Stocks**: Current Kt + WoW change Kt
- **Exports**: This week Kt + CY total + YoY%
- **Crush/Processing**: This week Kt + CY total + YoY%

Color coding: green for positive YoY, red for negative, gold for highlight card.

### 3. Supply Pipeline Waterfall (`components/dashboard/supply-pipeline.tsx`)
Horizontal bar visualization (custom, not Recharts):
- Row 1: Carry-in (orange bar)
- Row 2: Production (green bar)
- Row 3: = Total Supply (gold bar, bordered)
- Row 4: Delivered to date (blue bar)
- Row 5: Remaining on-farm (red bar, offset from delivered)
- Percentage callout boxes below: "X% delivered", "Y% on-farm", "+/-Kt vs last year"

### 4. Insight Cards (`components/dashboard/insight-cards.tsx`)
3-column responsive grid:
- Each card: colored top border (green=bullish, red=bearish, gold=watch)
- Signal icon, title, body text
- Subtle card background matching signal color at 5% opacity

### Grain Detail Page Layout (updated order):
1. Header (grain name, back button) — existing
2. **Thesis Banner** — NEW
3. **Intelligence KPIs** — NEW (replaces basic metrics)
4. **Supply Pipeline Waterfall** — NEW
5. **Insight Cards** — NEW
6. Flow breakdown + stock map — existing
7. Provincial cards — existing
8. Pace chart + gamified chart — existing

---

## Agent Swarm Roles

| Agent | Responsibility | Quality Gate |
|-------|---------------|-------------|
| **ultra-agent** | Reviews every deliverable before merge | Final approval on all PRs |
| **innovation-agent** | Claude prompt engineering, signal taxonomy, intelligence schema | ultra-agent reviews prompt quality |
| **ux-agent** | Information hierarchy, page layout order, mobile responsiveness | ultra-agent reviews UX decisions |
| **ui-agent** | Component implementation (thesis banner, insight cards, pipeline waterfall, KPIs) | ultra-agent + ux-agent review |
| **db-architect** | `grain_intelligence` migration, YoY view, `generate-intelligence` Edge Function | ultra-agent reviews SQL |
| **frontend-dev** | Data queries, page integration, wiring components to intelligence data | ultra-agent reviews code |
| **documentation-agent** | Pipeline docs, prompt template reference, updated architecture docs | Runs after each major milestone |
| **auth-engineer** | RLS policies for `grain_intelligence`, verify public read access | ultra-agent reviews security |

---

## Implementation Sequence

### Phase 1: Data Foundation
1. Backfill 2024-2025 CGC data (219k rows)
2. Create `grain_intelligence` table + RLS
3. Create `v_grain_yoy_comparison` and `v_supply_pipeline` views

### Phase 2: Intelligence Pipeline
4. Design Claude prompt template (innovation-agent)
5. Build `generate-intelligence` Edge Function (db-architect)
6. Update `import-cgc-weekly` to trigger intelligence generation
7. Store Anthropic API key in Vault
8. Test: manually trigger for current week, verify output quality

### Phase 3: UI Components
9. Build thesis banner component (ui-agent)
10. Build enhanced KPI cards (ui-agent)
11. Build supply pipeline waterfall (ui-agent)
12. Build insight cards (ui-agent)
13. Wire into grain detail page (frontend-dev)

### Phase 4: Integration & Polish
14. Data query layer for intelligence (frontend-dev)
15. Fallback UI when intelligence unavailable
16. Mobile responsiveness pass (ux-agent)
17. Full agent review (ultra-agent)
18. Documentation update (documentation-agent)

---

## Success Criteria

- Every grain detail page shows AI-generated thesis + insights within 100ms of page load
- Year-over-year comparisons accurate against prior year data
- Supply pipeline waterfall matches AAFC balance sheet numbers
- Intelligence auto-regenerates every Thursday after data import
- All 8 agents contribute meaningfully to their designated areas
- Ultra-agent signs off on final quality
