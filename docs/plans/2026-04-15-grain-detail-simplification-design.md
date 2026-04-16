# Grain Detail Page Simplification — Design Doc

**Date:** 2026-04-15
**Status:** Approved
**Track:** #43 — Grain Detail Simplification

## Problem

The grain detail page has 12 data sections (Key Metrics, Net Balance, Delivery Breakdown, Terminal Flow, Storage, Logistics, Pipeline Velocity, Quality, COT, Crush Gauge, Bull/Bear, WoW Detail). This overwhelms farmers with raw data they don't know how to interpret. The AI thesis and Bushy Chat exist to do this interpretation — but they're buried at the bottom or on separate pages.

Additionally, the week display shows "Data: Week 34 / Current: Week 35" which confuses farmers when the CGC import lags behind the analysis data.

## Decision

Strip the grain detail page to **3 sections only**: Bull/Bear Thesis, Bushy Chat, and My Farm. All removed data stays in the database and feeds the AI pipeline and chat — it just stops being shown as raw charts.

## Design

### Section 1: Hero + Week Display

**Layout:** Back button, grain name, stance badge, thesis title + bullets, week info, price sparkline.

**Week display fix:** Derive displayed week from `MAX(grain_week)` across `market_analysis` AND `cgc_imports` — whichever is higher. Show one week number with end date. If data is >1 week behind calendar, show a small amber "Data lag" indicator. Remove the dual "Data: Week X / Current: Week Y" pattern.

**Week source query:**
```sql
SELECT GREATEST(
  (SELECT MAX(grain_week) FROM market_analysis WHERE crop_year = $1),
  (SELECT MAX(grain_week) FROM cgc_imports WHERE crop_year = $1)
) AS display_week;
```

### Section 2: Bull/Bear Thesis with Reasoning Columns

**Layout:** Two-column table layout replacing bullet lists.

| What's Happening | Why It Matters |
|-----------------|----------------|
| Exports +70.6% YoY | More grain leaving = less competing for local bids |
| USDA wheat S/U at 28% | Global supply is tight. Canada benefits when the world is short |

**Bull case** and **bear case** each get their own table. US market data (USDA export sales, WASDE stocks-to-use, crop conditions) is woven into the bull/bear rows by the AI — not shown as a separate section.

**Stance spectrum meter** and **assessment callout** remain at the bottom (already working well).

**Data model change:** Add two JSONB columns to `market_analysis`:
- `bull_reasoning`: `[{fact: string, reasoning: string}, ...]`
- `bear_reasoning`: `[{fact: string, reasoning: string}, ...]`

The AI pipeline prompt is updated to produce paired `{fact, reasoning}` output alongside the existing `bull_case` / `bear_case` text. The text columns remain as fallback — if reasoning JSONB is null, render the existing bullet-style cards.

**AI pipeline change:** The analyst prompt (in `analyze-grain-market` Edge Function and Claude Agent Desk swarm) must:
1. Include USDA context from `lib/us-market-context.ts` (export sales, WASDE, crop progress)
2. Output structured `bull_reasoning` / `bear_reasoning` arrays
3. Weave US data into bull/bear points where relevant (not as a separate section)

### Section 3: Embedded Bushy Chat

**Layout:** Grain-scoped chat embedded in-page with fixed 400px height, scrollable message area, quick-action chips.

**Component:** New `GrainBushyChat` wrapper around existing `BushyChat` that:
- Passes `initialContext: { grain, grainWeek }` to the SSE hook
- Shows grain-specific quick chips: "Show me exports", "Compare to last year", "Terminal flow", "What would you do?"
- Shares thread with main `/chat` page (same `threadId`)
- Welcome state says: "Ask me anything about {Grain} this week. I have access to pipeline data, terminal flow, logistics, COT positioning, and USDA reports."

**All removed data is accessible via chat.** Farmers ask Bushy about pipeline velocity, terminal flow, delivery breakdown, COT positioning, logistics, grade distribution, etc. The data queries still exist — they're just consumed by the chat API instead of rendered as charts.

