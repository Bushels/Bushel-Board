# UX Layout & Hierarchy Redesign

**Date:** 2026-03-11
**Status:** Approved
**Source:** X thread review self-assessment (items 1-4)
**Approach:** Section-First Hierarchy Refactor (Approach A)

## Problem

The Overview and grain detail pages lack clear information hierarchy. Sections blend together without visual breaks, the X signal feed takes too much vertical space on Overview, domestic disappearance duplicates supply pipeline data, and the overall layout feels "jumbled."

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | All 4 P1 items in one unified design | They all affect layout/hierarchy — coherent implementation prevents inconsistency |
| Section headers | Left canola accent + title/subtitle | Fits wheat palette, scannable, uses existing design tokens |
| Deduplication | Fold domestic disappearance into supply pipeline | Single card with expandable breakdown, removes standalone card |
| Signal compactness | New compact strip for Overview | Single-line pills, horizontal scroll, ~80px vs ~400px current height |
| Overall approach | Section-first refactor with reusable SectionHeader | Addresses all issues without over-engineering |

## Component: SectionHeader

Shared component used on both Overview and grain detail pages.

```
Props:
  title: string          — e.g., "Market Intelligence"
  subtitle?: string      — e.g., "AI-powered weekly analysis"
  children?: ReactNode   — right-side slot for badges/metadata
```

Visual treatment:
- `pl-3 border-l-[3px] border-canola`
- Title: `font-display font-semibold text-lg`
- Subtitle: `text-sm text-muted-foreground`
- Right slot aligned with flexbox `justify-between`

## Overview Page Layout

### Current order (4 unlabeled blocks)
1. CropSummaryCards (5)
2. SentimentBanner
3. SignalTape (6 large cards, grid on desktop)
4. Market Pulse (3 AI thesis cards)

### New order (3 labeled sections)

**Section 1: "Prairie Snapshot"**
- Subtitle: "This week's grain movement at a glance"
- Content: 5 CropSummaryCards (unchanged)

**Section 2: "Community Pulse"**
- Subtitle: "What prairie farmers are thinking and seeing"
- Content:
  - SentimentBanner (unchanged)
  - CompactSignalStrip (new — replaces SignalTape)
  - Footer: "{n} posts this week · See all →"

**Section 3: "Market Intelligence"**
- Subtitle: "AI-powered weekly analysis"
- Content: 3 AnimatedCards with AI theses (unchanged)

### Spacing
- Between sections: `space-y-10` (40px, up from 32px)
- Within sections: `space-y-4` (unchanged)

## Component: CompactSignalStrip (Overview only)

Replaces the large `SignalTape` grid on Overview. The full `XSignalFeed` with voting remains on grain detail pages.

Each signal rendered as a compact pill:
```
[🟢] Wheat · "Basis firming at prairie elevators..."  @GrainTrader
```

Specs:
- Single row height (~40px)
- Horizontal scroll with snap, no grid breakpoint
- Sentiment: colored dot (green=bullish, red=bearish, gray=neutral)
- Grain: bold badge
- Summary: truncated to 60 chars
- Author: `@handle` right-aligned
- Click: opens X post in new tab
- Styling: `rounded-xl border border-border/50 bg-background/70 backdrop-blur-sm`
- Max 6 signals visible, horizontal scroll for overflow

## Grain Detail Page Layout

### Current order (~10 cards, 2 StaggerGroups)
ThesisBanner → KPIs → WoW → SupplyPipeline → InsightCards → XSignalFeed → SentimentPoll → ProvincialMap → PipelineVelocity → SupplyDisposition+Storage → DomesticDisappearance

### New order (3 labeled sections)

**Section 1: "Market Intelligence"**
- Subtitle: "AI-powered thesis for this week"
- Content:
  - ThesisBanner (full width)
  - KPI grid + Week-over-Week (side by side or stacked)

**Section 2: "Supply & Movement"**
- Subtitle: "Where grain is flowing this crop year"
- Content:
  - Pipeline Velocity chart
  - Supply Pipeline waterfall (with folded-in Domestic Use Breakdown)
  - Provincial Deliveries map

**Section 3: "Community Pulse"**
- Subtitle: "What farmers are thinking and seeing"
- Content:
  - X Signal Feed (full, with voting — unchanged)
  - Sentiment Poll

### Domestic Disappearance Fold-in

The standalone Domestic Disappearance card is removed. Its data is folded into the Supply Pipeline waterfall card as an expandable section:

- Collapsed by default with chevron toggle
- Label: "Domestic Use Breakdown"
- Shows Food/Industrial, Feed/Waste, and other domestic categories
- Expands inline below the waterfall disposition rows
- Uses existing `supply-pipeline.tsx` component, extended with collapsible section

### Removed/Merged
- Standalone InsightCards: content overlaps with thesis banner and KPIs
- Standalone DomesticDisappearance card: folded into Supply Pipeline
- Standalone SupplyDisposition+Storage grid: consolidated into Supply & Movement section

## Bonus Fix: Duplicate Logo on Auth Pages

The `AuthShell` component had two logo placements:
1. Absolute top-left corner (always visible) — **kept**
2. Inline in left content section (desktop-only) — **removed**

This was fixed as part of this design work.

## Files Affected

| File | Change |
|------|--------|
| `components/dashboard/section-header.tsx` | **New** — shared SectionHeader component |
| `components/dashboard/compact-signal-strip.tsx` | **New** — Overview-only compact signal pills |
| `app/(dashboard)/overview/page.tsx` | Reorganize into 3 labeled sections, replace SignalTape with CompactSignalStrip |
| `app/(dashboard)/grain/[slug]/page.tsx` | Reorganize into 3 labeled sections, remove DomesticDisappearance card |
| `components/dashboard/supply-pipeline.tsx` | Add expandable "Domestic Use Breakdown" section |
| `components/auth/auth-shell.tsx` | Remove duplicate logo (already done) |

## Out of Scope

- P2: Second LLM for analysis (separate design)
- P3: UX agent instruction updates
- P3: Analytics/session tracking integration
- Mobile-specific layout changes (this design is responsive by default via existing patterns)
