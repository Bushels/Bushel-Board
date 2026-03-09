# Overview & My Farm Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static Overview page with interactive waterfall + cumulative area charts backed by real AAFC supply/disposition data and CGC weekly data, add delivery logging to My Farm, and create a prairie horizon logo.

**Architecture:** New `supply_disposition` table stores AAFC balance sheet data. Overview page combines this with existing `cgc_observations` via new query functions. My Farm gains delivery logging via JSONB column on `crop_plans`. All charts use Recharts ComposedChart with real data.

**Tech Stack:** Next.js 15, Supabase (PostgreSQL + RLS), Recharts 3.7, shadcn/ui, Tailwind CSS 4, TypeScript

**Design Doc:** `docs/plans/2026-03-05-overview-myfarm-redesign.md`

**App Root:** `c:\Users\kyle\Agriculture\bushel-board-app\`

**CGC Data Field Reference (verified from CSV):**
- Worksheets: `Primary`, `Process`, `Summary`, `Terminal Stocks`, `Terminal Exports`, `Terminal Disposition`, `Feed Grains`, `Imported Grains`, `Producer Cars`, shipment distribution variants
- Deliveries: `worksheet='Primary' AND metric='Deliveries'`, regions: `Alberta`, `Saskatchewan`, `Manitoba`
- Producer Deliveries to crushers: `worksheet='Process' AND metric='Producer Deliveries'`
- Commercial Stocks: `worksheet='Primary' AND metric='Stocks'`, regions: AB/SK/MB
- Crusher Stocks: `worksheet='Process' AND metric='Stocks'`, regions: AB/SK/MB
- Terminal Stocks: `worksheet='Terminal Stocks' AND metric='Stocks'`, regions: port names
- Summary Stocks: `worksheet='Summary' AND metric='Stocks'`, regions: `Primary Elevators`, `Process Elevators`, port names
- Exports: `worksheet='Terminal Exports' AND metric='Exports'`, regions: port names
- Processing: `worksheet='Process' AND metric='Milled/Mfg Grain'`
- Periods: `Crop Year` (cumulative YTD), `Current Week` (snapshot)
- Grade: empty string `''` for province-level data, grade codes only in terminal worksheets
- Grain names: `Wheat`, `Amber Durum`, `Barley`, `Canola`, `Oats`, `Lentils`, `Peas`, `Beans`, `Corn`, `Flaxseed`, `Soybeans`, `Rye`, `Mustard Seed`, `Chick Peas`, `Canaryseed`, `Sunflower`
- **NO "disappearance" worksheet** — domestic disappearance = Processing (Milled/Mfg) + Terminal Disposition (Canadian Domestic)

---

## Task 1: Supply Disposition Migration

**Files:**
- Create: `supabase/migrations/20260305300000_supply_disposition.sql`

**Step 1: Write the migration**

```sql
-- Supply & Disposition balance sheet data (AAFC / StatsCan)
CREATE TABLE IF NOT EXISTS supply_disposition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain_slug text NOT NULL REFERENCES grains(slug),
  crop_year text NOT NULL,
  carry_in_kt numeric,
  production_kt numeric,
  imports_kt numeric,
  total_supply_kt numeric,
  exports_kt numeric,
  food_industrial_kt numeric,
  feed_waste_kt numeric,
  seed_kt numeric,
  total_domestic_kt numeric,
  carry_out_kt numeric,
  source text NOT NULL DEFAULT 'AAFC',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per grain/year/source combo
ALTER TABLE supply_disposition
  ADD CONSTRAINT supply_disposition_unique
  UNIQUE (grain_slug, crop_year, source);

-- Public read, service-role write
ALTER TABLE supply_disposition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read supply_disposition"
  ON supply_disposition FOR SELECT USING (true);
CREATE POLICY "Service role write supply_disposition"
  ON supply_disposition FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 2: Apply migration**

