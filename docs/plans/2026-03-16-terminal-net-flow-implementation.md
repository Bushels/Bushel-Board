# Terminal Net Flow Visualization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a narrative logistics banner to the Overview page and a per-grain terminal net flow chart to grain detail pages, showing weekly receipts vs exports with green/red diverging bars.

**Architecture:** Two new components (LogisticsBanner, TerminalFlowChart) backed by a new Supabase RPC (`get_weekly_terminal_flow`) and a query module (`lib/queries/logistics.ts`). A shared LogisticsStatPill component and `generateLogisticsHeadline` pure function provide the narrative layer. System-wide logistics data comes from the existing `get_logistics_snapshot` RPC.

**Tech Stack:** Next.js 16 (App Router), Recharts (ComposedChart), Supabase RPC, Vitest, TypeScript

**Design Doc:** `docs/plans/2026-03-16-terminal-net-flow-design.md`

---

### Task 1: Create `get_weekly_terminal_flow` RPC Migration

**Files:**
- Create: `supabase/migrations/20260316120000_weekly_terminal_flow_rpc.sql`

**Step 1: Write the migration SQL**

Create a new migration file with two RPC functions:

```sql
-- Per-grain weekly terminal flow (receipts vs exports)
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
    SELECT grain_week, MIN(week_ending_date::date) AS week_ending_date,
           SUM(ktonnes) AS terminal_receipts_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Receipts'
      AND metric = 'Receipts'
      AND period = 'Current Week'
      AND grain = p_grain
      AND crop_year = p_crop_year
    GROUP BY grain_week
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
    COALESCE(r.grain_week, e.grain_week)::smallint AS grain_week,
    r.week_ending_date,
    COALESCE(r.terminal_receipts_kt, 0) AS terminal_receipts_kt,
    COALESCE(e.exports_kt, 0) AS exports_kt,
    COALESCE(r.terminal_receipts_kt, 0) - COALESCE(e.exports_kt, 0) AS net_flow_kt
  FROM receipts r
  FULL OUTER JOIN exports e ON r.grain_week = e.grain_week
  ORDER BY grain_week;
$$;

-- System-wide aggregate (all grains) for Overview sparkline
CREATE OR REPLACE FUNCTION public.get_aggregate_terminal_flow(
  p_crop_year text DEFAULT '2025-2026'
)
RETURNS TABLE (
  grain_week smallint,
  terminal_receipts_kt numeric,
  exports_kt numeric,
  net_flow_kt numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH receipts AS (
    SELECT grain_week,
           SUM(ktonnes) AS terminal_receipts_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Receipts'
      AND metric = 'Receipts'
      AND period = 'Current Week'
      AND crop_year = p_crop_year
    GROUP BY grain_week
  ),
  exports AS (
    SELECT grain_week,
           SUM(ktonnes) AS exports_kt
    FROM cgc_observations
    WHERE worksheet = 'Terminal Exports'
      AND metric = 'Exports'
      AND period = 'Current Week'
      AND crop_year = p_crop_year
    GROUP BY grain_week
  )
  SELECT
    COALESCE(r.grain_week, e.grain_week)::smallint AS grain_week,
    COALESCE(r.terminal_receipts_kt, 0) AS terminal_receipts_kt,
    COALESCE(e.exports_kt, 0) AS exports_kt,
    COALESCE(r.terminal_receipts_kt, 0) - COALESCE(e.exports_kt, 0) AS net_flow_kt
  FROM receipts r
  FULL OUTER JOIN exports e ON r.grain_week = e.grain_week
  ORDER BY grain_week;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_weekly_terminal_flow(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_terminal_flow(text) TO authenticated, anon;
```

**Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: Migration applied successfully. Verify with:
```
SELECT * FROM get_weekly_terminal_flow('Canola', '2025-2026') LIMIT 5;
SELECT * FROM get_aggregate_terminal_flow('2025-2026') LIMIT 5;
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260316120000_weekly_terminal_flow_rpc.sql
git commit -m "feat(db): add get_weekly_terminal_flow and aggregate RPCs"
```

---

