# Grain Detail Simplification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip the grain detail page from 12 sections to 3 (Bull/Bear thesis with reasoning columns, embedded Bushy Chat, grain-scoped My Farm) and fix the stale week number display.

**Architecture:** Server Component page (`page.tsx`) fetches only the data needed for 3 sections (intelligence, market analysis, crop plan, recommendations, prices). Removed data queries stay in codebase for chat consumption. New `GrainBushyChat` client wrapper scopes the existing `BushyChat` to the current grain. `BullBearCards` redesigned to two-column table with `{fact, reasoning}` pairs.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL), TypeScript, Tailwind CSS, shadcn/ui, Framer Motion

---

### Task 1: Database Migration — Add reasoning columns to market_analysis

**Files:**
- Create: `supabase/migrations/20260415_add_bull_bear_reasoning.sql`

**Step 1: Write the migration**

```sql
-- Add structured reasoning columns for two-column Bull/Bear display
ALTER TABLE market_analysis
  ADD COLUMN IF NOT EXISTS bull_reasoning jsonb,
  ADD COLUMN IF NOT EXISTS bear_reasoning jsonb;

COMMENT ON COLUMN market_analysis.bull_reasoning IS 'Array of {fact, reasoning} pairs for two-column bull case display';
COMMENT ON COLUMN market_analysis.bear_reasoning IS 'Array of {fact, reasoning} pairs for two-column bear case display';
```

**Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: Migration applied successfully.

**Step 3: Verify columns exist**

Run via Supabase MCP: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'market_analysis' AND column_name IN ('bull_reasoning', 'bear_reasoning');`
Expected: 2 rows, both `jsonb`.

**Step 4: Commit**

```bash
git add supabase/migrations/20260415_add_bull_bear_reasoning.sql
git commit -m "feat(db): add bull_reasoning/bear_reasoning JSONB columns to market_analysis"
```

---

### Task 2: Update data-freshness query — `getDisplayWeek()`

**Files:**
- Modify: `lib/queries/data-freshness.ts`

**Step 1: Add `getDisplayWeek()` function**

Add after the existing `getLatestImportedWeek()` function:

```typescript
/**
 * Get the best week number to display — MAX across market_analysis and cgc_imports.
 * Prevents showing stale week when analysis is current but CGC import lagged.
 * Falls back to getCurrentGrainWeek() if both queries fail.
 */
