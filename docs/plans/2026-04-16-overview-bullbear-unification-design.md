# Overview Bull/Bear Unification — Design

**Date:** 2026-04-16
**Author:** Kyle + Claude
**Status:** Approved — ready for implementation plan

---

## Problem

The Overview page today has three problems:

1. The **2025-2026 Canadian Grain Market Snapshot** (4 KPI cards: Producer Deliveries, Terminal Receipts, Exports, Commercial Stocks) occupies prime screen real estate below the stance chart without helping farmers decide "haul or hold."
2. **US bull/bear stance lives on a separate `/us` route** and is effectively invisible from the main dashboard. Farmers who export into the US, or whose basis tracks CBOT, have no way to see the US read at a glance.
3. The **bull/bear commentary for each Canadian grain is truncated to a single line** of grey text under each row, which is too sparse to communicate the actual thesis.

## Goal

Make the Overview page a focused bull/bear decision surface that shows **both Canadian and US stances in a single unified chart** with **expandable bull/bear bullet commentary** per grain.

## Non-Goals

- Merging currency units (CAD/tonne and USD/bushel stay as-is per source).
- Changing the `/us` detail page — it remains the deep-dive destination.
- Changing the AI pipeline that writes `market_analysis` / `us_market_analysis`.
- Re-homing the deleted sections (Logistics Banner, Community Pulse). Those components still exist and can be used on other pages; they are only removed from `overview/page.tsx`.

---

## Architecture

One section on the Overview page: a single unified AI Market Stance card with two region groups (Canadian and US), where every row is independently expandable to reveal bull/bear bullets.

```
OverviewPage (server)
 └─ safeQuery × 2 in parallel
     ├─ getMarketStances(grainWeek)                → CA GrainStanceData[] with bullPoints/bearPoints
     └─ getUsMarketStancesForOverview(marketYear)  → US GrainStanceData[] with bullPoints/bearPoints
 └─ <UnifiedMarketStanceChart
       caRows={ca}
       caGrainWeek={grainWeek}
       usRows={us}
       usMarketYear={year}
       updatedAt={...}
    />    (client component: manages expandedKey state)
```

## Data shape

All rows pass through a single `GrainStanceData` contract regardless of origin.

```ts
// components/dashboard/market-stance-chart.tsx (extended)
export interface BulletPoint {
  fact: string;        // short headline (≤60 chars)
  reasoning: string;   // one-sentence supporting detail
}

export interface GrainStanceData {
  grain: string;
  slug: string;
  region: "CA" | "US";                       // NEW
  score: number;                              // -100..+100
  priorScore: number | null;
  confidence: "high" | "medium" | "low";
  cashPrice?: string | null;                  // e.g. "$232.01" (CA) or "$5.82" (US)
  priceChange?: string | null;
  thesisSummary?: string | null;              // existing initial_thesis short form
  bullPoints: BulletPoint[];                  // NEW (may be empty)
  bearPoints: BulletPoint[];                  // NEW (may be empty)
  recommendation?: string | null;             // NEW, US only — HAUL / HOLD / WATCH / SCALE_IN etc.
  detailHref: string;                         // NEW — `/grain/${slug}` for CA, `/us/${slug}` for US
}
```

## Data sources & normalizers

### Canadian rows (`market_analysis`)
- Columns in use: `grain`, `grain_week`, `stance_score`, `data_confidence`, `initial_thesis`, `bull_reasoning` (jsonb array of `{fact, reasoning}`), `bear_reasoning` (jsonb array of `{fact, reasoning}`), `generated_at`.
- Normalizer: pass `bull_reasoning` / `bear_reasoning` arrays directly into `bullPoints` / `bearPoints`. Null → `[]`.
- Extend `lib/queries/market-stance.ts::getMarketStances` to SELECT the two new columns and copy them through.

### US rows (`us_market_analysis`)
- Columns in use: `market_name`, `market_year`, `stance_score`, `data_confidence`, `recommendation`, `initial_thesis`, `key_signals` (jsonb array of `{signal, title, body, source}`).
- Normalizer: filter `key_signals` where `signal === "bullish"` → map `{fact: title, reasoning: body}` into `bullPoints`; `signal === "bearish"` → `bearPoints`. Ignore `signal: "watch"`.
- `cashPrice` uses latest `grain_prices.settlement_price` for the corresponding `futuresGrain` (same lookup table the current `/us` page uses).
- New file `lib/queries/us-market-stance.ts` exporting `getUsMarketStancesForOverview(marketYear)` returning `GrainStanceData[]` with `region: "US"`.

