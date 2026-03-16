# Delivery Gap Chart — Implementation Plan

> **⚠️ SUPERSEDED:** This plan describes a single-axis stacked-area approach that was
> replaced with the correct dual Y-axis implementation matching the user's prototype.
> The code in Task 2 is NOT what was shipped. See `delivery-gap-chart.tsx` for the
> actual implementation and `docs/lessons-learned/issues.md` for why this happened.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a thesis-driven YoY cumulative delivery gap chart for the Canola grain detail page.

**Architecture:** Generic `DeliveryGapChart` client component using Recharts, rendered only on Canola's grain detail page. No new queries — reuses existing `getCumulativeTimeSeries` data for current and prior crop years. Gap computed client-side.

**Tech Stack:** React, Recharts (ComposedChart + Area + Line), Tailwind CSS, Vitest

---

### Task 1: Gap Data Utility Function

**Files:**
- Create: `lib/utils/delivery-gap.ts`
- Test: `tests/lib/utils/delivery-gap.test.ts`

**Step 1: Write the failing test**

```ts
// tests/lib/utils/delivery-gap.test.ts
import { describe, it, expect } from "vitest";
import { computeDeliveryGap, type DeliveryGapPoint } from "@/lib/utils/delivery-gap";
import type { CumulativeWeekRow } from "@/lib/queries/observations";

function makeRow(grain_week: number, deliveries: number): CumulativeWeekRow {
  return {
    grain_week,
    week_ending_date: `2026-01-0${grain_week}`,
    producer_deliveries_kt: deliveries,
    terminal_receipts_kt: 0,
    exports_kt: 0,
    processing_kt: 0,
    domestic_disappearance_kt: 0,
  };
}

describe("computeDeliveryGap", () => {
  it("computes gap as prior minus current (positive = behind pace)", () => {
    const current = [makeRow(1, 100), makeRow(2, 250)];
    const prior = [makeRow(1, 120), makeRow(2, 300)];

    const result = computeDeliveryGap(current, prior);

    expect(result).toHaveLength(2);
    expect(result[0].gap).toBe(20); // 120 - 100
    expect(result[1].gap).toBe(50); // 300 - 250
  });

  it("returns negative gap when current ahead of prior", () => {
    const current = [makeRow(1, 150)];
    const prior = [makeRow(1, 100)];

    const result = computeDeliveryGap(current, prior);

    expect(result[0].gap).toBe(-50); // 100 - 150
  });

  it("handles missing prior year weeks gracefully", () => {
    const current = [makeRow(1, 100), makeRow(2, 200), makeRow(3, 350)];
    const prior = [makeRow(1, 110), makeRow(2, 220)];

    const result = computeDeliveryGap(current, prior);

    expect(result).toHaveLength(3);
    expect(result[2].prior).toBeNull();
    expect(result[2].gap).toBe(0); // no prior data, gap is 0
  });

  it("returns empty array for empty inputs", () => {
    expect(computeDeliveryGap([], [])).toEqual([]);
  });

  it("computes summary stats correctly", () => {
    const current = [makeRow(1, 100), makeRow(2, 250)];
    const prior = [makeRow(1, 120), makeRow(2, 300)];

    const result = computeDeliveryGap(current, prior);
    const latest = result[result.length - 1];

    expect(latest.current).toBe(250);
    expect(latest.prior).toBe(300);
    expect(latest.gap).toBe(50);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/utils/delivery-gap.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```ts
// lib/utils/delivery-gap.ts
import type { CumulativeWeekRow } from "@/lib/queries/observations";

export interface DeliveryGapPoint {
  week: number;
  current: number;
  prior: number | null;
  gap: number; // positive = behind pace (bullish), negative = ahead (bearish)
}

/**
 * Compute the YoY delivery gap between current and prior crop year.
 * Gap = prior - current. Positive means farmers are behind last year's pace.
 */
