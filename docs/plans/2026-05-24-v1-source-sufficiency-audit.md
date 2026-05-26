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

1. WASDE is now refreshed through May 2026 and source freshness reports strong after the post-audit import.
2. Spring Wheat and Winter Wheat are still V1 visible lanes with source-mapping placeholders, not direct packet lanes.
3. Canada crop progress is now admitted into Canada thesis packets where directly mapped (`supply.canada_crop_progress`); generic Wheat remains unmapped rather than silently aliasing Spring/Winter Wheat classes.
4. Export Sales + WASDE projection pace is intentionally admitted only where the importer passed sanity guardrails; Wheat, Corn, and Soybeans now pass after the USDA ESR commodity-code correction, while Barley and Oats remain null-guarded. The 2026-05-26 diagnostic re-audit recorded exact latest-row reasons in `source_runs.metadata.projection_admission.latest_by_commodity`: Barley is 38.182% of WASDE export projection and Oats is 1.964%, both below the 60-140% admission guardrail.
5. Farmer-local sources remain optional and should not be counted as public thesis blockers.

## Live source freshness snapshot

Checked live through Supabase on 2026-05-24.

| Source | Lane | Latest period end | Rows | Freshness | Action |
|---|---:|---:|---:|---|---|
| cgc_imports | system | 2026-05-14 | 35 | strong | No immediate action |
| grain_monitor_snapshots | Canada | 2026-05-19 | 33 | strong | No immediate action |
| producer_car_allocations | Canada | 2026-05-22 | 382 | strong | No immediate action |
| canada_crop_progress | Canada | 2026-05-20 | 491 | strong | No immediate action |
| crop_acreage_estimates | US | 2026-03-31 | 157 | strong | No immediate action |
| usda_quarterly_stocks | US | 2026-03-01 | 47 | strong | No immediate action |
| usda_wasde_raw | international | 2026-05-01 | 2,112 | strong | No immediate action |
| market_analysis | analysis | 2026-03-13 | 98 | usable but stale-risk | Do not treat as live source truth |
| us_market_analysis | analysis | 2026-04-20 | 0 estimated | legacy | Do not use for live source truth |
| x_market_signals | analysis | 2026-04-24 | 935 | legacy | Do not use for live source truth |
| crop_plans | farmer_local | 2026-04-28 | 6 | strong | Optional local only |
| crop_plan_deliveries | farmer_local | 2026-03-15 | 2 | usable but stale-risk | Optional local only |
| posted_prices | farmer_local | null | 0 | empty | Optional local only |
| weather_cache | farmer_local | null | 0 | empty | Optional local only |

Note: `usda_quarterly_stocks` previously showed `rows_available = 0` because the freshness RPC uses `pg_class.reltuples` estimates. Running `ANALYZE public.usda_quarterly_stocks` corrected the live estimate to 47 rows. This was a maintenance/statistics correction, not a data import.

## Cached thesis packet coverage

Live cache rows were refreshed again after the Canada crop-progress packet admission at `2026-05-24 18:28 UTC` with source watermark `2026-05-24 18:02 UTC` for active V1 source-backed lanes.

Legend:
- `Y` = field family appears in cached packet JSON.
- `—` = not applicable for that country lane.
- `Placeholder` = V1 visible row exists in the UI as mapping-needed / intentionally missing lane, not as a direct source-backed packet.

| V1 grain | Canada packet | US packet | Canada core fields | US core fields | Readiness |
|---|---|---|---|---|---|
| Corn | Y | Y | supply, crop progress, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; guarded projection pace now admitted |
| Soybeans | Y | Y | supply, crop progress, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; guarded projection pace now admitted |
| Wheat | Y | Y | supply, demand, logistics, positioning, prices, Grain Monitor, Producer Cars; generic Wheat has no direct Canada crop-progress row to avoid aliasing class data | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Strongest US compound lane today; guarded Export Sales/WASDE projection admitted |
| Spring Wheat | Placeholder | Placeholder | No direct packet row | No direct packet row | Needs source mapping before final V1 confidence |
| Winter Wheat | Placeholder | Placeholder | No direct packet row | No direct packet row | Needs source mapping before final V1 confidence |
| Durum | Y via `Amber Durum` | — | supply, crop progress via Durum, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | No intentional US lane in current V1 | Canada-first usable; US lane intentionally absent |
| Canola | Y | — | supply, crop progress, demand, logistics, positioning, prices, Grain Monitor, Producer Cars, Canola Council / StatsCan baseline | No intentional US lane in current V1 | Canada-first usable; US lane intentionally absent |
| Barley | Y | Y | supply, crop progress, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; projection pace null-guarded |
| Oats | Y | Y | supply, crop progress, demand, logistics, positioning, prices, Grain Monitor, Producer Cars | WASDE, quarterly stocks, acreage, crop progress, Export Sales, logistics, positioning, prices | Public V1 usable; projection pace null-guarded |

