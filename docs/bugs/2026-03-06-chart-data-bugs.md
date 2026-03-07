# Chart Data Bugs — 2026-03-06

## Summary
Three charts on the grain detail page were displaying incorrect data due to mismatched query filters against the CGC data format.

## Bug 1: Delivery Velocity vs Domestic Disappearance — Shows 0

**Symptom:** The "Domestic Disappearance" line on the delivery velocity chart shows 0.0 kt for all weeks.

**Root Cause:** `getCumulativeTimeSeries()` in `lib/queries/observations.ts` queried Terminal Exports with `grade = 'All grades combined'`. However, in the CGC data, only Peas has an "All grades combined" row in Terminal Exports/Stocks. All other grains (Canola, Wheat, Barley, etc.) only have individual grade rows (No.1 CANADA, No.2 CANADA, etc.).

Similarly, the processing query filtered by prairie provinces only, but the Process worksheet may use different region names.

**Fix:**
- Removed `grade = 'All grades combined'` filter from exports query — now sums all grades per week
- Removed prairie province filter from processing query — now captures total Canadian processing

**Affected file:** `lib/queries/observations.ts` — `getCumulativeTimeSeries()`

## Bug 2: Terminal Elevators — Shows 0

**Symptom:** Storage breakdown shows Primary Elevators and Process Elevators with values, but Terminal Elevators is missing (0 kt).

**Root Cause:** `getStorageBreakdown()` queried Terminal Stocks with `grade = 'All grades combined'`. Same issue as Bug 1 — this grade value doesn't exist for most grains.

**Fix:** Removed `grade = 'All grades combined'` filter — now sums all grades across all terminal regions.

**Affected file:** `lib/queries/observations.ts` — `getStorageBreakdown()`

## Bug 3: Domestic Disappearance Breakdown — Confusing duplicate legend entries

**Symptom:** The disposition bar chart shows repeated "Pacific" entries (3-4 times), "Thunder Bay" entries (3 times), "Canadian Domestic" entries (multiple times), all with different values. The legend is overwhelming and confusing.

**Root Cause:** `getShipmentDistribution()` used `LIKE '%Shipment Distribution%'` which matched 6 different worksheet+metric combinations:
1. `Feed Grains Shipment Distribution` / `Feed Grain Shipment Distribution` (national feed grain)
2. `Primary Shipment Distribution` / `Shipment Distribution` (national primary grain)
3. `Primary Shipment Distribution` / `Ab-Shipment Distribution` (Alberta only)
4. `Primary Shipment Distribution` / `Sk-Shipment Distribution` (Saskatchewan only)
5. `Primary Shipment Distribution` / `Mb-Shipment Distribution` (Manitoba only)
6. `Producer Cars` / `Shipment Distribution`

Each worksheet has overlapping region names (Pacific, Thunder Bay, etc.), causing duplicate entries.

**Fix:** Replaced the broad `LIKE` filter with an explicit `.or()` targeting only the two national-level worksheet+metric combos. A grain appears in exactly one (Primary or Feed Grains), so no duplicates.

**Affected file:** `lib/queries/observations.ts` — `getShipmentDistribution()`

## CGC Data Format Notes

Key learnings about the CGC CSV structure for future reference:

### Grade field behavior
- Most worksheets use empty string `""` for grade (Primary, Feed Grains, Process, Shipment Distribution)
- Terminal Stocks and Terminal Exports use specific grade names (No.1 CW, No.2 CANADA, etc.)
- Only Peas has an "All grades combined" rollup row — all other grains require summing individual grades

### Shipment Distribution worksheets
- National aggregate: `Primary Shipment Distribution` + `Shipment Distribution` metric
- National feed grain: `Feed Grains Shipment Distribution` + `Feed Grain Shipment Distribution` metric
- Provincial: Same worksheet but metrics like `Ab-Shipment Distribution`, `Sk-Shipment Distribution`, `Mb-Shipment Distribution`
- Producer Cars: Separate `Producer Cars` worksheet also has `Shipment Distribution` metric

### Terminal Disposition (not yet used)
- Contains: `Canadian Domestic`, `Export Destinations`, `Port Terminals` metrics
- Regions: Bay & Lakes, Churchill, Prince Rupert, St. Lawrence, Thunder Bay, Vancouver
- Could be used for more granular terminal flow analysis in future

## Testing
- After fix: verify Canola grain detail page shows non-zero Domestic Disappearance values
- Verify Terminal Elevators appears in storage breakdown for Canola, Wheat, Barley
- Verify Disposition Bar shows 7 or fewer distinct regions without duplicates
