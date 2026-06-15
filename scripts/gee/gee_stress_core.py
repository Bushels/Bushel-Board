#!/usr/bin/env python3
"""Shared GEE crop-stress core (Stance Model V2 §16.3).

Reused by the collector (import-gee-crop-stress.py) and the NASS validation
backtest (validate-hrw-vs-nass.py). Keeps the proven prototype logic in ONE
place: CDL winter-wheat-masked MODIS NDVI + SMAP root-zone soil moisture,
z-scored vs a trailing same-calendar-window baseline -> stress_index in
[-1, +1] (negative = stressed = bullish supply).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys

# US Hard Red Winter belt, by state (TIGER NAME) + abbrev.
HRW_STATES = [
    ("KS", "Kansas"),
    ("OK", "Oklahoma"),
    ("TX", "Texas"),
    ("NE", "Nebraska"),
    ("CO", "Colorado"),
]
CDL_WINTER_WHEAT_CLASS = 24
WINDOW_DAYS = 32
BASELINE_YEARS = 5
NDVI_WEIGHT = 0.6
SM_WEIGHT = 0.4
Z_TO_INDEX = 1.5
NDVI_SCALE = 500
SM_SCALE = 11000
SOURCE_DATASETS = ["MODIS/061/MOD13Q1", "NASA/SMAP/SPL4SMGP/008", "USDA/NASS/CDL"]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def _explicit_credentials():
    """Build EE creds directly from the persisted file (Python 3.13 loader bug
    workaround: ee.Initialize()'s is_valid_credentials() wrongly rejects a valid
    saved refresh token, so pass credentials explicitly)."""
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
        log("No project. Pass --project <id> or set GEE_PROJECT (e.g. monette-494717).")
        raise SystemExit(2)
    try:
        ee.Initialize(project=proj)
        return ee, proj
    except Exception as exc:  # noqa: BLE001
        log(f"standard ee.Initialize failed ({str(exc)[:60]}); using explicit credentials")
    creds = _explicit_credentials()
    if creds is None:
        log("No usable persisted credentials. Run: earthengine authenticate "
            "--scopes=https://www.googleapis.com/auth/earthengine,https://www.googleapis.com/auth/cloud-platform")
        raise SystemExit(2)
    ee.Initialize(credentials=creds, project=proj)
    return ee, proj


def cdl_wheat_mask(ee, target_year: int):
    cdl_year = min(target_year - 1, 2024)  # CDL publishes ~Feb for prior year
    cdl = (
        ee.ImageCollection("USDA/NASS/CDL")
        .filter(ee.Filter.calendarRange(cdl_year, cdl_year, "year"))
        .first()
        .select("cropland")
    )
    return cdl.eq(CDL_WINTER_WHEAT_CLASS), cdl_year


def _window(ee, year: int, end_md: tuple[int, int], days: int):
    end = ee.Date.fromYMD(year, end_md[0], end_md[1])
    return end.advance(-days, "day"), end


def _ndvi_img(ee, year, end_md, mask):
    start, end = _window(ee, year, end_md, WINDOW_DAYS)
    col = ee.ImageCollection("MODIS/061/MOD13Q1").filterDate(start, end).select("NDVI")
    return col.mean().multiply(0.0001).updateMask(mask).rename("v")


def _sm_img(ee, year, end_md, mask):
    start, end = _window(ee, year, end_md, WINDOW_DAYS)
    col = ee.ImageCollection("NASA/SMAP/SPL4SMGP/008").filterDate(start, end).select("sm_rootzone")
    return col.mean().updateMask(mask).rename("v")


def _reduce3(ee, cur_img, base_col, geom, scale):
    """One reduceRegion returning current, baseline mean, baseline std. Degrades
    to (None, None, None) on empty collections / errors."""
    try:
        base_mean = base_col.mean().rename("v")
        base_std = base_col.reduce(ee.Reducer.stdDev()).rename("v")
        stacked = (
            cur_img.rename("cur")
            .addBands(base_mean.rename("bmean"))
            .addBands(base_std.rename("bstd"))
        )
        d = stacked.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=geom, scale=scale, maxPixels=1e13, bestEffort=True
        ).getInfo()
        return d.get("cur"), d.get("bmean"), d.get("bstd")
    except Exception as exc:  # noqa: BLE001
        log(f"reduce3 degraded to None: {str(exc)[:110]}")
        return None, None, None


def _z(cur, mean, std):
    if cur is None or mean is None or std in (None, 0):
        return None
    return (cur - mean) / std


def compute_region_stress(ee, geom, mask, target: dt.date, cdl_year: int) -> dict:
    """stress dict for one region geometry at one target date."""
    end_md = (target.month, target.day)
    base_years = list(range(target.year - BASELINE_YEARS, target.year))

    ndvi_cur = _ndvi_img(ee, target.year, end_md, mask)
    ndvi_base = ee.ImageCollection([_ndvi_img(ee, y, end_md, mask) for y in base_years])
    sm_cur = _sm_img(ee, target.year, end_md, mask)
    sm_base = ee.ImageCollection([_sm_img(ee, y, end_md, mask) for y in base_years])

    nv_cur, nv_bm, nv_bs = _reduce3(ee, ndvi_cur, ndvi_base, geom, NDVI_SCALE)
    sm_c, sm_bm, sm_bs = _reduce3(ee, sm_cur, sm_base, geom, SM_SCALE)

    ndvi_z = _z(nv_cur, nv_bm, nv_bs)
    sm_z = _z(sm_c, sm_bm, sm_bs)

    parts, weights = [], []
    if ndvi_z is not None:
        parts.append(ndvi_z * NDVI_WEIGHT); weights.append(NDVI_WEIGHT)
    if sm_z is not None:
        parts.append(sm_z * SM_WEIGHT); weights.append(SM_WEIGHT)
    stress_index = round(clamp(sum(parts) / sum(weights) / Z_TO_INDEX), 3) if parts else None

    reading = (
        "stressed (bullish supply)" if stress_index is not None and stress_index < -0.2
        else "healthy (bearish supply)" if stress_index is not None and stress_index > 0.2
        else "near-normal" if stress_index is not None else "no-data"
    )
    return {
        "week_ending": target.isoformat(),
        "cdl_year": cdl_year,
        "baseline_years": base_years,
        "ndvi_current": nv_cur, "ndvi_baseline_mean": nv_bm, "ndvi_baseline_std": nv_bs, "ndvi_z": ndvi_z,
        "sm_current": sm_c, "sm_baseline_mean": sm_bm, "sm_baseline_std": sm_bs, "sm_z": sm_z,
        "stress_index": stress_index,
        "reading": reading,
    }


def hrw_state_geometries(ee):
    """dict {abbrev: (name, geometry)} for the HRW states + the belt union."""
    names = [n for _, n in HRW_STATES]
    fc = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.inList("NAME", names))
    out = {}
    for abbr, name in HRW_STATES:
        out[abbr] = (name, fc.filter(ee.Filter.eq("NAME", name)).geometry())
    out["BELT"] = ("US HRW belt", fc.geometry())
    return out


# --- Multi-belt support (P-G2 Russia extension) ----------------------------
# US belts use the USDA CDL winter-wheat mask. Non-US belts have no CDL, so they
# mask to ESA WorldCover cropland (class 40) and define the AOI as the country
# boundary (stable GAUL name) intersected with a winter/spring bounding box.

# Approximate bounding boxes [west, south, east, north] for the Russian wheat belts.
RU_WINTER_BBOX = [35.0, 43.0, 48.0, 53.0]   # S European Russia: Kuban / Black Earth
RU_SPRING_BBOX = [45.0, 50.0, 87.0, 57.0]   # Volga / Urals / West Siberia

BELTS = {
    "US_HRW": {"lane": "us", "country": None, "bbox": None, "mask": "cdl_winter_wheat"},
    "RU_WINTER": {"lane": "international", "country": "Russian Federation",
                  "bbox": RU_WINTER_BBOX, "mask": "worldcover_cropland",
                  "name": "Russia winter-wheat belt (south)"},
    "RU_SPRING": {"lane": "international", "country": "Russian Federation",
                  "bbox": RU_SPRING_BBOX, "mask": "worldcover_cropland",
                  "name": "Russia spring-wheat belt (Volga/Urals/Siberia)"},
}


def worldcover_cropland_mask(ee):
    """ESA WorldCover v200 cropland (class 40) — global static cropland mask."""
    wc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    return wc.eq(40)


def mask_for_belt(ee, belt: str, target_year: int):
    """Return (mask, mask_year_or_None, mask_desc, source_datasets, lane)."""
    cfg = BELTS[belt]
    if cfg["mask"] == "cdl_winter_wheat":
        mask, cdl_year = cdl_wheat_mask(ee, target_year)
        return mask, cdl_year, "CDL winter wheat (class 24)", list(SOURCE_DATASETS), cfg["lane"]
    mask = worldcover_cropland_mask(ee)
    return (mask, None, "ESA WorldCover cropland (class 40)",
            ["MODIS/061/MOD13Q1", "NASA/SMAP/SPL4SMGP/008", "ESA/WorldCover/v200"], cfg["lane"])


def belt_geometries(ee, belt: str):
    """dict {code: (name, geometry)} for any belt. US_HRW = states + union;
    Russia belts = single BELT = country-boundary ∩ bbox (cropland-masked at reduce)."""
    if belt == "US_HRW":
        return hrw_state_geometries(ee)
    cfg = BELTS[belt]
    country = (
        ee.FeatureCollection("FAO/GAUL/2015/level0")
        .filter(ee.Filter.eq("ADM0_NAME", cfg["country"]))
        .geometry()
    )
    bbox = ee.Geometry.Rectangle(cfg["bbox"], proj="EPSG:4326", geodesic=False)
    return {"BELT": (cfg["name"], country.intersection(bbox, maxError=1000))}
