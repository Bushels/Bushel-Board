# Canola Cash Movement Map V1

Purpose: define the Canola-first dashboard model that connects old-crop physical movement, farmer holding pressure, commercial disappearance, new-crop supply, and price confirmation. This is a product and analysis map, not a trading signal by itself.

Last source-date check: 2026-05-07.

Use this with:

- `docs/reference/source-registry.md` for admitted sources, update cadence, and failure modes.
- `docs/reference/cgc-market-mechanics-v1.md` for CGC worksheet accounting rules.
- `docs/reference/canonical-grain-fact-model.md` for fact, interpretation, speculation, and recommendation boundaries.

## Core Answer

The bullish/bearish baseline is physical tightness versus available supply, not ICE Canola price alone.

ICE Canola, cash bids, basis, FX, and CFTC positioning are validation and transmission signals. They help answer whether the market is confirming, ignoring, or front-running the physical balance.

```text
old-crop supply
  -> producer delivery pace
  -> commercial stocks
  -> crush + export disappearance
  -> remaining farm/commercial supply pressure
  -> price, basis, and futures confirmation
  -> stance score

new-crop expected supply
  -> seeded area
  -> crop condition / weather / yield risk
  -> forward supply pressure
  -> old-crop/new-crop spread pressure
```

## Canola Seed Rule

Do not show "farm-saved planting seed" as a farmer-held canola bucket.

For Bushel Board purposes, old-crop canola held in bins should be treated as unpriced/unsold inventory, commercial movement waiting to happen, feed/waste/dockage/loss, or source residual. If AAFC or Statistics Canada includes a small "seed use" component inside domestic-use accounting, keep it as source accounting only. Do not convert it into a farmer motive or a next-season seed-reserve story.

## Dashboard Spine

Use total supply for the full crop-year bar, not production alone.

For 2025-2026, AAFC's April 17, 2026 Outlook lists:

| Metric | Value |
| --- | ---: |
| Production | 21.809 MMT |
| Total supply | 23.516 MMT |
| Exports forecast | 8.200 MMT |
| Food and industrial use / crush forecast | 12.000 MMT |
| Feed, waste, and dockage forecast | 0.500 MMT |
| Total domestic use forecast | 12.551 MMT |
| Carry-out stocks forecast | 2.765 MMT |
| Average price forecast | CAD 685/t |

Carry the source date with these numbers. If AAFC and Statistics Canada differ by a small rounding or revision amount, do not blend them by hand. Pick the source contract for the panel and show the source/date.

The main product visual should start with total supply, while also showing production as the largest component inside supply.

```text
2025-2026 total supply: 23.516 MMT

| exports | crush / industrial | feed / waste / dockage | commercial stocks | estimated farm bins | residual / gap |
```

If the user wants a pure "where did the 2025 crop go?" view, start from production. If the question is market tightness, start from total supply because carry-in and imports matter.

## Farmer Holding Logic

Producer deliveries rising does not prove farmers expect higher future prices. It proves canola entered the licensed handling, process, or producer-car system.

Holding for higher prices is inferred only when multiple facts line up:

| State | Pattern | Read |
| --- | --- | --- |
| Holding with bullish conviction | Producer deliveries below last year / 5-year pace, on-farm stocks high, futures or basis firming, crush/export demand still active | Farmers may be waiting for better cash bids or futures follow-through. |
| Reluctant seller | Producer deliveries below normal, on-farm stocks high, futures and basis weak | Farmers may be refusing poor bids, not necessarily bullish. |
| Rally reward selling | Producer deliveries rise after futures/basis improve, stocks do not build too quickly | Farmers are selling into strength. Bullish demand may still be absorbing flow. |
| Forced flow / pressure selling | Producer deliveries rise while futures/basis weaken and commercial stocks build | Bearish supply pressure or contract/cash-flow/storage pressure. |
| Demand overwhelm | Deliveries rise, exports/crush rise faster, and stocks draw | Bullish. Demand is clearing available supply. |
| System backup | Deliveries rise, terminal/process/export movement lags, stocks build | Bearish or basis-negative until movement clears. |

The dashboard should show this as a pressure state, not a single number.

## Relationship Map

```text
AAFC / StatsCan crop baseline
  -> production
  -> carry-in
  -> total supply
  -> forecast exports, crush, domestic use, carry-out

StatsCan stocks
  -> on-farm stocks
  -> commercial stocks
  -> farmer holding estimate checkpoint

CGC weekly movement
  -> producer deliveries
  -> primary / process / terminal stocks
  -> terminal receipts
  -> terminal exports
  -> direct export-destination flow
  -> producer cars

Grain Monitor / producer cars
  -> rail, port, vessel, and corridor explanation

ICE Canola / cash basis / FX / CFTC
  -> price confirmation
  -> positioning pressure
  -> CAD/USD transmission
  -> futures-market divergence warning

Soybeans / soy oil / soy meal / palm / energy
  -> oilseed complex context
  -> canola oil and meal substitution pressure
  -> renewable fuel demand context
```

## Old-Crop Bar

V1 dashboard:

