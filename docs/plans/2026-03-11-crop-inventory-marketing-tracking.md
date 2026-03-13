# Crop Inventory And Marketing Tracking

Date: 2026-03-11
Difficulty: 7/10
Status: Implemented in code, migration staged in repo

## Goal

Make crop plans track four distinct farmer inputs:

1. Seeded acres
2. Estimated starting grain amount
3. Estimated grain left to sell
4. Contracted tonnes within the remaining amount

Also let farmers enter crop amounts in the unit they actually use operationally:

- metric tonnes
- bushels
- pounds

while storing canonical metric-tonne values for analytics, CGC comparisons, and AI prompts.

This gives Bushel Board enough structure to show:

- grain left in the bin as a percentage
- priced grain as a percentage
- contracted vs open-market tonnes
- community contract adoption and pricing posture

## Product Changes

### My Farm

- The add-crop form now asks for `Estimated Starting Grain Amount`, `Est. Grain Left to Sell`, and `Of Which Contracted`.
- Farmers can enter those amounts in `metric tonnes`, `bushels`, or `pounds`.
- Bushel entry requires a `Bushel Weight (lb/bu)` and preserves that preference on the crop plan.
- Crop cards now visualize:
  - starting grain
  - estimated yield in `bu/ac` and `t/ac`
  - current left-to-sell inventory
  - priced share
  - contracted share
  - open-market share
  - contracted share of remaining
- Existing crop cards now have an edit path so farmers can correct acreage or inventory assumptions later.

### Delivery Logging

- Every delivery must now be classified as either:
  - `contracted`
  - `open`
- Logging a delivery automatically updates:
  - `volume_left_to_sell_kt`
  - `contracted_kt`
  - `uncontracted_kt`
- This keeps the dashboard and farm summary in sync without requiring manual inventory edits after each load.

### Farm Summary AI

- The weekly farm-summary prompt now includes:
  - starting grain
  - left-to-sell tonnes and percent
  - priced tonnes and percent
  - contracted tonnes and percent
  - open tonnes
  - anonymized community averages when the privacy threshold is met
- The AI can now reason about contract posture, open exposure, and what the broader farmer cohort is doing.

## Supabase Changes

### `crop_plans`

- Added `starting_grain_kt`
- Added `inventory_unit_preference`
- Added `bushel_weight_lbs`
- Kept `volume_left_to_sell_kt` as the live remaining inventory field
- Continued using `contracted_kt` and `uncontracted_kt` as live state
- Canonical storage remains metric-tonne based even when the farmer enters bushels or pounds
- Added a constraint so the marketing state stays internally consistent:
  - starting >= remaining
  - contracted <= remaining
  - uncontracted = remaining - contracted

### `crop_plan_deliveries`

- Added `marketing_type`
- Allowed values:
  - `contracted`
  - `open`
  - `legacy_unspecified`

### Trigger / Workflow

- Added a trigger that applies new delivery rows back onto `crop_plans`
- Deliveries now update live farmer state at write time instead of relying on frontend math
- Delivery logging now supports bushels as an input unit and converts using the crop's bushel weight before saving
- The JSON `deliveries` projection remains a compatibility cache, not the source of truth

### Analytics / RPC

- `calculate_delivery_percentiles()` now ranks farmers by priced progress:

```text
(already_marketed + currently_contracted) / starting_grain
```

- `get_delivery_analytics()` now also returns:
  - total starting grain
  - total remaining grain
  - total contracted grain
  - total open grain
  - average priced percentage
  - average contracted percentage
  - average open percentage
  - average left-to-sell percentage
  - contract-user ratio

## Backfill Rule

Legacy crop plans did not have:

- a starting-grain denominator
- delivery sale classification
- automatic remaining-balance updates

Backfill therefore uses these assumptions:

1. Legacy `volume_left_to_sell_kt` is treated as the first tracked remaining snapshot.
2. Historical ledger deliveries are subtracted from that snapshot to produce today's remaining balance.
3. Historical deliveries without classification are assumed to consume contracted tonnes first.

This is the cleanest deterministic migration, but it is still an assumption. Farmers with older plans may need to use the new edit flow once to correct the starting estimate or contract split.

## Metrics

### AI already analyzed before this change

- CGC producer deliveries
- exports
- crush / processing
- commercial stocks
- AAFC supply balance
- farmer sentiment poll
- X/Twitter market signals
- farmer delivery percentiles

### New metrics AI analyzes now

- starting grain amount
- grain left to sell
- grain left percentage
- priced grain percentage
- contracted percentage
- open-market percentage
- estimated yield in `bu/ac`
- estimated yield in `t/ac`
- community average priced percentage
- community average contracted percentage
- community contract adoption rate

## Files

- `supabase/migrations/20260312110000_crop_inventory_marketing_tracking.sql`
- `supabase/migrations/20260312113000_crop_inventory_unit_preferences.sql`
- `app/(dashboard)/my-farm/actions.ts`
- `app/(dashboard)/my-farm/client.tsx`
- `components/dashboard/log-delivery-modal.tsx`
- `components/dashboard/delivery-pace-card.tsx`
- `supabase/functions/generate-farm-summary/index.ts`
- `lib/utils/crop-plan.ts`
- `lib/utils/grain-units.ts`
- `lib/queries/delivery-analytics.ts`

## Warnings

- This migration has been created but not applied to the linked Supabase project in this pass.
- Any external workflow writing directly into `crop_plan_deliveries` must now provide `marketing_type`.
- Contract-vs-open community reporting is only trustworthy if new deliveries are classified correctly.
- Bushel conversions are only as accurate as the chosen `bushel_weight_lbs`; custom farmer overrides should be preserved, not silently reset.
