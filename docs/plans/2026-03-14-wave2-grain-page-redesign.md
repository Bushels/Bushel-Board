# Wave 2: Grain Detail Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the grain detail page from a reporting dashboard into a signal-generating decision tool with 4 key metric cards, net balance chart, delivery breakdown, grain quality distribution, and enhanced logistics — removing redundant sections.

**Architecture:** Server-rendered Next.js page with parallel `safeQuery()` data fetches. New queries use existing `get_pipeline_velocity` RPC where possible, plus 2 new lightweight queries (grade distribution, delivery channel breakdown). New React components follow GlassCard + SectionBoundary error isolation pattern. Removed sections cleaned up with grep verification.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL RPCs), Recharts, Tailwind CSS, Framer Motion, shadcn/ui

**Design Doc:** `docs/plans/2026-03-14-dashboard-redesign-v2-design.md` (Wave 2 section, lines 92-200)

---

## Context for All Tasks

- **Branch:** `codex/Dashboard-audit-1` (existing Wave 1 branch)
- **Grain detail page:** `app/(dashboard)/grain/[slug]/page.tsx` — server component, ~660 lines
- **Query layer:** `lib/queries/observations.ts` — existing pipeline queries
- **Safe query pattern:** All data fetches wrapped in `safeQuery(label, fn)` from `lib/utils/safe-query.ts`
- **Error isolation:** Every section wrapped in `SectionBoundary` with `SectionStateCard` fallback
- **Crop year:** Always `CURRENT_CROP_YEAR` (long format "2025-2026")
- **PostgREST 1000-row limit:** Terminal Receipts has ~3,648 rows/grain. Must use RPC or `SUM() GROUP BY` server-side.
- **Design tokens:** canola=#c17f24, prairie=#437a22, AB=#2e6b9e, SK=#6d9e3a, MB=#b37d24, glass shadows, 40ms stagger

---

### Task 1: Grade Distribution Query

**Purpose:** Fetch Terminal Receipts by grade for the Grain Quality Distribution donut chart. Terminal Receipts has no `grade=''` aggregate rows — must sum all grades server-side.

**Files:**
- Modify: `lib/queries/observations.ts`

**Step 1: Add the `getGradeDistribution` function**

Add to `lib/queries/observations.ts`:

```typescript
export interface GradeDistribution {
  grade: string;
  ktonnes: number;
  percentage: number;
}

/**
 * Grade distribution from Terminal Receipts (CYTD).
 * Terminal Receipts has no grade='' aggregate — must sum all grades.
 * Uses server-side GROUP BY to stay under PostgREST 1000-row limit.
 */
export async function getGradeDistribution(
  grainName: string,
  cropYear: string = CURRENT_CROP_YEAR
): Promise<GradeDistribution[]> {
  const supabase = await createClient();

  // Terminal Receipts: sum ktonnes by grade for Crop Year period
  const { data, error } = await supabase
    .from("cgc_observations")
    .select("grade, ktonnes")
    .eq("grain", grainName)
    .eq("crop_year", cropYear)
    .eq("worksheet", "Terminal Receipts")
    .eq("metric", "Receipts")
    .eq("period", "Crop Year")
    .neq("grade", "");

  if (error || !data) {
    console.error("getGradeDistribution error:", error);
    return [];
  }

  // Get the latest grain_week available for each grade and sum
  // Terminal Receipts reports per-port, so we need to aggregate
  const gradeMap = new Map<string, number>();
  for (const row of data) {
    const current = gradeMap.get(row.grade) ?? 0;
    gradeMap.set(row.grade, current + Number(row.ktonnes));
  }

  const total = Array.from(gradeMap.values()).reduce((s, v) => s + v, 0);
  if (total === 0) return [];

  return Array.from(gradeMap.entries())
    .map(([grade, ktonnes]) => ({
      grade,
      ktonnes,
      percentage: (ktonnes / total) * 100,
    }))
    .sort((a, b) => b.ktonnes - a.ktonnes);
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes (no consumers yet, just a new export)

**Step 3: Commit**

```bash
git add lib/queries/observations.ts
git commit -m "feat: add getGradeDistribution query for Terminal Receipts by grade"
```

**Important note:** This initial query fetches ALL Crop Year rows and aggregates client-side. If PostgREST truncates (>1000 rows), we'll need an RPC. Terminal Receipts Crop Year for one grain = ~20 grades × 6 ports × 1 week (latest only for period=Crop Year) ≈ 120 rows, well under limit. If data shows otherwise, escalate to RPC in Task 1b.

---

### Task 2: Delivery Channel Breakdown Query

**Purpose:** Fetch the 3 delivery channels (Primary elevators, processors, producer cars) as a time series for the Delivery Breakdown stacked area chart.

**Files:**
- Modify: `lib/queries/observations.ts`

**Step 1: Add the `getDeliveryChannelBreakdown` function**

```typescript
export interface DeliveryChannelWeek {
  grain_week: number;
  primary_elevators_kt: number;
  processors_kt: number;
  producer_cars_kt: number;
}

