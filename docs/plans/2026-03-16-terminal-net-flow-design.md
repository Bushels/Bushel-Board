# Terminal Net Flow Visualization — Design Doc

**Date:** 2026-03-16
**Status:** Approved
**Author:** Claude (Opus) + Kyle
**Tracks:** Dashboard Visualization

## Problem

Bushel Board's existing pipeline visualizations show **cumulative** grain movement (PaceChart) and **point-in-time** snapshots (WoW comparison, NetBalanceKpi). Neither reveals the **weekly flow direction** — whether terminals are building or drawing down stock in a given week. This weekly rhythm is the actionable signal for farmers deciding when to haul grain to the elevator.

The prototype HTML chart demonstrated a "Terminal Net Flow" concept: diverging green/red bars showing `Receipts - Exports` per week, with overlay trend lines. This design integrates that concept into Bushel Board as two components.

## Solution: Approach C — Narrative Banner + Inline Chart

### Component 1: LogisticsBanner (Overview Page)

**Placement:** Bottom of Section 1 (Prairie Snapshot), below crop summary cards grid. Stays within the existing 3-section layout.

**Data source:** `get_logistics_snapshot` RPC — system-wide grain_monitor + producer_cars. Called once in Overview's `Promise.all`.

**Visual structure:**
- **Narrative headline** (Fraunces bold): Rules-based, auto-generated from data thresholds
- **Stat pills row** (3-4 pills): Vessels at Vancouver (vs 1yr avg), Out-of-Car Time %, YTD Shipments Kt (with YoY %), Terminal Capacity %
- **Compact all-grain net flow sparkline** (~100px tall): Mini diverging bars for system-wide terminal receipts vs exports across the crop year. No axis labels, just green/red bars with a zero line.

**Headline generation rules (pure function, no AI):**
- `vessels_vancouver > vessel_avg_one_year_vancouver` → "X Ships Waiting" variant
- `ytd_shipments_yoy_pct > 5` → "Export Pace Accelerating" variant
- `out_of_car_time_pct > 20` → "Rail Bottleneck" variant
- Fallback: "Terminal Flow Update — Week X"

**Why rules-based, not AI:** The intelligence pipeline runs weekly on Thursdays. Logistics headlines need to be deterministic and instant — no LLM latency or cost. Simple threshold rules on 3-4 metrics are sufficient.

### Component 2: TerminalFlowChart (Grain Detail Page)

**Placement:** Section 2 (Supply & Movement), between PaceChart (GamifiedGrainChart) and SupplyPipeline. New `AnimatedCard` at index 1; existing components shift down.

**Data source:** New `get_weekly_terminal_flow(p_grain, p_crop_year)` RPC returning `period = 'Current Week'` terminal receipts and exports per grain week, summing all grades server-side.

**Why a new RPC (not deriving from cumulative):** The existing `get_pipeline_velocity` returns cumulative (`period = 'Crop Year'`) data. Differencing consecutive cumulative values breaks when forward-fill logic carries values forward — producing false zero-flow weeks. A dedicated RPC querying `period = 'Current Week'` gives clean, direct weekly measurements.

**Chart (Recharts ComposedChart):**
- **Bar series:** `net_flow = receipts_kt - exports_kt`. Green fill (prairie/65) when positive, red fill (destructive/65) when negative. `borderRadius: 3`.
- **Line series:** Terminal Receipts (solid, sk-province blue) and Exports (dashed, canola amber). `tension: 0.3`, no point dots.
- **X-axis:** Grain weeks (Wk1–Wk52). `maxTicksLimit: 16`.
- **Y-axis:** "000's Tonnes" label.
- **Tooltip:** "Building +X Kt" (green) or "Drawing -X Kt" (red) for bars; raw values for lines.

**System-wide logistics context:** Above the chart, a compact row of 3 stat badges showing system-wide metrics (vessels, OCT, YTD shipments) with a "System-wide" label to distinguish from the per-grain chart below. Data from `get_logistics_snapshot`.

## Shared Primitives

### LogisticsStatPill

Reusable pill component for stat badges.

```typescript
interface LogisticsStatPillProps {
  label: string;
  value: string | number;
  unit?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sublabel?: string;
}
```

Used in both LogisticsBanner and TerminalFlowChart header.

### generateLogisticsHeadline(monitor)

Pure function returning `{ headline: string; subtext: string }` from grain_monitor data. Used by LogisticsBanner.

### Color/Signal Thresholds

| Metric | Green (positive) | Amber (neutral) | Red (concerning) |
|--------|-----------------|-----------------|-----------------|
| Vessels at Vancouver | <= avg | avg+1 to avg+5 | > avg+5 |
| Out-of-Car Time | < 10% | 10-20% | > 20% |
| YTD Shipments YoY | > +3% | -3% to +3% | < -3% |
| Net flow bar | Receipts > Exports | -- | Exports > Receipts |

## Data Architecture

### New RPC: `get_weekly_terminal_flow`

