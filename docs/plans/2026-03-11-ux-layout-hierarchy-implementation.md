# UX Layout & Hierarchy Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize Overview and grain detail pages into clearly labeled sections with a shared SectionHeader component, compact signal strip for Overview, and domestic disappearance folded into the supply pipeline.

**Architecture:** Create a shared `SectionHeader` component, a new `CompactSignalStrip` for Overview, extend `SupplyPipeline` with collapsible domestic breakdown, then rewire both page layouts into 3 labeled sections each.

**Tech Stack:** Next.js 16 (App Router), React Server Components, Tailwind CSS, Framer Motion, Recharts

---

### Task 1: Create SectionHeader Component

**Files:**
- Create: `components/dashboard/section-header.tsx`

**Step 1: Create the component**

```tsx
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, children }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="border-l-[3px] border-canola pl-3">
        <h2 className="text-lg font-display font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/section-header.tsx
git commit -m "feat: add shared SectionHeader component with canola left accent"
```

---

### Task 2: Create CompactSignalStrip Component

**Files:**
- Create: `components/dashboard/compact-signal-strip.tsx`

**Step 1: Create the component**

This is a new component for the Overview page only. It renders signals as single-line horizontal-scroll pills instead of large grid cards.

```tsx
"use client";

import { ExternalLink } from "lucide-react";
import { buildXPostHref } from "@/lib/utils/x-post";
import { cn } from "@/lib/utils";

interface CompactSignal {
  sentiment: string;
  category: string;
  post_summary: string;
  post_url?: string | null;
  post_author?: string | null;
  grain: string;
  searched_at?: string | null;
}

interface CompactSignalStripProps {
  signals: CompactSignal[];
}

const sentimentDot: Record<string, string> = {
  bullish: "bg-prairie",
  bearish: "bg-amber-500",
  neutral: "bg-muted-foreground/50",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}\u2026`;
}

