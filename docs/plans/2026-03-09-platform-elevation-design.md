# Bushel Board Platform Elevation Design

**Date:** 2026-03-09
**Status:** Approved
**Scope:** X Search Intelligence, Supply Truth Consolidation, Percentile Normalization, AI Transparency, UI/UX Overhaul, Community Metrics

---

## Context

Two independent audits (Gemini, GPT-5.4) identified six areas for improvement:

1. X Search queries are unfocused — Grok decides what to search with no explicit hashtags or farmer-relevance filtering
2. Supply data truth is split across three sources (macro_estimates, v_supply_pipeline, AI KPI data) creating conflicting numbers
3. Peer percentiles rank by raw Kt delivered — larger farms always "win"
4. AI-generated insights have no source attribution — farmers can't distinguish CGC data from X social narrative
5. Dashboard visuals are functional but generic — standard Recharts/shadcn without premium feel
6. No community metrics to show platform traction in farmer-relevant terms

### Bugs Fixed Prior to Design (2026-03-09)

| Bug | Fix |
|-----|-----|
| Crop year scoping: my-farm page + getFarmSummary() didn't filter crop_year | Added `.eq("crop_year", CURRENT_CROP_YEAR)` to both queries |
| Sunflower naming: "Sunflower Seed" in client vs "Sunflower" in DB | Changed client constant to "Sunflower" |
| Farm summary batching: stopped after first 50 users | Added self-trigger loop matching generate-intelligence pattern |
| Theme tokens: 20+ hardcoded hex values in chart components | Replaced with `var(--color-*)` CSS variable references |
| README/env: referenced OPENAI_API_KEY | Updated to XAI_API_KEY |

---

## Section 1: X Search Intelligence Layer

### Architecture

New Edge Function `search-x-intelligence` runs as a dedicated pipeline step before `generate-intelligence`:

```
import-cgc-weekly → search-x-intelligence → generate-intelligence → generate-farm-summary
                         ↓                        ↓
                   x_market_signals          grain_intelligence
                   (scored posts)            (reads from signals)
```

### Search Query Builder

Module `search-queries.ts` generates 3-5 targeted queries per grain combining:
- Grain-specific hashtags
- Seasonal topic context
- Geographic scope (Canada / prairies / western Canada)

#### Hashtag Mappings

| Grain | Base Hashtags |
|-------|--------------|
| Canola | #Canola, #westcdnag, #CanolaCouncil |
| CWRS Wheat | #wheat, #CWRS, #westcdnag |
| Amber Durum | #durum, #durumwheat, #pasta |
| Barley | #barley, #maltbarley, #feedbarley |
| Oats | #oats, #oatmarket |
| Peas | #peas, #pulses, #CDNpulses |
| Lentils | #lentils, #pulses, #CDNlentils |
| Flaxseed | #flax, #flaxseed |
| Soybeans | #soybeans, #CDNsoy |
| Mustard Seed | #mustard, #mustardmarket |
| Corn | #corn, #CDNcorn |
| Rye | #rye, #ryemarket |
| Chick Peas | #chickpeas, #desi, #kabuli |
| Sunflower | #sunflower, #sunflowermarket |
| Canaryseed | #canaryseed |
| Beans | #drybeans, #CDNbeans |

#### Seasonal Context Engine

| Season | Months | Topics |
|--------|--------|--------|
| Seeding | Mar-May | soil moisture, input costs, seed availability, acreage intentions |
| Growing | Jun-Aug | crop conditions, weather stress, yield estimates, satellite imagery |
| Harvest | Sep-Nov | quality reports, combines rolling, elevator congestion, basis levels |
| Marketing | Dec-Feb | carry-out projections, export pace, futures spreads, farmer selling pace |

### Relevance Scoring

Grok call with x_search per query batch, then a lightweight second pass scoring each post:

- **Relevance** (0-100): Is this about Canadian prairie grain markets?
- **Sentiment**: bullish / bearish / neutral
- **Category**: farmer_report | analyst_commentary | elevator_bid | export_news | weather | policy | other
- **Confidence** (0-100): Classification confidence

Only posts scoring relevance ≥ 60 are stored.

### New Table: `x_market_signals`

```sql
CREATE TABLE x_market_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  post_summary text NOT NULL,
  post_author text,
  post_date timestamptz,
  relevance_score int NOT NULL,
  sentiment text NOT NULL,
  category text NOT NULL,
  confidence_score int NOT NULL,
  search_query text NOT NULL,
  raw_context jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(grain, crop_year, grain_week, post_summary)
);

CREATE INDEX idx_xms_grain_week ON x_market_signals(grain, crop_year, grain_week);
```

### Updated `generate-intelligence`

