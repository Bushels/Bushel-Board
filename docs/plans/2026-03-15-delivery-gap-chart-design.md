# Delivery Gap Chart — Design Document

**Date:** 2026-03-15
**Status:** SUPERSEDED — see lesson learned below
**Author:** Kyle + Claude

> **⚠️ WARNING: This design doc was the root cause of a prototype fidelity failure.**
> It silently simplified the user's Chart.js prototype (3 datasets on 2 axes) to 2 lines
> on 1 axis with fill area. The right Y-axis and gap LINE — the most important visual
> element — were dropped without documentation. The actual implementation now uses dual
> Y-axes matching the prototype. See `docs/lessons-learned/issues.md` for the full
> retrospective and `components/dashboard/delivery-gap-chart.tsx` for the correct code.

## Overview

A thesis-driven cumulative delivery chart that visualizes the YoY gap between current and prior crop year deliveries. The gap area IS the chart's thesis — it shows farmers at a glance whether deliveries are running behind (bullish price signal) or ahead (bearish pressure) compared to last year.

## Scope

- **Canola-only for launch** — gated by `grain.slug === "canola"` on the grain detail page
- **Generic component** — `DeliveryGapChart` accepts data props and works for any grain, enabling easy future extension to Wheat/Durum
- No new database queries or RPCs required

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Page location | New section between Key Metrics and Net Balance | Own SectionHeader, doesn't create a 4th conceptual section |
| Visual style | Match existing page (SectionHeader + GlassCard + Recharts) | Consistency with dashboard design language |
| Data computation | Client-side gap calculation | Data already fetched (current + prior year pipeline velocity); gap is simple subtraction |
| Gap visibility | Always visible | The gap is the chart's entire purpose; toggling it defeats the point |
| Gap color (behind pace) | Prairie green (#437a22) | "Holding back" = bullish for price = positive signal |
| Gap color (ahead of pace) | Amber/warning (#d97706) | Communicates caution without alarming farmers (Gemini recommendation) |
| Canola gating | Slug-based conditional render | Generic component, Canola-only rendering for now |

## Component Design

### `DeliveryGapChart` (`components/dashboard/delivery-gap-chart.tsx`)

Client component using Recharts `ComposedChart`.

**Props:**
```ts
interface DeliveryGapChartProps {
  currentYearData: CumulativeWeekRow[]
  priorYearData: CumulativeWeekRow[]
  grainName: string
}
```

**Visual elements:**
- Solid canola-colored line — current crop year cumulative deliveries
- Dashed muted line — prior crop year cumulative deliveries
- Filled area between lines — the YoY gap
  - Prairie green fill when current < prior (farmers holding = bullish)
  - Amber fill when current > prior (farmers accelerating = bearish pressure)
- Left Y-axis: "Cumulative Deliveries (Kt)"
- X-axis: "Wk 1" through latest week
- Tooltip: both years' values + gap Kt at hover point
- Inline legend (styled to match GamifiedGrainChart, not Recharts default)

**Chart data transformation (client-side):**
```ts
chartData = currentYearData.map((row, i) => {
  const priorRow = priorByWeek.get(row.grain_week)
  const gap = (priorRow?.producer_deliveries_kt ?? 0) - row.producer_deliveries_kt
  return {
    week: row.grain_week,
    current: row.producer_deliveries_kt,
    prior: priorRow?.producer_deliveries_kt ?? null,
    gap, // positive = behind pace (bullish), negative = ahead (bearish)
  }
})
```

### Page Integration (`app/(dashboard)/grain/[slug]/page.tsx`)

**Section with dynamic pills:**
```tsx
{grain.slug === "canola" && hasGapData && (
  <section className="space-y-6">
    <SectionHeader
      title="Delivery Pace"
      subtitle="Cumulative deliveries vs prior year"
    >
      <PacePill yoyPct={yoyDeliveryPct} />
      <GapPill gapKt={gapKt} />
    </SectionHeader>
    <SectionBoundary
      title="Delivery pace unavailable"
      message="The delivery gap chart is temporarily unavailable."
    >
      <GlassCard hover={false} elevation={2} className="p-4">
        <DeliveryGapChart
          currentYearData={pipelineVelocityResult.data}
          priorYearData={priorYearPipelineResult.data}
          grainName={grain.name}
        />
      </GlassCard>
    </SectionBoundary>
  </section>
)}
```

**Server-side pill computation:**
- `yoyDeliveryPct`: `((currentLatest - priorLatest) / priorLatest) * 100`
- `gapKt`: `priorLatest - currentLatest` (positive = behind, negative = ahead)

### Pill Components (inline in page or small shared component)

- **PacePill**: Shows YoY % with red text if negative (behind), green if positive (ahead)
- **GapPill**: Shows absolute gap in Kt with prairie green border if behind pace

## Data Flow

```
Existing fetches (no changes):
  getCumulativeTimeSeries(grain.name)           → currentYearData
  getCumulativeTimeSeries(grain.name, priorCY)  → priorYearData

Server-side (page.tsx):
  Compute yoyDeliveryPct and gapKt from latest week of both arrays
  Pass to SectionHeader pills

Client-side (DeliveryGapChart):
  Merge current + prior by grain_week
  Compute gap per week
  Render Recharts ComposedChart with gap fill area
```

## What This Does NOT Include

- No new RPC functions or database migrations
- No dark theme override (matches existing page style)
- No hardcoded narrative text (thesis comes from existing intelligence pipeline)
- No Chart.js (uses Recharts like all other dashboard charts)
- No extension to other grains yet (future work if farmers respond well)

## Future Extension Path

If farmers love this on Canola, extend to:
1. **Wheat** and **Durum** (next most thesis-friendly, large volumes)
2. Dynamic narrative framing based on gap direction (behind/ahead)
3. Potential integration with intelligence pipeline to reference the gap in AI-generated thesis
