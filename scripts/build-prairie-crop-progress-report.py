#!/usr/bin/env python3
"""Build a source-backed Prairie crop-progress report package.

This is a no-write-to-database weekly evaluator. It loops over Manitoba,
Saskatchewan, and Alberta official crop reports, reuses the existing Canada
crop-progress parser, adds narrative risk extraction, and writes:
  - report.md
  - summary.json
  - infographic-seeding-crop-progress.svg
  - infographic-risk-watch.svg
  - infographic-major-crops-prairies.svg
  - infographic-quality-saskatchewan.svg
  - infographic-quality-alberta.svg
  - index.html

Usage:
  python scripts/build-prairie-crop-progress-report.py
  python scripts/build-prairie-crop-progress-report.py --out-dir output/prairie-crop-progress/latest
  python scripts/build-prairie-crop-progress-report.py --json
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import importlib.util
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = REPO_ROOT / "scripts"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "output" / "prairie-crop-progress"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


canada = load_module("canada_crop_progress", SCRIPTS_DIR / "import-canada-crop-progress.py")
statcan = load_module("statcan_wds", SCRIPTS_DIR / "import-statcan-wds.py")


MAJOR_GRAIN_ITEMS = {
    "Wheat, all",
    "Canola",
    "Barley",
    "Oats",
    "Corn for grain",
    "Soybeans",
}

CROP_LANE_DEFS = [
    {
        "key": "spring_wheat",
        "label": "Spring Wheat",
        "acre_items": ["Wheat, spring"],
        "color": "#7c8d35",
    },
    {
        "key": "canola",
        "label": "Canola",
        "acre_items": ["Canola"],
        "color": "#b26b2f",
    },
    {
        "key": "barley",
        "label": "Barley",
        "acre_items": ["Barley"],
        "color": "#2f6f8f",
    },
    {
        "key": "pulses_other",
        "label": "Pulses / Other",
        "acre_items": [],
        "color": "#8f4f78",
    },
]

AB_QUALITY_CROPS = [
    "Major Crops",
    "Spring Wheat",
    "Barley",
    "Canola",
    "Oats",
    "Dry Peas",
]

SK_DEVELOPMENT_WATCH = [
    "Oilseeds",
    "Spring Cereals",
    "Annual Forage",
    "Pulse Crops",
]

SK_SEEDED_WATCH_CROPS = [
    "triticale",
    "canary seed",
    "chickpeas",
    "mustard",
    "oats",
    "flax",
]

QUALITY_BUCKETS = ["excellent", "good", "fair", "poor", "very poor"]
QUALITY_COLORS = {
    "excellent": "#2f6f8f",
    "good": "#7c8d35",
    "fair": "#d6b23f",
    "poor": "#d68b2b",
    "very poor": "#c84630",
}
SK_CONDITION_REGIONS = ["South East", "South West", "East Central", "West Central", "North East", "North West"]


def log(message: str) -> None:
    print(message, file=sys.stderr)


def fmt_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    if abs(value - round(value)) < 0.05:
        return f"{value:.0f}%"
    return f"{value:.1f}%"


def fmt_acres(value: float | None) -> str:
    if value is None:
        return "n/a"
    if value >= 1_000_000:
        return f"{value / 1_000_000:.2f}M acres"
    return f"{value / 1_000:.0f}k acres"


def fmt_mm(value: float | None) -> str:
    if value is None:
        return "n/a"
    if abs(value - round(value)) < 0.05:
        return f"{value:.0f} mm"
    return f"{value:.1f} mm"


def round_acres(value: float | None) -> int | None:
    if value is None:
        return None
    return int(round(value / 1000.0) * 1000)


def row_value(
    rows: list[dict[str, Any]],
    *,
    province: str,
    metric: str,
    crop_name: str | None = None,
    region_code: str = "PROV",
) -> float | None:
    for row in rows:
        if row.get("province_code") != province:
            continue
        if row.get("metric") != metric:
            continue
        if row.get("region_code") != region_code:
            continue
        if crop_name is not None and row.get("crop_name") != crop_name:
            continue
        value = row.get("value_pct")
        return float(value) if value is not None else None
    return None


def row_obj(
    rows: list[dict[str, Any]],
    *,
    province: str,
    metric: str,
    crop_name: str | None = None,
    region_code: str = "PROV",
) -> dict[str, Any] | None:
    for row in rows:
        if row.get("province_code") != province:
            continue
        if row.get("metric") != metric:
            continue
        if row.get("region_code") != region_code:
            continue
        if crop_name is not None and row.get("crop_name") != crop_name:
            continue
        return row
    return None


def all_values_from_line(line: str) -> list[float]:
    return [float(value) for value in re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*%", line)]


def latest_alberta_resource_text(current_report_date: str) -> tuple[float | None, str | None, str | None]:
    """Find the newest prior Alberta report that still states seeding progress."""
    data = canada.fetch_json(canada.ALBERTA_DATASET_API_URL)
    resources = data.get("result", {}).get("resources", [])
    candidates: list[dict[str, Any]] = []
    for resource in resources:
        if not isinstance(resource, dict):
            continue
        name = str(resource.get("name") or "")
        url = str(resource.get("url") or "")
        if str(resource.get("format") or "").upper() != "PDF":
            continue
        if "crop reporting calendar" in name.lower() or "crop" not in name.lower():
            continue
        report_date = canada.parse_report_date(name) or date_from_alberta_filename(url)
        if not report_date or report_date >= current_report_date:
            continue
        candidates.append({"date": report_date, "url": url, "name": name})

    for item in sorted(candidates, key=lambda candidate: candidate["date"], reverse=True):
        text, final_url = canada.pdf_to_text(item["url"], layout=True)
        match = re.search(
            r"Provincial\s+seeding\s+progress\s+of\s+major\s+crops\s+(?:has\s+)?reached\s+([0-9]+(?:\.[0-9]+)?)\s+per\s+cent",
            text,
            flags=re.IGNORECASE,
        )
        if match:
            return float(match.group(1)), item["date"], final_url
    return None, None, None


def date_from_alberta_filename(url: str) -> str | None:
    match = re.search(r"crop-report-([0-9]{4})-([0-9]{2})-([0-9]{2})", url)
    if not match:
        return None
    year, month, day = match.groups()
    return f"{year}-{month}-{day}"


def major_grain_acres_by_province() -> tuple[dict[str, float], list[dict[str, Any]]]:
    rows = statcan.fetch_field_crops(3)
    latest_rows = [
        row
        for row in rows
        if row.get("product_id") == 32100359
        and row.get("dim_group") == "Seeded area (acres)"
        and row.get("ref_date") == "2026-01-01"
    ]
    major_rows = [row for row in latest_rows if row.get("item") in MAJOR_GRAIN_ITEMS]
    acres: dict[str, float] = {}
    for row in major_rows:
        geo = str(row["geo"])
        acres[geo] = acres.get(geo, 0.0) + float(row["value"])
    return acres, latest_rows


def crop_lane_acres_by_province(statcan_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lanes: dict[str, dict[str, Any]] = {}
    for lane in CROP_LANE_DEFS:
        acres_by_province: dict[str, float] = {}
        if lane["acre_items"]:
            for row in statcan_rows:
                if (
                    row.get("product_id") == 32100359
                    and row.get("dim_group") == "Seeded area (acres)"
                    and row.get("ref_date") == "2026-01-01"
                    and row.get("geo") in {"Manitoba", "Saskatchewan", "Alberta"}
                    and row.get("item") in lane["acre_items"]
                ):
                    geo = str(row["geo"])
                    acres_by_province[geo] = acres_by_province.get(geo, 0.0) + float(row["value"])
        lanes[lane["key"]] = {
            "label": lane["label"],
            "color": lane["color"],
            "acre_items": lane["acre_items"],
            "acres_by_province": acres_by_province,
            "prairie_acres": sum(acres_by_province.values()) if acres_by_province else None,
            "acreage_note": (
                "StatsCan 2026 seeded-area intentions."
                if acres_by_province
                else "No complete pulse-acre denominator in the current WDS crop pull; use report metrics only."
            ),
        }
    return lanes


def extract_alberta_surface_excessive(text: str) -> dict[str, float]:
    table = canada.table_text_between(text, r"Table 2:\s+Alberta Surface Soil.*?Moisture Ratings")
    values: dict[str, float] = {}
    if not table:
        return values
    for line in table.splitlines():
        parsed = canada.values_from_table_line(line, expected_count=5)
        if not parsed:
            continue
        label, row_values = parsed
        clean_label = re.sub(r"\s+", " ", label).strip()
        if clean_label.startswith("5-year") or clean_label.startswith("10-year"):
            continue
        if len(row_values) >= 5 and row_values[4] is not None:
            values[clean_label] = float(row_values[4])
    return values


def extract_manitoba_weather(text: str) -> dict[str, Any]:
    def number_after(pattern: str) -> float | None:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        return float(match.group(1)) if match else None

    return {
        "stonewall_24hr_mm": number_after(r"Most rainfall in 24 hrs\.\s+Stonewall\s+June 9\s+([0-9]+(?:\.[0-9]+)?)\s*mm"),
        "stonewall_7day_mm": number_after(r"Interlake\s+Stonewall\s+\(([0-9]+(?:\.[0-9]+)?)\s*mm\)"),
        "dugald_7day_mm": number_after(r"Eastern\s+Dugald\s+\(([0-9]+(?:\.[0-9]+)?)\s*mm\)"),
        "elie_7day_mm": number_after(r"Central\s+Elie\s+\(([0-9]+(?:\.[0-9]+)?)\s*mm\)"),
        "rorketon_7day_mm": number_after(r"Northwest\s+Rorketon\s+\(([0-9]+(?:\.[0-9]+)?)\s*mm\)"),
        "nw_canola_seeded_pct": number_after(r"Canola seeding is approximately\s+([0-9]+(?:\.[0-9]+)?)%\s+complete across the region"),
        "nw_spring_wheat_seeded_low_pct": number_after(r"Spring wheat seeding is approximately\s+([0-9]+(?:\.[0-9]+)?)\s*-\s*[0-9]+%\s+complete"),
        "nw_spring_wheat_seeded_high_pct": number_after(r"Spring wheat seeding is approximately\s+[0-9]+(?:\.[0-9]+)?\s*-\s*([0-9]+(?:\.[0-9]+)?)%\s+complete"),
    }


def extract_saskatchewan_report_values(text: str) -> dict[str, Any]:
    def first(pattern: str) -> float | None:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        return float(match.group(1)) if match else None

    langenburg_elfros = re.search(
        r"Langenburg\s+and\s+(?:the\s+)?Elfros\s+regions\s+received\s+([0-9]+(?:\.[0-9]+)?)\s+mm\s+and\s+([0-9]+(?:\.[0-9]+)?)\s+mm",
        text,
        flags=re.IGNORECASE,
    )
    crop_values: dict[str, float] = {}
    for label in ["durum", "spring wheat", "barley", "triticale", "canary seed", "oats", "field peas", "lentils", "chickpeas", "mustard", "canola", "flax"]:
        match = re.search(rf"([0-9]+(?:\.[0-9]+)?)\s+per\s+cent\s+for\s+{re.escape(label)}", text, flags=re.IGNORECASE)
        if match:
            crop_values[label] = float(match.group(1))

    return {
        "rm_lipton_rain_mm": first(r"RM of Lipton recorded\s+([0-9]+(?:\.[0-9]+)?)\s+millimetres"),
        "langenburg_rain_mm": float(langenburg_elfros.group(1)) if langenburg_elfros else first(r"Langenburg.*?received\s+([0-9]+(?:\.[0-9]+)?)\s+mm"),
        "elfros_rain_mm": float(langenburg_elfros.group(2)) if langenburg_elfros else first(r"Elfros.*?([0-9]+(?:\.[0-9]+)?)\s+mm"),
        "cropland_surplus_pct": first(r"Cropland topsoil moisture is:.*?([0-9]+)\s+per\s+cent\s+surplus"),
        "cropland_adequate_pct": first(r"Cropland topsoil moisture is:.*?([0-9]+)\s+per\s+cent\s+adequate"),
        "east_central_seeded_pct": first(r"east-central region has made progress at\s+([0-9]+(?:\.[0-9]+)?)\s+per\s+cent\s+complete"),
        "crop_seeded_pct": crop_values,
    }


def extract_saskatchewan_condition_tables(text: str) -> dict[str, Any]:
    first_crops = ["Winter Wheat", "Fall Rye", "Spring Wheat", "Durum", "Oats", "Barley", "Flax", "Canola"]
    second_crops = ["Triticale", "Mustard", "Soybean", "Lentil", "Field Pea", "Canaryseed", "Chickpea"]
    pattern = re.compile(
        r"(?m)^\s*(South East|South West|East Central|West Central|North East|North West)\s*\n"
        r"\s*Winter Wheat\s+Fall Rye\s+Spring Wheat.*?"
        r"very poor\s+[^\n]+(?:\n\s+Triticale\s+Mustard.*?very poor\s+[^\n]+)?",
        re.S,
    )
    region_tables: dict[str, dict[str, dict[str, float]]] = {}
    for match in pattern.finditer(text):
        region = match.group(1)
        if region in region_tables:
            continue
        block = match.group(0)
        if "Triticale" in block:
            first_block, second_block = block.split("Triticale", 1)
            second_block = "Triticale" + second_block
        else:
            first_block, second_block = block, ""

        region_tables[region] = {}
        parse_condition_block(first_block, first_crops, region_tables[region])
        parse_condition_block(second_block, second_crops, region_tables[region])

    return {
        "regions": region_tables,
        "regional_average": {
            "Spring Wheat": average_condition_distribution(region_tables, ["Spring Wheat"]),
            "Canola": average_condition_distribution(region_tables, ["Canola"]),
            "Barley": average_condition_distribution(region_tables, ["Barley"]),
            "Pulses / Other": average_condition_distribution(region_tables, ["Lentil", "Field Pea", "Chickpea"]),
        },
        "method": "Simple average of Saskatchewan regional crop-condition tables; not acreage-weighted.",
    }


def parse_condition_block(block: str, crop_names: list[str], output: dict[str, dict[str, float]]) -> None:
    if not block:
        return
    for bucket in QUALITY_BUCKETS:
        escaped_bucket = re.escape(bucket)
        match = re.search(rf"(?m)^\s*{escaped_bucket}\s+([0-9% \t]+)$", block)
        if not match:
            continue
        values = [float(value) for value in re.findall(r"([0-9]+(?:\.[0-9]+)?)%", match.group(1))]
        for crop_name, value in zip(crop_names, values):
            output.setdefault(crop_name, {})[bucket] = value


def average_condition_distribution(
    region_tables: dict[str, dict[str, dict[str, float]]],
    crop_names: list[str],
) -> dict[str, float | None]:
    distribution: dict[str, float | None] = {}
    for bucket in QUALITY_BUCKETS:
        values: list[float] = []
        for region in SK_CONDITION_REGIONS:
            crop_table = region_tables.get(region, {})
            for crop_name in crop_names:
                value = crop_table.get(crop_name, {}).get(bucket)
                if value is not None:
                    values.append(float(value))
        distribution[bucket] = round(sum(values) / len(values), 1) if values else None
    return distribution


def province_sources(summaries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {summary["province"]: summary for summary in summaries}


def evaluate() -> dict[str, Any]:
    started_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    rows, summaries = canada.collect(["MB", "SK", "AB"])
    sources = province_sources(summaries)

    mb_text, _ = canada.pdf_to_text(sources["MB"]["source_url"], layout=True)
    sk_report_url = sources["SK"]["discovery"].get("report_url") or sources["SK"]["source_url"]
    sk_text, _ = canada.pdf_to_text(sk_report_url, layout=True)
    ab_text, _ = canada.pdf_to_text(sources["AB"]["source_url"], layout=True)

    acres, statcan_rows = major_grain_acres_by_province()
    statcan_major_rows = [row for row in statcan_rows if row.get("item") in MAJOR_GRAIN_ITEMS]
    acres_mb = acres.get("Manitoba")
    acres_sk = acres.get("Saskatchewan")
    acres_ab = acres.get("Alberta")

    mb_seeded = row_value(rows, province="MB", metric="seeded_pct", crop_name="All Crops")
    sk_seeded = row_value(rows, province="SK", metric="seeded_pct", crop_name="All Crops")
    ab_condition_all = row_value(rows, province="AB", metric="condition_good_excellent_pct", crop_name="All Crops")
    ab_condition_major = row_value(rows, province="AB", metric="condition_good_excellent_pct", crop_name="Major Crops")
    ab_seeded_prev, ab_seeded_prev_date, ab_seeded_prev_url = latest_alberta_resource_text(
        sources["AB"]["discovery"].get("report_date") or "9999-12-31"
    )

    mb_weather = extract_manitoba_weather(mb_text)
    sk_report_values = extract_saskatchewan_report_values(sk_text)
    sk_condition_tables = extract_saskatchewan_condition_tables(sk_text)
    ab_excessive = extract_alberta_surface_excessive(ab_text)

    sk_cropland_moisture = row_value(rows, province="SK", metric="soil_moisture_adequate_surplus_pct", crop_name="Cropland")
    sk_oilseed_behind = row_value(rows, province="SK", metric="development_behind_pct", crop_name="Oilseeds")
    sk_spring_cereal_behind = row_value(rows, province="SK", metric="development_behind_pct", crop_name="Spring Cereals")
    ab_nw_all_condition = row_value(rows, province="AB", metric="condition_good_excellent_pct", crop_name="All Crops", region_code="NW")
    ab_nw_canola_condition = row_value(rows, province="AB", metric="condition_good_excellent_pct", crop_name="Canola", region_code="NW")
    ab_ne_all_condition = row_value(rows, province="AB", metric="condition_good_excellent_pct", crop_name="All Crops", region_code="NE")
    sk_development_watch = {
        crop_name: row_value(rows, province="SK", metric="development_behind_pct", crop_name=crop_name)
        for crop_name in SK_DEVELOPMENT_WATCH
    }
    sk_seeded_watch = {
        crop_name: sk_report_values["crop_seeded_pct"].get(crop_name)
        for crop_name in SK_SEEDED_WATCH_CROPS
    }
    ab_crop_conditions = {
        crop_name: row_value(rows, province="AB", metric="condition_good_excellent_pct", crop_name=crop_name)
        for crop_name in AB_QUALITY_CROPS
    }
    ab_nw_crop_conditions = {
        crop_name: row_value(rows, province="AB", metric="condition_good_excellent_pct", crop_name=crop_name, region_code="NW")
        for crop_name in AB_QUALITY_CROPS
    }

    mb_unseeded_acres = round_acres(acres_mb * (100 - mb_seeded) / 100) if acres_mb and mb_seeded is not None else None
    sk_unseeded_acres = round_acres(acres_sk * (100 - sk_seeded) / 100) if acres_sk and sk_seeded is not None else None
    ab_unseeded_acres = round_acres(acres_ab * (100 - ab_seeded_prev) / 100) if acres_ab and ab_seeded_prev is not None else None
    sk_surplus_acres = (
        round_acres(acres_sk * sk_report_values["cropland_surplus_pct"] / 100)
        if acres_sk and sk_report_values.get("cropland_surplus_pct") is not None
        else None
    )
    ab_excessive_acres = (
        round_acres(acres_ab * ab_excessive.get("Alberta", 0.0) / 100)
        if acres_ab and ab_excessive.get("Alberta") is not None
        else None
    )
    crop_lanes = crop_lane_acres_by_province(statcan_rows)
    crop_lanes["spring_wheat"]["province_metrics"] = {
        "MB": {
            "metric": "NW seeded",
            "value": f"{fmt_pct(mb_weather.get('nw_spring_wheat_seeded_low_pct'))}-{fmt_pct(mb_weather.get('nw_spring_wheat_seeded_high_pct'))}",
            "note": "Leaf spots reported; wet NW fields.",
            "severity": "watch",
        },
        "SK": {
            "metric": "Seeded",
            "value": fmt_pct(sk_report_values["crop_seeded_pct"].get("spring wheat")),
            "note": f"Spring cereals {fmt_pct(sk_spring_cereal_behind)} behind normal development.",
            "severity": "watch",
        },
        "AB": {
            "metric": "Good/excellent",
            "value": fmt_pct(ab_crop_conditions.get("Spring Wheat")),
            "note": f"NW spring wheat {fmt_pct(ab_nw_crop_conditions.get('Spring Wheat'))} G/E.",
            "severity": "watch",
        },
    }
    crop_lanes["spring_wheat"]["headline"] = "SK mostly Good; AB 72.4% G/E."
    crop_lanes["canola"]["province_metrics"] = {
        "MB": {
            "metric": "NW seeded",
            "value": fmt_pct(mb_weather.get("nw_canola_seeded_pct")),
            "note": "Flea beetles active.",
            "severity": "high",
        },
        "SK": {
            "metric": "Seeded",
            "value": fmt_pct(sk_report_values["crop_seeded_pct"].get("canola")),
            "note": f"Oilseeds {fmt_pct(sk_oilseed_behind)} behind normal.",
            "severity": "high",
        },
        "AB": {
            "metric": "Good/excellent",
            "value": fmt_pct(ab_crop_conditions.get("Canola")),
            "note": f"NW canola only {fmt_pct(ab_nw_canola_condition)} G/E.",
            "severity": "high",
        },
    }
    crop_lanes["canola"]["headline"] = "Quality watch: AB/NW weak."
    crop_lanes["barley"]["province_metrics"] = {
        "MB": {
            "metric": "Spring cereals",
            "value": "not split",
            "note": "Barley not published.",
            "severity": "watch",
        },
        "SK": {
            "metric": "Seeded",
            "value": fmt_pct(sk_report_values["crop_seeded_pct"].get("barley")),
            "note": f"Spring cereals {fmt_pct(sk_spring_cereal_behind)} behind.",
            "severity": "watch",
        },
        "AB": {
            "metric": "Good/excellent",
            "value": fmt_pct(ab_crop_conditions.get("Barley")),
            "note": f"NW barley {fmt_pct(ab_nw_crop_conditions.get('Barley'))} G/E.",
            "severity": "watch",
        },
    }
    crop_lanes["barley"]["headline"] = "Best AB quality of the three."
    crop_lanes["pulses_other"]["province_metrics"] = {
        "MB": {
            "metric": "Narrative",
            "value": "watch",
            "note": "Weevil/cutworms/wet access.",
            "severity": "watch",
        },
        "SK": {
            "metric": "Pulse seeded",
            "value": f"Peas {fmt_pct(sk_report_values['crop_seeded_pct'].get('field peas'))}; Lentils {fmt_pct(sk_report_values['crop_seeded_pct'].get('lentils'))}; Chickpeas {fmt_pct(sk_report_values['crop_seeded_pct'].get('chickpeas'))}",
            "note": f"Pulses {fmt_pct(sk_development_watch.get('Pulse Crops'))} behind.",
            "severity": "watch",
        },
        "AB": {
            "metric": "Dry peas G/E",
            "value": fmt_pct(ab_crop_conditions.get("Dry Peas")),
            "note": f"NW dry peas {fmt_pct(ab_nw_crop_conditions.get('Dry Peas'))} G/E.",
            "severity": "watch",
        },
    }
    crop_lanes["pulses_other"]["headline"] = "Strong SK; AB peas 79% G/E."

    package = {
        "generated_at": started_at,
        "prairie_week_status": canada.prairie_week_status(["MB", "SK", "AB"]),
        "rows_parsed": len(rows),
        "province_summaries": summaries,
        "statscan_major_grain_acres": {
            "method": "StatsCan WDS Table 32-10-0359-01, 2026 seeded-area intentions, selected major grains only: wheat all, canola, barley, oats, corn for grain, soybeans. Pulses, forage, potatoes, and minor crops are excluded.",
            "Manitoba": acres_mb,
            "Saskatchewan": acres_sk,
            "Alberta": acres_ab,
            "source_rows": statcan_major_rows,
        },
        "major_crop_lanes": crop_lanes,
        "major_crop_quality": {
            "method": {
                "Saskatchewan": sk_condition_tables["method"],
                "Alberta": "Alberta Table 1 publishes Good-to-Excellent only; Excellent/Good/Fair/Poor are not split in the current official table.",
            },
            "SK": sk_condition_tables,
            "AB": {
                "good_excellent_pct": ab_crop_conditions,
                "north_west_good_excellent_pct": ab_nw_crop_conditions,
            },
        },
        "provinces": {
            "MB": {
                "name": "Manitoba",
                "report_date": sources["MB"]["discovery"].get("report_date"),
                "source_url": sources["MB"]["source_url"],
                "seeded_pct": mb_seeded,
                "seeded_five_year_avg_pct": row_obj(rows, province="MB", metric="seeded_pct", crop_name="All Crops", region_code="PROV").get("five_year_avg_pct"),
                "seeded_previous_year_pct": row_obj(rows, province="MB", metric="seeded_pct", crop_name="All Crops", region_code="PROV").get("previous_year_pct"),
                "major_grain_acres": acres_mb,
                "estimated_unseeded_major_grain_acres": mb_unseeded_acres,
                "weather": mb_weather,
                "quality_indicators": {
                    "winter_cereals": "Winter cereals remain in good condition; disease scouting is increasingly important.",
                    "spring_cereals": "Spring cereals are mostly at tillering; cereal leaf spot diseases have been reported.",
                    "oilseeds": "Canola ranges from cotyledon to 2-3 leaf, with earliest fields approaching 4-leaf.",
                    "northwest_canola_seeded_pct": mb_weather.get("nw_canola_seeded_pct"),
                    "northwest_spring_wheat_seeded_low_pct": mb_weather.get("nw_spring_wheat_seeded_low_pct"),
                    "northwest_spring_wheat_seeded_high_pct": mb_weather.get("nw_spring_wheat_seeded_high_pct"),
                },
                "risk_level": "red",
                "lead_risks": [
                    "South Interlake and Eastern Manitoba flooding and standing water",
                    "Northwest Manitoba/Swan Valley inundated fields and access limits",
                    "Disease and pest scouting after saturated conditions",
                ],
            },
            "SK": {
                "name": "Saskatchewan",
                "report_date": row_obj(rows, province="SK", metric="seeded_pct", crop_name="All Crops", region_code="PROV").get("report_date"),
                "release_date": row_obj(rows, province="SK", metric="seeded_pct", crop_name="All Crops", region_code="PROV").get("release_date"),
                "source_url": sk_report_url,
                "seeded_pct": sk_seeded,
                "seeded_five_year_avg_pct": row_obj(rows, province="SK", metric="seeded_pct", crop_name="All Crops", region_code="PROV").get("five_year_avg_pct"),
                "seeded_previous_week_pct": 93.0,
                "major_grain_acres": acres_sk,
                "estimated_unseeded_major_grain_acres": sk_unseeded_acres,
                "cropland_adequate_surplus_pct": sk_cropland_moisture,
                "cropland_surplus_pct": sk_report_values.get("cropland_surplus_pct"),
                "estimated_surplus_moisture_major_grain_acres": sk_surplus_acres,
                "oilseeds_development_behind_pct": sk_oilseed_behind,
                "spring_cereals_development_behind_pct": sk_spring_cereal_behind,
                "east_central_seeded_pct": sk_report_values.get("east_central_seeded_pct"),
                "crop_seeded_pct": sk_report_values["crop_seeded_pct"],
                "seeded_watch_pct": sk_seeded_watch,
                "development_behind_pct": sk_development_watch,
                "crop_condition_summary": "The official report says crop conditions vary by crop type, with the majority rated fair to good and a notable proportion excellent.",
                "weather": {
                    "rm_lipton_rain_mm": sk_report_values.get("rm_lipton_rain_mm"),
                    "langenburg_rain_mm": sk_report_values.get("langenburg_rain_mm"),
                    "elfros_rain_mm": sk_report_values.get("elfros_rain_mm"),
                },
                "risk_level": "amber",
                "lead_risks": [
                    "East-central seeding lag",
                    "Oilseed and spring cereal development behind normal",
                    "Flooding, wind, gopher, and minor flea beetle damage",
                ],
            },
            "AB": {
                "name": "Alberta",
                "report_date": sources["AB"]["discovery"].get("report_date"),
                "release_date": sources["AB"]["discovery"].get("resource_last_modified"),
                "source_url": sources["AB"]["source_url"],
                "seeded_pct": ab_seeded_prev,
                "seeded_report_date": ab_seeded_prev_date,
                "seeded_source_url": ab_seeded_prev_url,
                "major_crop_good_excellent_pct": ab_condition_major,
                "all_crop_good_excellent_pct": ab_condition_all,
                "major_grain_acres": acres_ab,
                "estimated_unseeded_major_grain_acres_from_last_seeding_report": ab_unseeded_acres,
                "surface_excessive_pct": ab_excessive,
                "estimated_excessive_surface_moisture_major_grain_acres": ab_excessive_acres,
                "crop_good_excellent_pct": ab_crop_conditions,
                "north_west_crop_good_excellent_pct": ab_nw_crop_conditions,
                "north_west_all_crop_good_excellent_pct": ab_nw_all_condition,
                "north_west_canola_good_excellent_pct": ab_nw_canola_condition,
                "north_east_all_crop_good_excellent_pct": ab_ne_all_condition,
                "risk_level": "amber-red",
                "lead_risks": [
                    "North West and North East excess moisture",
                    "Standing water, reseeding, and unseeded acres in northern regions",
                    "Spraying delay and disease risk under continued moisture",
                ],
            },
        },
        "method_caveats": [
            "Provincial reports publish percentages and narrative impacts, not official affected-acre counts for every hazard.",
            "Acre estimates are derived acre-equivalents using selected StatsCan major-grain intended acres and should not be read as insured-loss acres.",
            "Alberta has moved from seeding-progress reporting to condition reporting; the seeded percentage is carried from the prior June 9 official report.",
            "The major-crop infographic uses StatsCan acreage for spring wheat, canola, and barley; the Pulses/Other lane is report-metric based because the current WDS pull does not include complete pulse acreage.",
        ],
    }
    return package


def build_markdown(package: dict[str, Any]) -> str:
    mb = package["provinces"]["MB"]
    sk = package["provinces"]["SK"]
    ab = package["provinces"]["AB"]
    lines = [
        "# Prairie Crop Progress Report",
        "",
        f"Generated: {package['generated_at']}",
        f"Package status: {package['prairie_week_status']} from {package['rows_parsed']} parsed rows.",
        "",
        "## TL;DR",
        "",
        "- Manitoba is the main weather story: seeding is 96% complete, but record rain and flooding hit the Interlake/Eastern belt and parts of the Northwest.",
        "- Saskatchewan is nearly seeded at 97%, but east-central remains behind and oilseed development is materially late.",
        "- Alberta has shifted from seeding to condition reporting: prior official seeding was 97%; the current report shows only 68.3% of major crops good-to-excellent, with North West Alberta the weak spot.",
        "",
        "## High-Level Seeding And Crop Progress",
        "",
        "| Province | Latest official report | Seeding / condition | Farmer read | Derived acre estimate |",
        "|---|---:|---:|---|---:|",
        f"| Manitoba | {mb['report_date']} | {fmt_pct(mb['seeded_pct'])} seeded vs {fmt_pct(mb['seeded_five_year_avg_pct'])} 5-year avg | Finish line delayed by flooding and saturated fields. | {fmt_acres(mb['estimated_unseeded_major_grain_acres'])} unseeded major-grain equivalent |",
        f"| Saskatchewan | {sk['release_date']} / period ending {sk['report_date']} | {fmt_pct(sk['seeded_pct'])} seeded vs {fmt_pct(sk['seeded_five_year_avg_pct'])} avg | Mostly seeded, but east-central lag and late development matter. | {fmt_acres(sk['estimated_unseeded_major_grain_acres'])} unseeded major-grain equivalent |",
        f"| Alberta | {ab['report_date']} condition report | {fmt_pct(ab['seeded_pct'])} seeded in prior seeding report; {fmt_pct(ab['major_crop_good_excellent_pct'])} major crops good/excellent now | Wet north is the pressure point; North West canola is weak. | {fmt_acres(ab['estimated_unseeded_major_grain_acres_from_last_seeding_report'])} unseeded equivalent from prior seeding report |",
        "",
        "## Infographic Outputs",
        "",
        "- `infographic-major-crops-prairies.svg` - Crop-quality ratings for Spring Wheat, Canola, Barley, and Pulses/Other.",
        "- `infographic-seeding-crop-progress.svg` - Prairie seeding and condition snapshot.",
        "- `infographic-risk-watch.svg` - Cross-province moisture, disease, access, and development risk matrix.",
        "- `infographic-quality-saskatchewan.svg` - Saskatchewan crop quality, moisture, and development lag watch.",
        "- `infographic-quality-alberta.svg` - Alberta good-to-excellent crop condition and excess-moisture watch.",
        "",
        "## Area Language For Public Copy",
        "",
        f"- South Interlake and Eastern Manitoba have seen substantial flooding and standing water. The official report records {mb['weather']['stonewall_24hr_mm']} mm in 24 hours at Stonewall and {mb['weather']['stonewall_7day_mm']} mm over seven days in the Interlake. The report does not publish affected acres; using the provincewide 4% unseeded gap on Bushel Board's mapped major-grain denominator gives roughly {fmt_acres(mb['estimated_unseeded_major_grain_acres'])} still not seeded, with flood stress concentrated in Interlake, Eastern, and Northwest Manitoba.",
        f"- Northwest Manitoba, including the Swan Valley/Minitonas area, has seen inundated fields, erosion, silt deposition, washouts, and saturated soils. The report puts Northwest canola seeding at about {fmt_pct(mb['weather']['nw_canola_seeded_pct'])} and spring wheat at roughly {fmt_pct(mb['weather']['nw_spring_wheat_seeded_low_pct'])}-{fmt_pct(mb['weather']['nw_spring_wheat_seeded_high_pct'])}.",
        f"- East-central Saskatchewan is the lagging region at {fmt_pct(sk['east_central_seeded_pct'])} seeded while the province is {fmt_pct(sk['seeded_pct'])}. On selected major-grain acres, the remaining 3% provincewide gap equals about {fmt_acres(sk['estimated_unseeded_major_grain_acres'])}.",
        f"- Saskatchewan cropland has {fmt_pct(sk['cropland_surplus_pct'])} surplus moisture and {fmt_pct(sk['cropland_adequate_surplus_pct'])} adequate-plus-surplus moisture. On selected major-grain acres, the surplus-moisture acre-equivalent is roughly {fmt_acres(sk['estimated_surplus_moisture_major_grain_acres'])}; this is not a damage count.",
        f"- North West Alberta has the clearest condition problem: all crops are only {fmt_pct(ab['north_west_all_crop_good_excellent_pct'])} good-to-excellent and canola is {fmt_pct(ab['north_west_canola_good_excellent_pct'])}. Surface soil moisture is rated excessive on {fmt_pct(ab['surface_excessive_pct'].get('North West'))} of the North West survey area.",
        f"- Alberta provincewide excessive surface moisture is {fmt_pct(ab['surface_excessive_pct'].get('Alberta'))}, equal to about {fmt_acres(ab['estimated_excessive_surface_moisture_major_grain_acres'])} of selected major-grain acre-equivalent exposure. Treat that as exposure, not verified lost acres.",
        "",
        "## What Else Matters",
        "",
        "- Moisture is now two-sided. Manitoba and northern Alberta have excess-water risk; Saskatchewan has a mix of surplus and still-short pockets.",
        "- Disease and spraying windows matter next. Manitoba flags cereal leaf spots suspected to be tan spot, cutworms, pea leaf weevil, and flea beetles; Alberta flags disease concern where spraying has been limited.",
        f"- Crop stage lag matters in Saskatchewan: oilseeds are {fmt_pct(sk['oilseeds_development_behind_pct'])} behind normal and spring cereals are {fmt_pct(sk['spring_cereals_development_behind_pct'])} behind.",
        "- The next weekly loop should watch whether these acres recover after drainage and heat, or turn into reseed/unseeded/quality risk.",
        "",
        "## Sources",
        "",
        f"- Manitoba Agriculture Crop Report: {mb['source_url']}",
        f"- Saskatchewan Crop Report: {sk['source_url']}",
        f"- Alberta Crop Report: {ab['source_url']}",
        "- Statistics Canada WDS Table 32-10-0359-01 for selected major-grain acreage denominators.",
        "",
        "## Method Notes",
        "",
    ]
    lines.extend(f"- {item}" for item in package["method_caveats"])
    lines.append("")
    return "\n".join(lines)


def svg_header(width: int, height: int) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img">'
    )


def svg_text(x: int, y: int, text: str, size: int = 24, weight: int = 500, fill: str = "#243126") -> str:
    return (
        f'<text x="{x}" y="{y}" font-family="DM Sans, Arial, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}">{html.escape(text)}</text>'
    )


def svg_multiline(x: int, y: int, lines: list[str], size: int = 20, fill: str = "#39473c", leading: int = 26) -> str:
    return "\n".join(svg_text(x, y + idx * leading, line, size=size, fill=fill) for idx, line in enumerate(lines))


def wrap_words(text: str, max_chars: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        trial = " ".join(current + [word])
        if len(trial) > max_chars and current:
            lines.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    return lines


def bar(x: int, y: int, width: int, height: int, pct: float | None, color: str, bg: str = "#d7ded2") -> str:
    pct = max(0, min(100, pct or 0))
    fill_width = int(width * pct / 100)
    return (
        f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="4" fill="{bg}"/>'
        f'<rect x="{x}" y="{y}" width="{fill_width}" height="{height}" rx="4" fill="{color}"/>'
    )


def panel(x: int, y: int, width: int, height: int, fill: str = "#ffffff") -> str:
    return f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="8" fill="{fill}" stroke="#d4d1c4"/>'


def metric_card(x: int, y: int, width: int, height: int, label: str, value: str, note: str, color: str) -> str:
    lines = [
        panel(x, y, width, height),
        svg_text(x + 24, y + 40, label, size=20, weight=800, fill=color),
        svg_text(x + 24, y + 100, value, size=48, weight=800, fill="#1f2c22"),
        svg_multiline(x + 24, y + 138, wrap_words(note, 27), size=18, fill="#4b554d", leading=23),
    ]
    return "\n".join(lines)


def percent_bar_row(
    x: int,
    y: int,
    label: str,
    pct: float | None,
    color: str,
    width: int = 430,
    label_width: int = 185,
) -> str:
    return "\n".join(
        [
            svg_text(x, y + 22, label, size=19, weight=700, fill="#2f3a31"),
            bar(x + label_width, y + 3, width, 22, pct, color),
            svg_text(x + label_width + width + 14, y + 22, fmt_pct(pct), size=19, weight=800, fill="#1f2c22"),
        ]
    )


def stacked_quality_bar(x: int, y: int, width: int, height: int, distribution: dict[str, float | None]) -> str:
    parts: list[str] = []
    cursor = x
    total = sum(float(distribution.get(bucket) or 0) for bucket in QUALITY_BUCKETS)
    if total <= 0:
        return f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="4" fill="#d7ded2"/>'
    for bucket in QUALITY_BUCKETS:
        value = float(distribution.get(bucket) or 0)
        segment_width = int(round(width * value / total))
        if value <= 0 or segment_width <= 0:
            continue
        parts.append(
            f'<rect x="{cursor}" y="{y}" width="{segment_width}" height="{height}" '
            f'rx="3" fill="{QUALITY_COLORS[bucket]}"/>'
        )
        cursor += segment_width
    return "\n".join(parts)


def quality_distribution_label(distribution: dict[str, float | None]) -> str:
    return " / ".join(
        f"{bucket.title().replace(' Poor', ' poor')} {fmt_pct(distribution.get(bucket))}"
        for bucket in QUALITY_BUCKETS
        if distribution.get(bucket) is not None
    )


def infographic_footer(source_url: str, caveat: str) -> str:
    source_label = source_url if len(source_url) <= 120 else f"{source_url[:117]}..."
    return "\n".join(
        [
            svg_text(70, 858, f"Source: {source_label}", size=15, fill="#677068"),
            svg_text(70, 882, caveat, size=15, fill="#677068"),
        ]
    )


def build_manitoba_quality_svg(package: dict[str, Any]) -> str:
    mb = package["provinces"]["MB"]
    weather = mb["weather"]
    color = "#385c4b"
    parts = [
        svg_header(1400, 900),
        '<rect width="1400" height="900" fill="#f7f4ec"/>',
        svg_text(70, 78, "Manitoba Crop Quality Watch", size=46, weight=800, fill="#1f2c22"),
        svg_text(72, 118, f"Crop Report {mb['report_date']} | Quality proxy: seeded progress, crop-stage notes, excess-water stress", size=21, fill="#586257"),
        metric_card(
            70,
            160,
            290,
            195,
            "Seeded",
            fmt_pct(mb["seeded_pct"]),
            f"{fmt_acres(mb['estimated_unseeded_major_grain_acres'])} selected major-grain acre equivalent not seeded.",
            color,
        ),
        metric_card(
            390,
            160,
            290,
            195,
            "Stonewall 24h",
            fmt_mm(weather.get("stonewall_24hr_mm")),
            f"Interlake 7-day total at Stonewall was {fmt_mm(weather.get('stonewall_7day_mm'))}.",
            "#2f6f8f",
        ),
        metric_card(
            710,
            160,
            290,
            195,
            "NW canola",
            fmt_pct(weather.get("nw_canola_seeded_pct")),
            "Northwest Manitoba remains a seeding and access watch area.",
            "#b26b2f",
        ),
        metric_card(
            1030,
            160,
            300,
            195,
            "5-year pace",
            fmt_pct(mb["seeded_five_year_avg_pct"]),
            "Current seeding is behind the normal finish line.",
            "#7c8d35",
        ),
        panel(70, 390, 620, 230),
        svg_text(100, 435, "Crop-stage and quality notes", size=27, weight=800, fill="#1f2c22"),
        svg_multiline(
            100,
            478,
            [
                "Winter cereals: good condition; disease scouting now matters.",
                "Spring cereals: mostly tillering; cereal leaf spots reported.",
                "Oilseeds: canola cotyledon to 2-3 leaf, earliest near 4-leaf.",
                "Pests: flea beetles active; cutworms and pea leaf weevil noted.",
            ],
            size=21,
            fill="#2f3a31",
            leading=29,
        ),
        panel(720, 390, 610, 230, fill="#fff7f1"),
        svg_text(750, 435, "Area language", size=27, weight=800, fill="#1f2c22"),
        svg_multiline(
            750,
            478,
            wrap_words(
                "South Interlake and Eastern Manitoba have seen substantial flooding and standing water. "
                "The report does not publish affected acres; Bushel Board estimates about "
                f"{fmt_acres(mb['estimated_unseeded_major_grain_acres'])} of selected major-grain acre-equivalent exposure from the provincewide unseeded gap.",
                63,
            ),
            size=21,
            fill="#2f3a31",
            leading=27,
        ),
        panel(70, 635, 1260, 170, fill="#e8eadf"),
        svg_text(100, 680, "Weekly watch", size=27, weight=800, fill="#1f2c22"),
        svg_multiline(
            100,
            724,
            [
                "High: flooding, standing water, washed roads, field access.",
                "Watch: disease pressure after saturated fields; spraying timing on stressed crops.",
                "Watch: forage and winter-feed risk where hayland stays inaccessible.",
            ],
            size=22,
            fill="#2f3a31",
            leading=32,
        ),
        infographic_footer(
            mb["source_url"],
            "Acre estimate is derived from selected StatsCan major-grain intentions; it is not an insured-loss or confirmed damage count.",
        ),
        "</svg>",
    ]
    return "\n".join(parts)


def build_saskatchewan_quality_svg(package: dict[str, Any]) -> str:
    sk = package["provinces"]["SK"]
    color = "#7c8d35"
    seeded_watch = sk["seeded_watch_pct"]
    development = sk["development_behind_pct"]
    parts = [
        svg_header(1400, 900),
        '<rect width="1400" height="900" fill="#f7f4ec"/>',
        svg_text(70, 78, "Saskatchewan Crop Quality Watch", size=46, weight=800, fill="#1f2c22"),
        svg_text(72, 118, f"Crop Report period ending {sk['report_date']} | Released {sk['release_date']}", size=21, fill="#586257"),
        metric_card(
            70,
            160,
            290,
            195,
            "Seeded",
            fmt_pct(sk["seeded_pct"]),
            f"Still below the {fmt_pct(sk['seeded_five_year_avg_pct'])} 5-year average.",
            color,
        ),
        metric_card(
            390,
            160,
            290,
            195,
            "Cropland moisture",
            fmt_pct(sk["cropland_adequate_surplus_pct"]),
            f"Adequate plus surplus; surplus alone is {fmt_pct(sk['cropland_surplus_pct'])}.",
            "#2f6f8f",
        ),
        metric_card(
            710,
            160,
            290,
            195,
            "Oilseeds behind",
            fmt_pct(sk["oilseeds_development_behind_pct"]),
            "Largest provincewide crop-development lag.",
            "#b26b2f",
        ),
        metric_card(
            1030,
            160,
            300,
            195,
            "East-central",
            fmt_pct(sk["east_central_seeded_pct"]),
            "Lagging region while the province is nearly seeded.",
            "#c84630",
        ),
        panel(70, 390, 620, 255),
        svg_text(100, 435, "Development behind normal", size=27, weight=800, fill="#1f2c22"),
        percent_bar_row(100, 468, "Oilseeds", development.get("Oilseeds"), "#b26b2f", width=330, label_width=165),
        percent_bar_row(100, 510, "Spring cereals", development.get("Spring Cereals"), "#7c8d35", width=330, label_width=165),
        percent_bar_row(100, 552, "Annual forage", development.get("Annual Forage"), "#2f6f8f", width=330, label_width=165),
        percent_bar_row(100, 594, "Pulse crops", development.get("Pulse Crops"), "#8f4f78", width=330, label_width=165),
        panel(720, 390, 610, 255),
        svg_text(750, 435, "Crop seeding lag by crop", size=27, weight=800, fill="#1f2c22"),
        percent_bar_row(750, 468, "Triticale", seeded_watch.get("triticale"), "#c84630", width=300, label_width=145),
        percent_bar_row(750, 510, "Canary seed", seeded_watch.get("canary seed"), "#d68b2b", width=300, label_width=145),
        percent_bar_row(750, 552, "Chickpeas", seeded_watch.get("chickpeas"), "#d68b2b", width=300, label_width=145),
        percent_bar_row(750, 594, "Mustard", seeded_watch.get("mustard"), "#7c8d35", width=300, label_width=145),
        panel(70, 680, 1260, 150, fill="#fff7f1"),
        svg_text(100, 725, "Area language", size=27, weight=800, fill="#1f2c22"),
        svg_multiline(
            100,
            766,
            wrap_words(
                "East-central Saskatchewan is the lagging area at 90% seeded while the province is 97%. "
                f"Cropland surplus moisture is {fmt_pct(sk['cropland_surplus_pct'])}, equal to about "
                f"{fmt_acres(sk['estimated_surplus_moisture_major_grain_acres'])} of selected major-grain acre-equivalent exposure; this is not a damage count.",
                115,
            ),
            size=21,
            fill="#2f3a31",
            leading=28,
        ),
        infographic_footer(
            sk["source_url"],
            "Condition summary is official narrative: majority fair-to-good, with a notable excellent share; exact condition table parsing is not used yet.",
        ),
        "</svg>",
    ]
    return "\n".join(parts)


def build_alberta_quality_svg(package: dict[str, Any]) -> str:
    ab = package["provinces"]["AB"]
    color = "#b26b2f"
    crop_conditions = ab["crop_good_excellent_pct"]
    excessive = ab["surface_excessive_pct"]
    release_date = str(ab["release_date"] or "")[:10] or "n/a"
    parts = [
        svg_header(1400, 900),
        '<rect width="1400" height="900" fill="#f7f4ec"/>',
        svg_text(70, 78, "Alberta Crop Quality Watch", size=46, weight=800, fill="#1f2c22"),
        svg_text(72, 118, f"Crop conditions as of {ab['report_date']} | Report posted {release_date}", size=21, fill="#586257"),
        metric_card(
            70,
            160,
            290,
            195,
            "Major crops G/E",
            fmt_pct(ab["major_crop_good_excellent_pct"]),
            "Provincewide good-to-excellent rating for major crops.",
            color,
        ),
        metric_card(
            390,
            160,
            290,
            195,
            "NW all crops G/E",
            fmt_pct(ab["north_west_all_crop_good_excellent_pct"]),
            "Weakest regional condition signal in the report.",
            "#c84630",
        ),
        metric_card(
            710,
            160,
            290,
            195,
            "NW canola G/E",
            fmt_pct(ab["north_west_canola_good_excellent_pct"]),
            "Canola is the clearest North West pressure point.",
            "#8f4f78",
        ),
        metric_card(
            1030,
            160,
            300,
            195,
            "NW excessive",
            fmt_pct(excessive.get("North West")),
            "Surface moisture rated excessive in North West Alberta.",
            "#2f6f8f",
        ),
        panel(70, 390, 620, 255),
        svg_text(100, 435, "Good-to-excellent by crop", size=27, weight=800, fill="#1f2c22"),
        percent_bar_row(100, 468, "Spring wheat", crop_conditions.get("Spring Wheat"), "#7c8d35", width=330, label_width=165),
        percent_bar_row(100, 510, "Barley", crop_conditions.get("Barley"), "#7c8d35", width=330, label_width=165),
        percent_bar_row(100, 552, "Canola", crop_conditions.get("Canola"), "#b26b2f", width=330, label_width=165),
        percent_bar_row(100, 594, "Oats", crop_conditions.get("Oats"), "#b26b2f", width=330, label_width=165),
        panel(720, 390, 610, 255),
        svg_text(750, 435, "Moisture pressure", size=27, weight=800, fill="#1f2c22"),
        percent_bar_row(750, 468, "Alberta", excessive.get("Alberta"), "#2f6f8f", width=300, label_width=145),
        percent_bar_row(750, 510, "North West", excessive.get("North West"), "#c84630", width=300, label_width=145),
        percent_bar_row(750, 552, "North East", excessive.get("North East"), "#d68b2b", width=300, label_width=145),
        percent_bar_row(750, 594, "Central", excessive.get("Central"), "#d6b23f", width=300, label_width=145),
        panel(70, 680, 1260, 150, fill="#fff7f1"),
        svg_text(100, 725, "Area language", size=27, weight=800, fill="#1f2c22"),
        svg_multiline(
            100,
            766,
            wrap_words(
                "North West Alberta has seen substantial excess moisture and weak canola condition: "
                f"{fmt_pct(excessive.get('North West'))} excessive surface moisture and "
                f"{fmt_pct(ab['north_west_canola_good_excellent_pct'])} canola good-to-excellent. "
                f"Provincewide excessive surface moisture equals about {fmt_acres(ab['estimated_excessive_surface_moisture_major_grain_acres'])} of selected major-grain acre-equivalent exposure.",
                115,
            ),
            size=21,
            fill="#2f3a31",
            leading=28,
        ),
        infographic_footer(
            ab["source_url"],
            "Acre exposure is derived from selected StatsCan major-grain intentions; Alberta seeded progress is carried from the June 9 seeding report.",
        ),
        "</svg>",
    ]
    return "\n".join(parts)


def build_major_crops_svg(package: dict[str, Any]) -> str:
    lanes = package["major_crop_lanes"]
    quality = package["major_crop_quality"]
    sk_quality = quality["SK"]["regional_average"]
    ab_quality = quality["AB"]["good_excellent_pct"]
    generated_date = str(package["generated_at"])[:10]
    parts = [
        svg_header(1400, 900),
        '<rect width="1400" height="900" fill="#f7f4ec"/>',
        svg_text(70, 76, "Prairie Major Crop Quality Ratings", size=46, weight=800, fill="#1f2c22"),
        svg_text(
            72,
            116,
            f"Saskatchewan full quality buckets; Alberta Good-to-Excellent only | generated {generated_date}",
            size=21,
            fill="#586257",
        ),
        svg_text(500, 154, "Saskatchewan", size=20, weight=800, fill="#2f3a31"),
        svg_text(930, 154, "Alberta", size=20, weight=800, fill="#2f3a31"),
    ]
    for idx, lane_key in enumerate(["spring_wheat", "canola", "barley", "pulses_other"]):
        lane = lanes[lane_key]
        y = 175 + idx * 135
        color = lane["color"]
        crop_label = lane["label"]
        sk_label = crop_label if crop_label != "Pulses / Other" else "Pulses / Other"
        ab_crop_name = {
            "spring_wheat": "Spring Wheat",
            "canola": "Canola",
            "barley": "Barley",
            "pulses_other": "Dry Peas",
        }[lane_key]
        sk_distribution = sk_quality.get(sk_label, {})
        ab_good_excellent = ab_quality.get(ab_crop_name)
        parts.append(panel(70, y, 1260, 116))
        parts.append(f'<rect x="70" y="{y}" width="12" height="116" rx="6" fill="{color}"/>')
        parts.append(svg_text(100, y + 38, lane["label"], size=28, weight=800, fill=color))
        acres_label = fmt_acres(lane.get("prairie_acres")) if lane.get("prairie_acres") is not None else "acre base n/a"
        parts.append(svg_text(100, y + 72, acres_label, size=20, weight=800, fill="#1f2c22"))
        parts.append(svg_multiline(100, y + 98, wrap_words(str(lane["headline"]), 31)[:1], size=16, fill="#4b554d", leading=18))

        parts.append(stacked_quality_bar(420, y + 30, 400, 26, sk_distribution))
        parts.append(svg_text(420, y + 75, f"E {fmt_pct(sk_distribution.get('excellent'))}  G {fmt_pct(sk_distribution.get('good'))}  F {fmt_pct(sk_distribution.get('fair'))}", size=16, weight=800, fill="#1f2c22"))
        parts.append(svg_text(420, y + 98, f"P {fmt_pct(sk_distribution.get('poor'))}  VP {fmt_pct(sk_distribution.get('very poor'))}", size=16, weight=800, fill="#1f2c22"))

        other_pct = 100 - ab_good_excellent if ab_good_excellent is not None else None
        parts.append(bar(930, y + 30, 320, 26, ab_good_excellent, "#7c8d35"))
        parts.append(svg_text(930, y + 75, f"G/E {fmt_pct(ab_good_excellent)}", size=17, weight=800, fill="#1f2c22"))
        parts.append(svg_text(930, y + 98, f"Other/not split {fmt_pct(other_pct)}", size=16, fill="#4b554d"))

    parts.extend(
        [
            panel(70, 735, 1260, 108, fill="#e8eadf"),
            svg_text(100, 777, "Quality rating truth table", size=24, weight=800, fill="#1f2c22"),
            svg_multiline(
                100,
                805,
                [
                    "Saskatchewan: Excellent/Good/Fair/Poor/Very Poor is a simple regional average from official tables.",
                    "Alberta: only Good-to-Excellent is published; the remaining share is not split into Fair/Poor buckets.",
                ],
                size=17,
                fill="#4b554d",
                leading=23,
            ),
            svg_text(100, 852, "Legend: E = Excellent, G = Good, F = Fair, P = Poor, VP = Very Poor.", size=17, fill="#4b554d"),
            svg_text(
                70,
                882,
                "Acreage: StatsCan 2026 seeded-area intentions for spring wheat, canola, barley only; pulses/other is report-metric based until a complete pulse-acre source is added.",
                size=15,
                fill="#677068",
            ),
            "</svg>",
        ]
    )
    return "\n".join(parts)


def build_progress_svg(package: dict[str, Any]) -> str:
    mb = package["provinces"]["MB"]
    sk = package["provinces"]["SK"]
    ab = package["provinces"]["AB"]
    generated_date = str(package["generated_at"])[:10]
    cards = [
        ("Manitoba", "#385c4b", mb["seeded_pct"], f"{fmt_acres(mb['estimated_unseeded_major_grain_acres'])} unseeded", "Flooding is the report driver."),
        ("Saskatchewan", "#7c8d35", sk["seeded_pct"], f"{fmt_acres(sk['estimated_unseeded_major_grain_acres'])} unseeded", f"Oilseeds {fmt_pct(sk['oilseeds_development_behind_pct'])} behind."),
        ("Alberta", "#b26b2f", ab["major_crop_good_excellent_pct"], f"{fmt_pct(ab['seeded_pct'])} seeded in prior report", "NW canola condition is weak."),
    ]
    parts = [
        svg_header(1400, 900),
        '<rect width="1400" height="900" fill="#f7f4ec"/>',
        svg_text(70, 86, "Prairie Crop Progress Snapshot", size=46, weight=800, fill="#1f2c22"),
        svg_text(72, 126, f"Latest official MB/SK/AB reports; generated {generated_date}. Acre estimates are derived, not loss counts.", size=22, fill="#586257"),
    ]
    for idx, (name, color, pct, acres_label, note) in enumerate(cards):
        x = 70 + idx * 430
        y = 180
        parts.append(f'<rect x="{x}" y="{y}" width="390" height="420" rx="8" fill="#ffffff" stroke="#d4d1c4"/>')
        parts.append(svg_text(x + 28, y + 56, name, size=32, weight=800, fill=color))
        label = "Seeded" if name != "Alberta" else "Major crops G/E"
        parts.append(svg_text(x + 28, y + 104, label, size=21, weight=700, fill="#3b433a"))
        parts.append(svg_text(x + 28, y + 178, fmt_pct(pct), size=64, weight=800, fill="#1f2c22"))
        parts.append(bar(x + 28, y + 210, 325, 24, pct, color))
        parts.append(svg_text(x + 28, y + 270, acres_label, size=24, weight=700, fill="#2b332c"))
        parts.append(svg_multiline(x + 28, y + 318, wrap_words(note, 34), size=21, fill="#4b554d", leading=28))
    parts.extend(
        [
            '<rect x="70" y="655" width="1260" height="155" rx="8" fill="#e8eadf" stroke="#cfd5c6"/>',
            svg_text(100, 705, "Current read", size=30, weight=800, fill="#1f2c22"),
            svg_multiline(
                100,
                746,
                [
                    "Moisture moved from drought relief to excess-water risk in Manitoba and northern Alberta.",
                    "Saskatchewan is nearly seeded, but development lag and east-central delays still matter.",
                    "Next report should separate recovery after heat/drainage from actual reseed or unseeded losses.",
                ],
                size=23,
                fill="#2f3a31",
                leading=32,
            ),
            "</svg>",
        ]
    )
    return "\n".join(parts)


def risk_cell(x: int, y: int, label: str, severity: str) -> str:
    colors = {
        "high": "#c84630",
        "medium-high": "#d68b2b",
        "medium": "#d6b23f",
        "low": "#7d9c58",
        "watch": "#6b8798",
    }
    fill = colors.get(severity, "#6b8798")
    return (
        f'<rect x="{x}" y="{y}" width="250" height="52" rx="6" fill="{fill}"/>'
        + svg_text(x + 18, y + 34, label, size=20, weight=800, fill="#ffffff")
    )


def build_risk_svg(package: dict[str, Any]) -> str:
    sk = package["provinces"]["SK"]
    ab = package["provinces"]["AB"]
    rows = [
        ("Flooding / standing water", ("High", "Watch", "Med-high")),
        ("Unseeded / reseed risk", ("High", "Medium", "Med-high")),
        ("Disease and insect scouting", ("Medium", "Medium", "Medium")),
        ("Spraying / field access delays", ("High", "Medium", "High")),
        ("Crop development lag", ("Medium", "High", "Medium")),
    ]
    severity_key = {"High": "high", "Med-high": "medium-high", "Medium": "medium", "Watch": "watch"}
    parts = [
        svg_header(1400, 900),
        '<rect width="1400" height="900" fill="#f7f4ec"/>',
        svg_text(70, 86, "What Matters In The Crop Reports", size=46, weight=800, fill="#1f2c22"),
        svg_text(72, 126, "Hazard matrix for MB, SK, AB. Built for a weekly repeatable crop-progress loop.", size=22, fill="#586257"),
        svg_text(430, 185, "Manitoba", size=28, weight=800),
        svg_text(710, 185, "Saskatchewan", size=28, weight=800),
        svg_text(1010, 185, "Alberta", size=28, weight=800),
    ]
    y = 220
    for title, severities in rows:
        parts.append(svg_text(70, y + 34, title, size=23, weight=800, fill="#293329"))
        for idx, sev in enumerate(severities):
            parts.append(risk_cell(400 + idx * 300, y, sev, severity_key[sev]))
        y += 82
    callouts = [
        "MB: South Interlake/Eastern flooding, Stonewall 233.8 mm in 24 hours, flooded fields and damaged roads.",
        f"SK: {fmt_pct(sk['seeded_pct'])} seeded, but east-central at {fmt_pct(sk['east_central_seeded_pct'])}; oilseeds {fmt_pct(sk['oilseeds_development_behind_pct'])} behind normal development.",
        f"AB: North West surface moisture {fmt_pct(ab['surface_excessive_pct'].get('North West'))} excessive; NW canola only {fmt_pct(ab['north_west_canola_good_excellent_pct'])} good-to-excellent.",
    ]
    parts.append('<rect x="70" y="675" width="1260" height="150" rx="8" fill="#ffffff" stroke="#d4d1c4"/>')
    parts.append(svg_text(100, 725, "Report language to use", size=30, weight=800, fill="#1f2c22"))
    parts.append(svg_multiline(100, 765, callouts, size=22, fill="#2f3a31", leading=31))
    parts.append("</svg>")
    return "\n".join(parts)


def build_index() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prairie Crop Progress Report</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f7f4ec; color: #1f2c22; }
    main { max-width: 1440px; margin: 0 auto; padding: 32px; }
    img { width: 100%; height: auto; display: block; margin: 24px 0; border: 1px solid #d4d1c4; }
    a { color: #385c4b; }
  </style>
</head>
<body>
  <main>
    <h1>Prairie Crop Progress Report</h1>
    <p><a href="report.md">Open report.md</a> | <a href="summary.json">Open summary.json</a></p>
    <img src="infographic-major-crops-prairies.svg" alt="Prairie major crop type watch">
    <img src="infographic-seeding-crop-progress.svg" alt="Prairie crop progress snapshot">
    <img src="infographic-risk-watch.svg" alt="Prairie crop risk watch">
    <img src="infographic-quality-saskatchewan.svg" alt="Saskatchewan crop quality watch">
    <img src="infographic-quality-alberta.svg" alt="Alberta crop quality watch">
  </main>
</body>
</html>
"""


