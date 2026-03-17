# Stance Spectrum Meter & Recommendation Confidence Gauge

**Date:** 2026-03-16
**Status:** Approved
**Scope:** Bull & Bear Cards confidence bar replacement + Recommendation Card gauge

## Problem

The current "Analysis Confidence" bar in `BullBearCards` measures data quality (high/medium/low) but doesn't communicate the AI's directional stance. Farmers see "Medium (65%)" and don't know if the AI leans bullish or bearish. The recommendation cards show a tiny "high/medium/low" text badge that doesn't convey conviction strength.

## Design

### 1. Stance Spectrum Meter (Bull & Bear Cards)

**Replaces:** The "Analysis Confidence" progress bar at the bottom of `BullBearCards`.

**Visual:** A horizontal spectrum bar with a positioned marker/needle.

- Left end: **BULLISH** (prairie green, `#437a22`)
- Center: **NEUTRAL** (wheat-400)
- Right end: **BEARISH** (amber/red, `#d97706`)
- Gradient fill across the bar: green → gray → amber
- Needle/marker positioned by `stance_score` (-100 to +100)
- Marker displays the numeric score (e.g., "+32") and derived label ("Slightly Bullish")

**Score-to-label mapping:**

| Range | Label |
|-------|-------|
| +70 to +100 | Strongly Bullish |
| +20 to +69 | Bullish |
| -19 to +19 | Neutral |
| -69 to -20 | Bearish |
| -100 to -70 | Strongly Bearish |

**Score-to-position mapping:**

- +100 → far left (0%)
- 0 → center (50%)
- -100 → far right (100%)
- Formula: `position = 50 - (stanceScore / 2)`

### 2. Recommendation Confidence Gauge (My Farm Cards)

**Replaces:** The `ActionBadge` + small categorical confidence badge in `RecommendationCard`.

**Visual:** A semicircle gauge (reusing `getArcPath` pattern from `CrushUtilizationGauge`).

- Arc fills from left to right based on numeric `confidenceScore` (0-100)
- Inside the gauge: action icon (Lock/Truck/DollarSign/Eye) + percentage
- Below the gauge: action label text ("HOLD", "HAUL", etc.)
- Arc color matches action: prairie for HOLD, amber for HAUL, canola for PRICE, wheat-400 for WATCH

**Confidence formula:**

```
stanceMagnitude = Math.abs(stanceScore) / 100    // 0 to 1
paceAlignment = <derived from delivery pace vs recommendation fit>
confidenceScore = Math.round(stanceMagnitude * 60 + paceAlignment * 40)
```

Pace alignment logic:
- HOLD: high alignment when `deliveryPacePct <= 40` (farmer has room to wait)
- HAUL: high alignment when `contractedPct < 30` (lots of uncontracted grain)
- PRICE: high alignment when `contractedPct < 25` (clear need to lock in)
- WATCH: always low alignment (inherently uncertain)

### 3. Data Flow

```
analyze-market-data (Grok 4.1 Fast)
  └── outputs stance_score (-100 to +100) in structured JSON
       └── stored in market_analysis.stance_score column
            ├── BullBearCards → renders stance spectrum meter
            └── deriveRecommendation()
                 ├── categorical marketStance derived from score (>=20 bullish, <=-20 bearish)
                 ├── numeric confidenceScore computed from stance magnitude + pace alignment
                 └── RecommendationCard → renders semicircle gauge
```

### 4. Database Migration

```sql
ALTER TABLE market_analysis ADD COLUMN stance_score smallint;
-- Constraint: CHECK (stance_score >= -100 AND stance_score <= 100)
```

Existing rows: NULL until next pipeline run. Components fall back to current behavior when NULL.

### 5. Edge Function Schema Update

Add to `analyze-market-data` JSON schema:

```json
"stance_score": { "type": "integer" }
```

Add to prompt instructions:

> `stance_score`: integer -100 to +100. Strongly bullish = +70 to +100, bullish = +20 to +69, neutral = -19 to +19, bearish = -69 to -20, strongly bearish = -100 to -70. Base on the weight of evidence between bull and bear cases. Consider: delivery pace vs historical, export momentum, spec positioning, basis trends, and farmer sentiment.

### 6. Backward Compatibility

- `RecommendationResult.confidence` (categorical) stays — derived from numeric score
- `RecommendationResult.marketStance` stays — derived from `stance_score` thresholds
- `BullBearCards` props: `stanceScore?: number` added alongside existing `confidence`/`confidenceScore`
- When `stance_score` is NULL, components render current behavior (confidence bar / text badge)

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/analyze-market-data/index.ts` | Add `stance_score` to JSON schema + prompt |
| `lib/queries/intelligence.ts` | Add `stance_score` to `MarketAnalysis` type |
| `components/dashboard/bull-bear-cards.tsx` | Replace confidence bar with stance spectrum meter |
| `lib/utils/recommendations.ts` | Add numeric `confidenceScore` + derive from `stance_score` |
| `components/dashboard/recommendation-card.tsx` | Replace badge with semicircle gauge |
| `app/(dashboard)/grain/[slug]/page.tsx` | Pass `stanceScore` to `BullBearCards` |
| `app/(dashboard)/my-farm/page.tsx` | Pass `stanceScore` through recommendation derivation |
| New migration | `ALTER TABLE market_analysis ADD COLUMN stance_score smallint` |

## Non-Goals

- No changes to `generate-intelligence` or `generate-farm-summary` — they consume `market_analysis` but don't need `stance_score`
- No changes to the sentiment poll or X signal feed
- No new database tables