### Task 2: Create `lib/queries/logistics.ts` Query Module

**Files:**
- Create: `lib/queries/logistics.ts`
- Create: `tests/lib/logistics-headline.test.ts`

**Step 1: Write the failing test for `generateLogisticsHeadline`**

This is the pure function that generates narrative headlines from grain monitor data. Test it first since it has no Supabase dependency.

```typescript
// tests/lib/logistics-headline.test.ts
import { describe, it, expect } from "vitest";
import { generateLogisticsHeadline } from "@/lib/queries/logistics";

describe("generateLogisticsHeadline", () => {
  it("returns vessel congestion headline when vessels exceed average", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 26,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 12,
      ytd_shipments_yoy_pct: 3,
      grain_week: 30,
    });
    expect(result.headline).toContain("26");
    expect(result.headline).toContain("Ship");
  });

  it("returns rail bottleneck headline when OCT is high", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 18,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 25,
      ytd_shipments_yoy_pct: 2,
      grain_week: 30,
    });
    expect(result.headline).toContain("Rail");
  });

  it("returns export pace headline when YoY shipments are strong", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 18,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 8,
      ytd_shipments_yoy_pct: 8,
      grain_week: 30,
    });
    expect(result.headline).toContain("Export");
  });

  it("returns fallback headline when no thresholds triggered", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 19,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 12,
      ytd_shipments_yoy_pct: 1,
      grain_week: 30,
    });
    expect(result.headline).toContain("Week 30");
  });

  it("prioritizes vessel congestion over other signals", () => {
    const result = generateLogisticsHeadline({
      vessels_vancouver: 30,
      vessel_avg_one_year_vancouver: 20,
      out_of_car_time_pct: 25,
      ytd_shipments_yoy_pct: 10,
      grain_week: 30,
    });
    expect(result.headline).toContain("Ship");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/logistics-headline.test.ts`
Expected: FAIL — module not found

**Step 3: Write the query module with headline generator**

```typescript
// lib/queries/logistics.ts
import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

// ─── Types ─────────────────────────────────────────────

export interface WeeklyTerminalFlow {
  grain_week: number;
  week_ending_date: string | null;
  terminal_receipts_kt: number;
  exports_kt: number;
  net_flow_kt: number;
}

export interface LogisticsSnapshot {
  grain_monitor: {
    grain_week: number;
    report_date: string;
    vessels_vancouver: number;
    vessel_avg_one_year_vancouver: number;
    vessels_prince_rupert: number;
    out_of_car_time_pct: number;
    total_unloads_cars: number;
    var_to_four_week_avg_pct: number;
    ytd_shipments_total_kt: number;
    ytd_shipments_yoy_pct: number;
    country_stocks_kt: number;
    country_capacity_pct: number;
    terminal_stocks_kt: number;
    terminal_capacity_pct: number;
    country_deliveries_kt: number;
    country_deliveries_yoy_pct: number;
    weather_notes: string | null;
    provincial_stocks: { mb_kt: number; sk_kt: number; ab_kt: number };
    port_stocks: {
      vancouver_kt: number;
      prince_rupert_kt: number;
      thunder_bay_kt: number;
    };
  } | null;
  producer_cars: Array<{
    grain: string;
    grain_week: number;
    cy_cars_total: number;
    week_cars: number;
    by_province: { mb: number; sk: number; ab_bc: number };
  }>;
}

export interface HeadlineInput {
  vessels_vancouver: number;
  vessel_avg_one_year_vancouver: number;
  out_of_car_time_pct: number;
  ytd_shipments_yoy_pct: number;
  grain_week: number;
}

export interface LogisticsHeadline {
  headline: string;
  subtext: string;
}

// ─── Headline Generator (pure function) ────────────────

export function generateLogisticsHeadline(
  monitor: HeadlineInput
): LogisticsHeadline {
  const vesselDelta =
    monitor.vessels_vancouver - monitor.vessel_avg_one_year_vancouver;

  // Priority 1: Vessel congestion
  if (vesselDelta > 5) {
    return {
      headline: `${monitor.vessels_vancouver} Ships Waiting. Grain Isn't Moving.`,
      subtext: `${vesselDelta} vessels above the 1-year average of ${monitor.vessel_avg_one_year_vancouver} at Vancouver`,
    };
  }

  // Priority 2: Rail bottleneck
  if (monitor.out_of_car_time_pct > 20) {
    return {
      headline: `Rail Bottleneck — Out-of-Car Time at ${monitor.out_of_car_time_pct}%`,
      subtext:
        "Terminal unloading delays are slowing the pipeline. Deliveries may back up.",
    };
  }

  // Priority 3: Strong export pace
  if (monitor.ytd_shipments_yoy_pct > 5) {
    return {
      headline: `Export Pace Accelerating — Shipments +${monitor.ytd_shipments_yoy_pct.toFixed(0)}% YoY`,
      subtext: "Terminals are clearing grain faster than last year.",
    };
  }

  // Fallback
  return {
    headline: `Terminal Flow Update — Week ${monitor.grain_week}`,
    subtext: "Pipeline metrics are within normal ranges.",
  };
}