- Reads top 10 scored posts from `x_market_signals` (by relevance × confidence) instead of using live x_search
- Injects pre-scored social signals as context in the prompt
- Deterministic, reproducible outputs

### Cost Impact

+~$0.04/weekly run for the search function. Total pipeline: ~$0.08/week.

---

## Section 2: Supply Truth Consolidation

### Problem

Three sources create conflicting numbers:
- `macro_estimates`: StatsCan Nov 2025 production forecast (static, stale)
- `supply_disposition` + `v_supply_pipeline`: AAFC official balance sheet (national)
- `grain_intelligence.kpi_data`: AI-synthesized KPI values (from CGC + AAFC mix)

"Remaining On-Farm" mixes national AAFC total supply with prairie-only CGC deliveries — indefensible grain accounting.

### Source Precedence Rule

1. **AAFC `supply_disposition`** is canonical for all balance sheet numbers (production, carry-in, total supply, exports, crush, carry-out)
2. **CGC `cgc_observations`** is canonical for weekly delivery, shipment, stock metrics (prairie-scoped)
3. **`macro_estimates` is deprecated** — remove from grain detail page queries
4. **`grain_intelligence.kpi_data`** is display-only narrative context — never extract values for calculations

### Metric Changes

| Old | New | Rationale |
|-----|-----|-----------|
| "Remaining On-Farm" (total_supply - cy_deliveries) | **Removed** | Mixes national + provincial scope |
| SupplyWidget (from macro_estimates) | **Replaced** with compact SupplyPipeline | Single source |
| — | **"Delivered % of Total Supply"** ratio | Directionally meaningful without pretending to be accounting |

---

## Section 3: Percentile Normalization

### Problem

`calculate_delivery_percentiles()` ranks by `total_delivered_kt` (raw tonnage). Larger farms always rank higher regardless of efficiency.

### New Metric: Delivery Pace %

Formula: `(total_delivered_kt / planned_volume_kt) * 100`

What percentage of your planned volume have you moved? Normalizes across farm sizes.

```sql
CREATE OR REPLACE FUNCTION calculate_delivery_percentiles(
  p_crop_year text DEFAULT '2025-26'
)
RETURNS TABLE (
  user_id uuid,
  grain text,
  total_delivered_kt numeric,
  delivery_pace_pct numeric,
  percentile_rank numeric
)
AS $$
  WITH user_totals AS (
    SELECT
      cp.user_id,
      cp.grain,
      COALESCE(
        (SELECT SUM((d->>'amount_kt')::numeric)
         FROM jsonb_array_elements(cp.deliveries) AS d),
        0
      ) AS total_delivered_kt,
      cp.planned_volume_kt,
      cp.acres_seeded
    FROM crop_plans cp
    WHERE cp.crop_year = p_crop_year
      AND cp.deliveries IS NOT NULL
      AND jsonb_array_length(cp.deliveries) > 0
  )
  SELECT
    ut.user_id,
    ut.grain,
    ut.total_delivered_kt,
    CASE
      WHEN ut.planned_volume_kt > 0
        THEN (ut.total_delivered_kt / ut.planned_volume_kt) * 100
      WHEN ut.acres_seeded > 0
        THEN (ut.total_delivered_kt / ut.acres_seeded) * 1000
      ELSE 0
    END AS delivery_pace_pct,
    (PERCENT_RANK() OVER (
      PARTITION BY ut.grain
      ORDER BY
        CASE
          WHEN ut.planned_volume_kt > 0
            THEN ut.total_delivered_kt / ut.planned_volume_kt
          WHEN ut.acres_seeded > 0
            THEN ut.total_delivered_kt / NULLIF(ut.acres_seeded, 0)
          ELSE 0
        END
    )) * 100 AS percentile_rank
  FROM user_totals ut;
$$
LANGUAGE sql STABLE;
```

### UI Changes

- Badge text: "Top X% of farmers" → "Xth percentile delivery pace"
- Tooltip explaining: "Ranked by % of planned volume delivered, not absolute tonnage"

---

## Section 4: AI Transparency Layer

### Source Badges

Every insight card gets source attribution badges:

| Badge | Meaning | Color |
|-------|---------|-------|
| `CGC` | Official Canadian Grain Commission data | wheat-700 |
| `AAFC` | Agriculture & Agri-Food Canada balance sheet | prairie |
| `X` | X/Twitter social signal | canola |
| `Derived` | Calculated from multiple sources | muted |

Stored in insights JSONB: `{ signal, title, body, sources: ["CGC", "X"], confidence: "high" }`

### X Citation Metadata

InsightCards with `signal: "social"` link to underlying `x_market_signals` entries:
- Post summary, author handle, timestamp visible in an expandable "Evidence drawer"
- Drawer shows the raw scored X posts behind each social insight

### Confidence Indicator

