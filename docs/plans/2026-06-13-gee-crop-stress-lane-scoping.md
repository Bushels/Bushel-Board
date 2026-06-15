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

**RESOLVED 2026-06-15 (prototype access):** Personal account `gronningk@gmail.com` (path (b)), project **`monette-494717`** (registered non-commercial via the Code Editor). Auth: `earthengine authenticate --scopes=https://www.googleapis.com/auth/earthengine,https://www.googleapis.com/auth/cloud-platform` — **must exclude the `drive` scope** (the default client ID is now `access_blocked` for `drive`, which silently fails the whole authorization). **Python 3.13 gotcha:** `ee.Initialize(project=...)` raises "Please authorize" even with a valid saved refresh token (`ee.oauth.is_valid_credentials()` wrongly returns False on 3.13); the working pattern is to build `google.oauth2.credentials.Credentials` from `~/.config/earthengine/credentials` and pass them explicitly: `ee.Initialize(credentials=creds, project='monette-494717')` — implemented in `scripts/gee/hrw-stress-prototype.py::init_ee()`. **For P-G2 automation, move to path (a) (service account)** — interactive tokens won't survive the Claude Desktop Routine cadence.

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
- **P-G1** ✅ **DONE 2026-06-15** — `scripts/gee/hrw-stress-prototype.py` proves the pipeline end-to-end: CDL-masked winter-wheat NDVI (MODIS/061/MOD13Q1) + root-zone soil moisture (NASA/SMAP/SPL4SMGP/**008** — /007 deprecated) over the HRW belt, z-scored vs trailing-5yr same-window baseline. First reading (2026-06-15): NDVI z −0.88, soil-moisture z −1.43, **stress_index −0.73 (stressed/bullish supply)** — independently corroborates the 25% G/E rating + drought narrative.
- **P-G2** ✅ **DONE 2026-06-15** — `gee_crop_stress` table (migration `20260615120000`, public-read RLS), shared `scripts/gee/gee_stress_core.py`, collector `scripts/gee/import-gee-crop-stress.py` (per-state KS/OK/TX/NE/CO + belt, PostgREST upsert + source_run). First load (wk ending 2026-06-14): all HRW states stressed, OK/NE worst (sm_z −2.6/−2.2), belt stress_index −0.73. *Still owed for full P-G2: a `collect:gee-crop-stress` npm wrapper + Claude Desktop Routine (needs the service account — see §1 RESOLVED).*
- **P-G2-VALIDATION** ✅ **DONE 2026-06-15** — `scripts/gee/validate-hrw-vs-nass.py` backtested the belt `stress_index` vs NASS US-TOTAL winter-wheat ratings across all 10 report weeks (Apr 5–Jun 7 2026): **Pearson r = +0.93 vs G/E%, +0.98 vs condition_index** (artifact: `docs/reference/gee/hrw-nass-validation-2026-06-15.json`). **CAVEAT:** single season with a monotonic decline — both series trended down together, which inflates r. Must re-validate across a season with a mid-year condition *reversal* (and ideally multiple years) before graduating to scoring. **Status: still WATCH-ONLY.**
- **P-G3** Phenology-aware `stress_index` + data-quality flags.
- **P-G4** `mapGeeCropStressContext()` bounded_context (±6); surface on /thesis as a "global crop stress" strip (watch-only).
- **P-G5** Validate across multiple seasons incl. a reversal (§7) → graduate to weather domain for belts where it backtests. Add the Russia belt (biggest blind spot) once the collector has a service account.

## 9. Open questions for Kyle
1. Which access do we have — service account (a), personal (b), or Vertex/commercial (c)? Provide the credential path if (a).
2. Commercial-use licensing for GEE confirmed?
3. Priority order of belts — lead with **Russia spring + winter** (biggest blind spot) or **US HRW** (easiest to validate against NASS)? Recommend: build US HRW first to validate the method against ground-truth NASS, then point it at Russia where we're flying blind.