Run: `cd ../bushel-board-app && npx supabase db push`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/20260305300000_supply_disposition.sql
git commit -m "feat: add supply_disposition table for AAFC balance sheet data"
```

---

## Task 2: Seed AAFC Supply & Disposition Data

**Files:**
- Create: `scripts/seed-supply-disposition.ts`

**Step 1: Write the seed script**

Create a Node.js script that inserts all AAFC data for 2023-24, 2024-25, and 2025-26 into the `supply_disposition` table. Use the Supabase service role client.

**Data source:** The full AAFC tables are documented in `docs/plans/2026-03-05-overview-myfarm-redesign.md` section 1.3.

**Grain slug mapping** (AAFC name → existing grains.slug):
- "Wheat (All)" → `wheat`
- "Durum" → `amber-durum`
- "Barley" → `barley`
- "Corn" → `corn`
- "Oats" → `oats`
- "Rye" → `rye`
- "Canola" → `canola`
- "Flaxseed" → `flaxseed`
- "Soybeans" → `soybeans`
- "Dry Peas" → `dry-peas`
- "Lentils" → `lentils`
- "Dry Beans" → `dry-beans`
- "Chickpeas" → `chick-peas`
- "Mustard Seed" → `mustard-seed`
- "Canary Seed" → `canary-seed`
- "Sunflower Seed" → `sunflower-seed`

**Note:** Some grains in AAFC may not have matching slugs in the `grains` table. The script should check for missing slugs and report them to stderr. Insert only matching grains.

The script must:
- Accept `--help` flag
- Output JSON to stdout, diagnostics to stderr
- Be idempotent (upsert on unique constraint)
- Use service role key from `.env.local`

**Also include StatsCan Nov 2025 production data** from `../Bushel Board/data/PrincipleFieldCrops_Nov2025.csv` as `source = 'StatsCan_Nov2025'` rows (only `production_kt` populated, other fields null).

**Step 2: Add package.json script**

Add to `package.json` scripts: `"seed-supply": "npx tsx scripts/seed-supply-disposition.ts"`

**Step 3: Run the seed**

Run: `npm run seed-supply`
Expected: JSON output with inserted count, no errors

**Step 4: Verify data**

Run: `npx supabase db execute "SELECT grain_slug, crop_year, source, total_supply_kt FROM supply_disposition ORDER BY grain_slug, crop_year LIMIT 20;"`
Expected: Rows for wheat, canola, barley etc. with real Kt values

**Step 5: Commit**

```bash
git add scripts/seed-supply-disposition.ts package.json
git commit -m "feat: seed AAFC supply/disposition data for 2023-2026"
```

---

## Task 3: Supply Disposition Query Functions

**Files:**
- Create: `lib/queries/supply-disposition.ts`

**Step 1: Write query module**

```typescript
import { createClient } from "@/lib/supabase/server";

export interface SupplyDisposition {
  grain_slug: string;
  crop_year: string;
  carry_in_kt: number | null;
  production_kt: number | null;
  imports_kt: number | null;
  total_supply_kt: number | null;
  exports_kt: number | null;
  food_industrial_kt: number | null;
  feed_waste_kt: number | null;
  seed_kt: number | null;
  total_domestic_kt: number | null;
  carry_out_kt: number | null;
  source: string;
}

export async function getSupplyDisposition(
  grainSlug: string,
  cropYear: string = "2025-26",
  source: string = "AAFC"
): Promise<SupplyDisposition | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supply_disposition")
    .select("*")
    .eq("grain_slug", grainSlug)
    .eq("crop_year", cropYear)
    .eq("source", source)
    .single();
  return data;
}