### Section 4: My Farm (Grain-Scoped)

**Layout:** 3-tile progress row + simplified recommendation + pace badge.

**3 tiles:**
- Delivered % (from `crop_plans.delivered_kt / total_kt`)
- Contracted % (from `crop_plans.contracted_kt / total_kt`)
- Open % (uncontracted — remainder)

Each tile has a mini progress bar and kt value.

**Recommendation:** Simplified version of `RecommendationCard` — stance → action → conviction rail → reason text. No separate card wrapper, integrated into the section.

**Pace badge:** Percentile from `calculate_delivery_percentiles()` — "Top 18% pace", "Avg pace", or "Behind peers".

**Edge cases:**
- **No crop plan for this grain:** Show "Track this grain" CTA button. No empty tiles.
- **Observer role:** Show "Add your grain to unlock farm insights" nudge. Thesis and chat still visible.

## Removed Sections

The following sections are **removed from rendering** but their data queries and components are **retained in the codebase** for Bushy Chat consumption:

| Removed Section | Data Still Used By |
|----------------|-------------------|
| Key Metrics (4-card grid) | Chat queries, AI pipeline |
| Net Balance chart | Chat queries |
| Delivery Breakdown chart | Chat queries |
| Terminal Net Flow chart | Chat queries, AI pipeline |
| Storage & Distribution | Chat queries |
| Logistics card | Chat queries, AI pipeline |
| Pipeline Velocity chart | Chat queries |
| Quality & Market Positioning (3-col) | Chat queries |
| WoW Detail (collapsible) | Chat queries |

**Do NOT delete** the component files or query functions. They may be re-used in future iterations or exposed through chat responses.

## Components Changed

| Component | Change |
|-----------|--------|
| `app/(dashboard)/grain/[slug]/page.tsx` | Strip to 3 sections. Update week logic. |
| `components/dashboard/bull-bear-cards.tsx` | Redesign to two-column table with reasoning. Accept `bullReasoning` / `bearReasoning` props. Fallback to bullet mode if null. |
| `components/bushy/grain-bushy-chat.tsx` | **NEW** — Wrapper that scopes BushyChat to a grain. |
| `components/bushy/bushy-chat.tsx` | Add `grainContext` optional prop for scoped mode. |
| `lib/queries/data-freshness.ts` | Add `getDisplayWeek()` that takes MAX across market_analysis + cgc_imports. |
| `lib/queries/intelligence.ts` | Add `bull_reasoning` / `bear_reasoning` to `MarketAnalysis` type. |

## Schema Migration

```sql
ALTER TABLE market_analysis
  ADD COLUMN bull_reasoning jsonb,
  ADD COLUMN bear_reasoning jsonb;

COMMENT ON COLUMN market_analysis.bull_reasoning IS 'Array of {fact, reasoning} pairs for two-column bull case display';
COMMENT ON COLUMN market_analysis.bear_reasoning IS 'Array of {fact, reasoning} pairs for two-column bear case display';
```

## Documentation Updates

- `CLAUDE.md` — Update "UI" section to reflect 3-section grain detail page. Remove references to deleted section layout. Add new components.
- `components/dashboard/CLAUDE.md` — Update page section structure. Add deleted sections to "Deleted Components" list (with note: retained for chat, not rendering).
- `README.md` — Add Track #43 entry.
- `docs/plans/STATUS.md` — Add Track #43.

## Success Criteria

1. Grain detail page renders 3 sections: Hero+Thesis, Chat, My Farm
2. Week number is current (not stale) — derived from MAX across analysis + imports
3. Bull/Bear shows two-column "What's Happening | Why It Matters" layout
4. USDA data appears woven into bull/bear reasoning (not separate section)
5. Bushy Chat is embedded and scoped to the current grain
6. My Farm shows delivery/contract/open progress + recommendation + pace
7. All removed data accessible via Bushy Chat queries
8. `npm run build` passes
9. No console errors on grain detail page
