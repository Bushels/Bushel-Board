# Dashboard Redesign V2 — Design Document

**Date:** 2026-03-14
**Status:** Approved
**Author:** Claude (Opus) + Gemini (3.1 Pro) collaborative design
**Scope:** 23 user-identified items + 4 new data features across 4 implementation waves

## Overview

A comprehensive redesign of the Bushel Board grain detail page, My Farm page, and supporting data infrastructure. The core philosophy shifts from "reporting data" to "generating signals" — every card should tell the farmer whether something is bullish, bearish, or neutral, and what action to consider.

## Data Source Hierarchy

1. **CGC weekly data** — primary source for all pipeline metrics (deliveries, exports, processing, stocks, terminal receipts, grade distribution, feed grain, shipment distribution)
2. **AAFC/StatsCan** — authoritative for Total Opening Supply (production + carry-in), updated annually
3. **CFTC COT** — speculative/commercial positioning from US futures markets
4. **Government Grain Monitor** — port throughput, vessel queues, storage capacity
5. **CGC Producer Cars** — forward-looking railcar allocations
6. **X/Twitter signals** — real-time market sentiment via Grok API

## AAFC Baseline Data (Feb 2026, Confirmed)

| Grain | Production (Kt) | Carry-In (Kt) | Total Opening Supply (Kt) | Approximate? |
|-------|-----------------|---------------|--------------------------|-------------|
| Wheat (excl. Durum) | 32,820 | 3,684 | 36,504 | No |
| Canola | 21,804 | 1,597 | 23,401 | No |
| Corn (for grain) | 14,867 | 1,584 | 16,451 | No |
| Barley | 9,725 | 1,249 | 10,974 | No |
| Amber Durum | 7,135 | 497 | 7,632 | No |
| Soybeans | 6,793 | 511 | 7,304 | No |
| Oats | 3,920 | 507 | 4,427 | No |
| Peas (Dry) | 3,934 | 489 | 4,423 | No |
| Lentil | 3,363 | 561 | 3,924 | No |
| Rye | 683 | 143 | 826 | No |
| Flaxseed | 455 | 134 | 589 | No |
| Chick Peas | 482 | ~180 | ~662 | Yes |
| Beans (Dry/Edible) | 438 | ~100 | ~538 | Yes |
| Canaryseed | 235 | ~85 | ~320 | Yes |
| Mustard Seed | 140 | ~85 | ~225 | Yes |
| Sunflower Seed | 69 | ~48 | ~117 | Yes |

Approximate grains get an `is_approximate` boolean flag in `supply_disposition`. UI shows `~` prefix and tooltip.

---

## Wave 1: Data Foundation & Quick Fixes

**Items:** #1, #3, #4, #5, #8, #9, #11
**Estimated files:** ~12
**Dependencies:** None — this wave is the foundation

### 1A. Seed AAFC Supply Baseline

Update `supply_disposition` table with confirmed AAFC Feb 2026 figures. Add `is_approximate BOOLEAN DEFAULT false` column. These figures are the single source of truth for "% left in bin vs market" calculations.

### 1B. Fix "% Left in Bin vs Market" Calculation

**Old (incorrect):** `Still in Bins = total_supply - exports - food_industrial - feed_waste` (AAFC residual estimate)

**New (correct):**
```
Market Bin Stock = Total Opening Supply - Total Producer Deliveries (CYTD)
Market Bin % = Market Bin Stock / Total Opening Supply × 100
```

Where:
- Total Opening Supply = Production + Carry-In (from seeded AAFC data)
- Total Producer Deliveries = `Primary.Deliveries` (AB+SK+MB+BC, `grade=''`, Crop Year) + `Process.Producer Deliveries` (national, `grade=''`, Crop Year) + `Producer Cars.Shipments` (AB+SK+MB, `grade=''`, Crop Year)

This is a **live calculation** updated weekly as CGC data arrives.

Imports threshold: Include in Total Opening Supply when >1% of total. Otherwise footnote.

### 1C. Fix Grain Week Display

Add data freshness indicator to grain page hero section:
```
Data: Week 31 (ended Mar 6) · Current: Week 33
```
Uses `getLatestImportedWeek()` for data week, date calculation for current calendar week.

### 1D. Quick UI Fixes

- **#1 Sign-in "f":** Fix Fraunces font ligature/rendering in `lib/auth/auth-scene.ts` title
- **#3 Yield alignment:** Right-align bold `220.5 bu/ac`, put `5.00 t/ac` underneath in `text-sm text-muted-foreground`
- **#5 "38pp":** Replace with "38% more grain remaining than the market average"
- **#8 Clickable grain boxes:** Add hover arrow, "View details →" text, increased GlassCard hover elevation on CropSummaryCard
- **#11 Flow donut visibility:** Fix totalFlow label overflow (temporary — removed in Wave 2)

---