- Each insight gets confidence: `high` / `medium` / `low`
- Visual: subtle border opacity treatment (not a numeric score)
- High = solid border, Medium = 70% opacity, Low = 40% opacity

---

## Section 5: UI/UX Overhaul

### Motion Design System

Reusable animation primitives built on framer-motion, respecting `prefers-reduced-motion`:

| Primitive | Purpose |
|-----------|---------|
| `AnimatedCard` | Staggered reveal (spring easing), hover lift (-2px), exit fade |
| `CountUp` | Animated number transitions on KPI values (0 → target, 800ms) |
| `PageTransition` | Skeleton → data → reveal orchestration per route |
| `StaggerGroup` | 40ms delay between siblings, configurable |

### Custom Visualizations

#### 1. Animated Grain Elevator (replaces StockMapWidget)
SVG grain bins that fill based on commercial stock levels. Visual metaphor every farmer understands. Three bins: Primary, Terminal, Process — fill level animated, color-coded.

#### 2. Supply Flow Sankey (replaces WaterfallChart)
Animated flow diagram: carry-in + production → deliveries/exports/crush → carry-out. Shows *flow* not just *bars*. Nodes sized by Kt, animated path lines.

#### 3. Prairie Pulse Map (replaces ProvincialCards)
Stylized Canada map with AB/SK/MB as pulsing nodes. Node size = delivery volume, pulse rate = week-over-week change. Color-coded by pace vs. last year (green = ahead, amber = behind).

#### 4. Signal Tape (new)
Horizontal scrolling ticker showing latest market signals from `x_market_signals`. Styled like a trading terminal — monospace font, signal-colored dots (bullish green, bearish red, watch amber, social canola).

### Dashboard Layout Evolution

```
┌─────────────────────────────────────────────────┐
│ Thesis Banner (sticky)          Signal Tape →→→  │
├─────────────────────────────────────────────────┤
│ YOUR POSITION                                    │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│ │ Delivery     │ │ Pace vs     │ │ Percentile  ││
│ │ Progress     │ │ Market      │ │ Ranking     ││
│ └─────────────┘ └─────────────┘ └─────────────┘│
├─────────────────────────────────────────────────┤
│ MARKET SIGNALS                                   │
│ ┌──────────────────┐ ┌────────────────────────┐ │
│ │ KPIs (CountUp)   │ │ Insight Cards          │ │
│ │ with source      │ │ [CGC] [X] [AAFC]      │ │
│ │ badges           │ │ + evidence drawer      │ │
│ └──────────────────┘ └────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ DECISION WINDOW                                  │
│ ┌──────────────────┐ ┌────────────────────────┐ │
│ │ Supply Sankey     │ │ Prairie Pulse Map      │ │
│ │ (flow diagram)    │ │ (AB/SK/MB nodes)       │ │
│ └──────────────────┘ └────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐│
│ │ Grain Elevator (stock visualization)          ││
│ └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

---

## Section 6: Community Metrics Banner

### Purpose

Social proof in farmer-relevant terms. "Monitoring 250,000 tonnes across 567,000 acres" is more compelling than "250 users."

### Database

```sql
CREATE MATERIALIZED VIEW v_community_stats AS
SELECT
  SUM(acres_seeded) AS total_acres,
  SUM(planned_volume_kt) * 1000 AS total_tonnes,
  COUNT(DISTINCT grain) AS grain_count,
  COUNT(DISTINCT user_id) AS farmer_count
FROM crop_plans
WHERE crop_year = '2025-26';
```

Refreshed on each weekly import via `REFRESH MATERIALIZED VIEW v_community_stats` in `import-cgc-weekly`.

### Display

| Placement | Format | Animation |
|-----------|--------|-----------|
| Landing page hero | "Monitoring {tonnes} tonnes of grain across {acres} acres" | CountUp on scroll into view |
| Dashboard footer | Subtle community stat bar | Static, updates weekly |

### Privacy

- Aggregate only — no individual farm data exposed
- Minimum threshold: don't display if fewer than 10 farmers
- No breakdown by province or grain (prevents reverse-engineering)

---

## Implementation Priority

1. **Supply truth consolidation** — fixes data integrity (blocks other work)
2. **X Search Intelligence Layer** — new Edge Function + table
3. **AI Transparency Layer** — source badges + evidence drawer
4. **Percentile normalization** — SQL migration + UI update
5. **Community Metrics** — materialized view + banner component
6. **Motion Design System** — animation primitives
7. **Custom Visualizations** — elevator, Sankey, pulse map, signal tape
8. **Dashboard Layout** — reorganize around position/signals/decisions

---

## Non-Goals

- Real-time X streaming (weekly batch is sufficient)
- Mobile app (responsive web is the target)
- Price prediction or financial advice
- Individual farm data exposure in community metrics