```sql
CREATE OR REPLACE FUNCTION public.get_weekly_terminal_flow(
  p_grain text,
  p_crop_year text DEFAULT '2025-2026'
)
RETURNS TABLE (
  grain_week smallint,
  week_ending_date date,
  terminal_receipts_kt numeric,
  exports_kt numeric,
  net_flow_kt numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH receipts AS (
    SELECT grain_week, week_ending_date::date,
           SUM(ktonnes) AS terminal_receipts_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Receipts'
      AND metric = 'Receipts'
      AND period = 'Current Week'
      AND grain = p_grain
      AND crop_year = p_crop_year
    GROUP BY grain_week, week_ending_date
  ),
  exports AS (
    SELECT grain_week,
           SUM(ktonnes) AS exports_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Exports'
      AND metric = 'Exports'
      AND period = 'Current Week'
      AND grain = p_grain
      AND crop_year = p_crop_year
    GROUP BY grain_week
  )
  SELECT
    COALESCE(r.grain_week, e.grain_week) AS grain_week,
    r.week_ending_date,
    COALESCE(r.terminal_receipts_kt, 0) AS terminal_receipts_kt,
    COALESCE(e.exports_kt, 0) AS exports_kt,
    COALESCE(r.terminal_receipts_kt, 0) - COALESCE(e.exports_kt, 0) AS net_flow_kt
  FROM receipts r
  FULL OUTER JOIN exports e ON r.grain_week = e.grain_week
  ORDER BY grain_week;
$$;
```

**Key patterns:**
- FULL OUTER JOIN (receipts and exports may not cover same weeks)
- SUM all grades (no `grade=''` aggregate for Terminal worksheets)
- Server-side aggregation (bypasses PostgREST 1000-row limit)

### System-Wide Aggregate Variant

For the Overview sparkline, we need all-grain aggregate net flow. Two options:
- **Option A:** Call `get_weekly_terminal_flow` with no grain filter (requires a second RPC or parameter override)
- **Option B (recommended):** Create `get_weekly_terminal_flow_aggregate(p_crop_year)` that omits the grain filter and sums across all grains

### New Query Module: `lib/queries/logistics.ts`

```typescript
interface LogisticsSnapshot {
  grain_monitor: {
    grain_week: number;
    report_date: string;
    vessels_vancouver: number;
    vessel_avg_one_year_vancouver: number;
    out_of_car_time_pct: number;
    ytd_shipments_total_kt: number;
    ytd_shipments_yoy_pct: number;
    terminal_capacity_pct: number;
    country_deliveries_kt: number;
    total_unloads_cars: number;
    // ... additional fields
  } | null;
  producer_cars: Array<{
    grain: string;
    grain_week: number;
    cy_cars_total: number;
    week_cars: number;
  }>;
}

interface WeeklyTerminalFlow {
  grain_week: number;
  week_ending_date: string;
  terminal_receipts_kt: number;
  exports_kt: number;
  net_flow_kt: number;
}

export async function getLogisticsSnapshot(
  cropYear: string,
  grainWeek: number
): Promise<LogisticsSnapshot | null>;

export async function getWeeklyTerminalFlow(
  grain: string,
  cropYear?: string
): Promise<WeeklyTerminalFlow[]>;

export async function getAggregateTerminalFlow(
  cropYear?: string
): Promise<WeeklyTerminalFlow[]>;
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `components/dashboard/logistics-banner.tsx` | Create | Overview logistics narrative banner + sparkline |
| `components/dashboard/terminal-flow-chart.tsx` | Create | Per-grain diverging bar + line chart |
| `components/dashboard/logistics-stat-pill.tsx` | Create | Shared stat pill component |
| `lib/queries/logistics.ts` | Create | Logistics + terminal flow query functions |
| `supabase/migrations/XXXXX_weekly_terminal_flow_rpc.sql` | Create | `get_weekly_terminal_flow` + aggregate variant RPCs |
| `app/(dashboard)/overview/page.tsx` | Modify | Add LogisticsBanner to Section 1 |
| `app/(dashboard)/grain/[slug]/page.tsx` | Modify | Add TerminalFlowChart + logistics fetch to Section 2 |

## Farmer Decision Scenarios

1. **"Should I haul this week?"** — Red bars (exports > receipts) mean terminals are actively shipping. Elevator line-ups are shorter, basis may tighten. Good week to deliver.
2. **"Is the port congested?"** — 26 vessels + high OCT means grain is arriving at port but not loading fast enough. Terminals may slow receipts, widening basis. Consider waiting.
3. **"Is my grain in demand?"** — Sustained red bars on a specific grain's chart = strong export pull. Combined with bullish AI thesis, supports holding for better prices or delivering while basis is favorable.

## Design Tokens

All components follow existing Bushel Board tokens:
- Background: `card/40` with `backdrop-blur-sm`
- Border: `border-border/40`, hover `border-canola/30`
- Fonts: Fraunces for headlines/values, DM Sans for labels
- Animation: `AnimatedCard` with 40ms stagger
- Pills: Rounded-full with sentiment-colored borders (matching existing pattern in ThesisBanner)

## Not In Scope

- AI-generated logistics narratives (keep rules-based for now; revisit when intelligence pipeline has logistics context)
- Historical year overlay on the net flow chart (future enhancement)
- Per-port breakdown of terminal flow (data exists but adds complexity; defer to v2)
- Mobile-specific layout (existing responsive patterns in Recharts handle this)