## Wave 2: Grain Detail Page Redesign

**Items:** #10, #12, #14, #15, #16, #17, #18, #19, #20
**Estimated files:** ~20
**Dependencies:** Wave 1 (AAFC data must be seeded)

### New Page Layout (top to bottom)

1. **Hero** — grain name, MarketStanceBadge, thesis headline/bullets, data freshness indicator
2. **Key Metrics** — 4 vertical cards (left) + net balance bar chart (right)
3. **Delivery Breakdown** — full-width stacked area chart (elevators vs processors vs cars)
4. **Provincial Deliveries + Grain Storage** — 2-column grid
5. **Logistics + Port Weather** — 2-column grid
6. **Railcar Allocations** — full-width
7. **Pipeline Velocity** — full-width with YoY toggle
8. **Grain Quality Distribution** — donut chart by grade from Terminal Receipts
9. **Prairie Chatter on X** — CompactSignalStrip (sole X presence)
10. **COT Positioning** — full-width
11. **Bull & Bear Cases** — full-width with confidence gauge
12. **WoW Detail** — collapsed/expandable

### Key Metrics Cards (Item #10)

4 vertical stacked cards, each showing: metric name, current week Kt, WoW change, 1-line insight.

| Card | Data Source | Insight Logic |
|------|-----------|---------------|
| Producer Deliveries | Primary.Deliveries (AB/SK/MB/BC) + Process.Producer Deliveries + Producer Cars.Shipments | Streak detection ("above X Kt N weeks running") |
| Processing / Crush | Process.Milled/Mfg Grain | vs annual capacity pace |
| Exports | Terminal Exports.Exports (all grades summed) | YoY comparison |
| Commercial Stocks | Primary.Stocks (prairie) | WoW draw/build magnitude |

### Net Balance Chart

Weekly bars: `Producer Deliveries - (Exports + Processing + Feed Deliveries)`
- Green above zero = surplus week
- Amber below zero = draw week
- Cumulative line overlay = running balance trend

Data: `get_pipeline_velocity` RPC + `Feed Grains.Deliveries`

### Delivery Breakdown Card (New)

Stacked area chart showing 3 delivery channels over the season:
- Primary Elevators: `Primary.Deliveries` (prairie) — color #2e6b9e
- Primary Elevators: `Primary.Deliveries` (AB/SK/MB/BC) — color #2e6b9e
- Direct to Processors: `Process.Producer Deliveries` (national) — color #437a22
- Producer Cars: `producer_car_allocations.week_cars` — color #c17f24

Right sidebar: current week percentage split + 8-week processor share sparkline trend.

### Provincial Deliveries (Item #12)

Existing ProvinceMap moves to replace COT's old position. AB/SK/MB/BC Primary delivery breakdown with CY totals. Direct-to-processor deliveries remain national-only in CGC.

### Grain Storage Card (Item #15, New)

Horizontal bar chart showing stock distribution:
- Primary Elevators: `Summary.Stocks` where region='Primary Elevators'
- Process Elevators: `Summary.Stocks` where region='Process Elevators'
- Terminal Elevators: `Terminal Stocks.Stocks`

Total + WoW change per category.

### Logistics (Item #14, Enhanced)

Week label on every KPI. Enhanced data display:
- Vessels: count + at berth (Vancouver + Prince Rupert)
- Western Port Throughput: vs 4-wk avg + vs last year
- YTD Shipments: vs last year
- Working Capacity %: existing gauge

### Port Weather Card (Item #14, New)

Vancouver/Prince Rupert precipitation for current grain week. Source: Open-Meteo free API (no key). Rain warning when loading delays expected.

### Railcar Allocation Card (Item #16, New)

Forward-looking railcar staging from `producer_car_allocations`:
- CY total cars, this week cars
- Destination breakdown (domestic, US, port)
- 8-week trend with bullish/bearish signal (more cars = rail expects more movement)

### Pipeline Velocity (Item #17)

Existing chart → full page width. Add YoY toggle (dashed line for prior crop year).

### Grain Quality Distribution (New)

Donut chart from Terminal Receipts grouped by grade (CYTD). New query: `SUM(ktonnes) GROUP BY grade WHERE worksheet='Terminal Receipts' AND metric='Receipts' AND period='Crop Year'`.

### Removed Sections (Items #18, #19)

- ~~Grain Balance section~~ → replaced by key metrics + net balance
- ~~Supply Pipeline (AAFC waterfall)~~ → data feeds "% left in bin" instead
- ~~"Where Grain Went" donut~~ → replaced by delivery breakdown + net balance
- ~~Market Signals (expandable detail)~~ → consolidated to CompactSignalStrip only

### COT Positioning (Item #20)

Full page width, moved to bottom. Same chart, more horizontal room.

### Bull & Bear Cases (Item #21 layout, Item #22 structure)