### Missing-data handling
- If both arrays empty → accordion body shows just the `thesisSummary` paragraph + "Open full thesis →" link.
- If one array empty → render its column with muted "No {bull|bear} case recorded this week" placeholder.
- US markets not yet present in `us_market_analysis` (currently Barley) → omitted from the US group entirely. No stub row.

---

## UI: `UnifiedMarketStanceChart`

New client component at `components/dashboard/unified-market-stance-chart.tsx`. Replaces the `MarketStanceChart` usage in `overview/page.tsx` but does NOT delete `MarketStanceChart` (still used elsewhere or can be removed in a follow-up once grep confirms zero references).

### Layout

```
┌─ AI Market Stance · Wk 35 · 2025-2026 ────── legend: [bear] [bull] ┐
│ Analyzed by 16 Agriculture Trained AI Agents                         │
│                                                                       │
│ ── 🇨🇦 CANADIAN GRAINS ─────────────────────────────────────          │
│ ● Barley       +30   [bar─────●─]        $232.01   ▲ +5    ▾        │
│   └ [expands: bull column | bear column]                              │
│ ● Peas         +30   [bar─────●─]        $298.06   — 0     ▾        │
│ ● Canola       +15   [bar──●───]          $704.20   ▲ +3    ▾        │
│ ...                                                                   │
│                                                                       │
│ ── 🇺🇸 US MARKETS ────────────────────────────────────────            │
│ ● Oats         +1    [bar─●────]          $3.40     ▲ +2    ▾        │
│ ● Corn         -5    [bar───●──]          $4.41     ▼ -1    ▾        │
│ ...                                                                   │
│                                                                       │
│ Updated Apr 16, 9:17 a.m.                                             │
└───────────────────────────────────────────────────────────────────────┘
```

### Row behavior

- Each row is a `<button>` (accessibility) with `aria-expanded`.
- Click toggles that row's accordion; clicking a different row closes the previous one (controlled via single `expandedKey: string | null` useState, where `expandedKey = ${region}:${slug}`).
- Rows within each region group sort by `score` descending (most bullish first), same as today.
- Chevron icon rotates 180° when expanded. Existing framer-motion stagger (40ms, bezier easing) preserved on initial mount; collapse/expand animates height via framer-motion's `AnimatePresence` + `layout`.
- `useReducedMotion()` disables all transitions, matching the existing pattern.

### Accordion body

Two-column layout on desktop (`md:grid-cols-2`), stacked on mobile:

```
┌─ Bull case ──────────────┐  ┌─ Bear case ──────────────┐
│ ● Crush keeps supporting │  │ ● Export program behind  │
│   canola                 │  │   Canola exports remain  │
│   Year-to-date processing│  │   down 22.1% YoY in Wk 35│
│   is 7,243.7 tonnes...   │  │                          │
└──────────────────────────┘  └──────────────────────────┘

Thesis: Week 35 canola still has support under it...

[Open grain page →]
```

- Bull headings in `text-prairie`, bear headings in `text-amber-600` (matches existing chart bar colors).
- `fact` renders as `font-medium text-sm`; `reasoning` as `text-xs text-muted-foreground`.
- Thesis paragraph renders `text-sm leading-6` using the existing `initial_thesis` data (full text, not truncated).
- Link uses `detailHref` — `/grain/{slug}` for CA, `/us/{slug}` for US.

### Group headers

Simple section labels inside the card, not separate cards:
```tsx
<div className="flex items-center gap-2 pt-3 pb-1">
  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    🇨🇦 Canadian grains · Wk {caGrainWeek}
  </span>
</div>
```
US group uses `🇺🇸 US markets · MY {usMarketYear}` (market year, not grain week — US track runs on market year).

---

## Page structure (before / after)

### Before — `app/(dashboard)/overview/page.tsx` (~170 lines)
- AI Market Stance chart (CA only)
- 2025-2026 Canadian Grain Market Snapshot (4 KPI cards) + Logistics Banner
- Community Pulse (Sentiment banner + Signal tape)
- Helper: `getUnlockedGrainContext()`