```text
23.516 MMT total supply
|------------------------- 100% -------------------------|
| exported | crushed | feed/waste/dockage | visible stocks | estimated farm bins | residual |
```

Required hover fields:

| Segment | Primary source | Notes |
| --- | --- | --- |
| Production | StatsCan / AAFC | Use final 2025 production once confirmed. |
| Carry-in | AAFC supply disposition | Needed for total supply. |
| Exports | CGC weekly for observed movement; AAFC for crop-year forecast | CGC exports need full formula from `cgc-market-mechanics-v1.md`. |
| Crush / industrial | CGC Process rows for weekly movement; AAFC/COPA/StatsCan context where admitted | Do not infer crusher margin without price/oil/meal data. |
| Feed, waste, dockage, loss, source residual | AAFC / StatsCan | Keep as residual accounting. Do not tell a farmer-action story from this bucket. |
| Commercial stocks | CGC commercial stocks plus StatsCan stock checks | Distinguish commercial from farm-held. |
| Estimated farm bins | StatsCan on-farm stocks, then interpolated between stock dates | Label as estimate unless directly reported. |

## New-Crop Overlay

New-crop canola must sit beside the old-crop bar, not inside it.

For 2026-2027, AAFC's April 17, 2026 Outlook lists:

| Metric | Value |
| --- | ---: |
| Seeded area | 8.838 Mha |
| Production forecast | 19.200 MMT |
| Total supply forecast | 22.065 MMT |
| Exports forecast | 7.800 MMT |
| Crush / industrial use forecast | 13.000 MMT |
| Carry-out stocks forecast | 1.064 MMT |
| Average price forecast | CAD 655/t |

New-crop pressure states:

| Signal | Bullish old-crop implication | Bearish old-crop implication |
| --- | --- | --- |
| Seeded area below expectations | More pressure on old-crop coverage and new-crop bids | Limited unless demand is also weak. |
| Seeded area above expectations | Limited unless crop risk emerges | New-crop supply pressure can cap rallies. |
| Early weather stress | Supports deferred futures and old-crop holding confidence | Weak if demand is already backing off. |
| Strong stand / favourable weather | Old-crop rallies need demand proof | New-crop supply can pressure deferred values. |

## Update Calendar

As of 2026-05-07, the next source gates are:

| Date | Source | Release | Dashboard action |
| --- | --- | --- | --- |
| 2026-05-06 | Statistics Canada | Stocks of principal field crops as of March 31, 2026 | Already released. Load canola total stocks, on-farm stocks, commercial stocks, exports, and domestic-use context into the old-crop holding checkpoint. |
| 2026-05-21 | AAFC | Outlook for Principal Field Crops | Refresh 2025-2026 canola supply/disposition forecast, price forecast, export forecast, crush forecast, and 2026-2027 forward-supply assumptions. |
| 2026-06-30 | Statistics Canada | Principal field crop areas, June 2026 | Replace March seeding intentions with actual seeded-area survey estimates. This is the first major new-crop acreage reset. |
| 2026-08-31 | Statistics Canada | Model-based principal field crop estimates, July 2026 | Candidate early production forecast. Use as a watched/forecast source until admitted in the source registry. |
| 2026-09-09 | Statistics Canada | Stocks of principal field crops as of July 31, 2026 | Final old-crop stock checkpoint. Reconcile carry-out, farm bins, and commercial stocks. |
| 2026-09-16 | Statistics Canada | Model-based principal field crop estimates, August 2026 | Candidate harvest-size update before final survey. Use with forecast flags. |
| 2026-12-04 | Statistics Canada | Production of principal field crops, November 2026 | Final 2026 production and acreage gate; updates 2026-2027 supply baseline. |

## Source Notes

Primary sources checked:

- AAFC Outlook, April 17, 2026: https://agriculture.canada.ca/en/sector/crops/reports-statistics/canada-outlook-principal-field-crops-2026-04-17
- Statistics Canada principal field crop areas, March 5, 2026: https://www150.statcan.gc.ca/n1/daily-quotidien/260305/dq260305a-eng.htm
- Statistics Canada stocks, March 31, 2026 release: https://www150.statcan.gc.ca/n1/daily-quotidien/260506/dq260506c-eng.htm
- Statistics Canada 2026 release calendar PDF: https://www150.statcan.gc.ca/release-diffusion/2026-eng.pdf

## V1 Build Boundary

Ship Canola only.

Do not add all grains until the Canola flow, stock, farmer-holding, and new-crop overlay are working. This is the first visible proof that Bushel Board can explain why a market is bullish or bearish instead of just saying it is.

V1 required panels:

1. Old-crop supply bar.
2. Farmer holding gauge.
3. Weekly CGC movement versus last year and 5-year pace.
4. Crush/export demand split.
5. Visible commercial stocks versus estimated farm bins.
6. ICE Canola/basis confirmation strip.
7. New-crop acreage and production overlay.
8. Source update calendar.

Mini-lesson: a residual is the accounting gap left after known buckets are removed. In oilfield terms, it is like fluid balance around a tank battery: if inlet, sales, and measured tank level do not fully explain the starting volume, the gap is not automatically theft or leakage. It is a labelled unknown until another measurement closes it.