export async function getSupplyDispositionForGrains(
  grainSlugs: string[],
  cropYear: string = "2025-26"
): Promise<SupplyDisposition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supply_disposition")
    .select("*")
    .in("grain_slug", grainSlugs)
    .eq("crop_year", cropYear)
    .eq("source", "AAFC");
  return data ?? [];
}
```

**Step 2: Commit**

```bash
git add lib/queries/supply-disposition.ts
git commit -m "feat: add supply/disposition query functions"
```

---

## Task 4: Crop Year Format Fix

**Files:**
- Modify: `lib/queries/crop-plans.ts` (lines with `"2025-2026"`)
- Modify: `app/(dashboard)/my-farm/actions.ts` (line with `"2025-26"`)

**Step 1: Standardize on `"2025-26"` format**

The database uses `"2025-26"` in `cgc_observations.crop_year`. But `lib/queries/crop-plans.ts` defaults to `"2025-2026"`. Fix to use `"2025-26"` everywhere.

In `lib/queries/crop-plans.ts`, change the default parameter:
- `cropYear = "2025-2026"` → `cropYear = "2025-26"`
- Do this for both `getUserCropPlans` and `getUserUnlockedGrains`

Verify `actions.ts` already uses `"2025-26"`.

**Step 2: Commit**

```bash
git add lib/queries/crop-plans.ts
git commit -m "fix: standardize crop year format to '2025-26'"
```

---

## Task 5: Add Deliveries Column to crop_plans

**Files:**
- Create: `supabase/migrations/20260305300100_crop_plans_deliveries.sql`

**Step 1: Write the migration**

```sql
-- Add delivery logging to crop_plans
ALTER TABLE crop_plans
  ADD COLUMN IF NOT EXISTS deliveries jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Ensure volume_left_to_sell_kt exists (may already from Gemini build)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crop_plans' AND column_name = 'volume_left_to_sell_kt'
  ) THEN
    ALTER TABLE crop_plans ADD COLUMN volume_left_to_sell_kt numeric;
  END IF;
END $$;

COMMENT ON COLUMN crop_plans.deliveries IS 'JSON array of {date, amount_kt, destination?} delivery log entries';
```

**Step 2: Apply migration**

Run: `cd ../bushel-board-app && npx supabase db push`

**Step 3: Commit**

```bash
git add supabase/migrations/20260305300100_crop_plans_deliveries.sql
git commit -m "feat: add deliveries JSONB column to crop_plans"
```

---

## Task 6: CGC Storage Breakdown Query

**Files:**
- Modify: `lib/queries/observations.ts`

**Step 1: Add storage breakdown query**

Add to the end of `lib/queries/observations.ts`:

```typescript
export interface StorageBreakdown {
  region: string;
  ktonnes: number;
}

export async function getStorageBreakdown(
  grainName: string,
  cropYear?: string
): Promise<StorageBreakdown[]> {
  const supabase = await createClient();
  const year = cropYear ?? (await getLatestCropYear(supabase));
  const week = await getLatestWeek(supabase, year);

  const { data } = await supabase
    .from("cgc_observations")
    .select("region, ktonnes")
    .eq("crop_year", year)
    .eq("grain_week", week)
    .eq("worksheet", "in-store")
    .eq("metric", "stocks")
    .eq("period", "Current Week")
    .eq("grain", grainName)
    .eq("grade", "Total")
    .in("region", [
      "Primary Elevator",
      "Terminal Elevator",
      "Process Elevator",
      "Total Commercial"
    ]);

  return data ?? [];
}
```

**Note:** The exact region names in CGC data for storage types need verification. Check the actual values in `cgc_observations` with:
```sql
SELECT DISTINCT region FROM cgc_observations
WHERE worksheet = 'in-store' AND metric = 'stocks'
ORDER BY region;
```
Adjust the `.in("region", [...])` filter to match actual CGC region naming.

**Step 2: Commit**

```bash
git add lib/queries/observations.ts
git commit -m "feat: add storage breakdown query for CGC in-store data"
```

---

## Task 7: Cumulative Deliveries & Disappearance Query

**Files:**
- Modify: `lib/queries/observations.ts`

**Step 1: Add cumulative time-series query**

Add to `lib/queries/observations.ts`:

```typescript
export interface CumulativeWeekRow {
  grain_week: number;
  week_ending_date: string;
  producer_deliveries_kt: number;
  domestic_disappearance_kt: number;
  exports_kt: number;
}

