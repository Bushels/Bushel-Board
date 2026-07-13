#!/usr/bin/env python3
"""GEE crop-stress prototype — US Hard Red Winter (HRW) wheat belt (P-G1).

Proves the Stance Model V2 §16.3 pipeline end-to-end on ONE belt:
  auth -> query Earth Engine -> NDVI + root-zone soil-moisture anomaly over the
  CDL winter-wheat-masked HRW belt (KS/OK/TX/NE/CO) -> z-score vs trailing 5-yr
  same-calendar-window baseline -> stress_index in [-1, +1]
  (negative = stressed = BULLISH supply; positive = healthy = bearish supply).

This is a PROTOTYPE: whole-belt aggregate, watch-only, NOT wired into scoring.
Output: one JSON object to stdout; diagnostics to stderr.

Usage:
  py -3.13 scripts/gee/hrw-stress-prototype.py [--date YYYY-MM-DD] [--project ID]
  py -3.13 scripts/gee/hrw-stress-prototype.py --help

Env:
  GEE_PROJECT   Earth Engine Cloud project id (or pass --project). Required by
                modern ee.Initialize(); a personal non-commercial project is fine.
"""
import argparse
import datetime as dt
import json
import os
import sys

HRW_STATES = ["Kansas", "Oklahoma", "Texas", "Nebraska", "Colorado"]
CDL_WINTER_WHEAT_CLASS = 24  # USDA/NASS CDL "Winter Wheat"
WINDOW_DAYS = 32             # current composite window (≈2 MODIS 16-day frames)
BASELINE_YEARS = 5           # trailing same-calendar-window baseline
NDVI_WEIGHT = 0.6            # vegetation vigor
SM_WEIGHT = 0.4             # root-zone soil moisture
Z_TO_INDEX = 1.5            # z divided by this, then clamped to [-1,1]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def parse_args():
    p = argparse.ArgumentParser(description="US HRW GEE crop-stress prototype")
    p.add_argument("--date", help="Target date YYYY-MM-DD (default: today)")
    p.add_argument("--project", help="Earth Engine Cloud project id (or GEE_PROJECT env)")
    return p.parse_args()


def _explicit_credentials():
    """Build EE OAuth credentials directly from the persisted creds file.

    Workaround: on Python 3.13 + earthengine-api 1.7.x, ee.data.get_persistent_
    credentials() -> oauth.is_valid_credentials() wrongly returns False (the
    refresh token is valid and refreshes fine via google-auth, but the EE
    validity check rejects it), so ee.Initialize() raises "Please authorize"
    even with good creds. Passing credentials explicitly bypasses that loader.
    """
    import json
    from google.oauth2.credentials import Credentials

    path = os.path.join(os.path.expanduser("~"), ".config", "earthengine", "credentials")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    if not d.get("refresh_token"):
        return None
    return Credentials(
        None,
        refresh_token=d["refresh_token"],
        client_id=d.get("client_id"),
        client_secret=d.get("client_secret"),
        token_uri="https://oauth2.googleapis.com/token",
        scopes=[
            "https://www.googleapis.com/auth/earthengine",
            "https://www.googleapis.com/auth/cloud-platform",
        ],
    )


def init_ee(project: str | None):
    import ee
    proj = project or os.environ.get("GEE_PROJECT")
    if not proj:
        log(
            "No project. Pass --project <id> or set GEE_PROJECT. Register a "
            "non-commercial Earth Engine project at https://code.earthengine.google.com."
        )
        raise SystemExit(2)
    # Primary path: standard init (works on environments without the 3.13 loader bug).
    try:
        ee.Initialize(project=proj)
        return ee
    except Exception as exc:  # noqa: BLE001
        log(f"standard ee.Initialize failed ({str(exc)[:80]}); trying explicit credentials...")
    creds = _explicit_credentials()
    if creds is None:
        log("No usable persisted credentials. Run: earthengine authenticate "
            "--scopes=https://www.googleapis.com/auth/earthengine,https://www.googleapis.com/auth/cloud-platform")
        raise SystemExit(2)
    ee.Initialize(credentials=creds, project=proj)
    return ee


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def window_for_year(ee, year: int, end_md: tuple[int, int], days: int):
    """[end_date - days, end_date] for a given year, where end_md is (month, day)."""
    end = ee.Date.fromYMD(year, end_md[0], end_md[1])
    return end.advance(-days, "day"), end


def mean_over_belt(ee, image, geom, scale):
    return image.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=geom,
        scale=scale,
        maxPixels=1e13,
        bestEffort=True,
    )