export function computeDeliveryGap(
  currentYear: CumulativeWeekRow[],
  priorYear: CumulativeWeekRow[]
): DeliveryGapPoint[] {
  if (currentYear.length === 0) return [];

  const priorByWeek = new Map<number, number>();
  for (const row of priorYear) {
    priorByWeek.set(row.grain_week, row.producer_deliveries_kt);
  }

  return currentYear.map((row) => {
    const priorVal = priorByWeek.get(row.grain_week) ?? null;
    return {
      week: row.grain_week,
      current: row.producer_deliveries_kt,
      prior: priorVal,
      gap: priorVal !== null ? priorVal - row.producer_deliveries_kt : 0,
    };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/utils/delivery-gap.test.ts`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add lib/utils/delivery-gap.ts tests/lib/utils/delivery-gap.test.ts
git commit -m "feat: add delivery gap computation utility with tests"
```

---

### Task 2: DeliveryGapChart Component

**Files:**
- Create: `components/dashboard/delivery-gap-chart.tsx`

**Reference:** Follow patterns from `components/dashboard/net-balance-chart.tsx` (same ComposedChart + GlassTooltip + color constants pattern).

**Step 1: Create the chart component**

```tsx
// components/dashboard/delivery-gap-chart.tsx
"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import { fmtKt } from "@/lib/utils/format";
import { computeDeliveryGap, type DeliveryGapPoint } from "@/lib/utils/delivery-gap";
import type { CumulativeWeekRow } from "@/lib/queries/observations";

const COLOR_BEHIND = "#437a22"; // prairie green — bullish (holding)
const COLOR_AHEAD = "#d97706"; // amber — bearish pressure
const COLOR_CURRENT = "#c17f24"; // canola
const COLOR_PRIOR = "hsl(var(--muted-foreground))";

interface DeliveryGapChartProps {
  currentYearData: CumulativeWeekRow[];
  priorYearData: CumulativeWeekRow[];
  grainName: string;
}

interface ChartRow extends DeliveryGapPoint {
  week_label: string;
  // Recharts needs two separate area dataKeys for two-color gap fill
  gapBehind: number; // positive gap (behind pace)
  gapAhead: number;  // negative gap (ahead of pace), stored as positive for fill
}

interface TooltipPayloadItem {
  payload?: ChartRow;
}

function GapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const gapLabel =
    row.gap > 0
      ? `${fmtKt(row.gap)} behind`
      : row.gap < 0
        ? `${fmtKt(Math.abs(row.gap))} ahead`
        : "On pace";

  const items = [
    { name: "This Year", value: fmtKt(row.current), color: COLOR_CURRENT },
    ...(row.prior !== null
      ? [{ name: "Last Year", value: fmtKt(row.prior), color: COLOR_PRIOR }]
      : []),
    {
      name: "Gap",
      value: gapLabel,
      color: row.gap > 0 ? COLOR_BEHIND : row.gap < 0 ? COLOR_AHEAD : COLOR_PRIOR,
    },
  ];

  return <GlassTooltip active={active} label={`Week ${row.week}`} payload={items} />;
}

export function DeliveryGapChart({
  currentYearData,
  priorYearData,
  grainName,
}: DeliveryGapChartProps) {
  const gapData = computeDeliveryGap(currentYearData, priorYearData);

  if (gapData.length === 0) return null;

  const chartData: ChartRow[] = gapData.map((d) => ({
    ...d,
    week_label: `W${d.week}`,
    gapBehind: d.gap > 0 ? d.gap : 0,
    gapAhead: d.gap < 0 ? Math.abs(d.gap) : 0,
  }));

  return (
    <div className="space-y-3">
      {/* Inline legend */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[3px] w-5 rounded-sm" style={{ background: COLOR_CURRENT }} />
          This Year
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="20" height="6" className="shrink-0">
            <line x1="0" y1="3" x2="20" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 3" />
          </svg>
          Last Year
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm opacity-30" style={{ background: COLOR_BEHIND }} />
          Behind (bullish)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm opacity-30" style={{ background: COLOR_AHEAD }} />
          Ahead (pressure)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.15}
            vertical={false}
          />
          <XAxis
            dataKey="week_label"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => fmtKt(v, 0).replace(" kt", "")}
            className="text-muted-foreground"
            label={{
              value: "Cumulative Deliveries (Kt)",
              angle: -90,
              position: "insideLeft",
              offset: -5,
              style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
            }}
          />
          <Tooltip content={<GapTooltip />} />

          {/* Current year — solid canola line */}
          <Line
            type="monotone"
            dataKey="current"
            name="This Year"
            stroke={COLOR_CURRENT}
            strokeWidth={2.5}
            dot={false}
            animationDuration={800}
          />

          {/* Prior year — dashed muted line */}
          <Line
            type="monotone"
            dataKey="prior"
            name="Last Year"
            stroke={COLOR_PRIOR}
            strokeWidth={1.5}
            strokeDasharray="8 4"
            dot={false}
            connectNulls
            animationDuration={800}
          />

          {/* Gap fill behind pace (bullish green) */}
          <Area
            type="monotone"
            dataKey="prior"
            stroke="none"
            fill={COLOR_BEHIND}
            fillOpacity={0.08}
            baseLine={chartData.map((d) => d.current)}
            animationDuration={800}
            name="_gap_behind"
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Note on gap fill:** Recharts doesn't natively support "fill between two lines" with conditional coloring. The initial implementation uses a single Area with low opacity as an approximation. If the visual isn't satisfactory after preview, we'll iterate with a custom SVG `<defs>` + `clipPath` approach or split into two areas using a `baseValue` trick. Preview-driven iteration is the right approach here.

**Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add components/dashboard/delivery-gap-chart.tsx
git commit -m "feat: add DeliveryGapChart component with gap fill area"
```

---

### Task 3: Integrate into Grain Detail Page

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Add imports and server-side gap computation**

At the top of `page.tsx`, add:
```ts
import { DeliveryGapChart } from "@/components/dashboard/delivery-gap-chart";
```

After the `const netBalanceData = ...` block (~line 239), add server-side pill computation:
```ts
// Delivery gap pills (server-side)
const currentYearDeliveries = pipelineVelocityResult.error ? [] : pipelineVelocityResult.data ?? [];
const priorYearDeliveries = priorYearPipelineResult.error ? [] : priorYearPipelineResult.data ?? [];
const hasGapData = currentYearDeliveries.length > 0 && priorYearDeliveries.length > 0;

let yoyDeliveryPct = 0;
let gapKt = 0;
if (hasGapData) {
  const currentLatest = currentYearDeliveries[currentYearDeliveries.length - 1].producer_deliveries_kt;
  const priorLatest = priorYearDeliveries.find(
    (r) => r.grain_week === currentYearDeliveries[currentYearDeliveries.length - 1].grain_week
  )?.producer_deliveries_kt ?? 0;
  if (priorLatest > 0) {
    yoyDeliveryPct = ((currentLatest - priorLatest) / priorLatest) * 100;
  }
  gapKt = priorLatest - currentLatest;
}
```

**Step 2: Add the section between Key Metrics and Net Balance**

Insert after the Key Metrics `</section>` closing tag (~line 331) and before the Net Balance `<section>`:

```tsx
{/* ========== DELIVERY PACE (Canola only) ========== */}
{grain.slug === "canola" && hasGapData && (
  <section className="space-y-6">
    <SectionHeader
      title="Delivery Pace"
      subtitle="Cumulative deliveries vs prior year"
    >
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        yoyDeliveryPct < 0
          ? "border border-red-500/30 text-red-600 dark:text-red-400"
          : "border border-prairie/30 text-prairie"
      }`}>
        {yoyDeliveryPct > 0 ? "+" : ""}{yoyDeliveryPct.toFixed(1)}% YoY
      </span>
      {gapKt !== 0 && (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          gapKt > 0
            ? "border border-prairie/30 text-prairie"
            : "border border-amber-500/30 text-amber-600 dark:text-amber-400"
        }`}>
          {gapKt > 0 ? `${fmtKt(gapKt, 0)} withheld` : `${fmtKt(Math.abs(gapKt), 0)} ahead`}
        </span>
      )}
    </SectionHeader>
    <SectionBoundary
      title="Delivery pace unavailable"
      message="The delivery gap chart is temporarily unavailable."
    >
      <GlassCard hover={false} elevation={2} className="p-4">
        <DeliveryGapChart
          currentYearData={currentYearDeliveries}
          priorYearData={priorYearDeliveries}
          grainName={grain.name}
        />
      </GlassCard>
    </SectionBoundary>
  </section>
)}
```

**Step 3: Add `fmtKt` import if not already present**

Check if `fmtKt` is imported in page.tsx. If not, add:
```ts
import { fmtKt } from "@/lib/utils/format";
```

**Step 4: Run build to verify**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: integrate Delivery Pace section on Canola grain page"
```

---

### Task 4: Visual Verification & Gap Fill Iteration

**Files:**
- Possibly modify: `components/dashboard/delivery-gap-chart.tsx`

**Step 1: Start dev server and preview Canola page**

Run: `npm run dev`
Navigate to Canola grain detail page.

**Step 2: Verify the chart renders**

Check:
- [ ] Section appears between Key Metrics and Net Balance
- [ ] SectionHeader shows "Delivery Pace" with canola left-accent
- [ ] Pills show YoY % and gap Kt values
- [ ] Chart renders with two lines (solid canola + dashed muted)
- [ ] Tooltip shows both years' values and gap description
- [ ] Inline legend displays correctly

**Step 3: Evaluate gap fill visual**

If the Area-based gap fill doesn't render properly between the two lines (Recharts limitation), switch to a `<defs>` + `linearGradient` approach or use two separate Areas bounded at min/max. Iterate based on what the preview shows.

**Step 4: Check dark mode**

Toggle dark mode and verify colors remain legible.

**Step 5: Run full test suite + build**

Run: `npm run test && npm run build`
Expected: PASS

**Step 6: Commit any visual fixes**

```bash
git add components/dashboard/delivery-gap-chart.tsx
git commit -m "fix: refine delivery gap chart visual styling"
```

---

### Task 5: Final Verification & Documentation

**Files:**
- Modify: `docs/plans/STATUS.md` (if exists)
- Modify: `components/dashboard/CLAUDE.md`

**Step 1: Add component to dashboard CLAUDE.md**

Add to the Key Components table in `components/dashboard/CLAUDE.md`:
```
| `delivery-gap-chart.tsx` | YoY cumulative delivery gap with bullish/bearish fill area | Grain detail (Canola only) |
```

**Step 2: Run final build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit docs**

```bash
git add components/dashboard/CLAUDE.md
git commit -m "docs: add delivery-gap-chart to dashboard component guide"
```