export async function getCumulativeTimeSeries(
  grainName: string,
  cropYear?: string
): Promise<CumulativeWeekRow[]> {
  const supabase = await createClient();
  const year = cropYear ?? (await getLatestCropYear(supabase));

  // Get cumulative producer deliveries
  const { data: deliveries } = await supabase
    .from("cgc_observations")
    .select("grain_week, week_ending_date, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("grade", "Total")
    .eq("worksheet", "deliveries")
    .eq("metric", "producer-deliveries")
    .eq("period", "Crop Year To Date")
    .eq("region", "Total Western")
    .order("grain_week", { ascending: true });

  // Get cumulative domestic disappearance
  const { data: disappearance } = await supabase
    .from("cgc_observations")
    .select("grain_week, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("grade", "Total")
    .eq("worksheet", "domestic-disappearance")
    .eq("metric", "domestic-disappearance")
    .eq("period", "Crop Year To Date")
    .eq("region", "Total")
    .order("grain_week", { ascending: true });

  // Get cumulative exports
  const { data: exports } = await supabase
    .from("cgc_observations")
    .select("grain_week, ktonnes")
    .eq("crop_year", year)
    .eq("grain", grainName)
    .eq("grade", "Total")
    .eq("worksheet", "exports")
    .eq("metric", "exports")
    .eq("period", "Crop Year To Date")
    .eq("region", "Total")
    .order("grain_week", { ascending: true });

  // Merge by grain_week
  const weekMap = new Map<number, CumulativeWeekRow>();
  for (const d of deliveries ?? []) {
    weekMap.set(d.grain_week, {
      grain_week: d.grain_week,
      week_ending_date: d.week_ending_date,
      producer_deliveries_kt: d.ktonnes,
      domestic_disappearance_kt: 0,
      exports_kt: 0,
    });
  }
  for (const d of disappearance ?? []) {
    const row = weekMap.get(d.grain_week);
    if (row) row.domestic_disappearance_kt = d.ktonnes;
  }
  for (const e of exports ?? []) {
    const row = weekMap.get(e.grain_week);
    if (row) row.exports_kt = e.ktonnes;
  }

  return Array.from(weekMap.values()).sort(
    (a, b) => a.grain_week - b.grain_week
  );
}
```

**Important:** The exact `worksheet`, `metric`, `period`, and `region` values depend on what's in the CGC CSV. Verify with:
```sql
SELECT DISTINCT worksheet, metric, period, region
FROM cgc_observations
WHERE grain = 'Canola' AND grade = 'Total'
ORDER BY worksheet, metric;
```
Adjust filter values to match actual data.

**Step 2: Commit**

```bash
git add lib/queries/observations.ts
git commit -m "feat: add cumulative time-series query for deliveries + disappearance"
```

---

## Task 8: Waterfall Chart Component

**Files:**
- Create: `components/dashboard/waterfall-chart.tsx`

**Step 1: Build the waterfall chart**

Create a Recharts BarChart-based waterfall visualization. Each bar segment represents a step in the supply balance:

1. Carry-in (green, starts at 0)
2. + Production (green, stacks on carry-in)
3. − Exports (red, subtracts)
4. − Food/Industrial (orange, subtracts)
5. − Feed/Waste (yellow, subtracts)
6. = Carry-out (blue, final bar)

**Props interface:**
```typescript
interface WaterfallChartProps {
  data: SupplyDisposition;
  grainName: string;
}
```

Use Recharts `BarChart` with invisible bottom segments to create the waterfall effect. Each bar has a transparent "base" plus a colored "value" segment.

**Styling:**
- Green (#437a22) for additions (carry-in, production)
- Red/orange shades for subtractions (exports, food/industrial, feed/waste)
- Blue (#2e6b9e) for ending stocks
- Animate on mount with `animationDuration={1000}`
- Responsive container
- Custom tooltip showing Kt values and % of total supply

**Step 2: Commit**

```bash
git add components/dashboard/waterfall-chart.tsx
git commit -m "feat: add waterfall chart component for supply/disposition"
```

---

## Task 9: Cumulative Pace Chart Component

**Files:**
- Create: `components/dashboard/pace-chart.tsx`

**Step 1: Build the cumulative area chart**

Recharts `ComposedChart` with:
- X-axis: grain weeks (1–52, but only show weeks with data)
- Area: Producer Deliveries (canola gold #c17f24, filled, 0.3 opacity)
- Line: Domestic Disappearance (prairie green #437a22, dashed, strokeWidth 2)
- Line: My Farm Deliveries (province color, dotted, only when userDeliveries provided)

**Props interface:**
```typescript
interface PaceChartProps {
  weeklyData: CumulativeWeekRow[];
  userDeliveries?: { grain_week: number; cumulative_kt: number }[];
  grainName: string;
}
```

**Custom tooltip:** Show weekly values for all three traces plus breakdown of disappearance into exports vs processing (exports_kt from data, processing = disappearance - exports).

**Styling:** Match existing animation patterns (1000ms duration, spring easing).

**Step 2: Commit**

```bash
git add components/dashboard/pace-chart.tsx
git commit -m "feat: add cumulative pace chart for deliveries vs disappearance"
```

---

## Task 10: Storage Breakdown Component

**Files:**
- Create: `components/dashboard/storage-breakdown.tsx`

**Step 1: Build the storage breakdown**

Horizontal stacked bar showing where grain is physically stored:
- Commercial Elevator (wheat-600)
- Terminal Elevator (canola #c17f24)
- Crusher/Processor (prairie #437a22)

**Props interface:**
```typescript
interface StorageBreakdownProps {
  data: StorageBreakdown[];
  grainName: string;
}
```

Simple horizontal bar using Recharts `BarChart` with `layout="vertical"` and stacked bars. Show Kt values and percentages in labels. Compact design for sidebar or inline placement.

**Step 2: Commit**

```bash
git add components/dashboard/storage-breakdown.tsx
git commit -m "feat: add storage breakdown component"
```

---

## Task 11: Prairie Horizon Logo (SVG)

**Files:**
- Create: `public/logo.svg`
- Create: `public/favicon.svg`
- Create: `components/layout/logo.tsx`
- Modify: `components/layout/nav.tsx`
- Modify: `app/layout.tsx` (favicon meta)

**Step 1: Create the SVG logo**

Design a minimal prairie horizon SVG:
- Flat horizon line across bottom third
- Small grain elevator silhouette (right of center)
- Rising sun arc (left, half-circle above horizon)
- Optional wheat stalk detail
- ViewBox: `0 0 40 40` for icon, `0 0 200 40` for full lockup with text
- Stroke-based for scalability, canola gold (#c17f24) as primary color
- Dark mode variant: use wheat-200 (#e8e4d9) stroke

**Step 2: Create Logo component**

```typescript
// components/layout/logo.tsx
import Image from "next/image";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/logo.svg"
      alt="Bushel Board"
      width={size}
      height={size}
      className="dark:invert-[.85] dark:sepia dark:hue-rotate-[350deg]"
    />
  );
}
```

**Step 3: Update nav.tsx**

Replace the text-only "Bushel Board" in `components/layout/nav.tsx` with the Logo component + text:
```tsx
<Logo size={28} />
<span className="text-lg font-semibold font-display text-canola">
  Bushel Board
