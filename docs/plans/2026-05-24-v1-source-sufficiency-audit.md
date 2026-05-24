# Bushel Board V1 source-sufficiency audit — 2026-05-24

## Scope

Audit whether the Bullish/Bearish V1 board has enough Canada + US public source data imported and admitted for the nine approved grain lanes:

- Corn
- Soybeans
- Wheat
- Spring Wheat
- Winter Wheat
- Durum
- Canola
- Barley
- Oats

This audit does not expand scope into pulses, flax, minor CGC labels, US rice/cotton, global lanes, or Kalshi.

## Bottom line

The public-data spine is strong enough for a **scouting-quality V1 thesis board**, but it is not yet complete enough to claim that all important Canada + US data is imported and admitted for final production-grade Bullish/Bearish authorization.

The main public source families are present and mostly fresh. The remaining gap is not “empty database”; it is source sufficiency and admission discipline:

1. WASDE is present but stale-risk relative to the current clock.
2. Spring Wheat and Winter Wheat are still V1 visible lanes with source-mapping placeholders, not direct packet lanes.
3. Canada crop progress exists in the database, but cached Canada thesis packets do not yet expose a dedicated crop-progress field.
4. Export Sales + WASDE projection pace is intentionally admitted only where the importer passed sanity guardrails; currently Wheat passes while Corn/Soybeans/Barley/Oats remain null-guarded.
5. Farmer-local sources remain optional and should not be counted as public thesis blockers.

## Live source freshness snapshot

Checked live through Supabase on 2026-05-24.

| Source | Lane | Latest period end | Rows | Freshness | Action |
|---|---:|---:|---:|---|---|
| cgc_imports | system | 2026-05-14 | 35 | strong | No immediate action |
| grain_monitor_snapshots | Canada | 2026-05-19 | 33 | strong | No immediate action |
| producer_car_allocations | Canada | 2026-05-22 | 382 | strong | No immediate action |
| crop_acreage_estimates | US | 2026-03-31 | 157 | strong | No immediate action |
| usda_quarterly_stocks | US | 2026-03-01 | 47 | strong | No immediate action |
| usda_wasde_raw | international | 2026-04-01 | 1,981 | usable but stale-risk | Refresh or explicitly accept stale-risk before thesis generation |
| market_analysis | analysis | 2026-03-13 | 98 | usable but stale-risk | Do not treat as live source truth |
| us_market_analysis | analysis | 2026-04-20 | 0 estimated | legacy | Do not use for live source truth |
| x_market_signals | analysis | 2026-04-24 | 935 | legacy | Do not use for live source truth |
| crop_plans | farmer_local | 2026-04-28 | 6 | strong | Optional local only |
| crop_plan_deliveries | farmer_local | 2026-03-15 | 2 | usable but stale-risk | Optional local only |
| posted_prices | farmer_local | null | 0 | empty | Optional local only |
| weather_cache | farmer_local | null | 0 | empty | Optional local only |

Note: `usda_quarterly_stocks` previously showed `rows_available = 0` because the freshness RPC uses `pg_class.reltuples` estimates. Running `ANALYZE public.usda_quarterly_stocks` corrected the live estimate to 47 rows. This was a maintenance/statistics correction, not a data import.

## Cached thesis packet coverage

Live cache rows are refreshed through `2026-05-23 17:07 UTC` with source watermark `2026-05-23 17:06 UTC` for active V1 source-backed lanes.

Legend:
- `Y` = field family appears in cached packet JSON.
- `—` = not applicable for that country lane.
- `Placeholder` = V1 visible row exists in the UI as mapping-needed / intentionally missing lane, not as a direct source-backed packet.

| V1 grain | Canada packet | US packet | Canada core fields | US core fields | Readiness |
|---|---|---|---|---|---|
| Corn | Y | Y | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; improve WASDE freshness/projection guardrail |
| Soybeans | Y | Y | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; improve WASDE freshness/projection guardrail |
| Wheat | Y | Y | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Strongest US compound lane today; guarded Export Sales/WASDE projection admitted |
| Spring Wheat | Placeholder | Placeholder | No direct packet row | No direct packet row | Needs source mapping before final V1 confidence |
| Winter Wheat | Placeholder | Placeholder | No direct packet row | No direct packet row | Needs source mapping before final V1 confidence |
| Durum | Y via `Amber Durum` | — | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | No intentional US lane in current V1 | Canada-first usable; US lane intentionally absent |
| Canola | Y | — | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars, Canola Council / StatsCan baseline | No intentional US lane in current V1 | Canada-first usable; US lane intentionally absent |
| Barley | Y | Y | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; projection pace null-guarded |
| Oats | Y | Y | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; projection pace null-guarded |

## Data families that are present but not yet fully admitted

### Canada crop progress

`public.canada_crop_progress` exists and recent source runs show successful imports through `2026-05-20`, but cached Canada thesis packets currently do not expose a dedicated `supply.canada_crop_progress` field. Canada crop progress should be wired into packet JSON before saying seeded/crop-condition signals are fully admitted to thesis scoring.

### Spring Wheat / Winter Wheat class split

The V1 UI keeps Spring Wheat and Winter Wheat visible, but `THESIS_BOARD_V1_LANE_SOURCE_MAP` currently marks them as `source mapping needed`. The cache has generic Wheat, not direct Spring/Winter rows. This is acceptable for transparent scouting, but not enough for a confident class-specific thesis.

### Export Sales + WASDE projection pace

Wheat has admitted guarded projection fields and can show `Export sales outrunning WASDE projection`. Corn, Soybeans, Barley, and Oats correctly avoid fake projection-pace claims while their fields remain null. Next improvement belongs in importer/admission logic, not UI-side inference.

### WASDE

WASDE raw and mapped context are present, and cached US packets expose WASDE revision fields. Freshness still reports stale-risk because latest report month is `2026-04-01`. Before final thesis authorization, refresh/import the current WASDE cycle or explicitly mark the thesis as using April WASDE context.

## Recommended next slices, in order

1. **WASDE refresh/admission check**
   - Confirm whether May 2026 WASDE should be present.
   - If missing, import/refresh it.
   - Refresh thesis packet cache.
   - Verify cached US packets still expose latest-vs-previous revision deltas.

2. **Canada crop-progress vertical slice**
   - Wire `canada_crop_progress` into Canada thesis packets under a stable supply/crop-progress field.
   - Add freshness RPC visibility if needed.
   - Add deterministic farmer-readable drivers for seeded progress / condition only where mapped and fresh.
   - Refresh cache and inspect Canada V1 grains.

3. **Wheat class mapping decision**
   - Decide whether Spring Wheat and Winter Wheat should remain placeholder rows for V1 or be mapped to actual class-specific source packets.
   - If mapping, do it deliberately; do not alias both to generic Wheat without a label explaining the proxy.

4. **Guarded projection admission expansion**
   - Continue importer-layer sanity checks for Corn/Soybeans/Barley/Oats Export Sales vs WASDE projection.
   - Only admit `export_pace_pct` when market-year, report-month, unit conversion, and 60–140% sanity guardrails pass.

5. **Final source-sufficiency gate before public thesis authorization**
   - Run `/thesis?audit=1` browser check.
   - Confirm source-health banner shows no false blockers.
   - Confirm every V1 row is either public-V1 usable, Canada-first intentional, or explicit mapping-needed.
   - Label output as scouting-quality until Spring/Winter mapping and WASDE freshness are settled.

## Security note

Supabase advisors still flag `public.prediction_scorecard` with RLS disabled. Do not blindly enable RLS without read/write policies because that can break production reads/writes, but it remains a real security issue that needs a deliberate policy pass.
