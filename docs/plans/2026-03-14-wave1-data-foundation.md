# Wave 1: Data Foundation & Quick Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix data accuracy (AAFC supply baseline, % left in bin calculation, grain week display) and resolve 5 quick UI issues.

**Architecture:** Update AAFC seed data with Feb 2026 figures, add `is_approximate` flag, replace the incorrect "carry-out / total supply" market bin calculation with "Total Opening Supply - CYTD Producer Deliveries", and fix 5 UI issues across auth, My Farm, overview, and grain detail pages.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL), TypeScript, Tailwind CSS

**Design Doc:** `docs/plans/2026-03-14-dashboard-redesign-v2-design.md`

---

### Task 1: Add `is_approximate` column to supply_disposition

**Files:**
- Create: `supabase/migrations/20260314100000_add_is_approximate_to_supply_disposition.sql`

**Step 1: Write the migration**

```sql
-- Add is_approximate flag for grains with estimated carry-over values
ALTER TABLE supply_disposition
  ADD COLUMN IF NOT EXISTS is_approximate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN supply_disposition.is_approximate
  IS 'True when carry-in or production values are approximate (~) estimates, not confirmed figures';
```

**Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: Migration applied successfully.

**Step 3: Commit**

```bash
git add supabase/migrations/20260314100000_add_is_approximate_to_supply_disposition.sql
git commit -m "feat: add is_approximate column to supply_disposition"
```

---

### Task 2: Update seed script with AAFC Feb 2026 figures

**Files:**
- Modify: `scripts/seed-supply-disposition.ts`

**Step 1: Update the AAFC_2025_26 data and source tag**

Replace the `AAFC_SOURCE` constant and the entire `AAFC_2025_26` record with AAFC Feb 2026 figures. Key changes:
- Source tag: `"AAFC_2026-02-18"` (was `"AAFC_2025-11-24"`)
- Canola production: `21804` (was `20028`)
- Wheat production: `32820` (was `36624`), carry_in: `3684` (was `4112`)
- All grains updated to match user-confirmed AAFC Feb 2026 table
- Add `is_approximate` field to `SupplyRow` interface and `AafcRecord` interface
- Mark Chick Peas, Beans, Canaryseed, Mustard Seed, Sunflower Seed as approximate

Updated `AAFC_2025_26` values (production / carry_in / total_supply in Kt):

| Grain slug | production | carry_in | imports | total_supply | is_approximate |
|------------|-----------|----------|---------|-------------|----------------|
| wheat | 32820 | 3684 | 105 | 36609 | false |
| amber-durum | 7135 | 497 | 5 | 7637 | false |
| barley | 9725 | 1249 | 50 | 11024 | false |
| corn | 14867 | 1584 | 1900 | 18351 | false |
| oats | 3920 | 507 | 20 | 4447 | false |
| rye | 683 | 143 | 1 | 827 | false |
| canola | 21804 | 1597 | 101 | 23502 | false |
| flaxseed | 455 | 134 | 10 | 599 | false |
| soybeans | 6793 | 511 | 450 | 7754 | false |
| peas | 3934 | 489 | 20 | 4443 | false |
| lentils | 3363 | 561 | 75 | 3999 | false |
| beans | 438 | 100 | 70 | 608 | true |
| chick-peas | 482 | 180 | 40 | 702 | true |
| mustard-seed | 140 | 85 | 9 | 234 | true |
| canaryseed | 235 | 85 | 0 | 320 | true |
| sunflower | 69 | 48 | 25 | 142 | true |

Note: `total_supply = production + carry_in + imports`. Imports kept from previous AAFC estimates where not updated. The exports/food_industrial/feed_waste/seed/total_domestic/carry_out disposition fields should be kept from previous AAFC data (Nov 2025) since Feb 2026 AAFC update only provided production and carry-over.

**Step 2: Add `is_approximate` to the SupplyRow and AafcRecord interfaces**

In `SupplyRow`, add:
```typescript
is_approximate?: boolean;
```