export function CompactSignalStrip({ signals }: CompactSignalStripProps) {
  if (!signals || signals.length === 0) return null;

  const visible = signals.slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
        {visible.map((signal, i) => {
          const href = buildXPostHref(
            signal.post_url,
            signal.post_author,
            `${signal.grain} ${signal.post_summary}`
          );

          return (
            <a
              key={`${signal.grain}-${i}`}
              href={href ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex shrink-0 snap-start items-center gap-2.5 rounded-xl border border-border/50 bg-background/70 px-3 py-2 backdrop-blur-sm transition-colors hover:border-canola/25"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  sentimentDot[signal.sentiment] ?? sentimentDot.neutral
                )}
              />
              <span className="text-xs font-semibold text-canola">
                {signal.grain}
              </span>
              <span className="text-xs text-muted-foreground">
                {truncate(signal.post_summary, 60)}
              </span>
              {signal.post_author && (
                <span className="text-[10px] text-muted-foreground/70">
                  @{signal.post_author.replace(/^@/, "")}
                </span>
              )}
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50 group-hover:text-canola" />
            </a>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {visible.length} post{visible.length !== 1 ? "s" : ""} this week
      </p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dashboard/compact-signal-strip.tsx
git commit -m "feat: add CompactSignalStrip for Overview page"
```

---

### Task 3: Add Expandable Domestic Breakdown to SupplyPipeline

**Files:**
- Modify: `components/dashboard/supply-pipeline.tsx`

**Step 1: Extend SupplyPipeline props and add collapsible section**

Add new optional prop `domesticData` of type `Array<{ region: string; ktonnes: number }>` and render it as a collapsible "Domestic Use Breakdown" section below the existing disposition rows.

Changes needed:
1. Add `"use client"` directive (component needs state for collapse toggle)
2. Import `useState` from React and `ChevronDown` from lucide-react
3. Add `domesticData?: Array<{ region: string; ktonnes: number }>` to props
4. After the summary callouts, add a collapsible section:
   - Trigger: button with "Domestic Use Breakdown" label + chevron icon
   - Collapsed by default
   - When expanded, render a simple list of `region: ktonnes` rows using the same `WaterfallRow` subcomponent
   - Use a dashed border separator above the section
5. Import `fmtKt` is already present

Key implementation details:
- Only render the domestic section if `domesticData` has entries with `ktonnes > 0`
- Sort by ktonnes descending
- Use `max` from the parent waterfall for consistent bar widths
- Assign colors from the existing `DESTINATION_COLORS` map in `disposition-bar.tsx` (Pacific, Thunder Bay, etc.) — copy the color map into this file or import from a shared location
- Animate the chevron rotation with `transition-transform duration-200`
- Animate the expand/collapse with `overflow-hidden transition-[max-height] duration-300`

**Step 2: Commit**

```bash
git add components/dashboard/supply-pipeline.tsx
git commit -m "feat: add expandable domestic use breakdown to SupplyPipeline"
```

---

### Task 4: Rewire Overview Page Layout

**Files:**
- Modify: `app/(dashboard)/overview/page.tsx`

**Step 1: Update imports**

Replace `SignalTape` import with `CompactSignalStrip` and add `SectionHeader`:

```tsx
import { CompactSignalStrip } from "@/components/dashboard/compact-signal-strip";
import { SectionHeader } from "@/components/dashboard/section-header";
// Remove: import { SignalTape } from "@/components/dashboard/signal-tape";
```

**Step 2: Restructure the JSX return**

Change the outer container from `space-y-8` to `space-y-10`.

Restructure into 3 labeled sections:

**Section 1: "Prairie Snapshot"**
- Wrap the existing CropSummaryCard section with `SectionHeader`
- Move the existing personalized/default title logic into the SectionHeader `title` prop
- Move the "Set up My Farm" CTA into the SectionHeader `children` slot
- Keep the grid of CropSummaryCards unchanged inside

**Section 2: "Community Pulse"**
- New `SectionHeader` with title="Community Pulse" subtitle="What prairie farmers are thinking and seeing"
- Contains: SentimentBanner (unchanged) + CompactSignalStrip (replacing SignalTape)
- Wrap both in a `space-y-4` div inside a single `SectionBoundary`
- Map signal data the same way, just pass to `CompactSignalStrip` instead of `SignalTape`

**Section 3: "Market Intelligence"**
- New `SectionHeader` with title="Market Intelligence" subtitle="AI-powered weekly analysis"
- Contains: MarketPulseSection (unchanged)
- Replace the inline `<h2>Market Pulse</h2>` inside MarketPulseSection with nothing (the SectionHeader handles it now)

Also update the `MarketPulseSection` function to remove its own `<h2>` tags since the outer SectionHeader now handles the title.

**Step 3: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors. The `SignalTape` import should be cleanly removed (it's still used nowhere else after this change — but don't delete the file yet in case grain detail pages need it).

**Step 4: Commit**

```bash
git add app/(dashboard)/overview/page.tsx
git commit -m "feat: reorganize Overview into 3 labeled sections with compact signal strip"
```

---

### Task 5: Rewire Grain Detail Page Layout

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

**Step 1: Update imports**

Add `SectionHeader` import. Remove `DispositionBar` import (domestic disappearance data will go to SupplyPipeline instead).

```tsx
import { SectionHeader } from "@/components/dashboard/section-header";
// Remove: import { DispositionBar } from "@/components/dashboard/disposition-bar";
```

**Step 2: Pass domestic data to SupplyPipeline**

In the data fetching section, the `distributionResult` (from `getShipmentDistribution`) already returns `{ region: string; ktonnes: number }[]`. Pass this to `SupplyPipeline` as the new `domesticData` prop:

```tsx
<SupplyPipeline
  carry_in_kt={supplyPipelineResult.data.carry_in_kt}
  production_kt={supplyPipelineResult.data.production_kt}
  total_supply_kt={supplyPipelineResult.data.total_supply_kt}
  exports_kt={supplyPipelineResult.data.exports_kt ?? undefined}
  food_industrial_kt={supplyPipelineResult.data.food_industrial_kt ?? undefined}
  feed_waste_kt={supplyPipelineResult.data.feed_waste_kt ?? undefined}
  carry_out_kt={supplyPipelineResult.data.carry_out_kt ?? undefined}
  grain={grain.name}
  domesticData={distributionResult.error ? undefined : (distributionResult.data ?? undefined)}
/>
```

**Step 3: Restructure the JSX into 3 sections**

Replace the two `StaggerGroup` blocks and the scattered content with 3 labeled sections:

**Section 1: "Market Intelligence"**
- `SectionHeader` title="Market Intelligence" subtitle="AI-powered thesis for this week"
- Contains: ThesisBanner, IntelligenceKpis, WoWComparisonCard
- Wrap in a single `StaggerGroup` with `space-y-6`

**Section 2: "Supply & Movement"**
- `SectionHeader` title="Supply & Movement" subtitle="Where grain is flowing this crop year"
- Contains: GamifiedGrainChart (pipeline velocity), SupplyPipeline (with domestic data), ProvinceMap, WaterfallChart + StorageBreakdown grid
- Wrap in a single `StaggerGroup` with `space-y-6`

**Section 3: "Community Pulse"**
- `SectionHeader` title="Community Pulse" subtitle="What farmers are thinking and seeing"
- Contains: XSignalFeed, SentimentPoll
- Wrap in a single `StaggerGroup` with `space-y-6`

**Remove:**
- The standalone `InsightCards` block (index={4}) — overlaps with thesis + KPIs
- The standalone `DispositionBar` / "Domestic Disappearance Breakdown" block (index={3} in second StaggerGroup) — now folded into SupplyPipeline

**Keep spacing:** `space-y-10` between sections (up from `space-y-8`).

**Step 4: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors. `DispositionBar` and `InsightCards` imports removed cleanly.

**Step 5: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: reorganize grain detail into 3 labeled sections, fold domestic breakdown into supply pipeline"
```

---

### Task 6: Visual QA and Polish

**Files:**
- Possibly touch: any of the above files for spacing/alignment tweaks

**Step 1: Start dev server and check Overview page**

Run: `npm run dev`

Verify:
- [ ] 3 labeled sections visible with canola left accent
- [ ] "Prairie Snapshot" section shows 5 grain cards
- [ ] "Community Pulse" shows sentiment banner + compact signal strip (horizontal scroll)
- [ ] "Market Intelligence" shows AI thesis cards
- [ ] Clear visual separation between sections (space-y-10)
- [ ] No duplicate section titles (MarketPulseSection should not have its own h2)

**Step 2: Check grain detail page (e.g., /grain/wheat)**

Verify:
- [ ] 3 labeled sections visible with canola left accent
- [ ] "Market Intelligence" has thesis + KPIs + WoW
- [ ] "Supply & Movement" has pipeline velocity, supply pipeline with expandable domestic breakdown, province map, waterfall + storage
- [ ] "Community Pulse" has X signal feed with voting + sentiment poll
- [ ] No standalone "Domestic Disappearance Breakdown" card
- [ ] No standalone "Market Signals" (InsightCards) section
- [ ] Domestic breakdown expands/collapses within supply pipeline card

**Step 3: Check sign-in page**

Verify:
- [ ] Only one Bushel Board logo visible (top-left corner)
- [ ] No duplicate logo in the left content area on desktop

**Step 4: Fix any visual issues found**

Adjust spacing, alignment, or text as needed.

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: visual QA polish for section hierarchy redesign"
```

---

### Task 7: Clean Up Unused Imports

**Files:**
- Check: `components/dashboard/signal-tape.tsx` — verify if still used anywhere
- Check: `components/dashboard/disposition-bar.tsx` — verify if still used anywhere
- Check: `components/dashboard/insight-cards.tsx` — verify if still used anywhere

**Step 1: Search for remaining usages**

```bash
grep -r "SignalTape" --include="*.tsx" --include="*.ts" -l
grep -r "DispositionBar" --include="*.tsx" --include="*.ts" -l
grep -r "InsightCards" --include="*.tsx" --include="*.ts" -l
```

**Step 2: If only the component definition file remains, delete it**

Only delete files that have zero imports elsewhere. Don't delete if other pages still use them.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove unused SignalTape/DispositionBar/InsightCards if unreferenced"
```