## Data families that are now admitted, with remaining caveats

### Canada crop progress

`public.canada_crop_progress` exists, freshness is strong through `2026-05-20`, and Canada thesis packets now expose mapped rows under `supply.canada_crop_progress`. Cache refresh verified crop-progress payloads for Amber Durum, Barley, Canola, Corn, Oats, and Soybeans. Generic Canada Wheat intentionally has no crop-progress payload until Spring/Winter Wheat class mapping is decided; do not silently alias class-specific crop-progress rows into generic Wheat.

## Data families that are present but not yet fully admitted

### Spring Wheat / Winter Wheat class split

The V1 UI keeps Spring Wheat and Winter Wheat visible, but `THESIS_BOARD_V1_LANE_SOURCE_MAP` currently marks them as `source mapping needed`. The cache has generic Wheat, not direct Spring/Winter rows. This is acceptable for transparent scouting, but not enough for a confident class-specific thesis.

### Export Sales + WASDE projection pace

Wheat, Corn, and Soybeans have admitted guarded projection fields and can show Export Sales + WASDE projection compound drivers. Barley and Oats correctly avoid fake projection-pace claims while their importer-admitted `export_pace_pct` fields remain null. The UI must not recompute projection pace from commitments/projection fields; any future expansion belongs in importer/admission logic. The 2026-05-25 root cause for the previous Corn/Soybeans null state was wrong USDA ESR commodity codes in the importer, not UI inference.

### WASDE

WASDE raw and mapped context are present, and cached US packets expose WASDE revision fields. The post-audit import refreshed the live source through `2026-05-01` and thesis freshness now reports `strong`. May-vs-April revision deltas are visible in cached US packets for Corn, Soybeans, Wheat, and Barley. Oats old-crop `2025` remains on the latest available April packet because the May PSD response had no 2025 Oats rows; new-crop 2026 Oats rows are present in `usda_wasde_raw`.

## Recommended next slices, in order

1. **Wheat class mapping decision — resolved 2026-05-25**
   - Spring Wheat and Winter Wheat remain visible V1 placeholder rows with explicit `Mapping needed` / `Mapping pending` copy.
   - Generic Wheat is not aliased into either class-specific row.
   - Future class-specific mapping must be deliberate; do not backslide into fake generic-Wheat precision.

2. **Guarded projection admission expansion — resolved 2026-05-26**
   - USDA ESR commodity codes were corrected in the importer.
   - Corn and Soybeans now admit `export_pace_pct` after commodity/year/report-month/unit and 60-140% sanity guardrails pass.
   - Barley and Oats were re-audited with source-run row diagnostics and remain null-guarded for a real guardrail miss, not a UI gap: latest Barley pace is 38.182% against 196,000 mt WASDE exports, and latest Oats pace is 1.964% against 44,000 mt.
   - Keep UI/query code from inferring projection pace. Future changes must happen in importer-layer admission only.

3. **Final source-sufficiency gate before public thesis authorization**
   - Run `/thesis?audit=1` browser check.
   - Confirm source-health banner shows no false blockers.
   - Confirm every V1 row is either public-V1 usable, Canada-first intentional, or explicit mapping-needed.
   - Label output as scouting-quality until Spring/Winter mapping and guarded projection expansion are settled.

## Security note

Supabase advisors still flag `public.prediction_scorecard` with RLS disabled. Do not blindly enable RLS without read/write policies because that can break production reads/writes, but it remains a real security issue that needs a deliberate policy pass.