In `AafcRecord`, add:
```typescript
is_approximate?: boolean;
```

In `aafcToRows()`, pass through:
```typescript
is_approximate: r.is_approximate ?? false,
```

**Step 3: Run the seed in dry-run mode**

Run: `npm run seed-supply -- --dry-run`
Expected: `{ "dry_run": true, "rows_built": 48, ... }` (16 grains × 2 crop years + StatsCan)

**Step 4: Run the actual seed**

Run: `npm run seed-supply`
Expected: All rows upserted successfully, 0 errors.

**Step 5: Verify data in Supabase**

Run via Supabase MCP:
```sql
SELECT grain_slug, production_kt, carry_in_kt, total_supply_kt, is_approximate
FROM supply_disposition
WHERE crop_year = '2025-2026' AND source LIKE 'AAFC%'
ORDER BY total_supply_kt DESC;
```

Verify: Canola shows 21804 / 1597 / 23502 / false. Chick-peas shows is_approximate = true.

**Step 6: Commit**

```bash
git add scripts/seed-supply-disposition.ts
git commit -m "feat: update AAFC supply data to Feb 2026 figures with is_approximate flag"
```

---

### Task 3: Update SupplyDisposition type and query to include is_approximate

**Files:**
- Modify: `lib/queries/supply-disposition.ts`

**Step 1: Add `is_approximate` to the SupplyDisposition interface**

At `lib/queries/supply-disposition.ts:4-18`, add to the interface:
```typescript
is_approximate?: boolean;
```

**Step 2: Verify view includes new column**

The queries hit `v_supply_disposition_current` view. Check if this view needs updating to include `is_approximate`. If the view is just `SELECT *`, the column flows through automatically. If it selects explicit columns, update the view migration.

**Step 3: Commit**

```bash
git add lib/queries/supply-disposition.ts
git commit -m "feat: add is_approximate to SupplyDisposition type"
```

---

### Task 4: Fix "% Left in Bin vs Market" calculation

**Files:**
- Modify: `app/(dashboard)/my-farm/page.tsx:108-125` (marketSupply map building)
- Modify: `app/(dashboard)/my-farm/client.tsx:74-77` (MarketSupplyData interface)
- Modify: `app/(dashboard)/my-farm/client.tsx:414-462` (% left in bin display)

**Step 1: Update MarketSupplyData interface**

At `client.tsx:74-77`, change from:
```typescript
export interface MarketSupplyData {
  total_supply_kt: number;
  carry_out_kt: number;
}
```
To:
```typescript
export interface MarketSupplyData {
  total_opening_supply_kt: number;  // production + carry_in (+ imports if material)
  cytd_producer_deliveries_kt: number;  // Primary.Deliveries + Process.Producer Deliveries CYTD
  is_approximate?: boolean;
}
```

**Step 2: Fetch CYTD producer deliveries in my-farm/page.tsx**

In `page.tsx`, import `getGrainOverview` from `lib/queries/grains.ts` and call it alongside existing parallel fetches. Then build the marketSupply map using:
- `total_opening_supply_kt`: from `supply_disposition.total_supply_kt` (which is production + carry_in + imports)
- `cytd_producer_deliveries_kt`: from grain overview's `cy_deliveries` field (already combines Primary + Process)
- `is_approximate`: from `supply_disposition.is_approximate`

Replace lines 108-125 with the new map building logic.

**Step 3: Update the % Left in Bin calculation in client.tsx**

At `client.tsx:414-462`, replace the calculation:

Old:
```typescript
const marketPctLeft = Math.max(0, Math.min(100, (ms.carry_out_kt / ms.total_supply_kt) * 100));
```

New:
```typescript
const marketBinStock = ms.total_opening_supply_kt - ms.cytd_producer_deliveries_kt;
const marketPctLeft = Math.max(0, Math.min(100, (marketBinStock / ms.total_opening_supply_kt) * 100));
```

