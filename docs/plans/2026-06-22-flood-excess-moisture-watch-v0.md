# Flood / Excess Moisture Watch V0

**Date:** 2026-06-22
**Status:** V0 built from a GEE spike; watch-only surface, not crop-loss proof.

## Decision

The spike proved enough signal to build v0.

Observed/forecast layers stay separate:

- Observed inundation: Sentinel-1 surface-water-like cropland pixels after permanent water removal.
- Excess moisture: recent IMERG rain plus SMAP wetness/saturation or lowland exposure.
- Forecast at-risk: GFS 3/7-day rainfall over already wet, recently rained-on, or low-lying cropland.
- Watch: lower-confidence rain/wetness/terrain acres worth monitoring.

Public language must say **acres at risk**, not confirmed damaged acres.

## Spike Proof

Command:

```powershell
npm run gee:flood-watch -- --event-start 2026-06-14 --event-end 2026-06-21 --event-label "2026-06-14 to 2026-06-21 Western Canada/US rain watch" --grid-degrees 2.5 --scale 2000 --min-grid-acres 2500 --out output/flood-watch/latest/flood-watch-v0.json
```

Result artifact copied to `public/data/flood-watch-v0.json` for the v0 map.

Totals:

| Bucket | Acres |
| --- | ---: |
| Observed inundation | 1,298.0 |
| Excess moisture | 8,772.0 |
| Forecast at-risk | 3,245.2 |
| Watch | 44,849.7 |

Source freshness was recorded in `source_runs` as `gee_flood_excess_moisture_watch`, source period ending `2026-06-21`.

## V0.1 Visual Context Pass

The map now uses official soil-moisture anomaly products as a visual underlay beneath the Bushel Board GEE acreage grid:

- Canada: AAFC weekly surface soil moisture anomaly, SMOS-derived percent-saturated surface soil moisture for the top 5 cm.
- Contiguous United States: Crop-CASMA weekly SMAP hybrid 1 km soil moisture anomaly from USDA NASS, NASA, and George Mason University.

This is a visual/context upgrade, not a claim upgrade. The underlay helps the map look and read more like established official products, while Bushel Board still owns only the watch acreage calculation:

```text
official moisture anomaly underlay
  -> Bushel Board GEE cropland acreage hotspots
  -> observed / excess / forecast / watch acres at risk
```

For the June 14-21 event artifact, the context layers are:

| Context layer | Latest / layer |
| --- | --- |
| AAFC weekly SMOS anomaly | 2026-06-21 12:00 UTC |
| Crop-CASMA SMAP hybrid weekly anomaly | `SMAP-HYB-1KM-ANOMALY-WEEKLY_2026_25_2026.06.15_2026.06.21` |

The Crop-CASMA WMS covers the contiguous United States, not Alaska, Hawaii, or U.S. territories. It is served through `app/api/map/crop-casma/[z]/[x]/[y]/route.ts` so Mapbox can request normal web map tiles while the server translates the tile bounds into WMS `EPSG:4326` requests.

The public v0.1 map no longer displays the original 2.5-degree rectangles. Those rectangles remain the reproducible acreage aggregation method in the GEE artifact, while the public map renders soft hotspot markers over the official moisture rasters.

## Data Contract

Datasets:

- `COPERNICUS/S1_GRD`
- `NASA/GPM_L3/IMERG_V07`
- `NASA/SMAP/SPL4SMGP/008`
- `NOAA/GFS0P25`
- `AAFC/ACI`
- `USDA/NASS/CDL`
- `JRC/GSW1_4/GlobalSurfaceWater`
- `MERIT/Hydro/v1_0_1`

Official visual context:

- AAFC weekly surface soil moisture anomaly ImageServer.
- Crop-CASMA SMAP hybrid 1 km weekly anomaly WMS.

Important correction from live GEE: `NASA/SMAP/SPL3SMP_E/005` was stale at 2023-12-02 in this environment. V0 uses SMAP L4 `NASA/SMAP/SPL4SMGP/008`, which was fresh to 2026-06-19 in the spike.

## Map Decision

Use the existing Mapbox/react-map-gl stack for v0/v0.1 because `/data` already has the choropleth pattern, token wiring, raster underlay support, and UI conventions. MapLibre + deck.gl can replace it later if this graduates into a denser H3 layer or high-volume tile layer.

The v0 acreage calculation uses a neutral 2.5-degree grid first. Province/state/county/RM rollups are a later step after boundary quality is checked.

## Ground-Truth Feedback

The `/environmental/flood-watch` page now includes a public wet/dry field-report form backed by the server-side `/api/environmental/field-check` route and saved into `feedback_log`; legacy `/data/flood-watch` redirects there. Users can mark a nearby location as normal, too wet, standing water, access blocked, dry topsoil, or drought stress. These reports are review/calibration inputs only; they do not automatically change public acre totals or convert watch acres into confirmed damaged acres.

## Boundaries

- Watch-only, not a thesis-score input.
- No crop-loss, yield-loss, prevented-planting, or insurance-style claim.
- Sentinel-1 observed acres are surface-water watch acres, not field-verified flood acres.
- Forecast acres are modeled exposure, not observed damage.
- Static v0 JSON is acceptable for first public inspection; recurring collection should graduate rows into a proper `gee_flood_watch` table rather than storing map rows in `source_runs`.
