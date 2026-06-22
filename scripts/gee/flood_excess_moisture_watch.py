#!/usr/bin/env python3
"""Build a GEE-derived flood / excess-moisture watch acreage artifact.

This is a watch-only screening layer. It estimates cropland acres at risk from:
- observed new surface water from Sentinel-1 SAR,
- recent rainfall from GPM IMERG,
- wetness/saturation context from SMAP L4,
- low-lying susceptibility from MERIT Hydro HAND,
- forecast rainfall from NOAA GFS.

It does not claim confirmed crop damage.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import ee

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from source_run import write_source_run  # noqa: E402

ACRES_PER_M2 = 4046.8564224
DEFAULT_PROJECT = "monette-494717"
AAFC_WEEKLY_ANOMALY_SERVICE = (
    "https://agriculture.canada.ca/imagery-images/rest/services/"
    "percent_saturated_surface_soil_moisture/weekly_anomaly/ImageServer"
)
CROP_CASMA_HYBRID_WEEKLY_DOCS = (
    "https://nassgeo.csiss.gmu.edu/Crop-CASMA-Developer/wms/SMAP-HYB-1KM-ANOMALY/"
)
CROP_CASMA_MAP_TEMPLATE = "/WMS/SMAP-HYB-1KM-ANOMALY-WEEKLY_{year}.map"

DATASETS = {
    "sentinel1": "COPERNICUS/S1_GRD",
    "imerg": "NASA/GPM_L3/IMERG_V07",
    "smap_l4": "NASA/SMAP/SPL4SMGP/008",
    "gfs": "NOAA/GFS0P25",
    "aafc_aci": "AAFC/ACI",
    "usda_cdl": "USDA/NASS/CDL",
    "jrc_surface_water": "JRC/GSW1_4/GlobalSurfaceWater",
    "merit_hydro": "MERIT/Hydro/v1_0_1",
}

CANADA_AOI = [-125.0, 48.0, -88.0, 60.0]
US_AOI = [-125.0, 24.0, -66.0, 50.0]

# AAFC ACI classes: broad cropland plus named field-crop classes. This keeps
# the layer as crop/ag acres, not forest/wetland/open-water acreage.
AAFC_CROP_CLASSES = [
    121,
    122,
    131,
    132,
    133,
    134,
    135,
    136,
    137,
    138,
    139,
    140,
    141,
    142,
    143,
    145,
    146,
    147,
    148,
    149,
    150,
    151,
    152,
    153,
    154,
    155,
    156,
    157,
    158,
    159,
    160,
    161,
    162,
    163,
    167,
    168,
    174,
    175,
    176,
    177,
    178,
    179,
    180,
    181,
    182,
    183,
    185,
    188,
    189,
    190,
    191,
    192,
    193,
    194,
    195,
    196,
    197,
    198,
    199,
]

# USDA CDL crop/fallow classes. Excludes water, developed, forest, shrubland,
# barren, wetlands, pasture/grass, and undefined classes.
CDL_CROP_CLASSES = list(range(1, 62)) + list(range(204, 255))


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def parse_date(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def iso(d: dt.date) -> str:
    return d.isoformat()


def load_env_local() -> None:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def env_value(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def ee_date_millis_to_iso(millis: Any) -> str | None:
    if millis is None:
        return None
    try:
        return (
            dt.datetime.fromtimestamp(int(millis) / 1000, tz=dt.timezone.utc)
            .replace(microsecond=0)
            .isoformat()
        )
    except Exception:
        return None


def unix_millis_to_iso(millis: Any) -> str | None:
    return ee_date_millis_to_iso(millis)


def fetch_json(url: str) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            payload = json.load(response)
            return payload if isinstance(payload, dict) else None
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
        log(f"Warning: failed to fetch external layer metadata from {url}: {exc}")
        return None


def image_collection_latest_iso(collection_id: str, start: str | None = None, end: str | None = None) -> str | None:
    col = ee.ImageCollection(collection_id)
    if start and end:
        col = col.filterDate(start, end)
    millis = col.aggregate_max("system:time_start").getInfo()
    return ee_date_millis_to_iso(millis)


def latest_landcover_image(collection_id: str) -> ee.Image:
    col = ee.ImageCollection(collection_id)
    millis = col.aggregate_max("system:time_start")
    return ee.Image(col.filter(ee.Filter.eq("system:time_start", millis)).first())


def in_list_mask(image: ee.Image, values: list[int]) -> ee.Image:
    masks = [image.eq(v) for v in values]
    result = ee.Image(0)
    for m in masks:
        result = result.Or(m)
    return result


def cropland_mask(aoi: ee.Geometry) -> ee.Image:
    aafc = latest_landcover_image(DATASETS["aafc_aci"]).select("landcover")
    cdl = latest_landcover_image(DATASETS["usda_cdl"]).select("cropland")

    canada = in_list_mask(aafc, AAFC_CROP_CLASSES)
    us = in_list_mask(cdl, CDL_CROP_CLASSES)

    return canada.Or(us).rename("cropland").selfMask().clip(aoi)


def permanent_water_mask(aoi: ee.Geometry) -> ee.Image:
    jrc = ee.Image(DATASETS["jrc_surface_water"])
    merit = ee.Image(DATASETS["merit_hydro"])
    permanent = jrc.select("occurrence").gte(50).Or(jrc.select("seasonality").gte(10)).Or(merit.select("wat").gt(0))
    return permanent.rename("permanent_water").clip(aoi)


def lowland_mask(aoi: ee.Geometry, hand_m: float) -> ee.Image:
    hnd = ee.Image(DATASETS["merit_hydro"]).select("hnd")
    return hnd.gte(0).And(hnd.lte(hand_m)).rename("lowland").clip(aoi)


def imerg_rain_mm(start: str, end: str, aoi: ee.Geometry) -> ee.Image:
    # IMERG V07 precipitation is half-hourly precipitation rate in mm/hr.
    col = ee.ImageCollection(DATASETS["imerg"]).filterDate(start, end).select("precipitation")
    return col.sum().multiply(0.5).rename("recent_rain_mm").clip(aoi)


def smap_wetness(aoi: ee.Geometry, start: str, end: str) -> tuple[ee.Image, ee.Image]:
    col = ee.ImageCollection(DATASETS["smap_l4"]).filterDate(start, end)
    wet = col.select("sm_surface_wetness").mean().rename("smap_surface_wetness").clip(aoi)
    saturated = col.select("land_fraction_saturated").mean().rename("smap_land_fraction_saturated").clip(aoi)
    return wet, saturated


def sentinel_new_water(
    aoi: ee.Geometry,
    event_start: dt.date,
    event_end: dt.date,
    threshold_db: float,
    drop_db: float,
) -> tuple[ee.Image, ee.Image]:
    after_start = iso(event_start)
    after_end = iso(event_end + dt.timedelta(days=1))
    before_start = iso(event_start - dt.timedelta(days=35))
    before_end = iso(event_start - dt.timedelta(days=5))

    base = (
        ee.ImageCollection(DATASETS["sentinel1"])
        .filterBounds(aoi)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .select("VV")
    )
    before_col = base.filterDate(before_start, before_end)
    after_col = base.filterDate(after_start, after_end)

    before = before_col.median()
    before_count = before_col.count()
    after = after_col.median()
    after_count = after_col.count().rename("sentinel1_after_count").clip(aoi)

    # Water-like backscatter after the event, with higher confidence when a
    # pre-event baseline shows a fresh drop. Very dark post-event pixels are
    # accepted even when the baseline is sparse; permanent water is removed
    # later, and the public layer stays labelled watch-only.
    water_like = after.lt(threshold_db)
    baseline_drop = before_count.gt(0).And(before.subtract(after).gte(drop_db))
    very_dark = after.lt(threshold_db - 3)
    new_water = water_like.And(after_count.gt(0)).And(baseline_drop.Or(very_dark).Or(before_count.eq(0)))
    return new_water.rename("observed_new_surface_water").clip(aoi), after_count


def gfs_precip_accum(aoi: ee.Geometry, horizon_hours: int) -> tuple[ee.Image, dict[str, Any]]:
    col = ee.ImageCollection(DATASETS["gfs"])
    latest_creation = col.aggregate_max("creation_time")
    run = col.filter(ee.Filter.eq("creation_time", latest_creation)).filter(
        ee.Filter.gt("forecast_hours", 0)
    ).filter(ee.Filter.lte("forecast_hours", horizon_hours))

    def to_depth(img: ee.Image) -> ee.Image:
        fh = ee.Number(img.get("forecast_hours"))
        step_hours = ee.Number(ee.Algorithms.If(fh.lte(120), 1, 3))
        # precipitation_rate is kg m-2 s-1, numerically mm/s for liquid water.
        return img.select("precipitation_rate").multiply(step_hours.multiply(3600)).rename("forecast_mm")

    depth = run.map(to_depth).sum().rename(f"gfs_{horizon_hours}h_precip_mm").clip(aoi)
    info = {
        "latest_creation_time": ee_date_millis_to_iso(latest_creation.getInfo()),
        "horizon_hours": horizon_hours,
        "image_count": run.size().getInfo(),
    }
    return depth, info


def build_aoi() -> ee.Geometry:
    canada = ee.Geometry.Rectangle(CANADA_AOI, proj="EPSG:4326", geodesic=False)
    us = ee.Geometry.Rectangle(US_AOI, proj="EPSG:4326", geodesic=False)
    return canada.union(us, maxError=1000)


def build_grid(grid_degrees: float) -> ee.FeatureCollection:
    min_lon = min(CANADA_AOI[0], US_AOI[0])
    max_lon = max(CANADA_AOI[2], US_AOI[2])
    min_lat = min(CANADA_AOI[1], US_AOI[1])
    max_lat = max(CANADA_AOI[3], US_AOI[3])
    features = []
    lon_steps = int(math.ceil((max_lon - min_lon) / grid_degrees))
    lat_steps = int(math.ceil((max_lat - min_lat) / grid_degrees))
    for i in range(lon_steps):
        west = min_lon + i * grid_degrees
        east = min(west + grid_degrees, max_lon)
        for j in range(lat_steps):
            south = min_lat + j * grid_degrees
            north = min(south + grid_degrees, max_lat)
            # Keep the broad Western Canada + US envelope, not ocean precision.
            intersects_canada = not (
                east <= CANADA_AOI[0]
                or west >= CANADA_AOI[2]
                or north <= CANADA_AOI[1]
                or south >= CANADA_AOI[3]
            )
            intersects_us = not (
                east <= US_AOI[0]
                or west >= US_AOI[2]
                or north <= US_AOI[1]
                or south >= US_AOI[3]
            )
            if not (intersects_canada or intersects_us):
                continue
            grid_id = f"grid_{west:.2f}_{south:.2f}".replace("-", "m").replace(".", "p")
            features.append(
                ee.Feature(
                    ee.Geometry.Rectangle([west, south, east, north], proj="EPSG:4326", geodesic=False),
                    {
                        "grid_id": grid_id,
                        "west": west,
                        "south": south,
                        "east": east,
                        "north": north,
                        "center_lon": (west + east) / 2,
                        "center_lat": (south + north) / 2,
                    },
                )
            )
    return ee.FeatureCollection(features)


def iso_week_layer(date_value: dt.date) -> tuple[dt.date, dt.date, int, int]:
    iso_year, iso_week, _ = date_value.isocalendar()
    week_start = date_value - dt.timedelta(days=date_value.weekday())
    week_end = week_start + dt.timedelta(days=6)
    return week_start, week_end, iso_year, iso_week


def aafc_weekly_latest_iso() -> str | None:
    metadata = fetch_json(f"{AAFC_WEEKLY_ANOMALY_SERVICE}?f=json")
    extent = (((metadata or {}).get("timeInfo") or {}).get("timeExtent") or [])
    if len(extent) < 2:
        return None
    return unix_millis_to_iso(extent[1])


def official_moisture_layers(event_end: dt.date) -> list[dict[str, Any]]:
    week_start, week_end, iso_year, iso_week = iso_week_layer(event_end)
    crop_casma_layer = (
        f"SMAP-HYB-1KM-ANOMALY-WEEKLY_{iso_year}_{iso_week:02d}_"
        f"{week_start:%Y.%m.%d}_{week_end:%Y.%m.%d}"
    )

    return [
        {
            "id": "aafc_smos_weekly_anomaly",
            "label": "AAFC weekly surface soil moisture anomaly",
            "provider": "Agriculture and Agri-Food Canada",
            "coverage": "Canada",
            "service": "ArcGIS ImageServer",
            "service_url": AAFC_WEEKLY_ANOMALY_SERVICE,
            "latest_at": aafc_weekly_latest_iso(),
            "resolution": "0.25 degrees",
            "description": "SMOS-derived percent-saturated surface soil moisture anomaly for the top 5 cm.",
            "source_url": "https://agriculture.canada.ca/en/agricultural-production/weather/satellite-soil-moisture",
        },
        {
            "id": "crop_casma_smap_hybrid_1km_weekly_anomaly",
            "label": "Crop-CASMA weekly SMAP hybrid soil moisture anomaly",
            "provider": "USDA NASS, NASA, and George Mason University",
            "coverage": "Contiguous United States",
            "service": "WMS",
            "map": CROP_CASMA_MAP_TEMPLATE.format(year=iso_year),
            "layer_name": crop_casma_layer,
            "latest_at": f"{week_end.isoformat()}T23:59:59+00:00",
            "resolution": "1 km hybrid weekly anomaly",
            "description": "Crop-CASMA SMAP hybrid weekly anomaly layer used as official U.S. visual context.",
            "source_url": CROP_CASMA_HYBRID_WEEKLY_DOCS,
        },
    ]


def acreage_bands(
    cropland: ee.Image,
    permanent: ee.Image,
    lowland: ee.Image,
    recent_rain: ee.Image,
    smap_wet: ee.Image,
    smap_saturated: ee.Image,
    observed_water: ee.Image,
    gfs_72h: ee.Image,
    gfs_168h: ee.Image,
) -> ee.Image:
    crop_candidate = cropland.And(permanent.Not())
    wet_context = smap_wet.gte(0.80).Or(smap_saturated.gte(0.20))
    very_wet_context = smap_wet.gte(0.88).Or(smap_saturated.gte(0.30))

    observed = crop_candidate.And(observed_water)
    forecast3 = crop_candidate.And(gfs_72h.gte(50)).And(wet_context.Or(lowland).Or(recent_rain.gte(30)))
    forecast7 = crop_candidate.And(gfs_168h.gte(75)).And(wet_context.Or(lowland).Or(recent_rain.gte(30)))
    forecast = forecast3.Or(forecast7).And(observed.Not())
    excess = (
        crop_candidate.And(observed.Not())
        .And(forecast.Not())
        .And(recent_rain.gte(50).And(wet_context.Or(lowland)).Or(very_wet_context))
    )
    watch = (
        crop_candidate.And(observed.Not())
        .And(forecast.Not())
        .And(excess.Not())
        .And(recent_rain.gte(25).Or(smap_wet.gte(0.70)).Or(lowland.And(gfs_168h.gte(25))))
    )

    acres = ee.Image.pixelArea().divide(ACRES_PER_M2)
    return ee.Image.cat(
        [
            acres.updateMask(observed).rename("observed_inundation_acres"),
            acres.updateMask(excess).rename("excess_moisture_acres"),
            acres.updateMask(forecast).rename("forecast_at_risk_acres"),
            acres.updateMask(watch).rename("watch_acres"),
            acres.updateMask(forecast3.And(observed.Not())).rename("forecast_3day_at_risk_acres"),
            acres.updateMask(forecast7.And(observed.Not())).rename("forecast_7day_at_risk_acres"),
        ]
    )


def feature_number(feature: dict[str, Any], key: str) -> float:
    value = feature.get("properties", {}).get(key)
    try:
        if value is None:
            return 0.0
        return float(value)
    except Exception:
        return 0.0


def summarize_rows(features: list[dict[str, Any]], min_acres: float) -> tuple[list[dict[str, Any]], dict[str, float]]:
    fields = [
        "observed_inundation_acres",
        "excess_moisture_acres",
        "forecast_at_risk_acres",
        "watch_acres",
        "forecast_3day_at_risk_acres",
        "forecast_7day_at_risk_acres",
    ]
    rows: list[dict[str, Any]] = []
    totals = {field: 0.0 for field in fields}
    for feature in features:
        props = feature.get("properties", {})
        row = {
            "grid_id": props.get("grid_id"),
            "west": props.get("west"),
            "south": props.get("south"),
            "east": props.get("east"),
            "north": props.get("north"),
            "center_lon": props.get("center_lon"),
            "center_lat": props.get("center_lat"),
        }
        total = 0.0
        for field in fields:
            acres = round(feature_number(feature, field), 1)
            row[field] = acres
            totals[field] += acres
            total += acres
        row["total_watch_layer_acres"] = round(total, 1)
        if total >= min_acres:
            rows.append(row)

    rows.sort(key=lambda r: r["total_watch_layer_acres"], reverse=True)
    return rows, {k: round(v, 1) for k, v in totals.items()}


def build_artifact(args: argparse.Namespace) -> dict[str, Any]:
    event_start = parse_date(args.event_start)
    event_end = parse_date(args.event_end)
    if event_end <= event_start:
        raise ValueError("--event-end must be after --event-start")

    aoi = build_aoi()
    grid = build_grid(args.grid_degrees)

    log("Building cropland/permanent-water/terrain masks")
    crop = cropland_mask(aoi)
    permanent = permanent_water_mask(aoi)
    lowland = lowland_mask(aoi, args.hand_threshold_m)

    log("Building rainfall and SMAP wetness layers")
    recent_rain = imerg_rain_mm(iso(event_start), iso(event_end + dt.timedelta(days=1)), aoi)
    smap_start = iso(event_end - dt.timedelta(days=5))
    smap_end = iso(event_end + dt.timedelta(days=1))
    smap_wet, smap_saturated = smap_wetness(aoi, smap_start, smap_end)

    log("Building Sentinel-1 observed-new-water layer")
    observed_water, s1_count = sentinel_new_water(
        aoi,
        event_start,
        event_end,
        args.sentinel_water_threshold_db,
        args.sentinel_drop_db,
    )

    log("Building GFS forecast rainfall layers")
    gfs_72h, gfs_72_info = gfs_precip_accum(aoi, 72)
    gfs_168h, gfs_168_info = gfs_precip_accum(aoi, 168)

    log("Reducing acreage by neutral grid")
    bands = acreage_bands(crop, permanent, lowland, recent_rain, smap_wet, smap_saturated, observed_water, gfs_72h, gfs_168h)
    reduced = bands.reduceRegions(
        collection=grid,
        reducer=ee.Reducer.sum(),
        scale=args.scale,
        tileScale=args.tile_scale,
    )
    features = reduced.getInfo().get("features", [])
    rows, totals = summarize_rows(features, args.min_grid_acres)

    source_freshness = {
        "sentinel1_latest_in_event_window": image_collection_latest_iso(
            DATASETS["sentinel1"], iso(event_start), iso(event_end + dt.timedelta(days=1))
        ),
        "imerg_latest_in_event_window": image_collection_latest_iso(
            DATASETS["imerg"], iso(event_start), iso(event_end + dt.timedelta(days=1))
        ),
        "smap_l4_latest_in_context_window": image_collection_latest_iso(DATASETS["smap_l4"], smap_start, smap_end),
        "gfs_72h": gfs_72_info,
        "gfs_168h": gfs_168_info,
        "aafc_aci_latest": image_collection_latest_iso(DATASETS["aafc_aci"]),
        "usda_cdl_latest": image_collection_latest_iso(DATASETS["usda_cdl"]),
        "jrc_surface_water": "static JRC/GSW1_4 occurrence/seasonality",
        "merit_hydro": "static MERIT/Hydro v1_0_1 HAND/water",
    }
    official_layers = official_moisture_layers(event_end)

    return {
        "ok": True,
        "watch_only": True,
        "claim_boundary": "Acres are at risk/watch acres from satellite, rainfall, forecast, and terrain screening; they are not confirmed damaged acres or crop-loss proof.",
        "event": {
            "start": iso(event_start),
            "end": iso(event_end),
            "label": args.event_label,
            "aoi": "Western Canada plus contiguous US cropland envelope",
        },
        "method": {
            "grid_degrees": args.grid_degrees,
            "scale_m": args.scale,
            "hand_threshold_m": args.hand_threshold_m,
            "sentinel_water_threshold_db": args.sentinel_water_threshold_db,
            "sentinel_drop_db": args.sentinel_drop_db,
            "priority_order": ["observed_inundation", "forecast_at_risk", "excess_moisture", "watch"],
            "observed_layer": "Sentinel-1 new surface water on cropland, permanent water removed.",
            "forecast_layer": "GFS 3-day/7-day precipitation risk on cropland with wetness, recent-rain, or lowland susceptibility context.",
        },
        "datasets": DATASETS,
        "official_moisture_layers": official_layers,
        "source_freshness": source_freshness,
        "acre_totals": totals,
        "rows_returned": len(rows),
        "rows": rows,
    }


def write_artifact(path: Path, artifact: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def maybe_write_source_run(args: argparse.Namespace, artifact: dict[str, Any]) -> dict[str, Any] | None:
    if not args.write_source_run:
        return None
    load_env_local()
    supabase_url = env_value("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    service_key = env_value("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    event = artifact["event"]
    return write_source_run(
        supabase_url,
        service_key,
        source_name="gee_flood_excess_moisture_watch",
        source_lane="cross_border",
        collector_name="gee-flood-excess-moisture-watch-v0",
        status="success",
        source_period_start=event["start"],
        source_period_end=event["end"],
        latest_source_label=event["label"],
        rows_inserted=0,
        rows_updated=artifact["rows_returned"],
        rows_skipped=0,
        source_url="https://code.earthengine.google.com/",
        metadata={
            "watch_only": True,
            "claim_boundary": artifact["claim_boundary"],
            "datasets": artifact["datasets"],
            "source_freshness": artifact["source_freshness"],
            "official_moisture_layers": artifact.get("official_moisture_layers", []),
            "acre_totals": artifact["acre_totals"],
            "rows_returned": artifact["rows_returned"],
            "artifact_path": str(args.out) if args.out else None,
            "note": "Acreage artifact is local unless separately loaded into a public table.",
        },
    )


def main() -> int:
    today = dt.date.today()
    default_end = today - dt.timedelta(days=1)
    default_start = default_end - dt.timedelta(days=7)

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.environ.get("GOOGLE_CLOUD_PROJECT", DEFAULT_PROJECT))
    parser.add_argument("--event-start", default=iso(default_start), help="Inclusive event-window start date, YYYY-MM-DD")
    parser.add_argument("--event-end", default=iso(default_end), help="Inclusive event-window end date, YYYY-MM-DD")
    parser.add_argument("--event-label", default="recent 7-day rain/flood watch")
    parser.add_argument("--grid-degrees", type=float, default=2.5, help="Neutral lon/lat grid cell size for v0 aggregation")
    parser.add_argument("--scale", type=int, default=1000, help="GEE reduction scale in metres")
    parser.add_argument("--tile-scale", type=float, default=4)
    parser.add_argument("--min-grid-acres", type=float, default=1000, help="Drop grid cells below this total watch acreage")
    parser.add_argument("--hand-threshold-m", type=float, default=5.0)
    parser.add_argument("--sentinel-water-threshold-db", type=float, default=-17.0)
    parser.add_argument("--sentinel-drop-db", type=float, default=2.0)
    parser.add_argument("--out", type=Path, default=Path("output/flood-watch/latest/flood-watch-v0.json"))
    parser.add_argument("--write-source-run", action="store_true", help="Write freshness summary to Supabase source_runs")
    args = parser.parse_args()

    started = dt.datetime.now(dt.timezone.utc)
    try:
        ee.Initialize(project=args.project)
        artifact = build_artifact(args)
        artifact["computed_at"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
        artifact["runtime_seconds"] = round((dt.datetime.now(dt.timezone.utc) - started).total_seconds(), 2)
        if args.out:
            write_artifact(args.out, artifact)
            artifact["artifact_path"] = str(args.out)
        source_run = maybe_write_source_run(args, artifact)
        if source_run:
            artifact["source_run_id"] = source_run.get("id")
        print(json.dumps(artifact, sort_keys=True), flush=True)
        return 0
    except Exception as exc:
        error = {
            "ok": False,
            "error": str(exc),
            "computed_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        }
        print(json.dumps(error, sort_keys=True), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