def main():
    args = parse_args()
    target = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    log(f"[hrw-stress] target date {target.isoformat()}")

    ee = init_ee(args.project)

    # --- AOI: HRW states, masked to CDL winter wheat ---
    states = (
        ee.FeatureCollection("TIGER/2018/States")
        .filter(ee.Filter.inList("NAME", HRW_STATES))
    )
    belt = states.geometry()

    cdl_year = min(target.year - 1, 2024)  # CDL publishes ~Feb for prior year
    cdl = (
        ee.ImageCollection("USDA/NASS/CDL")
        .filter(ee.Filter.calendarRange(cdl_year, cdl_year, "year"))
        .first()
        .select("cropland")
    )
    wheat_mask = cdl.eq(CDL_WINTER_WHEAT_CLASS)

    end_md = (target.month, target.day)

    def ndvi_window(year):
        start, end = window_for_year(ee, year, end_md, WINDOW_DAYS)
        col = (
            ee.ImageCollection("MODIS/061/MOD13Q1")
            .filterDate(start, end)
            .select("NDVI")
        )
        # MODIS NDVI scale factor 0.0001
        return col.mean().multiply(0.0001).updateMask(wheat_mask)

    def sm_window(year):
        start, end = window_for_year(ee, year, end_md, WINDOW_DAYS)
        col = (
            ee.ImageCollection("NASA/SMAP/SPL4SMGP/008")  # /007 deprecated, stopped updating
            .filterDate(start, end)
            .select("sm_rootzone")
        )
        return col.mean().updateMask(wheat_mask)

    NDVI_SCALE = 500
    SM_SCALE = 11000  # SMAP L4 native ~9-11km

    # current
    cur_ndvi_img = ndvi_window(target.year)
    cur_sm_img = sm_window(target.year)

    # baseline images (prior N years), as an ImageCollection -> mean & stdDev
    base_years = list(range(target.year - BASELINE_YEARS, target.year))
    ndvi_base_col = ee.ImageCollection([ndvi_window(y) for y in base_years])
    sm_base_col = ee.ImageCollection([sm_window(y) for y in base_years])

    log(f"[hrw-stress] CDL year {cdl_year}; baseline years {base_years}")
    log("[hrw-stress] reducing over belt (this triggers GEE compute)...")

    def reduce_val(img, scale, band):
        # Degrade gracefully: an empty collection (.mean() -> 0 bands) or any GEE
        # error for one component must not crash the whole run; return None and
        # let the stress_index fall back to the available components.
        try:
            d = mean_over_belt(ee, img, belt, scale).getInfo()
            return d.get(band)
        except Exception as exc:  # noqa: BLE001
            log(f"[hrw-stress] reduce_val({band}) degraded to None: {str(exc)[:120]}")
            return None

    cur_ndvi = reduce_val(cur_ndvi_img, NDVI_SCALE, "NDVI")
    base_ndvi_mean = reduce_val(ndvi_base_col.mean(), NDVI_SCALE, "NDVI")
    base_ndvi_std = reduce_val(ndvi_base_col.reduce(ee.Reducer.stdDev()), NDVI_SCALE, "NDVI_stdDev")

    cur_sm = reduce_val(cur_sm_img, SM_SCALE, "sm_rootzone")
    base_sm_mean = reduce_val(sm_base_col.mean(), SM_SCALE, "sm_rootzone")
    base_sm_std = reduce_val(sm_base_col.reduce(ee.Reducer.stdDev()), SM_SCALE, "sm_rootzone_stdDev")

    def zscore(cur, mean, std):
        if cur is None or mean is None or std in (None, 0):
            return None
        return (cur - mean) / std

    ndvi_z = zscore(cur_ndvi, base_ndvi_mean, base_ndvi_std)
    sm_z = zscore(cur_sm, base_sm_mean, base_sm_std)

    # stress_index: weighted mean of available z-scores, clamped
    parts, weights = [], []
    if ndvi_z is not None:
        parts.append(ndvi_z * NDVI_WEIGHT); weights.append(NDVI_WEIGHT)
    if sm_z is not None:
        parts.append(sm_z * SM_WEIGHT); weights.append(SM_WEIGHT)
    stress_index = None
    if parts:
        combined_z = sum(parts) / sum(weights)
        stress_index = round(clamp(combined_z / Z_TO_INDEX), 3)

    out = {
        "belt": "US_HRW",
        "states": HRW_STATES,
        "grain": "Wheat",
        "as_of": target.isoformat(),
        "cdl_year": cdl_year,
        "baseline_years": base_years,
        "ndvi": {"current": cur_ndvi, "baseline_mean": base_ndvi_mean, "baseline_std": base_ndvi_std, "z": ndvi_z},
        "soil_moisture_rootzone": {"current": cur_sm, "baseline_mean": base_sm_mean, "baseline_std": base_sm_std, "z": sm_z},
        "stress_index": stress_index,
        "reading": (
            "stressed (bullish supply)" if stress_index is not None and stress_index < -0.2
            else "healthy (bearish supply)" if stress_index is not None and stress_index > 0.2
            else "near-normal"
        ),
        "note": "PROTOTYPE - whole-belt CDL-masked aggregate, watch-only, not wired to scoring.",
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