**Step 4: Fix the diff label (Item #5 — "38pp" → "38%")**

At `client.tsx:420-424`, change from:
```typescript
const diffLabel = diff > 1
  ? `${Math.abs(diff).toFixed(0)}pp more than market`
  : diff < -1
    ? `${Math.abs(diff).toFixed(0)}pp less than market`
    : "on par with market";
```
To:
```typescript
const diffLabel = diff > 1
  ? `${Math.abs(diff).toFixed(0)}% more grain remaining than the market average`
  : diff < -1
    ? `${Math.abs(diff).toFixed(0)}% less grain remaining than the market average`
    : "on par with market";
```

**Step 5: Update the explanation text**

At `client.tsx:456-458`, change from:
```typescript
Market figure is AAFC projected carry-out as a share of total supply.
```
To:
```typescript
Market figure is total opening supply minus cumulative producer deliveries to date.{ms.is_approximate ? ' Supply estimate is approximate (~).' : ''}
```

**Step 6: Add approximate indicator to market percentage**

If `ms.is_approximate` is true, prefix the market percentage with `~`:
```typescript
<span className="font-display text-lg font-semibold text-muted-foreground">
  {ms.is_approximate ? '~' : ''}{marketPctLeft.toFixed(0)}%
</span>
```

**Step 7: Commit**

```bash
git add app/(dashboard)/my-farm/page.tsx app/(dashboard)/my-farm/client.tsx
git commit -m "fix: correct % left in bin calculation to use CYTD deliveries vs total opening supply"
```

---

### Task 5: Add data freshness indicator to grain detail hero

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx:209-252` (hero section)
- Modify: `lib/utils/crop-year.ts` (add `grainWeekEndDate()` helper)

**Step 1: Add `grainWeekEndDate()` utility**

In `lib/utils/crop-year.ts`, add a function that converts a grain week number to its ending date:

```typescript
/**
 * Calculate the ending date for a given grain week.
 * Week 1 ends 7 days after Aug 1 of the crop year start.
 */
export function grainWeekEndDate(grainWeek: number, cropYear?: string): Date {
  const start = cropYearStartDate(cropYear);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + grainWeek * 7);
  return endDate;
}
```

**Step 2: Add freshness badge to hero section**

In the grain detail page hero section (after the thesis bullets, before the closing `</div>`), add:

```tsx
<p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
    Data: Week {shippingWeek}
    <span className="text-muted-foreground/60">
      (ended {grainWeekEndDate(shippingWeek).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})
    </span>
  </span>
  <span className="text-muted-foreground/40">·</span>
  <span>Current: Week {getCurrentGrainWeek()}</span>
</p>
```

`shippingWeek` is already computed at line 134 via `getLatestImportedWeek()`. `getCurrentGrainWeek()` is already imported.

**Step 3: Commit**

```bash
git add lib/utils/crop-year.ts app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: add data freshness indicator showing data week vs current grain week"
```

---

### Task 6: Fix sign-in "f" font rendering

**Files:**
- Modify: `lib/auth/auth-scene.ts:15` (title text)
- Potentially modify: `app/layout.tsx` or `tailwind.config.ts` (font configuration)

**Step 1: Investigate the Fraunces font "f" issue**

The title "Set up your farm while the market is moving." uses Fraunces display font. The "f" in "farm" may have a ligature or optical size issue. Check:
1. Is Fraunces loaded with `font-display` class? Check `app/layout.tsx` for font setup.
2. Does the `f` render correctly at different weights? Fraunces has variable optical sizing.
3. Test by adding `font-feature-settings: 'liga' 0` to disable ligatures if that's the issue.

**Step 2: Apply fix**

Most likely fix — add to the title element's parent in `components/auth/auth-shell.tsx`:
```css
font-feature-settings: 'liga' 0, 'calt' 0;
```
Or if it's a weight issue, adjust the Fraunces font weight used for the title.

**Step 3: Verify visually with preview tools**

Run: Preview the login page and verify the "f" in "farm" renders correctly.

**Step 4: Commit**

```bash
git add <changed-files>
git commit -m "fix: resolve Fraunces font 'f' rendering issue on sign-in page"
```

---

### Task 7: Fix estimated yield alignment on My Farm crop cards

**Files:**
- Modify: `app/(dashboard)/my-farm/client.tsx:350-357` (yield display area)

**Step 1: Find and update the yield display**

Locate the Estimated Yield row in the crop card. Change from inline `bu/ac` + `t/ac` on same line to:
- Bold `bu/ac` value right-aligned (matching other bold numbers in the card)
- `t/ac` conversion underneath in `text-sm text-muted-foreground`, also right-aligned

Current pattern (approximate):
```tsx
<span className="font-semibold">{buAc} bu/ac</span>
<span className="text-sm text-muted-foreground ml-2">{tAc} t/ac</span>
```

New pattern:
```tsx
<div className="text-right">
  <span className="font-semibold">{buAc} bu/ac</span>
  <div className="text-xs text-muted-foreground">{tAc} t/ac</div>
