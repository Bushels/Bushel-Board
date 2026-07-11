# Wheat Data Page — P1 (GEE Crop-Stress Map Hero) — Design & Build Spec

**Date:** 2026-06-16
**Status:** APPROVED (Kyle, 2026-06-16) after a Codex design review. Implementation in progress.
**Parent direction:** `docs/plans/2026-06-15-wheat-first-data-viz-redesign.md` (§10). This spec is the implementation-of-record for P1.

## Locked decisions
- **New public `/data` route** — leave the 3D `/data-universe` untouched.
- **Choropleth fills** (filled polygons), not centroid markers.
- **Static latest-week** only (no time slider; only ~1–2 weeks of GEE data exist).
- **P1 scope = page scaffold + the GEE crop-stress map hero ONLY.** P2 = CGC/COT/WASDE/crop-condition/price panels.

## Data (authoritative)
`gee_crop_stress` (migration `20260615120000_gee_crop_stress.sql`, **public-read RLS** → SSR/anon client can read it directly).
Columns: `crop_belt`, `region_code` (`KS|OK|TX|NE|CO|BELT`), `region_name`, `grain`, `week_ending`, `ndvi_z`, `sm_z`, `stress_index` (clamped `[-1,+1]`; **negative = stressed = bullish supply**), `reading` (text: "stressed (bullish supply)" / "healthy (bearish supply)" / "near-normal" / "no-data"), `data_quality` jsonb, `source_datasets` text[], `computed_at`.
Belts: `US_HRW` (5 states + `BELT` union), `RU_WINTER` (`BELT` only), `RU_SPRING` (`BELT` only). **No geometry stored.** Russia bboxes (from `scripts/gee/gee_stress_core.py`, `[W,S,E,N]`): `RU_WINTER [35,43,48,53]`, `RU_SPRING [45,50,87,57]`.

## Architecture (data flow)
```
Supabase latest week (public-read RLS, SSR client)
  -> lib/queries/gee-crop-stress.ts  getLatestCropStress()  [two-query shape]
  -> typed CropStressMapData payload
  -> app/(dashboard)/data/page.tsx (server: safeQuery + SectionBoundary)
  -> components/dashboard/crop-stress-map.tsx (client)
  -> client merges rows into checked-in GeoJSON features (by crop_belt+region_code)
  -> Mapbox fill-color reads feature.properties.stress_index
```

## Files
- `app/(dashboard)/data/page.tsx` — server page. `dynamic = "force-dynamic"`, metadata, header (farmer voice + public-data disclaimer), plain-English takeaway, `safeQuery` + `SectionBoundary` around the map.
- `lib/queries/gee-crop-stress-utils.ts` — **client-safe** type source + pure helpers: `stressColor(stressIndex)` diverging **red(stressed/bullish) ↔ tan ↔ green(healthy/bearish)** in HEX, a Mapbox `interpolate` color expression, a takeaway-sentence builder (uses `reading`), `num()`.
- `lib/queries/gee-crop-stress.ts` — **server-only** `getLatestCropStress()`; imports types FROM utils. Two-query shape (below). Re-exports nothing client needs.
- `components/dashboard/crop-stress-map.tsx` — **client** map. Imports ONLY `gee-crop-stress-utils` + geometry (never the server module). `react-map-gl/mapbox`, `light-v11` base, token guard + graceful fallback, `Source`+`Layer(fill)`, `interactiveLayerIds` + hover focus strip, diverging legend, freshness ribbon, "watch-only" honesty badge.
- `lib/maps/wheat-belt-geometries.ts` + committed simplified GeoJSON — 5 US HRW state polygons + 2 Russia bbox rectangles; each feature `properties = {crop_belt, region_code, region_name}`.
- Nav (desktop + mobile) — add `/data`, disambiguate vs `/data-universe`.
- `components/dashboard/CLAUDE.md` component-map note + `STATUS.md`/`PROJECT_STATE.md` track note.

## Codex review refinements (folded in — all adopted)
1. **Latest-week = two queries, not "recent N + reduce":** (a) `select week_ending order desc limit 1`; (b) `select * where week_ending = <that>`; (c) `source_runs` queried separately (no FK from `gee_crop_stress`).
2. **Base = `mapbox://styles/mapbox/light-v11`** + muted labels + palette chrome (satellite fights fills).
3. **Bounds = computed from GeoJSON / global wheat-belt bounds (US + Russia).** Do NOT reuse the spring map's North-America `MAX_BOUNDS [[-126,31],[-88,57]]` — Russia (lon +35→+87) would be clipped.
4. **Composite join key `(crop_belt, region_code)`** — `BELT` collides across belts.
5. **`US_HRW/BELT` feeds takeaway/ribbon only, never a fill** (it's the union of the 5 states → would double-render). Fills = 5 US states + 2 Russia rectangles.
6. **Color via `feature.properties.stress_index`** merged into GeoJSON client-side; `feature-state` only for hover.
7. **Geometry generated once, simplified, committed** (with source/license note). No build-time fetch; no rough hand polygons.
8. **Client/server split:** types live in `-utils`; server imports from utils; client imports utils + geometry only.
9. **Nav:** update desktop AND mobile; disambiguate the two data links (`/data` = "Wheat Data"; relabel `/data-universe` "Data Map" → "Data Flow").
10. **Interaction reference = the choropleth `Source+Layer+interactiveLayerIds+onMouseMove` pattern** (NOT the marker map). NB: `province-map.tsx` is on the dashboard "Retired — do not recreate" list → read it as a *technique reference only*, build a fresh component.

## Build order
1. Generate + simplify + commit the 5 US-state GeoJSON (one-time local, with license note).
2. `lib/maps/wheat-belt-geometries.ts` (assemble FeatureCollection: 5 states + 2 Russia rectangles).
3. `lib/queries/gee-crop-stress-utils.ts` (types + pure helpers).
4. `lib/queries/gee-crop-stress.ts` (server two-query helper).
5. `components/dashboard/crop-stress-map.tsx` (client map).
6. `app/(dashboard)/data/page.tsx` (server page).
7. Nav (desktop + mobile) + label disambiguation.
8. Docs (`CLAUDE.md` component map, STATUS/PROJECT_STATE).

## Verification (Definition of Done)
`npm run build` + `npm run test` green; no `any` escape hatches; preview the `/data` page → screenshot light + dark, console clean; **confirm both Russia belts render** (tests the bounds fix); confirm **negative `stress_index` renders red** (correct polarity); honest empty state when no rows / no token. Then an adversarial review pass over the diff against this spec + the Codex risk list.