</span>
```

**Step 4: Update favicon in layout.tsx**

Add to `app/layout.tsx` metadata:
```typescript
icons: {
  icon: "/favicon.svg",
},
```

**Step 5: Commit**

```bash
git add public/logo.svg public/favicon.svg components/layout/logo.tsx
git add components/layout/nav.tsx app/layout.tsx
git commit -m "feat: add prairie horizon logo and favicon"
```

---

## Task 12: Overview Page — Crop Year Summary Cards

**Files:**
- Create: `components/dashboard/crop-summary-card.tsx`
- Modify: `app/(dashboard)/overview/page.tsx`

**Step 1: Build CropSummaryCard component**

Replaces the existing `PipelineCard` for the Overview hero section. Shows richer data per grain:

```typescript
interface CropSummaryCardProps {
  grain: string;
  slug: string;
  startingStock: number; // carry_in + production from supply_disposition
  cyDeliveries: number;  // from v_grain_overview
  cwDeliveries: number;  // current week
  wowChange: number;     // week-over-week %
  isUnlocked: boolean;
  index: number;         // for stagger animation
}
```

Card layout:
- Grain name + lock icon if not unlocked
- "Starting: X,XXX Kt" (carry-in + production)
- Progress bar: % delivered = cyDeliveries / startingStock
- Current week deliveries with WoW badge
- Click → grain detail page (or unlock modal if locked)

Use existing design tokens: `bg-card/40 backdrop-blur-sm`, stagger animation `${index * 40}ms`.

**Step 2: Update Overview page**

Modify `app/(dashboard)/overview/page.tsx`:
- Import `getSupplyDispositionForGrains` from new query module
- Fetch supply data for top 5 grains: `["wheat", "canola", "barley", "oats", "lentils"]`
- Fetch user's unlocked grains (if authenticated)
- Replace PipelineCard section with CropSummaryCards
- Keep GrainTable at bottom

**Step 3: Commit**

```bash
git add components/dashboard/crop-summary-card.tsx app/(dashboard)/overview/page.tsx
git commit -m "feat: replace pipeline cards with crop summary cards on overview"
```

---

## Task 13: Overview Page — Wire Up Charts

**Files:**
- Modify: `app/(dashboard)/overview/page.tsx`
- Create: `app/(dashboard)/overview/client.tsx` (client wrapper for interactive grain selector)

**Step 1: Create client wrapper**

The Overview page needs a grain selector that controls which grain the waterfall chart, pace chart, and storage breakdown show. This requires client-side state.

```typescript
// app/(dashboard)/overview/client.tsx
"use client";