### After — `app/(dashboard)/overview/page.tsx` (~35 lines)
```tsx
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const grainWeek = await getLatestImportedWeek();

  const [caResult, usResult] = await Promise.all([
    safeQuery("CA market stances", () => getMarketStances(grainWeek)),
    safeQuery("US market stances", () => getUsMarketStancesForOverview(CURRENT_US_MARKET_YEAR)),
  ]);

  const caRows = caResult.data ?? [];
  const usRows = usResult.data ?? [];
  const hasAny = caRows.length > 0 || usRows.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6">
      <section>
        <SectionHeader
          title="AI Market Stance"
          subtitle="Weekly bullish/bearish scoring across prairie grains and US markets, with bull and bear points"
        />
        <div className="mt-4">
          <GlassCard elevation={2} hover={false}>
            <div className="p-5">
              {hasAny ? (
                <UnifiedMarketStanceChart
                  caRows={caRows}
                  caGrainWeek={grainWeek}
                  usRows={usRows}
                  usMarketYear={CURRENT_US_MARKET_YEAR}
                  updatedAt={new Date().toISOString()}
                />
              ) : (
                <SectionStateCard
                  title="Market stance temporarily unavailable"
                  message="Canadian and US stance data are both unavailable right now. Please refresh shortly."
                />
              )}
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
```

Removed imports and functions: `SentimentBanner`, `MarketSnapshotGrid`, `MarketStanceChart` (usage), `SectionBoundary`, `LogisticsBanner`, `SignalStripWithVoting`, `getMarketOverviewSnapshot`, `getSentimentOverview`, `getLogisticsSnapshotRaw`, `getAggregateTerminalFlow`, `getLatestXSignals`, `getUnlockedGrainContext`, `getUserRole`, `createClient` (from `@/lib/supabase/server`).

### Destructive-change verification (required)
Per CLAUDE.md Definition of Done rule 7: after removing imports, grep the codebase for each removed symbol to confirm nothing else still imports them. Expected outcome: all symbols still have other callers (they're used elsewhere), so no component files get deleted. If any symbol has zero remaining callers, surface the dead code in the implementation plan for a follow-up decision.

---

## Error handling

- Each region's query is wrapped in `safeQuery`, so one failing does not block the other.
- Both failing → single `SectionStateCard` renders (see code above).
- Within a row: missing bullets handled per "Missing-data handling" above. Missing prior score → no delta icon (existing behavior preserved).
- US markets with `key_signals: null` → treated same as empty array.

## Accessibility

- Rows are `<button type="button">` with `aria-expanded={isOpen}` and `aria-controls={panelId}`.
- Accordion body has `role="region"` and `aria-labelledby={buttonId}`.
- Keyboard: Enter/Space toggles (native `<button>` behavior). Escape on an open row closes it.
- Framer-motion transitions disabled under `useReducedMotion()`.
- Emoji flags kept inline but accompanied by the text label ("Canadian grains", "US markets") so screen readers get meaning.

## Performance

- Both queries hit different tables; no contention. Current CA query already runs on every Overview load; adding US adds one `SELECT` + one `grain_prices` lookup, both are sub-100ms.
- Client component mounts one `useState<string | null>`. Row expand/collapse is local — no network activity.
- Memoize sorted rows with `useMemo` keyed on `caRows`/`usRows` identity.

## Testing

1. `npm run build` passes with no unused-import warnings on `overview/page.tsx`.
2. Unit-level: pure function `normalizeUsKeySignals(keySignals)` tested with three fixtures — all-bullish, all-bearish, mixed with `watch`.
3. Visual (preview_screenshot):
   - Overview with both regions populated (current DB state: 10 CA + 4 US).
   - Overview with CA only (simulate `us_market_analysis` empty).
   - Overview with US only (simulate `market_analysis` empty for the current week).
   - Row expanded, showing both bull and bear bullets.
   - Row expanded with only bull present ("No bear case recorded this week" placeholder).
   - Mobile viewport (375px): bullets stack vertically.
4. Accessibility: keyboard-only traversal — Tab into card, Enter expands row, Tab to link, Escape collapses.

## Rollout

- Single PR. No migration needed (columns already exist).
- After merge + Vercel deploy, run `qc-crawler` agent per the mandatory DAG gate 6 to confirm the Overview page renders cleanly in production with the new query paths.

## Deviations from the original request

None substantive. The only asymmetry worth calling out is that US bullets are *derived* from `key_signals` (filtered by `signal: "bullish"|"bearish"`), whereas CA bullets come from purpose-built `bull_reasoning` / `bear_reasoning` arrays. The user-facing result is identical: a two-column bull/bear bullet list per grain.

## Open risks

1. **US data sparse** — only 4 of 5 US markets (missing Barley) have been analyzed. Implementation handles this by omitting absent rows; user may notice and ask why. Mitigation: nothing in this change, but flag for the AI pipeline team that US Barley analysis hasn't published.
2. **`MarketStanceChart` may become orphaned** — if grep shows no other callers after the Overview switch, consider removal in a follow-up. Not blocking for this design.
3. **Intra-card clutter if all 14 rows expanded at once** — mitigated by single-expand policy.