</div>
```

**Step 2: Commit**

```bash
git add app/(dashboard)/my-farm/client.tsx
git commit -m "fix: align estimated yield value with other bold numbers, t/ac conversion underneath"
```

---

### Task 8: Make grain boxes more obviously clickable on Overview

**Files:**
- Modify: `components/dashboard/crop-summary-card.tsx`

**Step 1: Add visual click affordance**

Add these enhancements to `CropSummaryCard`:

1. Add a "View details →" text at the bottom (only for unlocked grains):
```tsx
{isUnlocked && (
  <span className="text-xs text-canola opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">
    View details <ArrowRight className="h-3 w-3" />
  </span>
)}
```

2. Import `ArrowRight` from lucide-react.

3. Add `cursor-pointer` to the Link className for unlocked grains.

4. Enhance the GlassCard hover effect — the existing `hover` prop is already true by default, so the glass hover works. Add a subtle border transition:
```tsx
<GlassCard index={index} className="transition-all duration-200 hover:border-canola/30">
```

**Step 2: Commit**

```bash
git add components/dashboard/crop-summary-card.tsx
git commit -m "feat: make overview grain boxes more obviously clickable with hover arrow"
```

---

### Task 9: Fix flow donut chart overflow issue

**Files:**
- Modify: `components/dashboard/flow-donut-chart.tsx`

**Step 1: Fix the totalFlow label clipping**

The "Where X Went" header area has a number clipped in the top-left corner. This is likely the `totalFlow` value rendered in a position that overflows the card boundary.

Find the header section and ensure:
1. The container has `overflow-visible` or proper padding
2. The totalFlow label has adequate spacing from the card edge
3. Add `min-w-0` to prevent flex children from overflowing

Look for the header around line 50-51 and the value display. Ensure the value has enough room:
```tsx
<div className="flex items-baseline justify-between gap-2 min-w-0">
```

Note: This is a temporary fix — the flow donut is removed entirely in Wave 2.

**Step 2: Commit**

```bash
git add components/dashboard/flow-donut-chart.tsx
git commit -m "fix: resolve flow donut chart overflow clipping issue"
```

---

### Task 10: Build verification and final check

**Step 1: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass.

**Step 3: Verify visually**

Use preview tools to check:
1. Sign-in page — "f" in "farm" renders correctly
2. My Farm — estimated yield aligned, % left in bin shows correct calculation
3. Grain detail — data freshness badge visible in hero
4. Overview — grain boxes show hover arrow

**Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: wave 1 data foundation build verification"
```

---

## Post-Wave 1 Checklist

After all tasks complete:
- [ ] `npm run build` passes
- [ ] No console errors on affected pages
- [ ] AAFC data verified in Supabase (correct production/carry-in per grain)
- [ ] % left in bin uses new formula (Total Opening Supply - CYTD Deliveries)
- [ ] Approximate grains show `~` prefix
- [ ] Data freshness indicator visible on grain detail page
- [ ] All 5 UI fixes verified visually
- [ ] Update `docs/plans/STATUS.md` with Wave 1 completion
- [ ] Document any non-obvious bugs in `docs/lessons-learned/issues.md`