// ─── Sentiment Helpers ─────────────────────────────────

export type PillSentiment = "positive" | "negative" | "neutral";

export function vesselSentiment(
  vessels: number,
  avg: number
): PillSentiment {
  if (vessels <= avg) return "positive";
  if (vessels <= avg + 5) return "neutral";
  return "negative";
}

export function octSentiment(pct: number): PillSentiment {
  if (pct < 10) return "positive";
  if (pct <= 20) return "neutral";
  return "negative";
}

export function shipmentYoySentiment(pct: number): PillSentiment {
  if (pct > 3) return "positive";
  if (pct >= -3) return "neutral";
  return "negative";
}

// ─── Supabase Queries ──────────────────────────────────

export async function getLogisticsSnapshot(
  cropYear: string,
  grainWeek: number
): Promise<LogisticsSnapshot | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_logistics_snapshot", {
      p_crop_year: cropYear,
      p_grain_week: grainWeek,
    });

    if (error) {
      console.error("getLogisticsSnapshot error:", error.message);
      return null;
    }

    return data as LogisticsSnapshot;
  } catch (err) {
    console.error("getLogisticsSnapshot failed:", err);
    return null;
  }
}

export async function getWeeklyTerminalFlow(
  grain: string,
  cropYear?: string
): Promise<WeeklyTerminalFlow[]> {
  try {
    const supabase = await createClient();
    const year = cropYear ?? CURRENT_CROP_YEAR;

    const { data, error } = await supabase.rpc("get_weekly_terminal_flow", {
      p_grain: grain,
      p_crop_year: year,
    });

    if (error) {
      console.error("getWeeklyTerminalFlow error:", error.message);
      return [];
    }

    return (data as WeeklyTerminalFlow[]) ?? [];
  } catch (err) {
    console.error("getWeeklyTerminalFlow failed:", err);
    return [];
  }
}