Full-width, visible (not collapsed). Two-column bull/bear bullets with:
- Confidence gauge (0-100%, color gradient: amber→muted→green)
- Final Assessment: 1-2 sentence plain-English recommendation
- Clean bullet points, no jargon without inline context

---

## Wave 3: Engagement & My Farm

**Items:** #2, #6, #7, #13, #21 (content), #22
**Estimated files:** ~15
**Dependencies:** Wave 2 (card structure must exist for per-card voting)

### Custom Farming Icons (Item #2)

Monochrome SVG icons for each grain type (wheat stalk, canola flower, barley head, oat panicle, pulse pod, generic kernel). Wheat/canola color palette.

### Shipping Week Dates (Item #2)

Display on My Farm: `Grain Week 31 · Feb 27 – Mar 5, 2026` with data release schedule note.

### Estimated Yield Alignment (Item #3)

Bold value right-aligned, t/ac conversion underneath in smaller muted text.

### Percentile Distribution Graph (Item #6)

Bell curve SVG with farmer's position marker and median marker. Color-coded zones:
- <25th percentile: amber (behind pace)
- 25th-75th: muted (average)
- >75th: prairie green (ahead of pace)

Data: `getDeliveryAnalytics()` p25/p50/p75 values.

### Delivery Logging (Item #7)

- Default weight unit: kg (instead of tonnes)
- Destination helper text: "Adding your delivery point helps us bring you local elevator prices and features as they become available."

### X Signal Voting (Item #13)

Thumbs up/down buttons on each CompactSignalStrip card. Filled + colored after voting. Explainer below strip: "Vote to improve your feed — we learn what matters to your farm"

Wires to existing `voteSignalRelevance()` server action.

### Per-Card Metric Sentiment (Item #22)

Binary bullish/bearish vote on each of the 4 key metric cards. New table:

```sql
CREATE TABLE metric_sentiment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  grain TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  grain_week SMALLINT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('deliveries', 'processing', 'exports', 'stocks')),
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish')),
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, grain, crop_year, grain_week, metric)
);
```

Aggregates feed into AI thesis generation. Observer role: buttons hidden, aggregates visible.

### Bull & Bear Content Quality (Item #21)

Update `generate-intelligence` Edge Function prompt:
- Shorter, plain-English bullets
- No jargon without inline context
- Produce a `confidence_score` (0-100) for the confidence gauge
- Produce a `final_assessment` 1-2 sentence recommendation

---

## Wave 4: Advanced Intelligence

**Items:** #23 + new features
**Estimated files:** ~10 + Edge Function
**Dependencies:** Waves 1-3

### Market Price Import (Item #23)

**Phase 4A-1: Daily Futures Settlement**

New table:
```sql
CREATE TABLE grain_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grain TEXT NOT NULL,
  contract TEXT NOT NULL,
  price_date DATE NOT NULL,
  settlement_price NUMERIC,
  change_amount NUMERIC,
  change_pct NUMERIC,
  volume INTEGER,
  open_interest INTEGER,
  source TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grain, contract, price_date)
);
```

Source: Free delayed quotes API (Barchart free tier or similar — needs research).

**Phase 4A-2: Cash Basis Tracking** — future, requires elevator partnerships.

UI: Price sparkline on grain cards, full price chart on grain detail page.

### Processor Capacity Reference (New)

New table with known Canadian processing capacity per grain (seeded manually from industry reports). Crush card shows utilization gauge: weekly processing × 52 vs annual capacity.

### YoY Toggle on Cumulative Charts

Toggle buttons: `[This Year] [Last Year ─ ─] [5yr Avg ···]`

Prior year data from `v_grain_yoy_comparison`. 5-year average from `get_historical_average()` RPC.

### Processor Self-Sufficiency Signal (New)

```
Self-Sufficiency = Process.Producer Deliveries / (Process.Producer Deliveries + Process.Other Deliveries) × 100
```

`Process.Other Deliveries` is imported but currently unqueried. When ratio drops below historical average, flagged as bullish signal in AI thesis.

---

## Collaboration Model

- **Claude (Opus):** Architecture, component design, implementation, type safety, RPC design
- **Gemini (3.1 Pro):** Strategic data analysis, calculation auditing, cross-checking wave outputs, signal logic review
- Both agents review each other's work before shipping each wave
- Mandatory agent workflow applies: Plan → Implement → Verify → Document → Ship → QC

## Design Tokens (Unchanged)

Per CLAUDE.md — wheat palette, canola primary, prairie success, Fraunces display + DM Sans body, glass shadow system, 40ms stagger animation.

## Definition of Done (Per Wave)

1. `npm run build` passes
2. No console errors on affected pages
3. No `any` escape hatches
4. Visual verification via preview tools
5. Lessons learned documented if non-obvious bugs encountered
6. STATUS.md updated
7. Deleted exports verified with grep