/**
 * Delivery channel breakdown: elevators vs processors vs producer cars.
 * - Primary Elevators: Primary.Deliveries (prairie provinces, grade='')
 * - Processors: Process.Producer Deliveries (national, grade='')
 * - Producer Cars: producer_car_allocations.week_cars
 */
export async function getDeliveryChannelBreakdown(
  grainName: string,
  cropYear: string = CURRENT_CROP_YEAR
): Promise<DeliveryChannelWeek[]> {
  const supabase = await createClient();

  // Fetch Primary Deliveries (Current Week by week)
  const [primaryRes, processRes, carsRes] = await Promise.all([
    supabase
      .from("cgc_observations")
      .select("grain_week, ktonnes")
      .eq("grain", grainName)
      .eq("crop_year", cropYear)
      .eq("worksheet", "Primary")
      .eq("metric", "Deliveries")
      .eq("period", "Current Week")
      .eq("grade", "")
      .in("region", ["Alberta", "Saskatchewan", "Manitoba"])
      .order("grain_week"),
    supabase
      .from("cgc_observations")
      .select("grain_week, ktonnes")
      .eq("grain", grainName)
      .eq("crop_year", cropYear)
      .eq("worksheet", "Process")
      .eq("metric", "Producer Deliveries")
      .eq("period", "Current Week")
      .eq("grade", "")
      .order("grain_week"),
    supabase
      .from("producer_car_allocations")
      .select("grain_week, week_cars")
      .ilike("grain", grainName)
      .eq("crop_year", cropYear)
      .order("grain_week"),
  ]);

  // Aggregate Primary by week (3 provinces → 1 total)
  const primaryByWeek = new Map<number, number>();
  for (const row of primaryRes.data ?? []) {
    const w = row.grain_week;
    primaryByWeek.set(w, (primaryByWeek.get(w) ?? 0) + Number(row.ktonnes));
  }

  const processByWeek = new Map<number, number>();
  for (const row of processRes.data ?? []) {
    processByWeek.set(row.grain_week, Number(row.ktonnes));
  }

  const carsByWeek = new Map<number, number>();
  for (const row of carsRes.data ?? []) {
    // week_cars is number of cars, not Kt — keep as-is for now
    // (Wave 4 will add conversion factor)
    carsByWeek.set(row.grain_week, Number(row.week_cars));
  }

  // Merge all weeks
  const allWeeks = new Set([
    ...primaryByWeek.keys(),
    ...processByWeek.keys(),
    ...carsByWeek.keys(),
  ]);

  return Array.from(allWeeks)
    .sort((a, b) => a - b)
    .map((w) => ({
      grain_week: w,
      primary_elevators_kt: primaryByWeek.get(w) ?? 0,
      processors_kt: processByWeek.get(w) ?? 0,
      producer_cars_kt: carsByWeek.get(w) ?? 0,
    }));
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 3: Commit**

```bash
git add lib/queries/observations.ts
git commit -m "feat: add getDeliveryChannelBreakdown query for 3 delivery pathways"
```

---

### Task 3: Key Metrics Cards Component

**Purpose:** Replace the 2×4 `IntelligenceKpis` grid with 4 vertical signal-generating metric cards. Each card shows: metric name, current week Kt, WoW % change, and a 1-line auto-generated insight.

**Files:**
- Create: `components/dashboard/key-metrics-cards.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { fmtKt, fmtPct } from "@/lib/utils/format";

export interface KeyMetric {
  label: string;
  currentWeekKt: number;
  cropYearKt: number;
  wowChangePct: number;
  insight: string;
  color: string;
}

interface KeyMetricsCardsProps {
  metrics: KeyMetric[];
}

export function KeyMetricsCards({ metrics }: KeyMetricsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m, i) => {
        const isPositive = m.wowChangePct > 0;
        const isNeutral = m.wowChangePct === 0;
        return (
          <GlassCard key={m.label} index={i} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {m.label}
              </span>
              <span
                className="flex items-center gap-0.5 text-xs font-mono"
                style={{ color: isNeutral ? undefined : isPositive ? "#437a22" : "#d91c1c" }}
              >
                {isNeutral ? (
                  <Minus className="h-3 w-3" />
                ) : isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {fmtPct(m.wowChangePct)}
              </span>
            </div>
            <div className="font-display font-bold text-xl" style={{ color: m.color }}>
              {fmtKt(m.currentWeekKt)}
            </div>
            <div className="text-xs text-muted-foreground">
              CY: {fmtKt(m.cropYearKt)}
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed border-t border-border/30 pt-2 mt-1">
              {m.insight}
            </p>
          </GlassCard>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes (no consumers yet)

**Step 3: Commit**

```bash
git add components/dashboard/key-metrics-cards.tsx
git commit -m "feat: add KeyMetricsCards component for grain detail page"
```

---

### Task 4: Net Balance Chart Component

**Purpose:** Weekly bar chart showing `Producer Deliveries - (Exports + Processing)`. Green bars above zero = surplus week, amber below = draw. Cumulative line overlay.

**Files:**
- Create: `components/dashboard/net-balance-chart.tsx`

**Step 1: Create the component**

```tsx
"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import { fmtKt } from "@/lib/utils/format";

interface NetBalanceWeek {
  grain_week: number;
  deliveries_kt: number;
  exports_kt: number;
  processing_kt: number;
  net_balance_kt: number;
  cumulative_kt: number;
}

interface NetBalanceChartProps {
  data: NetBalanceWeek[];
  grainName: string;
}

export function NetBalanceChart({ data, grainName }: NetBalanceChartProps) {
  if (data.length === 0) return null;

  return (
    <GlassCard className="p-4 space-y-3">
      <div>
        <h3 className="font-display font-semibold text-base">Net Balance</h3>
        <p className="text-xs text-muted-foreground">
          Weekly deliveries minus exports & processing
        </p>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
          <XAxis
            dataKey="grain_week"
            tick={{ fontSize: 11 }}
            tickFormatter={(w) => `W${w}`}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v.toFixed(0)}`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as NetBalanceWeek;
              return (
                <GlassTooltip>
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold">Week {d.grain_week}</p>
                    <p>Deliveries: {fmtKt(d.deliveries_kt)}</p>
                    <p>Exports: {fmtKt(d.exports_kt)}</p>
                    <p>Processing: {fmtKt(d.processing_kt)}</p>
                    <p className="font-semibold border-t pt-1">
                      Net: {fmtKt(d.net_balance_kt)}
                    </p>
                    <p className="text-muted-foreground">
                      Cumulative: {fmtKt(d.cumulative_kt)}
                    </p>
                  </div>
                </GlassTooltip>
              );
            }}
          />
          <Bar dataKey="net_balance_kt" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={`bar-${i}`}
                fill={d.net_balance_kt >= 0 ? "#437a22" : "#d97706"}
                opacity={0.8}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="cumulative_kt"
            stroke="#c17f24"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </GlassCard>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add components/dashboard/net-balance-chart.tsx
git commit -m "feat: add NetBalanceChart component for weekly surplus/deficit"
```

---

### Task 5: Delivery Breakdown Chart Component

**Purpose:** Stacked area chart showing grain flowing through 3 channels: Primary Elevators, Processors, Producer Cars.

**Files:**
- Create: `components/dashboard/delivery-breakdown-chart.tsx`

**Step 1: Create the component**

```tsx
"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import { fmtKt } from "@/lib/utils/format";
import type { DeliveryChannelWeek } from "@/lib/queries/observations";

interface DeliveryBreakdownChartProps {
  data: DeliveryChannelWeek[];
  grainName: string;
}

const CHANNEL_COLORS = {
  primary_elevators_kt: "#2e6b9e",
  processors_kt: "#437a22",
  producer_cars_kt: "#c17f24",
} as const;

const CHANNEL_LABELS: Record<string, string> = {
  primary_elevators_kt: "Primary Elevators",
  processors_kt: "Processors",
  producer_cars_kt: "Producer Cars",
};

export function DeliveryBreakdownChart({ data, grainName }: DeliveryBreakdownChartProps) {
  if (data.length === 0) return null;

  return (
    <GlassCard className="p-4 space-y-3">
      <div>
        <h3 className="font-display font-semibold text-base">Delivery Breakdown</h3>
        <p className="text-xs text-muted-foreground">
          Where {grainName.toLowerCase()} deliveries are going each week
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        {Object.entries(CHANNEL_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{CHANNEL_LABELS[key]}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
          <XAxis
            dataKey="grain_week"
            tick={{ fontSize: 11 }}
            tickFormatter={(w) => `W${w}`}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as DeliveryChannelWeek;
              const total = d.primary_elevators_kt + d.processors_kt + d.producer_cars_kt;
              return (
                <GlassTooltip>
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold">Week {d.grain_week}</p>
                    <p>Elevators: {fmtKt(d.primary_elevators_kt)}</p>
                    <p>Processors: {fmtKt(d.processors_kt)}</p>
                    <p>Cars: {d.producer_cars_kt.toFixed(0)} cars</p>
                    <p className="font-semibold border-t pt-1">Total: {fmtKt(total)}</p>
                  </div>
                </GlassTooltip>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="primary_elevators_kt"
            stackId="1"
            fill={CHANNEL_COLORS.primary_elevators_kt}
            stroke={CHANNEL_COLORS.primary_elevators_kt}
            fillOpacity={0.6}
          />
          <Area
            type="monotone"
            dataKey="processors_kt"
            stackId="1"
            fill={CHANNEL_COLORS.processors_kt}
            stroke={CHANNEL_COLORS.processors_kt}
            fillOpacity={0.6}
          />
          <Area
            type="monotone"
            dataKey="producer_cars_kt"
            stackId="1"
            fill={CHANNEL_COLORS.producer_cars_kt}
            stroke={CHANNEL_COLORS.producer_cars_kt}
            fillOpacity={0.6}
          />
        </AreaChart>
      </ResponsiveContainer>
    </GlassCard>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add components/dashboard/delivery-breakdown-chart.tsx
git commit -m "feat: add DeliveryBreakdownChart for 3 delivery channels"
```

---

### Task 6: Grain Quality Distribution Donut

**Purpose:** Donut chart showing Terminal Receipts grade distribution (CYTD). Replaces the "Where Grain Went" flow donut.

**Files:**
- Create: `components/dashboard/grain-quality-donut.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { useState, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import { fmtKt } from "@/lib/utils/format";
import type { GradeDistribution } from "@/lib/queries/observations";

// CGC grade colors — distinct, accessible
const GRADE_COLORS = [
  "#2e6b9e", "#437a22", "#c17f24", "#b37d24", "#6d9e3a",
  "#8b7355", "#d97706", "#5a7d9e", "#9e6b3a", "#7a8b55",
];

interface GrainQualityDonutProps {
  grades: GradeDistribution[];
  grainName: string;
}

export function GrainQualityDonut({ grades, grainName }: GrainQualityDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onMouseEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index);
  }, []);

  const onMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  if (grades.length === 0) return null;

  const total = grades.reduce((s, g) => s + g.ktonnes, 0);

  return (
    <GlassCard className="p-4 space-y-3">
      <div>
        <h3 className="font-display font-semibold text-base">Grain Quality</h3>
        <p className="text-xs text-muted-foreground">
          Terminal Receipts grade distribution (CYTD)
        </p>
      </div>
      <div className="flex items-center gap-6">
        <div className="w-[180px] h-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={grades}
                dataKey="ktonnes"
                nameKey="grade"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={1}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                {grades.map((g, i) => (
                  <Cell
                    key={`grade-${i}`}
                    fill={GRADE_COLORS[i % GRADE_COLORS.length]}
                    opacity={activeIndex === null || activeIndex === i ? 1 : 0.4}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const g = payload[0]?.payload as GradeDistribution;
                  return (
                    <GlassTooltip>
                      <div className="text-xs space-y-0.5">
                        <p className="font-semibold">{g.grade}</p>
                        <p>{fmtKt(g.ktonnes)} ({g.percentage.toFixed(1)}%)</p>
                      </div>
                    </GlassTooltip>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex-1 space-y-1.5 text-xs">
          {grades.slice(0, 8).map((g, i) => (
            <div key={`legend-${i}`} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: GRADE_COLORS[i % GRADE_COLORS.length] }}
                />
                <span className="text-muted-foreground truncate max-w-[120px]">{g.grade}</span>
              </div>
              <span className="font-mono tabular-nums">{g.percentage.toFixed(1)}%</span>
            </div>
          ))}
          {grades.length > 8 && (
            <p className="text-muted-foreground/60">+{grades.length - 8} more grades</p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add components/dashboard/grain-quality-donut.tsx
git commit -m "feat: add GrainQualityDonut for Terminal Receipts grade distribution"
```

---

### Task 7: Grain Storage Card (Enhanced)

**Purpose:** Replace the existing `StorageBreakdown` vertical bar chart with a cleaner horizontal bar card showing Primary/Process/Terminal elevator stocks with WoW deltas.

**Files:**
- Modify: `components/dashboard/storage-breakdown.tsx`

**Step 1: Redesign the component**

Replace the contents of `storage-breakdown.tsx` with a horizontal bar chart layout:
- Keep existing `StorageBreakdown` type from `lib/queries/observations.ts`
- Use horizontal bars with percentage labels
- Add WoW delta badges per category
- Rename visual title to "Grain Storage"

Key changes:
- Remove the Recharts BarChart (layout="vertical") — replace with CSS bars for simplicity and performance
- Keep WoW delta logic (prevKtonnes → changeKt, changePct)
- Add total summary at top

**Implementation approach:** The existing component works correctly and pulls the right data. Refactor the visual layout but keep the data interface unchanged. The page already calls `getStorageBreakdown()` and renders `StorageBreakdown`.

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add components/dashboard/storage-breakdown.tsx
git commit -m "refactor: redesign StorageBreakdown with cleaner horizontal bars"
```

---

### Task 8: Enhanced Bull & Bear Cards

**Purpose:** Make Bull & Bear cards visible (not collapsed) and add confidence gauge + final assessment text. Currently they're hidden in a `<details>` expandable section.

**Files:**
- Modify: `components/dashboard/bull-bear-cards.tsx`

**Step 1: Add confidence gauge and final assessment**

Add to the `BullBearCards` component:
- A confidence gauge bar (0-100%) with gradient: amber → muted → green
- Accept new optional props: `confidenceScore?: number` (0-100), `finalAssessment?: string`
- Render `finalAssessment` as a callout box below the bull/bear columns

```typescript
// Add to BullBearCardsProps:
interface BullBearCardsProps {
  bullCase: string | null;
  bearCase: string | null;
  confidence: "high" | "medium" | "low" | null;
  modelUsed?: string | null;
  confidenceScore?: number; // NEW: 0-100
  finalAssessment?: string; // NEW: plain-English recommendation
}
```

The confidence gauge is a horizontal bar:
- Width = `confidenceScore%`
- Color gradient: `confidenceScore < 40` → amber, `40-70` → muted, `>70` → prairie green
- Label: "Confidence: XX%"

Final assessment: bordered callout with `text-sm` below the two cards.

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add components/dashboard/bull-bear-cards.tsx
git commit -m "feat: enhance BullBearCards with confidence gauge and final assessment"
```

---

### Task 9: Enhanced Logistics Card with Week Labels

**Purpose:** Add grain week labels to every KPI in the logistics card so farmers know which week the data represents. The design says "Week label on every KPI."

**Files:**
- Modify: `components/dashboard/logistics-card.tsx`

**Step 1: Add week labels**

Update the `KpiTile` sub-component (or equivalent) inside `logistics-card.tsx`:
- Accept a `weekLabel?: string` prop (e.g., "Week 31")
- Render it as a small badge next to the metric label: `<span className="text-[10px] text-muted-foreground/60">W31</span>`
- Pass the grain week number from the parent (derived from `grainMonitor.report_date` or passed as a new prop)

Add a `grainWeek?: number` prop to `LogisticsCardProps`:

```typescript
interface LogisticsCardProps {
  grainMonitor: GrainMonitorData | null;
  producerCars: ProducerCarData[];
  grainName: string;
  grainWeek?: number; // NEW
  className?: string;
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add components/dashboard/logistics-card.tsx
git commit -m "feat: add grain week labels to LogisticsCard KPIs"
```

---

### Task 10: Restructure Grain Detail Page Layout

**Purpose:** The big one — restructure `app/(dashboard)/grain/[slug]/page.tsx` to match the new Wave 2 layout. This task wires up all new components and removes deprecated sections.

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**New layout (top to bottom):**
1. **Hero** — unchanged (grain name, stance badge, thesis bullets, data freshness)
2. **Key Metrics** — `KeyMetricsCards` (4 cards) + `NetBalanceChart` in 2-col grid
3. **Delivery Breakdown** — `DeliveryBreakdownChart` full-width
4. **Provincial Deliveries + Grain Storage** — 2-col grid (`ProvinceMap` + `StorageBreakdown`)
5. **Logistics** — `LogisticsCard` with week labels (full-width or 2-col if port weather added later)
6. **Pipeline Velocity** — `GamifiedGrainChart` full-width
7. **Grain Quality** — `GrainQualityDonut` + `CotPositioningCard` in 2-col grid
8. **Prairie Chatter** — `CompactSignalStrip` (sole X presence)
9. **Bull & Bear Cases** — `BullBearCards` visible (NOT collapsed)
10. **WoW Detail** — collapsed `<details>`

**Removed sections:**
- ~~"This Week's Flow" section~~ (FlowDonutChart) — replaced by Delivery Breakdown
- ~~"Grain Balance" section~~ (SupplyPipeline) — data feeds % left in bin on My Farm
- ~~Expandable "All Market Signals"~~ — consolidated to CompactSignalStrip only
- ~~IntelligenceKpis~~ — replaced by KeyMetricsCards

**Step 1: Add new imports**

```typescript
import { KeyMetricsCards, type KeyMetric } from "@/components/dashboard/key-metrics-cards";
import { NetBalanceChart } from "@/components/dashboard/net-balance-chart";
import { DeliveryBreakdownChart } from "@/components/dashboard/delivery-breakdown-chart";
import { GrainQualityDonut } from "@/components/dashboard/grain-quality-donut";
import { getGradeDistribution, getDeliveryChannelBreakdown } from "@/lib/queries/observations";
```

**Step 2: Add new data fetches to Promise.all**

Add to the existing `Promise.all([...])`:

```typescript
safeQuery("Grade distribution", () => getGradeDistribution(grain.name)),
safeQuery("Delivery channels", () => getDeliveryChannelBreakdown(grain.name)),
```

Destructure the new results alongside existing ones.

**Step 3: Build key metrics data from existing WoW data**

After the data fetches, construct the `KeyMetric[]` array from `wowResult.data`:

```typescript
function buildKeyMetrics(
  wow: WoWComparison | null,
  correctedKpiData: Record<string, unknown> | undefined
): KeyMetric[] {
  if (!wow) return [];
  const findMetric = (name: string) => wow.metrics.find((m) => m.metric === name);

  const deliveries = findMetric("Deliveries");
  const processing = findMetric("Processing");
  const exports = findMetric("Exports");
  const stocks = findMetric("Stocks");

  const metrics: KeyMetric[] = [];

  if (deliveries) {
    metrics.push({
      label: "Deliveries",
      currentWeekKt: deliveries.thisWeek,
      cropYearKt: Number(correctedKpiData?.cy_deliveries_kt ?? 0),
      wowChangePct: deliveries.changePct,
      insight: deliveries.changePct > 5
        ? "Accelerating pace — farmers are moving grain"
        : deliveries.changePct < -5
          ? "Delivery pace slowing this week"
          : "Steady delivery pace",
      color: "#2e6b9e",
    });
  }

  if (processing) {
    metrics.push({
      label: "Processing",
      currentWeekKt: processing.thisWeek,
      cropYearKt: 0, // Not available from WoW
      wowChangePct: processing.changePct,
      insight: processing.changePct > 5
        ? "Crush demand picking up"
        : processing.changePct < -5
          ? "Processing volume declining"
          : "Processing at typical levels",
      color: "#437a22",
    });
  }

  if (exports) {
    metrics.push({
      label: "Exports",
      currentWeekKt: exports.thisWeek,
      cropYearKt: 0,
      wowChangePct: exports.changePct,
      insight: exports.changePct > 10
        ? "Export surge — international demand strengthening"
        : exports.changePct < -10
          ? "Export drawback this week"
          : "Export flow at normal pace",
      color: "#c17f24",
    });
  }

  if (stocks) {
    metrics.push({
      label: "Stocks",
      currentWeekKt: stocks.thisWeek,
      cropYearKt: 0,
      wowChangePct: stocks.changePct,
      insight: stocks.changePct > 0
        ? "Inventory building — more coming in than going out"
        : stocks.changePct < -3
          ? "Stock drawdown — tightening supply pipeline"
          : "Stocks stable",
      color: "#8b7355",
    });
  }

  return metrics;
}
```

**Step 4: Build net balance data from pipeline velocity**

```typescript
function buildNetBalanceData(pipelineData: CumulativeWeekRow[]): NetBalanceWeek[] {
  // Pipeline velocity gives us cumulative data; we need Current Week diffs
  // For now, use the per-week delta approach from cumulative series
  let cumulative = 0;
  return pipelineData.map((week) => {
    const deliveries = week.producer_deliveries_kt;
    const exports = week.exports_kt;
    const processing = week.processing_kt;
    const net = deliveries - exports - processing;
    cumulative += net;
    return {
      grain_week: week.grain_week,
      deliveries_kt: deliveries,
      exports_kt: exports,
      processing_kt: processing,
      net_balance_kt: net,
      cumulative_kt: cumulative,
    };
  });
}
```

**Note:** The `get_pipeline_velocity` RPC returns cumulative Crop Year data. For per-week net balance, compute the week-to-week delta of each metric. If the existing data is already Current Week (check `period` parameter), use directly.

**Step 5: Rewrite the JSX layout**

Replace everything from `{/* ========== KEY METRICS */}` through `{/* ========== EXPANDABLE DETAIL */}` with the new section ordering. Keep Hero and GrainPageTransition wrapper intact.

**Step 6: Remove unused imports**

Remove imports for:
- `FlowDonutChart`
- `SupplyPipeline`
- `IntelligenceKpis`
- `XSignalFeed` (if no longer used — keep if still in compact strip)
- `getWeeklyFlowBreakdown`
- `getSupplyPipeline`

**Step 7: Verify build**

Run: `npm run build`
Expected: Build passes with no errors

**Step 8: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: restructure grain detail page with new Wave 2 layout"
```

---

### Task 11: Remove Unused Components & Verify

**Purpose:** Clean up components that are no longer imported anywhere after the page restructure. Verify with grep before deleting.

**Files:**
- Potentially delete: `components/dashboard/flow-donut-chart.tsx`
- Potentially delete: `components/dashboard/supply-pipeline.tsx`
- Potentially delete: `components/dashboard/intelligence-kpis.tsx`

**Step 1: Grep for remaining imports**

```bash
# Check each component for remaining imports
grep -r "FlowDonutChart" --include="*.tsx" --include="*.ts" .
grep -r "SupplyPipeline" --include="*.tsx" --include="*.ts" .
grep -r "IntelligenceKpis" --include="*.tsx" --include="*.ts" .
grep -r "XSignalFeed" --include="*.tsx" --include="*.ts" .
```

**Step 2: Delete only files with zero remaining imports**

Only delete files where grep returns zero results (excluding the file itself). If a component is still imported elsewhere (e.g., Overview page), DO NOT delete it.

**Important:** `CompactSignalStrip` is used on both Overview and grain detail — do NOT delete.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused components after grain page redesign"
```

---

### Task 12: Build, Visual Verify, & STATUS.md

**Purpose:** Final verification — build passes, no console errors, visual check of the grain detail page, update STATUS.md.

**Files:**
- Modify: `docs/plans/STATUS.md`

**Step 1: Full build**

Run: `npm run build`
Expected: 0 errors

**Step 2: Visual verification**

Start dev server and navigate to a grain detail page (e.g., `/grain/canola`). Verify:
- [ ] Hero section renders with stance badge + thesis bullets + data freshness
- [ ] 4 key metric cards render with WoW changes
- [ ] Net balance chart shows green/amber bars
- [ ] Delivery breakdown stacked area renders
- [ ] Provincial map + grain storage side by side
- [ ] Logistics card has week labels
- [ ] Pipeline velocity chart renders full-width
- [ ] Grain quality donut shows grade distribution
- [ ] CompactSignalStrip renders
- [ ] Bull & Bear cards visible (not collapsed)
- [ ] WoW detail in collapsed `<details>`
- [ ] No console errors introduced by our changes (pre-existing Recharts NaN warnings are acceptable)

**Step 3: Update STATUS.md**

Add Wave 2 completion entry under the appropriate track.

**Step 4: Commit**

```bash
git add docs/plans/STATUS.md
git commit -m "docs: update STATUS.md with Wave 2 completion"
```

---

## Dependency Graph

```
Task 1 (grade query) ──────────────────────────┐
Task 2 (delivery channel query) ────────────────┤
Task 3 (KeyMetricsCards) ───────────────────────┤
Task 4 (NetBalanceChart) ───────────────────────┤
Task 5 (DeliveryBreakdownChart) ────────────────┼──→ Task 10 (page restructure) ──→ Task 11 (cleanup) ──→ Task 12 (verify)
Task 6 (GrainQualityDonut) ────────────────────┤
Task 7 (StorageBreakdown redesign) ─────────────┤
Task 8 (BullBearCards enhance) ─────────────────┤
Task 9 (LogisticsCard week labels) ─────────────┘
```

Tasks 1-9 are independent and can be executed in any order. Task 10 depends on all of 1-9. Tasks 11-12 are sequential after 10.

---

## Risk Mitigations

1. **PostgREST truncation on grade query (Task 1):** Terminal Receipts period='Crop Year' returns the latest cumulative snapshot, not all weeks. Expected ~120 rows max. If truncated, create an RPC.
2. **Pipeline velocity data format (Task 10):** The `get_pipeline_velocity` RPC returns cumulative CY data per week. Net balance needs per-week deltas. Compute as `week[n] - week[n-1]`.
3. **Producer cars unit mismatch (Task 2):** Cars count ≠ Kt. Keep as car count in the chart; label axis "Cars" not "Kt".
4. **Pre-existing NaN warnings:** Recharts SVG NaN warnings are pre-existing. Do not attempt to fix in this wave.