export async function getDisplayWeek(): Promise<number> {
  try {
    const supabase = await createClient();
    const [importResult, analysisResult] = await Promise.all([
      supabase
        .from("cgc_imports")
        .select("grain_week")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .order("grain_week", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("market_analysis")
        .select("grain_week")
        .eq("crop_year", CURRENT_CROP_YEAR)
        .order("grain_week", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const importWeek = importResult.data ? Number(importResult.data.grain_week) : 0;
    const analysisWeek = analysisResult.data ? Number(analysisResult.data.grain_week) : 0;
    const best = Math.max(importWeek, analysisWeek);

    return best > 0 ? best : getCurrentGrainWeek();
  } catch {
    return getCurrentGrainWeek();
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add lib/queries/data-freshness.ts
git commit -m "feat: add getDisplayWeek() — MAX across imports and analysis"
```

---

### Task 3: Update MarketAnalysis type — add reasoning fields

**Files:**
- Modify: `lib/queries/intelligence.ts`

**Step 1: Update the `MarketAnalysis` interface**

Add after `stance_score: number | null;` (around line 117):

```typescript
  bull_reasoning: Array<{ fact: string; reasoning: string }> | null;
  bear_reasoning: Array<{ fact: string; reasoning: string }> | null;
```

No query changes needed — `select("*")` already fetches all columns.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add lib/queries/intelligence.ts
git commit -m "feat: add bull_reasoning/bear_reasoning to MarketAnalysis type"
```

---

### Task 4: Redesign BullBearCards — two-column reasoning table

**Files:**
- Modify: `components/dashboard/bull-bear-cards.tsx`

**Step 1: Update the component**

Replace the entire file with:
- New props: add `bullReasoning?: Array<{ fact: string; reasoning: string }> | null` and `bearReasoning?: ...`
- When reasoning arrays exist: render a two-column table per case with "What's Happening" | "Why It Matters" headers
- When reasoning is null: fall back to the existing bullet-point rendering (backward compatible)
- Keep the stance spectrum meter and assessment callout exactly as-is

**Key implementation details:**
- Two-column layout uses a `div` grid (not HTML `<table>`) with `grid-cols-2` for responsive behavior
- Left column: `text-sm font-medium text-foreground` — the fact
- Right column: `text-sm text-muted-foreground` — the reasoning in farmer-friendly language
- Row dividers: `border-b border-border/50` between rows
- Bull case header: prairie green accent (existing `border-prairie/20` pattern)
- Bear case header: red accent (existing `border-red-500/20` pattern)
- Each case wrapped in `GlassCard` or rounded border div (consistent with existing)
- Mobile: single column stack (fact on top, reasoning below with left border accent)

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. Existing grain detail page still works (reasoning is null, falls back to bullets).

**Step 3: Commit**

```bash
git add components/dashboard/bull-bear-cards.tsx
git commit -m "feat: redesign BullBearCards with two-column reasoning table"
```

---

### Task 5: Create GrainBushyChat wrapper component

**Files:**
- Create: `components/bushy/grain-bushy-chat.tsx`

**Step 1: Create the wrapper**

```typescript
"use client";

import { BushyChat } from "./bushy-chat";

interface GrainBushyChatProps {
  grainName: string;
  grainWeek: number;
}

const GRAIN_CHIPS = [
  "Show me exports",
  "Compare to last year",
  "Terminal flow",
  "What would you do?",
];

export function GrainBushyChat({ grainName, grainWeek }: GrainBushyChatProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden" style={{ height: 400 }}>
      <BushyChat
        initialPrompt={undefined}
        grainContext={{ grain: grainName, grainWeek }}
      />
    </div>
  );
}
```

**Step 2: Update BushyChat props to accept `grainContext`**

Modify `components/bushy/bushy-chat.tsx`:
- Add `grainContext?: { grain: string; grainWeek: number }` to `BushyChatProps`
- When `grainContext` is set, use grain-specific chips instead of default chips
- Pass `grainContext` through to `useBushySSE()` so the API scopes responses
- Update welcome text to reference the grain: "Ask me anything about {grain} this week"

**Step 3: Update `useBushySSE` to pass grain context**

Modify `components/bushy/use-bushy-sse.ts`:
- Accept `grainContext?: { grain: string; grainWeek: number }` parameter
- Include it in the fetch body sent to `/api/bushy/chat` so the system prompt can scope to the grain

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add components/bushy/grain-bushy-chat.tsx components/bushy/bushy-chat.tsx components/bushy/use-bushy-sse.ts
git commit -m "feat: add GrainBushyChat wrapper with grain-scoped context"
```

---

### Task 6: Rewrite grain detail page — 3 sections only

**Files:**
- Modify: `app/(dashboard)/grain/[slug]/page.tsx`

This is the main task. The page goes from ~700 lines to ~250 lines.

**Step 1: Update imports**

Remove imports for: `KeyMetric`, `KeyMetricsWithVoting`, `NetBalanceChart`, `DeliveryBreakdownChart`, `GrainQualityDonut`, `ProvinceMap`, `StorageBreakdown`, `TerminalFlowChart`, `WoWComparisonCard`, `GamifiedGrainChart`, `FarmerCotCard`, `LogisticsCard`, `CrushUtilizationGauge`, `DeliveryGapChart`, `fmtKt`, `ChevronRight`.

Remove imports for removed query functions: `getCumulativeTimeSeries`, `getDeliveryChannelBreakdown`, `getGradeDistribution`, `getHistoricalPipelineAvg`, `getProcessorInventory`, `getProvincialDeliveries`, `getStorageBreakdown`, `getWeekOverWeekComparison`, `getCotPositioning`, `getLogisticsSnapshot`, `getProcessorCapacity`, `getMetricSentiment`, `getUserMetricVotes`, `getWeeklyTerminalFlow`.

Add imports: `GrainBushyChat` from `@/components/bushy/grain-bushy-chat`, `getDisplayWeek` from `@/lib/queries/data-freshness`, `deriveRecommendation` from `@/lib/utils/recommendations`.

Keep imports: `Link`, `notFound`, `ArrowLeft`, `SectionBoundary`, `SectionHeader`, `SectionStateCard`, `BullBearCards`, `GlassCard`, `MarketStanceBadge`, `Button`, `PriceSparkline`, `getUserRole`, `getGrainBySlug`, `getGrainOverviewBySlug`, `getGrainIntelligence`, `getMarketAnalysis`, `getRecentPrices`, `createClient`, `CURRENT_CROP_YEAR`, `cropYearLabel`, `getCurrentGrainWeek`, `grainWeekEndDate`, `safeQuery`, `GrainPageTransition`.

**Step 2: Simplify data fetching**

Replace the 18-query `Promise.all` with ~5 queries:

```typescript
const displayWeek = await getDisplayWeek();

const [
  marketCoreResult,
  roleResult,
  pricesResult,
] = await Promise.all([
  safeQuery("Market intelligence", async () => {
    const [intelligence, grainOverview, marketAnalysis] = await Promise.all([
      getGrainIntelligence(grain.name),
      getGrainOverviewBySlug(grain.slug),
      getMarketAnalysis(grain.name),
    ]);
    return { intelligence, grainOverview, marketAnalysis };
  }),
  safeQuery("User role", () => getUserRole()),
  safeQuery("Recent prices", () => getRecentPrices(grain.name)),
]);
```

**Step 3: Compute recommendation from crop plan + market data**

```typescript
const totalKt = (userPlan.planned_kt ?? 0);
const deliveredKt = (userPlan.delivered_kt ?? 0);
const contractedKt = (userPlan.contracted_kt ?? 0);
const uncontractedKt = totalKt - deliveredKt - contractedKt;
const deliveredPct = totalKt > 0 ? (deliveredKt / totalKt) * 100 : 0;
const contractedPct = totalKt > 0 ? (contractedKt / totalKt) * 100 : 0;
const openPct = totalKt > 0 ? (uncontractedKt / totalKt) * 100 : 0;

const marketStance = marketAnalysis?.stance_score != null
  ? marketAnalysis.stance_score >= 20 ? "bullish"
    : marketAnalysis.stance_score <= -20 ? "bearish" : "neutral"
  : "neutral";

const recommendation = deriveRecommendation({
  marketStance,
  stanceScore: marketAnalysis?.stance_score,
  deliveryPacePct: deliveredPct,
  contractedPct,
  uncontractedKt: Math.max(0, uncontractedKt),
  totalPlannedKt: totalKt,
});
```

**Step 4: Render 3 sections**

```
<GrainPageTransition>
  <div className="space-y-10">
    {/* ========== HERO ========== */}
    ...hero with displayWeek instead of shippingWeek...
    ...single "Week {displayWeek} · Ended {date}" line...
    ...amber "Data lag" badge if displayWeek < getCurrentGrainWeek()...

    {/* ========== MARKET THESIS ========== */}
    <section className="space-y-6">
      <SectionHeader title="Market Thesis" subtitle="AI analysis with US and Canadian market data" />
      <BullBearCards
        bullCase={marketAnalysis.bull_case}
        bearCase={marketAnalysis.bear_case}
        confidence={marketAnalysis.data_confidence}
        confidenceScore={marketAnalysis.confidence_score ?? undefined}
        stanceScore={marketAnalysis.stance_score}
        finalAssessment={marketAnalysis.final_assessment ?? undefined}
        bullReasoning={marketAnalysis.bull_reasoning}
        bearReasoning={marketAnalysis.bear_reasoning}
      />
    </section>

    {/* ========== ASK BUSHY ========== */}
    <section className="space-y-6">
      <SectionHeader title="Ask Bushy" subtitle={`Ask anything about ${grain.name} this week`} />
      <GrainBushyChat grainName={grain.name} grainWeek={displayWeek} />
    </section>

    {/* ========== MY FARM ========== */}
    <section className="space-y-6">
      <SectionHeader title={`My Farm · ${grain.name}`} subtitle="Your delivery and contract progress" />
      ...3 progress tiles (delivered/contracted/open)...
      ...simplified recommendation rail...
      ...pace percentile badge...
    </section>
  </div>
</GrainPageTransition>
```

**Step 5: Remove helper functions no longer needed**

Remove `buildKeyMetrics()` and `buildNetBalanceData()` from the bottom of the file — they're only used by removed sections.

Keep `parseToBullets()` and `deriveStanceFromThesis()` — still used in the hero.

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 7: Verify page renders**

Start dev server, navigate to a grain detail page (e.g., `/grain/wheat`), confirm:
- Hero shows correct week number
- Bull/Bear renders (falls back to bullet mode since reasoning columns are empty)
- Chat section renders with grain-specific welcome
- My Farm section shows progress tiles and recommendation

**Step 8: Commit**

```bash
git add app/(dashboard)/grain/[slug]/page.tsx
git commit -m "feat: simplify grain detail page to 3 sections (thesis, chat, farm)"
```

---

### Task 7: Build My Farm section UI components

**Files:**
- Create: `components/dashboard/grain-farm-progress.tsx`

**Step 1: Create the grain-scoped farm progress component**

This is a client component (`"use client"`) that renders:
- 3-tile row: Delivered / Contracted / Open — each with mini progress bar + kt label
- Simplified recommendation: stance badge → action badge → conviction rail → reason text
- Pace percentile badge (passed as prop from server parent)

Props:
```typescript
interface GrainFarmProgressProps {
  grainName: string;
  deliveredKt: number;
  contractedKt: number;
  openKt: number;
  totalKt: number;
  recommendation: RecommendationResult;
  deliveredPct: number;
  pacePercentile?: number; // 0-100, from calculate_delivery_percentiles
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/dashboard/grain-farm-progress.tsx
git commit -m "feat: add GrainFarmProgress component for grain-scoped My Farm section"
```

---

### Task 8: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `components/dashboard/CLAUDE.md`
- Modify: `docs/plans/STATUS.md`

**Step 1: Update `CLAUDE.md`**

In the UI section, update the grain detail page description to reflect 3 sections. Add `GrainBushyChat` and `GrainFarmProgress` to the component list. Add `bull_reasoning`/`bear_reasoning` to the `market_analysis` table description.

**Step 2: Update `components/dashboard/CLAUDE.md`**

Update "Page Section Structure" to show the new 3-section layout:
```
**Grain detail page:** Market Thesis → Ask Bushy → My Farm
```

Add removed sections to "Deleted Components" list with note: "Retained in codebase for Bushy Chat queries, no longer rendered on grain detail page (Track #43, 2026-04-15)."

Add new components:
- `grain-bushy-chat.tsx` — Grain-scoped chat wrapper
- `grain-farm-progress.tsx` — 3-tile progress + recommendation + pace

**Step 3: Update `docs/plans/STATUS.md`**

Add Track #43:
```
| 43 | Grain Detail Simplification | 2026-04-15 | Strip to 3 sections (thesis/chat/farm), two-column reasoning, embedded chat, fix week display |
```

**Step 4: Commit**

```bash
git add CLAUDE.md components/dashboard/CLAUDE.md docs/plans/STATUS.md
git commit -m "docs: Track #43 — update documentation for grain detail simplification"
```

---

### Task 9: Seed reasoning data for existing market analysis

**Files:**
- Create: `scripts/backfill-reasoning.ts`

**Step 1: Write backfill script**

Script reads existing `bull_case` / `bear_case` text and `key_signals` from `market_analysis` rows where `bull_reasoning IS NULL`. For each row, it:
1. Parses `key_signals` into `{fact, reasoning}` pairs — `title` becomes `fact`, `body` becomes `reasoning`
2. Separates by signal type: bullish signals → `bull_reasoning`, bearish signals → `bear_reasoning`
3. Updates the row with the generated JSONB

This is a one-time backfill. Future analysis runs will produce reasoning natively.

**Step 2: Run the backfill**

Run: `npx tsx scripts/backfill-reasoning.ts`
Expected: Updated N rows with reasoning data.

**Step 3: Verify reasoning renders**

Navigate to a grain detail page. Bull/Bear should now show two-column table instead of bullets.

**Step 4: Commit**

```bash
git add scripts/backfill-reasoning.ts
git commit -m "feat: backfill bull_reasoning/bear_reasoning from key_signals"
```

---

### Task 10: Visual verification and polish

**Step 1: Verify all grain pages**

Check 3-4 grain detail pages (wheat, canola, barley, oats) for:
- Hero: correct week, stance badge, thesis, price sparkline
- Thesis: two-column layout renders correctly (or falls back to bullets)
- Chat: renders, accepts input, shows grain-specific welcome
- My Farm: progress tiles, recommendation, pace badge
- Mobile: responsive layout works (single-column on small screens)

**Step 2: Check for console errors**

Open browser dev tools, navigate grain pages, confirm zero console errors.

**Step 3: Check dark mode**

Toggle dark mode, verify all 3 sections render correctly.

**Step 4: Final build**

Run: `npm run build`
Expected: Clean build, no warnings.

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: polish grain detail simplification — visual verification pass"
```