export async function getAggregateTerminalFlow(
  cropYear?: string
): Promise<WeeklyTerminalFlow[]> {
  try {
    const supabase = await createClient();
    const year = cropYear ?? CURRENT_CROP_YEAR;

    const { data, error } = await supabase.rpc(
      "get_aggregate_terminal_flow",
      { p_crop_year: year }
    );

    if (error) {
      console.error("getAggregateTerminalFlow error:", error.message);
      return [];
    }

    return (data as WeeklyTerminalFlow[]) ?? [];
  } catch (err) {
    console.error("getAggregateTerminalFlow failed:", err);
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/logistics-headline.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add lib/queries/logistics.ts tests/lib/logistics-headline.test.ts
git commit -m "feat: add logistics query module with headline generator"
```

---

### Task 3: Create LogisticsStatPill Component

**Files:**
- Create: `components/dashboard/logistics-stat-pill.tsx`

**Step 1: Write the component**

```typescript
// components/dashboard/logistics-stat-pill.tsx
import type { PillSentiment } from "@/lib/queries/logistics";

interface LogisticsStatPillProps {
  label: string;
  value: string | number;
  unit?: string;
  sentiment: PillSentiment;
  sublabel?: string;
}

const SENTIMENT_STYLES: Record<PillSentiment, { border: string; text: string }> = {
  positive: {
    border: "border-prairie/40",
    text: "text-prairie",
  },
  negative: {
    border: "border-destructive/40",
    text: "text-destructive",
  },
  neutral: {
    border: "border-amber-500/40",
    text: "text-amber-500",
  },
};

export function LogisticsStatPill({
  label,
  value,
  unit,
  sentiment,
  sublabel,
}: LogisticsStatPillProps) {
  const style = SENTIMENT_STYLES[sentiment];

  return (
    <div
      className={`rounded-xl border bg-card/60 px-4 py-2.5 text-center backdrop-blur-sm ${style.border}`}
    >
      <p className={`font-display text-lg font-bold tabular-nums ${style.text}`}>
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
      <p className="text-[0.6rem] font-medium uppercase tracking-[1.5px] text-muted-foreground">
        {label}
      </p>
      {sublabel && (
        <p className="mt-0.5 text-[0.55rem] text-muted-foreground/70">
          {sublabel}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors in the new file

**Step 3: Commit**

```bash
git add components/dashboard/logistics-stat-pill.tsx
git commit -m "feat: add LogisticsStatPill component"
```

---

### Task 4: Create TerminalFlowChart Component (Grain Detail)

**Files:**
- Create: `components/dashboard/terminal-flow-chart.tsx`

**Step 1: Write the chart component**

This is a `"use client"` Recharts ComposedChart with diverging bars + overlay lines.

```typescript
// components/dashboard/terminal-flow-chart.tsx
"use client";

import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { LogisticsStatPill } from "./logistics-stat-pill";
import {
  vesselSentiment,
  octSentiment,
  shipmentYoySentiment,
} from "@/lib/queries/logistics";
import type { WeeklyTerminalFlow, LogisticsSnapshot } from "@/lib/queries/logistics";

interface TerminalFlowChartProps {
  flowData: WeeklyTerminalFlow[];
  logistics: LogisticsSnapshot | null;
  grainName: string;
}

export function TerminalFlowChart({
  flowData,
  logistics,
  grainName,
}: TerminalFlowChartProps) {
  if (flowData.length === 0) return null;

  const monitor = logistics?.grain_monitor ?? null;

  const chartData = flowData.map((row) => ({
    week: `Wk${row.grain_week}`,
    receipts: Number(row.terminal_receipts_kt),
    exports: Number(row.exports_kt),
    netFlow: Number(row.net_flow_kt),
  }));

  return (
    <Card className="space-y-4 border-border/40 bg-card/40 p-5 backdrop-blur-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-display font-semibold text-foreground">
          Terminal Net Flow
        </h2>
        <p className="text-xs text-muted-foreground">
          Weekly terminal receipts vs exports — red weeks mean terminals are
          drawing down stock (bullish)
        </p>
      </div>

      {/* System-wide logistics pills */}
      {monitor && (
        <div className="space-y-1.5">
          <p className="text-[0.55rem] font-medium uppercase tracking-[2px] text-muted-foreground/60">
            System-wide logistics
          </p>
          <div className="flex flex-wrap gap-2">
            <LogisticsStatPill
              label="Vessels at Vancouver"
              value={monitor.vessels_vancouver}
              sentiment={vesselSentiment(
                monitor.vessels_vancouver,
                monitor.vessel_avg_one_year_vancouver
              )}
              sublabel={`avg ${monitor.vessel_avg_one_year_vancouver}`}
            />
            <LogisticsStatPill
              label="Out-of-Car Time"
              value={`${Number(monitor.out_of_car_time_pct).toFixed(1)}%`}
              sentiment={octSentiment(Number(monitor.out_of_car_time_pct))}
            />
            <LogisticsStatPill
              label="YTD Shipments YoY"
              value={`${Number(monitor.ytd_shipments_yoy_pct) > 0 ? "+" : ""}${Number(monitor.ytd_shipments_yoy_pct).toFixed(0)}%`}
              sentiment={shipmentYoySentiment(
                Number(monitor.ytd_shipments_yoy_pct)
              )}
              sublabel={`${Number(monitor.ytd_shipments_total_kt).toLocaleString("en-CA")} kt`}
            />
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.4}
            />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "000's Tonnes",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => {
                if (name === "netFlow") {
                  const label =
                    value >= 0 ? "Building" : "Drawing";
                  const icon = value >= 0 ? "\u25B2" : "\u25BC";
                  return [
                    `${icon} ${label} ${Math.abs(value).toFixed(1)} Kt`,
                    "Net Flow",
                  ];
                }
                return [`${value.toFixed(1)} Kt`, name === "receipts" ? "Terminal Receipts" : "Exports"];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  netFlow: "Net Flow (Receipts \u2212 Exports)",
                  receipts: "Terminal Receipts",
                  exports: "Exports",
                };
                return labels[value] ?? value;
              }}
            />
            <Bar dataKey="netFlow" radius={[3, 3, 0, 0]} maxBarSize={20}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`bar-${index}`}
                  fill={
                    entry.netFlow >= 0
                      ? "hsl(var(--prairie) / 0.65)"
                      : "hsl(var(--destructive) / 0.65)"
                  }
                  stroke={
                    entry.netFlow >= 0
                      ? "hsl(var(--prairie) / 0.9)"
                      : "hsl(var(--destructive) / 0.9)"
                  }
                  strokeWidth={1}
                />
              ))}
            </Bar>
            <Line
              dataKey="receipts"
              type="monotone"
              stroke="hsl(var(--sk-province))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="exports"
              type="monotone"
              stroke="hsl(var(--canola))"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[0.6rem] text-muted-foreground/60">
        Green = terminal building stocks (receipts &gt; exports) · Red = drawing
        down (exports &gt; receipts) · {grainName}, 000&apos;s tonnes
      </p>
    </Card>
  );
}
```

**Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

**Step 3: Commit**

```bash
git add components/dashboard/terminal-flow-chart.tsx
git commit -m "feat: add TerminalFlowChart diverging bar + line component"
```

---

### Task 5: Create LogisticsBanner Component (Overview)

**Files:**
- Create: `components/dashboard/logistics-banner.tsx`

**Step 1: Write the banner component**

This is a server-friendly wrapper (no `"use client"`) that renders the narrative headline, stat pills, and a compact sparkline. The sparkline itself needs `"use client"` so we extract it as a sub-component.

```typescript
// components/dashboard/logistics-banner.tsx
"use client";

import {
  Bar,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
  Cell,
} from "recharts";
import { LogisticsStatPill } from "./logistics-stat-pill";
import {
  generateLogisticsHeadline,
  vesselSentiment,
  octSentiment,
  shipmentYoySentiment,
} from "@/lib/queries/logistics";
import type {
  LogisticsSnapshot,
  WeeklyTerminalFlow,
} from "@/lib/queries/logistics";

interface LogisticsBannerProps {
  logistics: LogisticsSnapshot;
  aggregateFlow: WeeklyTerminalFlow[];
}

export function LogisticsBanner({
  logistics,
  aggregateFlow,
}: LogisticsBannerProps) {
  const monitor = logistics.grain_monitor;
  if (!monitor) return null;

  const headline = generateLogisticsHeadline({
    vessels_vancouver: Number(monitor.vessels_vancouver),
    vessel_avg_one_year_vancouver: Number(
      monitor.vessel_avg_one_year_vancouver
    ),
    out_of_car_time_pct: Number(monitor.out_of_car_time_pct),
    ytd_shipments_yoy_pct: Number(monitor.ytd_shipments_yoy_pct),
    grain_week: monitor.grain_week,
  });

  const sparkData = aggregateFlow.map((row) => ({
    week: row.grain_week,
    netFlow: Number(row.net_flow_kt),
  }));

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-5 backdrop-blur-sm">
      {/* Headline */}
      <div className="mb-4">
        <p className="text-[0.6rem] font-medium uppercase tracking-[2px] text-canola">
          Grain Monitor · Wk{monitor.grain_week}
        </p>
        <h2 className="mt-1 font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
          {headline.headline}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {headline.subtext}
        </p>
      </div>

      {/* Stat pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        <LogisticsStatPill
          label="Vessels at Vancouver"
          value={Number(monitor.vessels_vancouver)}
          sentiment={vesselSentiment(
            Number(monitor.vessels_vancouver),
            Number(monitor.vessel_avg_one_year_vancouver)
          )}
          sublabel={`avg ${Number(monitor.vessel_avg_one_year_vancouver)}`}
        />
        <LogisticsStatPill
          label="Out-of-Car Time"
          value={`${Number(monitor.out_of_car_time_pct).toFixed(1)}%`}
          sentiment={octSentiment(Number(monitor.out_of_car_time_pct))}
        />
        <LogisticsStatPill
          label="YTD Shipments"
          value={`${Number(monitor.ytd_shipments_total_kt).toLocaleString("en-CA")} kt`}
          sentiment={shipmentYoySentiment(
            Number(monitor.ytd_shipments_yoy_pct)
          )}
          sublabel={`${Number(monitor.ytd_shipments_yoy_pct) > 0 ? "+" : ""}${Number(monitor.ytd_shipments_yoy_pct).toFixed(0)}% YoY`}
        />
      </div>

      {/* Compact sparkline */}
      {sparkData.length > 0 && (
        <div className="h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sparkData}>
              <ReferenceLine
                y={0}
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
              <Bar dataKey="netFlow" maxBarSize={8}>
                {sparkData.map((entry, index) => (
                  <Cell
                    key={`spark-${index}`}
                    fill={
                      entry.netFlow >= 0
                        ? "hsl(var(--prairie) / 0.6)"
                        : "hsl(var(--destructive) / 0.6)"
                    }
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

**Step 3: Commit**

```bash
git add components/dashboard/logistics-banner.tsx
git commit -m "feat: add LogisticsBanner with narrative headline + sparkline"
```

---

### Task 6: Wire TerminalFlowChart into Grain Detail Page

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Add imports and data fetch**

At the top of the file, add:
```typescript
import { TerminalFlowChart } from "@/components/dashboard/terminal-flow-chart";
import { getWeeklyTerminalFlow, getLogisticsSnapshot } from "@/lib/queries/logistics";
import { getCurrentGrainWeek } from "@/lib/utils/crop-year";
```

In the first `Promise.all` block (lines ~76-104), add two more queries:
```typescript
safeQuery("Terminal flow", () => getWeeklyTerminalFlow(grain.name)),
safeQuery("Logistics snapshot", () => getLogisticsSnapshot(CURRENT_CROP_YEAR, getCurrentGrainWeek())),
```

Destructure the results alongside the existing ones:
```typescript
const [
  marketCoreResult,
  deliverySeriesResult,
  pipelineVelocityResult,
  provincialResult,
  distributionResult,
  wowResult,
  supplyPipelineResult,
  storageResult,
  roleResult,
  terminalFlowResult,    // NEW
  logisticsResult,       // NEW
] = await Promise.all([...]);
```

**Step 2: Add TerminalFlowChart to Section 2 (Supply & Movement)**

After the PaceChart `AnimatedCard` (index 0) and before SupplyPipeline, add:

```tsx
{terminalFlowResult.error ? (
  <SectionStateCard
    title="Terminal flow unavailable"
    message="The terminal net flow chart is temporarily unavailable."
  />
) : terminalFlowResult.data && terminalFlowResult.data.length > 0 ? (
  <AnimatedCard index={1}>
    <SectionBoundary
      title="Terminal flow unavailable"
      message="The terminal net flow chart is temporarily unavailable."
    >
      <TerminalFlowChart
        flowData={terminalFlowResult.data}
        logistics={logisticsResult.error ? null : (logisticsResult.data ?? null)}
        grainName={grain.name}
      />
    </SectionBoundary>
  </AnimatedCard>
) : null}
```

Shift the `index` values of SupplyPipeline (now index 2), ProvinceMap (index 3), StorageBreakdown (index 4).

**Step 3: Verify dev server renders**

Run: Open `http://localhost:50521/grain/canola` (or whichever port).
Expected: TerminalFlowChart appears in Section 2 between PaceChart and SupplyPipeline. If no terminal flow data exists, it renders nothing (graceful empty state).

**Step 4: Run build**

Run: `npm run build`
Expected: Build passes with no errors

**Step 5: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: wire TerminalFlowChart into grain detail page"
```

---

### Task 7: Wire LogisticsBanner into Overview Page

**Files:**
- Modify: `app/(dashboard)/overview/page.tsx`

**Step 1: Add imports and data fetch**

At the top:
```typescript
import { LogisticsBanner } from "@/components/dashboard/logistics-banner";
import { getLogisticsSnapshot, getAggregateTerminalFlow } from "@/lib/queries/logistics";
```

In the `Promise.all` (lines ~71-77), add:
```typescript
safeQuery("Logistics snapshot", () => getLogisticsSnapshot(CURRENT_CROP_YEAR, grainWeek)),
safeQuery("Aggregate terminal flow", () => getAggregateTerminalFlow()),
```

Destructure:
```typescript
const [summaryResult, sentimentResult, signalsResult, marketPulseResult, logisticsResult, aggregateFlowResult] =
  await Promise.all([...]);
```

Note: `marketPulseResult` is not wrapped in `safeQuery` (it has its own error handling). Keep it as-is.

**Step 2: Add LogisticsBanner below crop summary cards in Section 1**

Inside Section 1 (Prairie Snapshot), after the `.grid.gap-4` of summary cards and before the closing `</section>`, add:

```tsx
{logisticsResult.data && !logisticsResult.error && (
  <LogisticsBanner
    logistics={logisticsResult.data}
    aggregateFlow={aggregateFlowResult.error ? [] : (aggregateFlowResult.data ?? [])}
  />
)}
```

**Step 3: Verify dev server renders**

Run: Open `http://localhost:50521/overview`
Expected: LogisticsBanner appears below crop summary cards. If no grain_monitor data exists, it renders nothing.

**Step 4: Run build + tests**

Run: `npm run build && npm run test`
Expected: Both pass

**Step 5: Commit**

```bash
git add app/(dashboard)/overview/page.tsx
git commit -m "feat: wire LogisticsBanner into Overview page"
```

---

### Task 8: Verify CSS Custom Properties Exist

**Files:**
- Potentially modify: `app/globals.css` or `tailwind.config.ts`

**Step 1: Check that `--prairie`, `--destructive`, `--sk-province`, `--canola` CSS custom properties exist**

Run: Search `globals.css` and `tailwind.config.ts` for these variable names.

The components reference:
- `hsl(var(--prairie) / 0.65)` — green for positive net flow
- `hsl(var(--destructive) / 0.65)` — red for negative net flow
- `hsl(var(--sk-province))` — blue for receipts line
- `hsl(var(--canola))` — amber for exports line

If any are missing, add them to the CSS variables in `globals.css` using the values from CLAUDE.md design tokens:
- prairie: `#437a22`
- canola: `#c17f24`
- sk-province: `#6d9e3a`
- destructive: existing Tailwind token

**Step 2: Verify the chart renders with correct colors**

Run: Open the grain detail page, inspect the chart in browser devtools.
Expected: Green bars, red bars, blue receipt line, amber export line all render with correct colors.

**Step 3: Commit if changes were needed**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "fix: ensure logistics chart CSS custom properties exist"
```

---

### Task 9: Run Full Test Suite + Build Verification

**Files:** None (verification only)

**Step 1: Run tests**

Run: `npm run test`
Expected: All tests pass including the new `logistics-headline.test.ts`

**Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Visual verification**

Check both pages:
- `http://localhost:50521/overview` — LogisticsBanner with headline, pills, sparkline
- `http://localhost:50521/grain/canola` — TerminalFlowChart with bars, lines, pills

If grain_monitor_snapshots table has no data yet, both components should gracefully render nothing (not crash).

**Step 4: Commit all remaining changes if any**

```bash
git add -A
git commit -m "chore: final verification pass for terminal net flow feature"
```