def write_package(package: dict[str, Any], out_dir: Path) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale_name in ("infographic-quality-manitoba.svg", "infographic-quality-manitoba.preview.png"):
        stale_path = out_dir / stale_name
        if stale_path.exists():
            stale_path.unlink()
    files = {
        "summary_json": out_dir / "summary.json",
        "report_md": out_dir / "report.md",
        "major_crops_svg": out_dir / "infographic-major-crops-prairies.svg",
        "progress_svg": out_dir / "infographic-seeding-crop-progress.svg",
        "risk_svg": out_dir / "infographic-risk-watch.svg",
        "quality_sk_svg": out_dir / "infographic-quality-saskatchewan.svg",
        "quality_ab_svg": out_dir / "infographic-quality-alberta.svg",
        "index_html": out_dir / "index.html",
    }
    files["summary_json"].write_text(json.dumps(package, indent=2, sort_keys=True), encoding="utf-8")
    files["report_md"].write_text(build_markdown(package), encoding="utf-8")
    files["major_crops_svg"].write_text(build_major_crops_svg(package), encoding="utf-8")
    files["progress_svg"].write_text(build_progress_svg(package), encoding="utf-8")
    files["risk_svg"].write_text(build_risk_svg(package), encoding="utf-8")
    files["quality_sk_svg"].write_text(build_saskatchewan_quality_svg(package), encoding="utf-8")
    files["quality_ab_svg"].write_text(build_alberta_quality_svg(package), encoding="utf-8")
    files["index_html"].write_text(build_index(), encoding="utf-8")
    return {key: str(path) for key, path in files.items()}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "out_dir_positional",
        nargs="?",
        type=Path,
        help="Optional output directory, accepted for npm/PowerShell wrapper compatibility.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory. Defaults to output/prairie-crop-progress/YYYY-MM-DD-HHMMSS.",
    )
    parser.add_argument("--json", action="store_true", help="Print package summary JSON to stdout.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    package = evaluate()
    timestamp = dt.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    out_dir = args.out_dir or args.out_dir_positional or (DEFAULT_OUTPUT_ROOT / timestamp)
    files = write_package(package, out_dir)
    result = {
        "status": "success",
        "out_dir": str(out_dir),
        "files": files,
        "prairie_week_status": package["prairie_week_status"],
        "rows_parsed": package["rows_parsed"],
    }
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}), file=sys.stderr)
        raise SystemExit(1)
