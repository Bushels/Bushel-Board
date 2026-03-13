# Delivery Accuracy & Dashboard Layout Fixes

**Date:** 2026-03-09
**Status:** In Progress
**Priority:** High — data accuracy issue affecting all grain charts

---

## Issues Identified

### Issue 1: Producer Deliveries Undercounted (Data Bug) 🔴 Critical

**Location:** `lib/queries/observations.ts` → `getCumulativeTimeSeries()` (lines 256–267)

**Root Cause:** The cumulative "Producer Deliveries" line on grain charts only queries **Primary Elevator** intake:
```
worksheet = 'Primary', metric = 'Deliveries', period = 'Crop Year'
```

This misses **direct-to-processor deliveries** which the CGC tracks separately:
```
worksheet = 'Process', metric = 'Producer Deliveries', period = 'Crop Year'
```

**Impact by Grain (W15, Crop Year 2025-2026):**

| Grain | Primary Elevator (chart shows) | Direct-to-Process (chart misses) | True Total | % Undercounted |
|-------|-------------------------------|----------------------------------|------------|----------------|
| Wheat | 7,763.9 kt | 169.2 kt | 7,933.1 kt | ~2% |
| **Canola** | **2,948.4 kt** | **2,314.0 kt** | **5,262.4 kt** | **~44%** |

For canola and other crush-heavy oilseeds, the chart shows barely half the actual producer delivery volume. Farmers comparing their on-farm deliveries against the "Producer Deliveries" line see a misleadingly low national benchmark.

**Affected Components:**
- `getCumulativeTimeSeries()` — missing 4th query for Process.Producer Deliveries
- `GamifiedGrainChart` — chart tooltip label says "Producer Deliveries" (correct after fix)
- `PaceChart` (overview) — same underlying data
- `v_grain_overview` view — if it uses the same Primary-only filter

**Solution:**
1. Add a 4th Supabase query in `getCumulativeTimeSeries()` for `worksheet='Process'` + `metric='Producer Deliveries'` + `period='Crop Year'`
2. Sum Process.Producer Deliveries into the `producer_deliveries_kt` field alongside Primary.Deliveries
3. Note: Process.Producer Deliveries has `region=''` (national only, no provincial breakdown), so sum is straightforward — no regional grouping needed
4. Verify the `v_grain_overview` view uses consistent logic; update if needed

---

### Issue 2: Overview Dashboard Missing Thesis Content 🟡 Important

**Location:** `app/(dashboard)/overview/page.tsx`

**Root Cause:** The overview page renders:
- ✅ CropSummaryCards (starting stock, CY deliveries, CW deliveries, WoW%)
- ✅ OverviewCharts (waterfall, storage, pace)
- ❌ **No intelligence/thesis content at all**

Meanwhile, the grain detail page has rich intelligence:
- ThesisBanner (AI-generated market thesis per grain)
- IntelligenceKpis (key metrics from AI analysis)
- InsightCards (market signals + X/social signals)
- SignalTape (scrolling ticker of X signals)

**User expectation:** The Overview Dashboard should provide a high-level market narrative — the "big picture" thesis across all the user's grains — so farmers get immediate context before drilling into individual grains.

**Solution:**
1. Add a **"Market Overview" section** between CropSummaryCards and OverviewCharts
2. Fetch `grain_intelligence` for each active grain (latest week)
3. Display a condensed thesis banner per grain (title + 1-line summary, not full body)
4. Add a "Top Signals" widget aggregating the strongest X signals across all grains
5. Optionally: a "Notable Movers" highlight showing which grains had the biggest WoW changes

---

### Issue 3: Grain Detail Page Lacks WoW Comparisons 🟡 Important

**Location:** `app/(dashboard)/grain/[slug]/page.tsx`

**Root Cause:** The grain detail page is built around:
- Cumulative pace charts (CY totals over time)
- Intelligence narratives (thesis, insights, signals)
- Supply flow visualizations (Sankey, elevator, map)

But it has **no explicit Week-over-Week (WoW) comparison** for key metrics. The overview page's CropSummaryCards show WoW% for deliveries only. A farmer on the grain detail page wants to see this week's activity vs last week across ALL metrics — deliveries, shipments, stocks, exports, processing.

**Solution:**
1. Add a **WoW Comparison Card** to Zone 2 (Market Signals area) or Zone 3 (Decision Window)
2. Query `cgc_observations` for `period='Current Week'` at the latest 2 grain weeks
3. Display a table/card grid:
   - Metric | This Week | Last Week | Change | % Change | Trend Arrow
   - Deliveries, Shipments, Stocks, Exports, Processing
4. Use color coding: green for increases, amber for decreases (or contextual — higher stocks could be bearish)
5. This makes the grain detail page the authoritative source for weekly tactical decisions

---

## Agent Assignments

| Agent | Task | Priority |
|-------|------|----------|
| **db-architect** | Fix `getCumulativeTimeSeries()` query + verify `v_grain_overview` view + add WoW query function | 🔴 Critical |
| **frontend-dev** | Build WoW comparison component + integrate on grain detail page | 🟡 Important |
| **frontend-dev** | Add intelligence summary section to overview page | 🟡 Important |
| **ux-agent** | Design WoW card layout + overview thesis section wireframe | 🟢 Nice-to-have (agents can use existing patterns) |

## Implementation Order
1. **db-architect fixes the data query** (Issue 1) — all charts immediately show correct data
2. **frontend-dev adds WoW query + component** (Issue 3) — grain detail gains weekly comparison
3. **frontend-dev adds overview thesis** (Issue 2) — overview gains market narrative
