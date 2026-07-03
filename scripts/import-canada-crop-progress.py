#!/usr/bin/env python3
"""
Import official Canadian provincial crop-progress reports into Supabase.

The importer keeps province-specific parsing separate, then normalizes every
observation into canada_crop_progress for map and thesis use.

Usage:
  python scripts/import-canada-crop-progress.py --dry-run
  python scripts/import-canada-crop-progress.py --province SK --dry-run
  python scripts/import-canada-crop-progress.py --province MB --force
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from source_run import SourceRunError, write_source_run

SUPABASE_TIMEOUT_SECONDS = 60
FETCH_TIMEOUT_SECONDS = 60

MANITOBA_REPORT_URL = (
    "https://www.gov.mb.ca/agriculture/crops/seasonal-reports/crop-report/"
    "pubs/crop-report-2026-05-05.pdf"
)
MANITOBA_PAGE_URL = (
    "https://www.gov.mb.ca/agriculture/crops/seasonal-reports/crop-report/index.html"
)

SASKATCHEWAN_PAGE_URL = (
    "https://www.saskatchewan.ca/business/agriculture-natural-resources-and-industry/"
    "agribusiness-farmers-and-ranchers/market-and-trade-statistics/crops-statistics/"
    "crop-report"
)
SASKATCHEWAN_REPORT_API_URL = (
    "https://publications.saskatchewan.ca/api/v1/products/128638/formats/154312/download"
)
SASKATCHEWAN_TABLE_API_URL = (
    "https://publications.saskatchewan.ca/api/v1/products/128627/formats/154300/download"
)

ALBERTA_PAGE_URL = "https://www.alberta.ca/alberta-crop-reports"
ALBERTA_DATASET_API_URL = (
    "https://open.alberta.ca/api/3/action/package_show"
    "?id=9af5b54d-f334-46ca-a0b1-23e560edb353"
)
ALBERTA_REPORT_URL = (
    "https://open.alberta.ca/dataset/9af5b54d-f334-46ca-a0b1-23e560edb353/"
    "resource/68be6127-e94a-444a-8f17-583af64c571a/download/"
    "agi-tedab-alberta-crop-report-2026-05-05.pdf"
)

PROVINCE_SOURCE_PAGES = {
    "MB": MANITOBA_PAGE_URL,
    "SK": SASKATCHEWAN_PAGE_URL,
    "AB": ALBERTA_PAGE_URL,
}

PROVINCE_RELEASE_SEQUENCE = ["MB", "SK", "AB"]

CANONICAL_GRAIN_MAP = {
    "Spring Wheat": "Spring Wheat",
    "Durum": "Durum",
    "Oats": "Oats",
    "Barley": "Barley",
    "Triticale": "Triticale",
    "Flax": "Flax",
    "Canola": "Canola",
    "Mustard": "Mustard",
    "Soybeans": "Soybeans",
    "Dry Peas": "Peas",
    "Lentils": "Lentils",
    "Field Peas": "Peas",
    "Canary Seed": "Canary Seed",
    "Chickpeas": "Chickpeas",
    "Corn": "Corn",
    "Potatoes": None,
    "Major Crops": None,
    "Perennial Forage": None,
    "All Crops": None,
}

SASKATCHEWAN_REGIONS = [
    ("SE", "South East"),
    ("SW", "South West"),
    ("EC", "East Central"),
    ("WC", "West Central"),
    ("NE", "North East"),
    ("NW", "North West"),
    ("PROV", "Provincial"),
]

SASKATCHEWAN_DEVELOPMENT_GROUPS = [
    ("Fall Cereals", "fall cereals"),
    ("Spring Cereals", "spring cereals"),
    ("Pulse Crops", "pulse crops"),
    ("Oilseeds", "oilseeds"),
    ("Perennial Forage", "perennial forage"),
    ("Annual Forage", "annual forage"),
]

ALBERTA_REGIONS = [
    ("SOUTH", "South"),
    ("CENTRAL", "Central"),
    ("NE", "North East"),
    ("NW", "North West"),
    ("PEACE", "Peace"),
    ("PROV", "Alberta"),
]

ALBERTA_REGION_LABELS = {label.lower(): (code, label) for code, label in ALBERTA_REGIONS}
ALBERTA_REGION_LABELS["north east"] = ("NE", "North East")
ALBERTA_REGION_LABELS["north west"] = ("NW", "North West")

MONTHS = {
    "January": 1,
    "February": 2,
    "March": 3,
    "April": 4,
    "May": 5,
    "June": 6,
    "July": 7,
    "August": 8,
    "September": 9,
    "October": 10,
    "November": 11,
    "December": 12,
}

WORD_NUMBERS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def env_value(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return None


def load_env_files() -> None:
    candidates = [
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
        Path.cwd().parent / ".env.local",
        Path.cwd().parent / ".env",
        Path.home() / ".hermes" / ".env",
    ]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            value = value.replace("\\n", "").replace("\\r", "")
            os.environ.setdefault(key, value)


def fetch_bytes(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "BushelBoardCropProgressImporter/1.0"},
    )
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SECONDS) as response:
        return response.read(), response.geturl()


def fetch_json(url: str) -> dict[str, Any]:
    payload, _ = fetch_bytes(url)
    data = json.loads(payload.decode("utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"Expected JSON object from {url}")
    return data


def pdf_to_text(url: str, *, layout: bool) -> tuple[str, str]:
    pdf_bytes, final_url = fetch_bytes(url)
    pdftotext = shutil.which("pdftotext")
    if not pdftotext:
        raise RuntimeError(
            "pdftotext was not found. Install Poppler or MiKTeX pdftotext before importing PDFs."
        )

    with tempfile.TemporaryDirectory(prefix="canada-crop-progress-") as tmp_dir:
        tmp = Path(tmp_dir)
        pdf_path = tmp / "source.pdf"
        txt_path = tmp / "source.txt"
        pdf_path.write_bytes(pdf_bytes)
        cmd = [pdftotext]
        if layout:
            cmd.append("-layout")
        cmd.extend([str(pdf_path), str(txt_path)])
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        return txt_path.read_text(encoding="utf-8", errors="replace"), final_url


def parse_report_date(label: str) -> str | None:
    match = re.search(
        r"\b("
        + "|".join(MONTHS)
        + r")\s+([0-9]{1,2}),\s+([0-9]{4})\b",
        label,
    )
    if not match:
        return None
    month, day, year = match.groups()
    return dt.date(int(year), MONTHS[month], int(day)).isoformat()


def latest_alberta_report_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "province": "AB",
        "source_page": ALBERTA_PAGE_URL,
        "dataset_api_url": ALBERTA_DATASET_API_URL,
        "report_url": ALBERTA_REPORT_URL,
        "discovery_status": "fallback_seed_url",
    }
    try:
        data = fetch_json(ALBERTA_DATASET_API_URL)
        result = data.get("result", {}) if isinstance(data.get("result"), dict) else {}
        resources = result.get("resources", [])
        candidates: list[dict[str, Any]] = []
        for resource in resources:
            if not isinstance(resource, dict):
                continue
            name = str(resource.get("name") or "")
            url = str(resource.get("url") or "")
            fmt = str(resource.get("format") or "").upper()
            if fmt != "PDF" or "crop reporting calendar" in name.lower():
                continue
            if "crop" not in name.lower():
                continue
            candidates.append(
                {
                    "name": name,
                    "url": url,
                    "report_date": parse_report_date(name),
                    "created": resource.get("created"),
                    "last_modified": resource.get("last_modified"),
                    "resource_id": resource.get("id"),
                }
            )
        dated = [item for item in candidates if item.get("report_date")]
        selected = (
            sorted(dated, key=lambda item: str(item.get("report_date") or ""))[-1]
            if dated
            else (candidates[-1] if candidates else None)
        )
        if selected:
            info.update(
                {
                    "report_url": selected["url"],
                    "report_date": selected.get("report_date"),
                    "resource_name": selected.get("name"),
                    "resource_id": selected.get("resource_id"),
                    "resource_created": selected.get("created"),
                    "resource_last_modified": selected.get("last_modified"),
                    "package_date_modified": result.get("date_modified"),
                    "candidate_count": len(candidates),
                    "discovery_status": "discovered_latest_resource",
                }
            )
    except Exception as exc:
        info["discovery_error"] = str(exc)
    return info


def latest_alberta_report_url() -> str:
    return str(latest_alberta_report_info()["report_url"])


def latest_manitoba_report_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "province": "MB",
        "source_page": MANITOBA_PAGE_URL,
        "report_url": MANITOBA_REPORT_URL,
        "discovery_status": "fallback_seed_url",
    }
    try:
        html = fetch_bytes(MANITOBA_PAGE_URL)[0].decode("utf-8", "ignore")
        links = re.findall(
            r'href="([^"]*crop-report-[0-9]{4}-[0-9]{2}-[0-9]{2}\.pdf)"',
            html,
            flags=re.IGNORECASE,
        )
        dated: list[tuple[str, str]] = []
        for href in links:
            match = re.search(r"crop-report-([0-9]{4}-[0-9]{2}-[0-9]{2})\.pdf", href)
            if match:
                dated.append((match.group(1), urllib.parse.urljoin(MANITOBA_PAGE_URL, href)))
        if dated:
            report_date, url = sorted(dated, key=lambda item: item[0])[-1]
            info.update(
                {
                    "report_url": url,
                    "report_date": report_date,
                    "candidate_count": len(dated),
                    "discovery_status": "discovered_latest_pdf_link",
                }
            )
    except Exception as exc:
        info["discovery_error"] = str(exc)
    return info


def latest_manitoba_report_url() -> str:
    return str(latest_manitoba_report_info()["report_url"])


def latest_saskatchewan_links_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "province": "SK",
        "source_page": SASKATCHEWAN_PAGE_URL,
        "report_url": SASKATCHEWAN_REPORT_API_URL,
        "table_url": SASKATCHEWAN_TABLE_API_URL,
        "discovery_status": "fallback_product_format_urls",
    }
    try:
        html = fetch_bytes(SASKATCHEWAN_PAGE_URL)[0].decode("utf-8", "ignore")
        link_matches = re.finditer(
            r'href="([^"]+)"[^>]*>([^<]+)',
            html,
            flags=re.IGNORECASE,
        )
        report_url = None
        table_url = None
        discovered_labels: list[str] = []
        for match in link_matches:
            href = match.group(1).replace(":443", "")
            text = re.sub(r"\s+", " ", match.group(2)).strip().lower()
            absolute = urllib.parse.urljoin(SASKATCHEWAN_PAGE_URL, href)
            if text == "download crop report":
                report_url = absolute
                discovered_labels.append(text)
            elif text == "seeding progress table":
                table_url = absolute
                discovered_labels.append(text)
        info.update(
            {
                "report_url": report_url or SASKATCHEWAN_REPORT_API_URL,
                "table_url": table_url or SASKATCHEWAN_TABLE_API_URL,
                "discovered_labels": discovered_labels,
                "discovery_status": "discovered_page_links" if report_url or table_url else "fallback_product_format_urls",
            }
        )
    except Exception as exc:
        info["discovery_error"] = str(exc)
    return info


def latest_saskatchewan_links() -> tuple[str, str]:
    info = latest_saskatchewan_links_info()
    return str(info["report_url"]), str(info["table_url"])


def pct(value: str) -> float | None:
    cleaned = value.strip()
    if not cleaned or cleaned.lower().startswith("no response"):
        return None
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*%", cleaned)
    return float(match.group(1)) if match else None


def number_word_or_digits(value: str) -> float | None:
    cleaned = value.strip().lower()
    if cleaned in WORD_NUMBERS:
        return float(WORD_NUMBERS[cleaned])
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)", cleaned)
    return float(match.group(1)) if match else None


def percent_series_between(text: str, start_label: str, end_label: str) -> list[float]:
    pattern = rf"{re.escape(start_label)}\s+(.*?){re.escape(end_label)}"
    match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return []
    return [float(value) for value in re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*%", match.group(1))]


def percent_series_on_line(text: str, label: str) -> list[float]:
    for line in text.splitlines():
        if label.lower() in line.lower():
            return [float(value) for value in re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*%", line)]
    return []


def values_from_table_line(line: str, expected_count: int) -> tuple[str, list[float | None]] | None:
    tokens = list(re.finditer(r"(?<![0-9])(?:[0-9]+(?:\.[0-9]+)?%|-)", line))
    if len(tokens) != expected_count:
        return None
    label = line[: tokens[0].start()].strip()
    values: list[float | None] = []
    for token in tokens:
        raw = token.group(0)
        values.append(None if raw == "-" else float(raw.rstrip("%")))
    return label, values


def sum_present_percentages(values: list[float | None], indexes: list[int]) -> float | None:
    selected = [values[idx] for idx in indexes if idx < len(values)]
    if not selected or any(value is None for value in selected):
        return None
    return round(sum(value for value in selected if value is not None), 2)


def table_text_between(text: str, heading_pattern: str) -> str | None:
    heading = re.search(heading_pattern, text, flags=re.IGNORECASE)
    if not heading:
        return None
    table_start = heading.start()
    table_end = text.find("Source: AGI/AFSC Crop Reporting Survey", table_start)
    if table_end <= table_start:
        return None
    return text[table_start:table_end]


def parse_alberta_metric_table(
    text: str,
    *,
    heading_pattern: str,
    expected_count: int,
    metric: str,
    value_indexes: list[int],
    report_date: str,
    release_date: str | None,
    document_url: str,
    source_excerpt: str,
) -> list[dict[str, Any]]:
    table_text = table_text_between(text, heading_pattern)
    if not table_text:
        return []

    rows_by_region: dict[str, float | None] = {}
    five_year_by_region: dict[str, float | None] = {}

    for line in table_text.splitlines():
        parsed = values_from_table_line(line, expected_count=expected_count)
        if not parsed:
            continue
        raw_label, values = parsed
        label = re.sub(r"\s+", " ", raw_label).strip()
        value = sum_present_percentages(values, value_indexes)

        if label.startswith("5-year"):
            five_year_by_region["PROV"] = value
            continue
        if label.startswith("10-year"):
            continue

        region = ALBERTA_REGION_LABELS.get(label.lower())
        if not region:
            continue
        region_code, _region_name = region
        rows_by_region[region_code] = value

    rows: list[dict[str, Any]] = []
    for region_code, region_name in ALBERTA_REGIONS:
        if region_code not in rows_by_region:
            continue
        value = rows_by_region[region_code]
        rows.append(
            make_row(
                province_code="AB",
                province_name="Alberta",
                crop_year=2026,
                report_date=report_date,
                release_date=release_date,
                period_start=None,
                period_end=report_date,
                report_label=f"Alberta Crop Report - {report_date}",
                source_name="Alberta Crop Report",
                source_url=ALBERTA_PAGE_URL,
                document_url=document_url,
                region_scope="province" if region_code == "PROV" else "crop_region",
                region_code=region_code,
                region_name="Alberta" if region_code == "PROV" else region_name,
                crop_name="All Crops",
                metric=metric,
                value_pct=value,
                five_year_avg_pct=five_year_by_region.get(region_code),
                source_excerpt=source_excerpt,
                confidence="high" if value is not None else "medium",
                quality_flags=[] if value is not None else ["region_not_reported"],
            )
        )

    return rows


def parse_alberta_emergence_rows(
    text: str,
    *,
    report_date: str,
    release_date: str | None,
    document_url: str,
) -> list[dict[str, Any]]:
    provincial = re.search(
        r"Provincial emergence of major crops.*?reported at\s+([0-9]+(?:\.[0-9]+)?)\s+per cent.*?5-year average of\s+([0-9]+(?:\.[0-9]+)?)\s+per cent",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    regional = re.search(
        r"South Region.*?at\s+([0-9]+(?:\.[0-9]+)?)\s+\(([0-9]+(?:\.[0-9]+)?)\)\s+per cent.*?"
        r"Central at\s+([0-9]+(?:\.[0-9]+)?)\s+\(([0-9]+(?:\.[0-9]+)?)\)\s+per cent.*?"
        r"North East at\s+([0-9]+(?:\.[0-9]+)?)\s+\(([0-9]+(?:\.[0-9]+)?)\).*?"
        r"North West at\s+([0-9]+(?:\.[0-9]+)?)\s+\(([0-9]+(?:\.[0-9]+)?)\).*?"
        r"Peace at\s+([0-9]+(?:\.[0-9]+)?)\s+\(([0-9]+(?:\.[0-9]+)?)\)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not provincial and not regional:
        return []

    values_by_region: dict[str, tuple[float, float | None]] = {}
    if regional:
        groups = [float(value) for value in regional.groups()]
        region_codes = ["SOUTH", "CENTRAL", "NE", "NW", "PEACE"]
        for idx, region_code in enumerate(region_codes):
            values_by_region[region_code] = (groups[idx * 2], groups[idx * 2 + 1])
    if provincial:
        values_by_region["PROV"] = (float(provincial.group(1)), float(provincial.group(2)))

    rows: list[dict[str, Any]] = []
    for region_code, region_name in ALBERTA_REGIONS:
        values = values_by_region.get(region_code)
        if not values:
            continue
        value, five_year_avg = values
        rows.append(
            make_row(
                province_code="AB",
                province_name="Alberta",
                crop_year=2026,
                report_date=report_date,
                release_date=release_date,
                period_start=None,
                period_end=report_date,
                report_label=f"Alberta Crop Report - {report_date}",
                source_name="Alberta Crop Report",
                source_url=ALBERTA_PAGE_URL,
                document_url=document_url,
                region_scope="province" if region_code == "PROV" else "crop_region",
                region_code=region_code,
                region_name="Alberta" if region_code == "PROV" else region_name,
                crop_name="All Crops",
                metric="emerged_pct",
                value_pct=value,
                five_year_avg_pct=five_year_avg,
                source_excerpt=f"Alberta narrative emergence summary as of {report_date}.",
                confidence="high",
            )
        )

    return rows


def parse_alberta_condition_rows(
    text: str,
    *,
    report_date: str,
    release_date: str | None,
    document_url: str,
) -> list[dict[str, Any]]:
    table_text = table_text_between(
        text,
        r"Table 1:\s+Regional\s+Crop\s+Condition\s+Ratings",
    )
    if not table_text:
        return []

    parsed_rows: dict[str, list[float | None]] = {}
    five_year_all_crops: list[float | None] | None = None

    for line in table_text.splitlines():
        parsed = values_from_table_line(line, expected_count=6)
        if not parsed:
            continue
        raw_label, values = parsed
        cleaned = raw_label.replace("âˆ—", "*")
        cleaned = re.sub(r"\s+\*", "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned.startswith("5-year"):
            five_year_all_crops = values
            continue
        if cleaned.startswith("10-year"):
            continue
        if cleaned.startswith("Major Crops"):
            crop_name = "Major Crops"
        elif cleaned.startswith("All Crops"):
            crop_name = "All Crops"
        else:
            crop_name = clean_alberta_crop_label(cleaned)
        parsed_rows[crop_name] = values

    rows: list[dict[str, Any]] = []
    for crop_name, values in parsed_rows.items():
        for idx, ((region_code, region_name), value) in enumerate(zip(ALBERTA_REGIONS, values)):
            five_year_avg = (
                five_year_all_crops[idx]
                if crop_name == "All Crops" and five_year_all_crops and idx < len(five_year_all_crops)
                else None
            )
            rows.append(
                make_row(
                    province_code="AB",
                    province_name="Alberta",
                    crop_year=2026,
                    report_date=report_date,
                    release_date=release_date,
                    period_start=None,
                    period_end=report_date,
                    report_label=f"Alberta Crop Report - {report_date}",
                    source_name="Alberta Crop Report",
                    source_url=ALBERTA_PAGE_URL,
                    document_url=document_url,
                    region_scope="province" if region_code == "PROV" else "crop_region",
                    region_code=region_code,
                    region_name="Alberta" if region_code == "PROV" else region_name,
                    crop_name=crop_name,
                    metric="condition_good_excellent_pct",
                    value_pct=value,
                    five_year_avg_pct=five_year_avg,
                    source_excerpt=f"Table 1: Alberta Regional Crop Condition Ratings as of {report_date}.",
                    confidence="high" if value is not None else "medium",
                    quality_flags=[] if value is not None else ["region_not_reported"],
                )
            )

    return rows


def parse_alberta_narrative_seeding_rows(
    text: str,
    *,
    report_date: str,
    release_date: str | None,
    document_url: str,
) -> list[dict[str, Any]]:
    paragraph_match = re.search(
        r"Provincial seeding progress of major crops.*?(?:\n\s*\n|Provincial emergence|Table\s+1:)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not paragraph_match:
        return []

    paragraph = re.sub(r"\s+", " ", paragraph_match.group(0)).strip()
    province_match = re.search(
        r"Provincial seeding progress of major crops has reached\s+([0-9]+(?:\.[0-9]+)?)\s+per cent"
        r".*?5-year average of\s+([0-9]+(?:\.[0-9]+)?)\s+per cent",
        paragraph,
        flags=re.IGNORECASE,
    )
    if not province_match:
        return []

    values_by_region: dict[str, tuple[float, float | None]] = {
        "PROV": (float(province_match.group(1)), float(province_match.group(2)))
    }

    for value, five_year_avg, raw_region in re.findall(
        r"([0-9]+(?:\.[0-9]+)?)\s+\(([0-9]+(?:\.[0-9]+)?)\)\s+per\s+cent\s+in\s+the\s+(\w+(?:\s+\w+)?)\s+Region",
        paragraph,
        flags=re.IGNORECASE,
    ):
        region = ALBERTA_REGION_LABELS.get(raw_region.lower())
        if not region:
            continue
        region_code, _region_name = region
        values_by_region[region_code] = (float(value), float(five_year_avg))

    rows: list[dict[str, Any]] = []
    for region_code, region_name in ALBERTA_REGIONS:
        values = values_by_region.get(region_code)
        if not values:
            continue
        value, five_year_avg = values
        rows.append(
            make_row(
                province_code="AB",
                province_name="Alberta",
                crop_year=2026,
                report_date=report_date,
                release_date=release_date,
                period_start=None,
                period_end=report_date,
                report_label=f"Alberta Crop Report - {report_date}",
                source_name="Alberta Crop Report",
                source_url=ALBERTA_PAGE_URL,
                document_url=document_url,
                region_scope="province" if region_code == "PROV" else "crop_region",
                region_code=region_code,
                region_name="Alberta" if region_code == "PROV" else region_name,
                crop_name="All Crops",
                metric="seeded_pct",
                value_pct=value,
                five_year_avg_pct=five_year_avg,
                source_excerpt=f"Alberta narrative seeding progress summary as of {report_date}.",
                confidence="high",
            )
        )

    return rows


def parse_saskatchewan_topsoil_moisture_rows(
    text: str,
    *,
    period_start: str,
    period_end: str,
    release_date: str,
    report_label: str,
    document_url: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    moisture_blocks = [
        ("Cropland", "cropland"),
        ("Hayland", "hayland"),
        ("Pasture", "pasture"),
    ]

    for crop_name, label in moisture_blocks:
        match = re.search(
            rf"{label}\s+topsoil\s+moisture\s+is:\s*(.*?)(?=(?:cropland|hayland|pasture)\s+topsoil\s+moisture\s+is:|Crop development|For further information|$)",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if not match:
            continue

        values: dict[str, float] = {}
        for raw_value, raw_category in re.findall(
            r"([A-Za-z0-9.]+)\s+per\s+cent\s+([A-Za-z ]+?)(?=;|\.|\n|$)",
            match.group(1),
            flags=re.IGNORECASE,
        ):
            value = number_word_or_digits(raw_value)
            category = raw_category.lower().replace("and", "").strip()
            if value is not None:
                values[category] = value

        if "surplus" not in values or "adequate" not in values:
            continue

        rows.append(
            make_row(
                province_code="SK",
                province_name="Saskatchewan",
                crop_year=2026,
                report_date=period_end,
                release_date=release_date,
                period_start=period_start,
                period_end=period_end,
                report_label=report_label,
                source_name="Saskatchewan Crop Report",
                source_url=SASKATCHEWAN_PAGE_URL,
                document_url=document_url,
                region_scope="province",
                region_code="PROV",
                region_name="Saskatchewan",
                crop_name=crop_name,
                metric="soil_moisture_adequate_surplus_pct",
                value_pct=round(values["surplus"] + values["adequate"], 2),
                source_excerpt=(
                    f"Saskatchewan {label} topsoil moisture for period ending {period_end}; "
                    "value is surplus plus adequate."
                ),
                confidence="high",
            )
        )

    return rows


def crop_group_segment(text: str, label: str, labels: list[str]) -> str | None:
    match = re.search(rf"\b{re.escape(label)}\b", text, flags=re.IGNORECASE)
    if not match:
        return None
    segment_end = len(text)
    for next_label in labels:
        if next_label == label:
            continue
        next_match = re.search(
            rf"\b{re.escape(next_label)}\b",
            text[match.end() :],
            flags=re.IGNORECASE,
        )
        if next_match:
            segment_end = min(segment_end, match.end() + next_match.start())
    end_marker = re.search(r"For further information", text[match.end() :], flags=re.IGNORECASE)
    if end_marker:
        segment_end = min(segment_end, match.end() + end_marker.start())
    return text[match.start() : segment_end]


def parse_saskatchewan_development_rows(
    text: str,
    *,
    period_start: str,
    period_end: str,
    release_date: str,
    report_label: str,
    document_url: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    labels = [label for _crop_name, label in SASKATCHEWAN_DEVELOPMENT_GROUPS]
    scoped_match = re.search(r"Crop development varies", text, flags=re.IGNORECASE)
    if not scoped_match:
        return rows
    scoped_text = text[scoped_match.start() :]
    end_match = re.search(r"For further information", scoped_text, flags=re.IGNORECASE)
    if end_match:
        scoped_text = scoped_text[: end_match.start()]

    for crop_name, label in SASKATCHEWAN_DEVELOPMENT_GROUPS:
        segment = crop_group_segment(scoped_text, label, labels)
        if not segment:
            continue

        values: dict[str, float] = {}
        normal_match = re.search(
            r"([A-Za-z0-9.]+)\s+per\s+cent\s+(?:at\s+)?(?:of\s+(?:their\s+)?)?normal",
            segment,
            flags=re.IGNORECASE,
        )
        ahead_match = re.search(
            r"([A-Za-z0-9.]+)\s+per\s+cent\s+ahead",
            segment,
            flags=re.IGNORECASE,
        )
        behind_match = re.search(
            r"([A-Za-z0-9.]+)\s+per\s+cent\s+behind",
            segment,
            flags=re.IGNORECASE,
        )

        if normal_match:
            value = number_word_or_digits(normal_match.group(1))
            if value is not None:
                values["development_normal_pct"] = value
        if ahead_match:
            value = number_word_or_digits(ahead_match.group(1))
            if value is not None:
                values["development_ahead_pct"] = value
        if behind_match:
            value = number_word_or_digits(behind_match.group(1))
            if value is not None:
                values["development_behind_pct"] = value

        for metric, value in values.items():
            rows.append(
                make_row(
                    province_code="SK",
                    province_name="Saskatchewan",
                    crop_year=2026,
                    report_date=period_end,
                    release_date=release_date,
                    period_start=period_start,
                    period_end=period_end,
                    report_label=report_label,
                    source_name="Saskatchewan Crop Report",
                    source_url=SASKATCHEWAN_PAGE_URL,
                    document_url=document_url,
                    region_scope="province",
                    region_code="PROV",
                    region_name="Saskatchewan",
                    crop_name=crop_name,
                    metric=metric,
                    value_pct=value,
                    source_excerpt=(
                        f"Saskatchewan {label} crop development for period ending {period_end}; "
                        f"metric is {metric.replace('_', ' ')}."
                    ),
                    confidence="high",
                )
            )

    return rows


def clean_alberta_crop_label(label: str) -> str:
    cleaned = label.replace("∗", "*")
    cleaned = re.sub(r"\s+\*", "", cleaned)
    cleaned = re.sub(r"\s*,\s*(?:" + "|".join(MONTHS) + r")\s+[0-9]+$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    if cleaned.startswith("Major Crops"):
        return "All Crops"
    if cleaned.startswith("All Crops"):
        return "All Crops"
    if cleaned.startswith("5-year"):
        return "5-year All Crops"
    if cleaned.startswith("10-year"):
        return "10-year All Crops"
    return cleaned.strip()


def make_row(
    *,
    province_code: str,
    province_name: str,
    crop_year: int,
    report_date: str,
    release_date: str | None,
    period_start: str | None,
    period_end: str | None,
    report_label: str,
    source_name: str,
    source_url: str,
    document_url: str,
    region_scope: str,
    region_code: str,
    region_name: str,
    crop_name: str,
    metric: str,
    value_pct: float | None,
    previous_year_pct: float | None = None,
    five_year_avg_pct: float | None = None,
    source_excerpt: str | None = None,
    confidence: str = "high",
    quality_flags: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "province_code": province_code,
        "province_name": province_name,
        "crop_year": crop_year,
        "report_date": report_date,
        "release_date": release_date,
        "period_start": period_start,
        "period_end": period_end,
        "report_label": report_label,
        "source_name": source_name,
        "source_url": source_url,
        "document_url": document_url,
        "region_scope": region_scope,
        "region_code": region_code,
        "region_name": region_name,
        "crop_name": crop_name,
        "canonical_grain": CANONICAL_GRAIN_MAP.get(crop_name),
        "metric": metric,
        "value_pct": value_pct,
        "previous_year_pct": previous_year_pct,
        "five_year_avg_pct": five_year_avg_pct,
        "unit": "percent",
        "source_excerpt": source_excerpt,
        "confidence": confidence,
        "quality_flags": quality_flags or [],
        "updated_at": utc_now(),
    }


def parse_manitoba() -> tuple[list[dict[str, Any]], str]:
    report_url = latest_manitoba_report_url()
    text, document_url = pdf_to_text(report_url, layout=True)
    report_date = (
        re.search(r"crop-report-([0-9]{4}-[0-9]{2}-[0-9]{2})\.pdf", document_url).group(1)
        if re.search(r"crop-report-([0-9]{4}-[0-9]{2}-[0-9]{2})\.pdf", document_url)
        else "2026-05-05"
    )
    chart_start = text.find("<May 1st")
    chart_end = text.find("Calendar Week by Date", chart_start)
    chart_text = text[chart_start:chart_end] if chart_start >= 0 and chart_end > chart_start else text
    current = percent_series_on_line(chart_text, "2026") or percent_series_between(chart_text, "2026", "2025")
    previous = percent_series_on_line(chart_text, "2025") or percent_series_between(chart_text, "2025", "5-Year Average")
    average = percent_series_on_line(chart_text, "5-Year Average") or percent_series_between(chart_text, "5-Year Average", "09-Jun")

    seeded = current[-1] if current else None
    previous_seeded = previous[len(current) - 1] if current and len(previous) >= len(current) else None
    average_seeded = average[len(current) - 1] if current and len(average) >= len(current) else None

    if seeded is None:
        match = re.search(
            r"approximately\s+([0-9]+(?:\.[0-9]+)?)\s*%\s+of\s+seeding\s+completed",
            text,
            flags=re.IGNORECASE,
        )
        seeded = float(match.group(1)) if match else None

    rows = [
        make_row(
            province_code="MB",
            province_name="Manitoba",
            crop_year=2026,
            report_date=report_date,
            release_date=report_date,
            period_start=None,
            period_end=report_date,
            report_label=f"Crop Report - {report_date}",
            source_name="Manitoba Agriculture Crop Report",
            source_url=MANITOBA_PAGE_URL,
            document_url=document_url,
            region_scope="province",
            region_code="PROV",
            region_name="Manitoba",
            crop_name="All Crops",
            metric="seeded_pct",
            value_pct=seeded,
            previous_year_pct=previous_seeded,
            five_year_avg_pct=average_seeded,
            source_excerpt=(
                f"Seeding Progression in 2026 Compared to Previous Years chart shows "
                f"{seeded:.0f}% seeded as of {report_date}."
                if seeded is not None
                else "Seeding Progression in 2026 Compared to Previous Years chart."
            ),
            confidence="high",
        )
    ]
    return rows, document_url


def parse_saskatchewan() -> tuple[list[dict[str, Any]], str]:
    report_link, table_link = latest_saskatchewan_links()
    text, document_url = pdf_to_text(table_link, layout=True)
    report_text, report_url = pdf_to_text(report_link, layout=False)
    rows: list[dict[str, Any]] = []

    period_match = re.search(
        r"For the Period\s+([A-Za-z]+)\s+([0-9]{1,2})\s+to\s+([A-Za-z]+)\s+([0-9]{1,2}),\s+([0-9]{4})",
        report_text,
    )
    if period_match:
        start_month, start_day, end_month, end_day, year = period_match.groups()
        period_start = dt.date(int(year), MONTHS[start_month], int(start_day)).isoformat()
        period_end = dt.date(int(year), MONTHS[end_month], int(end_day)).isoformat()
    else:
        period_start = "2026-04-28"
        period_end = "2026-05-04"

    release_match = re.search(r"Report number\s+[0-9]+,\s+([A-Za-z]+ [0-9]{1,2}, [0-9]{4})", report_text)
    release_date = parse_report_date(release_match.group(1)) if release_match else "2026-05-07"
    report_label = f"Crop Report - {release_date}"

    all_crop_match = re.search(
        r"(?:Currently,\s+|Seeding\s+progress\s+reached\s+|Seeding\s+is\s+)([A-Za-z0-9.]+)\s+per\s+cent(?:\s+complete)?(?:\s+across\s+Saskatchewan)?[,.\s-]+.*?five-(?:\s+and\s+ten-)?year\s+average\s+of\s+([A-Za-z0-9.]+)",
        report_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    previous_year_match = re.search(
        r"One\s+year\s+ago.*?seeding\s+now\s+([0-9]+(?:\.[0-9]+)?)\s+per\s+cent",
        report_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if all_crop_match:
        value = number_word_or_digits(all_crop_match.group(1))
        five_year_avg = number_word_or_digits(all_crop_match.group(2))
        previous_year = float(previous_year_match.group(1)) if previous_year_match else None
        rows.append(
            make_row(
                province_code="SK",
                province_name="Saskatchewan",
                crop_year=2026,
                report_date=period_end,
                release_date=release_date,
                period_start=period_start,
                period_end=period_end,
                report_label=report_label,
                source_name="Saskatchewan Crop Report",
                source_url=SASKATCHEWAN_PAGE_URL,
                document_url=report_url,
                region_scope="province",
                region_code="PROV",
                region_name="Saskatchewan",
                crop_name="All Crops",
                metric="seeded_pct",
                value_pct=value,
                previous_year_pct=previous_year,
                five_year_avg_pct=five_year_avg,
                source_excerpt=(
                    f"Saskatchewan crop report says seeding progress reached {value:g}% "
                    f"for the period ending {period_end}, compared with the five-year "
                    f"average of {five_year_avg:g}%."
                ),
                confidence="high",
            )
        )

    rows.extend(
        parse_saskatchewan_topsoil_moisture_rows(
            report_text,
            period_start=period_start,
            period_end=period_end,
            release_date=release_date,
            report_label=report_label,
            document_url=report_url,
        )
    )
    rows.extend(
        parse_saskatchewan_development_rows(
            report_text,
            period_start=period_start,
            period_end=period_end,
            release_date=release_date,
            report_label=report_label,
            document_url=report_url,
        )
    )

    in_table = False

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if "Provincial" in line and "South East" in line:
            in_table = True
            continue
        if not in_table:
            continue
        if not line.strip() or line.startswith("\f"):
            if rows:
                break
            continue

        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) != 8:
            continue

        crop_name = parts[0].strip()
        values = parts[1:]
        for (region_code, region_name), raw_value in zip(SASKATCHEWAN_REGIONS, values):
            value = pct(raw_value)
            quality_flags = []
            if value is None and "No Response" in raw_value:
                quality_flags.append("no_regional_response")
            rows.append(
                make_row(
                    province_code="SK",
                    province_name="Saskatchewan",
                    crop_year=2026,
                    report_date=period_end,
                    release_date=release_date,
                    period_start=period_start,
                    period_end=period_end,
                    report_label=report_label,
                    source_name="Saskatchewan Crop Report",
                    source_url=SASKATCHEWAN_PAGE_URL,
                    document_url=document_url,
                    region_scope="province" if region_code == "PROV" else "crop_region",
                    region_code=region_code,
                    region_name="Saskatchewan" if region_code == "PROV" else region_name,
                    crop_name=crop_name,
                    metric="seeded_pct",
                    value_pct=value,
                    source_excerpt=(
                        f"Regional Seeding Progress by Crop Type table, period "
                        f"{period_start} to {period_end}."
                    ),
                    confidence="high",
                    quality_flags=quality_flags,
                )
            )

    if not rows:
        raise RuntimeError("Could not parse Saskatchewan regional crop-progress table.")
    return rows, document_url


def parse_alberta(alberta_url: str | None = None) -> tuple[list[dict[str, Any]], str]:
    report_url = alberta_url or latest_alberta_report_url()
    text, document_url = pdf_to_text(report_url, layout=True)

    report_date = (
        parse_report_date(
            re.search(r"Crop conditions as of ([A-Za-z]+ [0-9]{1,2}, [0-9]{4})", text).group(1)
        )
        if re.search(r"Crop conditions as of ([A-Za-z]+ [0-9]{1,2}, [0-9]{4})", text)
        else "2026-05-05"
    )
    release_date = (
        parse_report_date(
            re.search(r"©2026 Government of Alberta \| ([A-Za-z]+ [0-9]{1,2}, [0-9]{4})", text).group(1)
        )
        if re.search(r"©2026 Government of Alberta \| ([A-Za-z]+ [0-9]{1,2}, [0-9]{4})", text)
        else None
    )

    if release_date is None:
        release_match = re.search(
            r"Government of Alberta \|\s+([A-Za-z]+ [0-9]{1,2}, [0-9]{4})",
            text,
        )
        release_date = parse_report_date(release_match.group(1)) if release_match else None

    table_heading = re.search(
        r"Table 1:\s+Alberta(?:\s+Major\s+Crop)?\s+Seeding\s+Progress",
        text,
    )
    table_start = table_heading.start() if table_heading else -1
    table_end = text.find("Source: AGI/AFSC Crop Reporting Survey", table_start)
    rows: list[dict[str, Any]] = []

    if table_heading:
        if table_end <= table_start:
            raise RuntimeError("Could not locate Alberta Table 1 seeding progress.")

        table_text = text[table_start:table_end]
        parsed_rows: dict[str, list[float | None]] = {}
        five_year_all_crops: list[float | None] | None = None

        for line in table_text.splitlines():
            parsed = values_from_table_line(line, expected_count=6)
            if not parsed:
                continue
            raw_label, values = parsed

            # If the label has a date, ensure it matches the report_date
            date_in_label = re.search(r"([A-Za-z]+)\s+([0-9]{1,2})", raw_label)
            if date_in_label:
                month_str, day_str = date_in_label.groups()
                if month_str in MONTHS:
                    report_year = report_date.split("-")[0]
                    label_date = f"{month_str} {day_str}, {report_year}"
                    parsed_label_date = parse_report_date(label_date)
                    if parsed_label_date and parsed_label_date != report_date:
                        # Skip historical date rows (e.g. previous week)
                        continue

            crop_name = clean_alberta_crop_label(raw_label)
            if crop_name.startswith("5-year All Crops"):
                five_year_all_crops = values
                continue
            if crop_name.startswith("10-year All Crops"):
                continue
            parsed_rows[crop_name] = values

        if not parsed_rows:
            raise RuntimeError("Could not parse Alberta Table 1 crop rows.")

        for crop_name, values in parsed_rows.items():
            for idx, ((region_code, region_name), value) in enumerate(zip(ALBERTA_REGIONS, values)):
                five_year_avg = (
                    five_year_all_crops[idx]
                    if crop_name == "All Crops" and five_year_all_crops and idx < len(five_year_all_crops)
                    else None
                )
                rows.append(
                    make_row(
                        province_code="AB",
                        province_name="Alberta",
                        crop_year=2026,
                        report_date=report_date,
                        release_date=release_date,
                        period_start=None,
                        period_end=report_date,
                        report_label=f"Alberta Crop Report - {report_date}",
                        source_name="Alberta Crop Report",
                        source_url=ALBERTA_PAGE_URL,
                        document_url=document_url,
                        region_scope="province" if region_code == "PROV" else "crop_region",
                        region_code=region_code,
                        region_name="Alberta" if region_code == "PROV" else region_name,
                        crop_name=crop_name,
                        metric="seeded_pct",
                        value_pct=value,
                        five_year_avg_pct=five_year_avg,
                        source_excerpt=f"Table 1: Alberta Seeding Progress as of {report_date}.",
                        confidence="high" if value is not None else "medium",
                        quality_flags=[] if value is not None else ["region_not_reported"],
                    )
                )
    else:
        rows.extend(
            parse_alberta_narrative_seeding_rows(
                text,
                report_date=report_date,
                release_date=release_date,
                document_url=document_url,
            )
        )
        rows.extend(
            parse_alberta_condition_rows(
                text,
                report_date=report_date,
                release_date=release_date,
                document_url=document_url,
            )
        )
        if not rows:
            raise RuntimeError(
                "Could not locate Alberta Table 1 seeding progress, narrative seeding progress, "
                "or crop condition ratings."
            )

    rows.extend(
        parse_alberta_emergence_rows(
            text,
            report_date=report_date,
            release_date=release_date,
            document_url=document_url,
        )
    )
    rows.extend(
        parse_alberta_metric_table(
            text,
            heading_pattern=r"Table 2:\s+Alberta Surface Soil.*?Moisture Ratings",
            expected_count=5,
            metric="soil_moisture_adequate_surplus_pct",
            value_indexes=[2, 3, 4],
            report_date=report_date,
            release_date=release_date,
            document_url=document_url,
            source_excerpt=f"Table 2: Alberta Surface Soil Moisture Ratings as of {report_date}; value is good plus excellent plus excessive.",
        )
    )
    rows.extend(
        parse_alberta_metric_table(
            text,
            heading_pattern=r"Table 3:\s+(?:Alberta\s+)?Pasture Growth Conditions",
            expected_count=4,
            metric="pasture_good_excellent_pct",
            value_indexes=[2, 3],
            report_date=report_date,
            release_date=release_date,
            document_url=document_url,
            source_excerpt=f"Table 3: Pasture Growth Conditions as of {report_date}; value is good plus excellent.",
        )
    )

    return rows, document_url


def source_discovery_for_province(province: str, *, alberta_url: str | None = None) -> dict[str, Any]:
    if province == "MB":
        return latest_manitoba_report_info()
    if province == "SK":
        return latest_saskatchewan_links_info()
    if province == "AB":
        info = latest_alberta_report_info()
        if alberta_url:
            info.update(
                {
                    "report_url": alberta_url,
                    "override_url": alberta_url,
                    "discovery_status": "override_url",
                }
            )
        return info
    raise ValueError(f"Unsupported province: {province}")


def validate_missing_provinces(provinces: list[str], missing_provinces: list[str]) -> None:
    parsed = set(provinces)
    missing = set(missing_provinces)
    overlap = parsed & missing
    if overlap:
        joined = ", ".join(sorted(overlap))
        raise ValueError(f"missing_province cannot also be collected: {joined}")


def prairie_week_status(provinces: list[str], *, missing_provinces: list[str] | None = None) -> str:
    parsed = set(provinces)
    missing = set(missing_provinces or [])
    validate_missing_provinces(provinces, sorted(missing))
    accounted = parsed | missing
    if missing and set(PROVINCE_RELEASE_SEQUENCE).issubset(accounted):
        return "complete_with_missing_province"
    if set(PROVINCE_RELEASE_SEQUENCE).issubset(parsed):
        return "complete_mb_sk_ab"
    if {"MB", "SK"}.issubset(parsed):
        return "partial_mb_sk"
    if "MB" in parsed:
        return "partial_mb_only"
    return "partial_prairie_week"


def province_source_url(provinces: list[str]) -> str:
    if len(provinces) == 1:
        return PROVINCE_SOURCE_PAGES[provinces[0]]
    return ",".join(PROVINCE_SOURCE_PAGES[province] for province in PROVINCE_RELEASE_SEQUENCE if province in provinces)


def collect(provinces: list[str], *, alberta_url: str | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []

    for province in provinces:
        discovery = source_discovery_for_province(province, alberta_url=alberta_url)
        if province == "MB":
            province_rows, source_url = parse_manitoba()
        elif province == "SK":
            province_rows, source_url = parse_saskatchewan()
        elif province == "AB":
            province_rows, source_url = parse_alberta(alberta_url)
        else:
            raise ValueError(f"Unsupported province: {province}")

        rows.extend(province_rows)
        summaries.append(
            {
                "province": province,
                "source_url": source_url,
                "rows": len(province_rows),
                "status": "parsed",
                "discovery": discovery,
            }
        )

    return rows, summaries


def upsert_rows(rows: list[dict[str, Any]], supabase_url: str, service_key: str) -> list[dict[str, Any]]:
    if not rows:
        return []

    conflict_cols = ",".join(
        [
            "province_code",
            "crop_year",
            "report_date",
            "region_scope",
            "region_code",
            "crop_name",
            "metric",
        ]
    )
    url = (
        f"{supabase_url.rstrip('/')}/rest/v1/canada_crop_progress"
        f"?on_conflict={urllib.parse.quote(conflict_cols, safe=',')}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(rows).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise RuntimeError(f"canada_crop_progress upsert failed: HTTP {exc.code} {body[:800]}") from exc
    return payload if isinstance(payload, list) else []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import Canadian provincial crop progress")
    parser.add_argument(
        "--province",
        action="append",
        choices=["MB", "SK", "AB", "all"],
        help="Province to import. Repeatable. Defaults to all.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse and print JSON without writing Supabase")
    parser.add_argument("--force", action="store_true", help="Accepted for scheduler parity; upserts are idempotent")
    parser.add_argument(
        "--alberta-url",
        help="Override the Alberta report PDF URL. Defaults to Open Alberta latest-report discovery.",
    )
    parser.add_argument(
        "--missing-province",
        action="append",
        choices=["MB", "SK", "AB"],
        default=[],
        help="Record an explicitly stale/missing province after its retry window. Use with province-specific runs only after verification.",
    )
    return parser.parse_args()


def main() -> int:
    load_env_files()
    args = parse_args()
    requested = args.province or ["all"]
    provinces = ["MB", "SK", "AB"] if "all" in requested else requested
    missing_provinces = sorted(set(args.missing_province or []))

    started_at = utc_now()
    status = "success"
    error_message = None
    source_run_payload = None

    try:
        validate_missing_provinces(provinces, missing_provinces)
        rows, summaries = collect(provinces, alberta_url=args.alberta_url)
        week_status = prairie_week_status(provinces, missing_provinces=missing_provinces)
        written_rows: list[dict[str, Any]] = []
        if not args.dry_run:
            supabase_url = env_value("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
            service_key = env_value("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE")
            if not supabase_url or not service_key:
                raise RuntimeError("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
            written_rows = upsert_rows(rows, supabase_url, service_key)

            try:
                source_run_payload = write_source_run(
                    supabase_url,
                    service_key,
                    source_name="canada_crop_progress",
                    source_lane="canada",
                    collector_name="import-canada-crop-progress",
                    status=status,
                    source_period_start="2026-04-28" if any(p == "SK" for p in provinces) else None,
                    source_period_end=max((row["report_date"] for row in rows), default=None),
                    latest_source_label=", ".join(sorted({row["report_label"] for row in rows})),
                    rows_inserted=len(written_rows),
                    source_url=province_source_url(provinces),
                    started_at=started_at,
                    metadata={
                        "province_summaries": summaries,
                        "dry_run": False,
                        "prairie_week_status": week_status,
                        "missing_provinces": missing_provinces,
                        "province_release_sequence": PROVINCE_RELEASE_SEQUENCE,
                    },
                )
                if source_run_payload and source_run_payload.get("id"):
                    rows_with_source_run = [
                        {**row, "source_run_id": source_run_payload["id"]}
                        for row in rows
                    ]
                    upsert_rows(rows_with_source_run, supabase_url, service_key)
            except SourceRunError as exc:
                status = "partial"
                error_message = str(exc)
        else:
            status = "dry_run"

        output = {
            "status": status,
            "rows_parsed": len(rows),
            "rows_written": len(written_rows),
            "province_summaries": summaries,
            "prairie_week_status": week_status,
            "missing_provinces": missing_provinces,
            "source_run": source_run_payload,
            "error": error_message,
            "sample_rows": rows[:20],
        }
        print(json.dumps(output, indent=2, sort_keys=True))
        return 0 if status in {"success", "dry_run"} else 1
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error": str(exc),
                    "provinces": provinces,
                },
                indent=2,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
