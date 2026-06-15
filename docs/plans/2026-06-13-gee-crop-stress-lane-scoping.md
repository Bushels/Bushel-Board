# GEE Crop-Stress Lane — Scoping (Wheat-first)

**Date:** 2026-06-13
**Status:** Scoping (not built). Prerequisite: confirm GEE access (see §1).
**Origin:** Stance Model V2 §16.3 — the weather domain is proxy-only (`weather_cache` empty; domain uses seeding%/condition%). Google Earth Engine turns weather from a lagging proxy into a **leading** crop-stress signal, and — critically — gives us crop condition for **Russia / EU / Australia / Black Sea, where we have NO data today**. That international blind spot is the single biggest gap in the wheat thesis (this whole session leaned on second-hand Russia tweets).

## 1. Access reality (the gating prerequisite — confirm before any build)
The repo has **zero GEE wiring**: no `earthengine-api` / `@google/earthengine` dependency, no `GEE_*`/`GOOGLE_APPLICATION_CREDENTIALS` env vars, no collector. "We have access to GEE" must be pinned to one of:
- **(a) GCP service account + Earth Engine enabled** (preferred for automation) — a JSON key, `earthengine-api` (Python), headless auth. This is what a weekly collector needs.
- **(b) Personal GEE account** (interactive `earthengine authenticate`) — fine for prototyping, **not** for the Claude Desktop Routine cadence.
- **(c) Earth Engine on Vertex AI / commercial plan** — required if Bushel Board is commercial use (GEE's free tier is non-commercial only — **licensing flag for Kyle**).
**Action:** Kyle confirms which of (a)/(b)/(c) we have. If (a), provide the service-account JSON path as `GEE_SERVICE_ACCOUNT_JSON` (gitignored). If only (b), we prototype but can't automate yet.

## 2. What GEE gives wheat (datasets)
| Signal | GEE dataset | Why it matters for wheat |
|---|---|---|
| Vegetation vigor | MODIS `MOD13Q1` NDVI/EVI (250m, 16-day); Sentinel-2 `COPERNICUS/S2_SR` for finer | Below-baseline NDVI over a wheat belt = crop stress = bullish supply |
| Soil moisture | NASA-USDA `SMAP` / `NASA/SMAP/SPL4SMGP` | Root-zone moisture anomaly leads condition ratings |
| Heat / GDD | ERA5 `ECMWF/ERA5_LAND/DAILY_AGGR` 2m temp; MODIS LST | Heat stress at grain fill; accumulated GDD vs normal |
| Precip anomaly | CHIRPS `UCSB-CHG/CHIRPS/DAILY`; ERA5 | Drought/flood (e.g. the Manitoba flood, Russian Volga dryness) |
| Evapotranspiration | MODIS `MOD16A2` ET/PET | Water-stress confirmation |

## 3. Wheat belts (AOIs) — where we point it
Defined as admin-boundary polygons (GAUL/FAO `FAO/GAUL/2015/level1` or TIGER for US):
- **US HRW:** KS, OK, TX, NE, CO  ·  **US/Canada N. Plains spring:** ND, MT, SD; SK, MB, AB
- **Canadian prairies (CWRS/durum):** AB, SK, MB crop districts
- **Russia winter:** Southern/Central districts (Krasnodar, Rostov, Volgograd)  ·  **Russia spring:** Volga, Urals, Siberia (the Sizov story — currently invisible to us)
- **EU:** France, Germany; **Black Sea:** Ukraine  ·  **Australia:** NSW, WA, SA, VIC
This set covers ~the entire global exportable wheat supply — the exact regions the `world_balance` + `competitor_area_trajectory` (§16.2) contexts reason about.

## 4. Signal design (turn pixels into a score)
Per region, per ISO week:
1. Composite each dataset over the AOI (cloud-masked mean for NDVI; mean for SMAP/ERA5).
2. **Z-score vs a trailing 5-year same-week baseline** (the anomaly is the signal, not the absolute).
3. Combine into a `crop_stress_index` ∈ [−1, +1]: **negative = stressed (bullish supply), positive = healthy (bearish supply)** — weight NDVI + soil-moisture most at vegetative stage, GDD/heat most at grain fill (phenology-aware).
4. Flag `data_quality` (cloud %, pixel coverage).

## 5. Storage
```sql
create table gee_crop_stress (
  id uuid primary key default gen_random_uuid(),
  crop_belt text not null,          -- 'US_HRW' | 'RU_SPRING' | 'CA_PRAIRIE' | ...
  region_code text not null,        -- admin code
  grain text not null default 'Wheat',
  week_ending date not null,
  ndvi_z numeric, soil_moisture_z numeric, gdd_anom numeric, precip_anom numeric,
  stress_index numeric,             -- [-1,+1], negative = stressed = bullish supply
  data_quality jsonb,
  source_datasets text[],
  computed_at timestamptz not null default now(),
  unique (crop_belt, region_code, grain, week_ending)
);
```

## 6. Collector + mapper
- **Collector:** `scripts/import-gee-crop-stress.py` (Python — `earthengine-api`), weekly, idempotent upsert, JSON to stdout / diagnostics to stderr (per Script Conventions). Wrapper `collect:gee-crop-stress` → refreshes thesis cache. Claude Desktop Routine, weekly (Mon, after the week's imagery composites).
- **Mapper:** start as a **`bounded_context`** (±6, weight-neutral, strong-freshness-gated) — the proven veg-oil pattern — feeding the weather/supply read: a stressed major-exporter belt = bullish supply tilt. **Graduate to a real `weather` domain** only after §7 validation. For Russia/EU/Australia (no other condition data), this is the *only* crop-condition input → highest marginal value.

## 7. Validation before it scores
Per the wheat-only discipline: backtest `stress_index` against realized condition ratings (USDA NASS / StatsCan where they exist) AND against price moves over ≥6–8 weeks before letting it move the stance. Until then: **watch-only / display**, not scored.

## 8. Build order
- **P-G0** Confirm access (§1) + licensing.
- **P-G1** Prototype: 1 belt (US HRW), NDVI + SMAP, z-score vs baseline — prove the pipeline end-to-end.
- **P-G2** Full belt set (§3) + `gee_crop_stress` table + collector + wrapper.
- **P-G3** Phenology-aware `stress_index` + data-quality flags.
- **P-G4** `mapGeeCropStressContext()` bounded_context (±6); surface on /thesis as a "global crop stress" strip (watch-only).
- **P-G5** Validate (§7) → graduate to weather domain for belts where it backtests.

## 9. Open questions for Kyle
1. Which access do we have — service account (a), personal (b), or Vertex/commercial (c)? Provide the credential path if (a).
2. Commercial-use licensing for GEE confirmed?
3. Priority order of belts — lead with **Russia spring + winter** (biggest blind spot) or **US HRW** (easiest to validate against NASS)? Recommend: build US HRW first to validate the method against ground-truth NASS, then point it at Russia where we're flying blind.