import { useState } from "react";
import { WaterfallChart } from "@/components/dashboard/waterfall-chart";
import { PaceChart } from "@/components/dashboard/pace-chart";
import { StorageBreakdown } from "@/components/dashboard/storage-breakdown";

interface OverviewChartsProps {
  supplyData: Record<string, SupplyDisposition>;
  weeklyData: Record<string, CumulativeWeekRow[]>;
  storageData: Record<string, StorageBreakdown[]>;
  userDeliveries?: Record<string, { grain_week: number; cumulative_kt: number }[]>;
  defaultGrains: string[];
}
```

The server page pre-fetches all data for the 5 default grains and passes it down. The client component manages which grain is selected via tabs.

**Step 2: Update server page**

In `overview/page.tsx`, fetch all data in parallel:
- `getSupplyDispositionForGrains(defaultSlugs)`
- `getCumulativeTimeSeries(grainName)` for each grain (parallel with `Promise.all`)
- `getStorageBreakdown(grainName)` for each grain
- Pass all data to `OverviewCharts` client component

**Step 3: Commit**

```bash
git add app/(dashboard)/overview/client.tsx app/(dashboard)/overview/page.tsx
git commit -m "feat: wire up waterfall, pace, and storage charts on overview"
```

---

## Task 14: My Farm — Delivery Logging

**Files:**
- Modify: `app/(dashboard)/my-farm/actions.ts`
- Modify: `app/(dashboard)/my-farm/client.tsx`
- Create: `components/dashboard/log-delivery-modal.tsx`

**Step 1: Add delivery server actions**

Add to `actions.ts`:
```typescript
export async function logDelivery(formData: FormData) {
  const grain = formData.get("grain") as string;
  const amount_kt = parseFloat(formData.get("amount_kt") as string);
  const date = formData.get("date") as string;
  const destination = formData.get("destination") as string | null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get current deliveries array
  const { data: plan } = await supabase
    .from("crop_plans")
    .select("deliveries")
    .eq("user_id", user.id)
    .eq("crop_year", "2025-26")
    .eq("grain", grain)
    .single();

  if (!plan) throw new Error("No crop plan for this grain");

  const deliveries = [...(plan.deliveries || []), { date, amount_kt, destination }];

  await supabase
    .from("crop_plans")
    .update({ deliveries })
    .eq("user_id", user.id)
    .eq("crop_year", "2025-26")
    .eq("grain", grain);

  revalidatePath("/my-farm");
  revalidatePath("/overview");
}
```

**Step 2: Build LogDeliveryModal component**

Modal with: grain (pre-selected), date picker, amount (tonnes with Kt conversion), optional destination text input. Uses shadcn Dialog + form.

**Step 3: Update My Farm client**

Add delivery logging UI to each crop card:
- Show total delivered (sum of deliveries array)
- Show remaining = volume_left_to_sell_kt - total delivered
- Progress bar: delivered / starting amount
- "Log Delivery" button opens modal

**Step 4: Commit**

```bash
git add app/(dashboard)/my-farm/actions.ts app/(dashboard)/my-farm/client.tsx
git add components/dashboard/log-delivery-modal.tsx
git commit -m "feat: add delivery logging to My Farm"
```

---

## Task 15: Wire User Deliveries to Pace Chart

**Files:**
- Modify: `lib/queries/crop-plans.ts`
- Modify: `app/(dashboard)/overview/page.tsx`

**Step 1: Add delivery aggregation query**

Add to `crop-plans.ts`:
```typescript
export async function getUserDeliveryCumulative(
  userId: string,
  grain: string,
  cropYear: string = "2025-26"
): Promise<{ grain_week: number; cumulative_kt: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crop_plans")
    .select("deliveries")
    .eq("user_id", userId)
    .eq("crop_year", cropYear)
    .eq("grain", grain)
    .single();

  if (!data?.deliveries?.length) return [];

  // Sort deliveries by date, compute cumulative
  const sorted = [...data.deliveries].sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let cumulative = 0;
  return sorted.map((d: any) => {
    cumulative += d.amount_kt;
    // Map date to approximate grain week (week 1 = Aug 1)
    const weekStart = new Date(parseInt(cropYear.split("-")[0]), 7, 1);
    const deliveryDate = new Date(d.date);
    const weekNum = Math.ceil(
      (deliveryDate.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    return { grain_week: Math.max(1, weekNum), cumulative_kt: cumulative };
  });
}
```

**Step 2: Pass user deliveries to pace chart**

In `overview/page.tsx`, if user is authenticated, fetch their delivery data for each unlocked grain and pass to `OverviewCharts.userDeliveries`.

**Step 3: Commit**

```bash
git add lib/queries/crop-plans.ts app/(dashboard)/overview/page.tsx
git commit -m "feat: wire user delivery data to pace chart"
```

---

## Task 16: Verify & Fix CGC Data Field Names

**Files:** No file changes — investigation task

**Step 1: Query actual CGC field values**

Before Tasks 6-7 can work correctly, verify the exact values in `cgc_observations`:

```sql
-- Check worksheet names
SELECT DISTINCT worksheet FROM cgc_observations ORDER BY worksheet;

-- Check metrics for deliveries
SELECT DISTINCT metric FROM cgc_observations WHERE worksheet LIKE '%deliver%';

-- Check periods
SELECT DISTINCT period FROM cgc_observations;

-- Check regions for storage
SELECT DISTINCT region FROM cgc_observations WHERE worksheet LIKE '%store%' OR worksheet LIKE '%stock%';

-- Check grain names (exact casing)
SELECT DISTINCT grain FROM cgc_observations ORDER BY grain;
```

**Step 2: Document findings**

Update the query functions in Tasks 6-7 with the correct field values. The filters in the queries (worksheet, metric, period, region) must exactly match what's in the database.

**Step 3: Commit any fixes**

```bash
git add lib/queries/observations.ts
git commit -m "fix: align query filters with actual CGC field values"
```

---

## Execution Order & Dependencies

```
Task 1  (migration)           ─── no deps
Task 2  (seed data)           ─── depends on Task 1
Task 3  (query functions)     ─── depends on Task 1
Task 4  (crop year fix)       ─── no deps
Task 5  (deliveries column)   ─── no deps
Task 16 (verify CGC fields)   ─── no deps, do EARLY

Task 6  (storage query)       ─── depends on Task 16
Task 7  (cumulative query)    ─── depends on Task 16

Task 8  (waterfall chart)     ─── depends on Task 3
Task 9  (pace chart)          ─── depends on Task 7
Task 10 (storage component)   ─── depends on Task 6
Task 11 (logo)                ─── no deps

Task 12 (summary cards)       ─── depends on Tasks 3, 8
Task 13 (wire up overview)    ─── depends on Tasks 8, 9, 10, 12
Task 14 (delivery logging)    ─── depends on Task 5
Task 15 (user deliveries)     ─── depends on Tasks 9, 14
```

**Parallel execution groups:**
1. **Batch 1 (no deps):** Tasks 1, 4, 5, 11, 16
2. **Batch 2 (after batch 1):** Tasks 2, 3, 6, 7
3. **Batch 3 (after batch 2):** Tasks 8, 9, 10
4. **Batch 4 (after batch 3):** Tasks 12, 13, 14
5. **Batch 5 (after batch 4):** Task 15
