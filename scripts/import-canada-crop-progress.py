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

ALBERTA_REGIONS = [
    ("SOUTH", "South"),
    ("CENTRAL", "Central"),
    ("NE", "North East"),
    ("NW", "North West"),
    ("PEACE", "Peace"),
    ("PROV", "Alberta"),
]

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


def latest_alberta_report_url() -> str:
    try:
        data = fetch_json(ALBERTA_DATASET_API_URL)
        resources = data.get("result", {}).get("resources", [])
        candidates: list[tuple[str, str, str | None]] = []
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
            candidates.append((name, url, parse_report_date(name)))
        dated = [item for item in candidates if item[2]]
        if dated:
            return sorted(dated, key=lambda item: item[2] or "")[-1][1]
        if candidates:
            return candidates[-1][1]
    except Exception:
        pass
    return ALBERTA_REPORT_URL


def latest_manitoba_report_url() -> str:
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
            return sorted(dated, key=lambda item: item[0])[-1][1]
    except Exception:
        pass
    return MANITOBA_REPORT_URL


def latest_saskatchewan_links() -> tuple[str, str]:
    try:
        html = fetch_bytes(SASKATCHEWAN_PAGE_URL)[0].decode("utf-8", "ignore")
        link_matches = re.finditer(
            r'href="([^"]+)"[^>]*>([^<]+)',
            html,
            flags=re.IGNORECASE,
        )
        report_url = None
        table_url = None
        for match in link_matches:
            href = match.group(1).replace(":443", "")
            text = re.sub(r"\s+", " ", match.group(2)).strip().lower()
            absolute = urllib.parse.urljoin(SASKATCHEWAN_PAGE_URL, href)
            if text == "download crop report":
                report_url = absolute
            elif text == "seeding progress table":
                table_url = absolute
        return report_url or SASKATCHEWAN_REPORT_API_URL, table_url or SASKATCHEWAN_TABLE_API_URL
    except Exception:
        return SASKATCHEWAN_REPORT_API_URL, SASKATCHEWAN_TABLE_API_URL


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


def clean_alberta_crop_label(label: str) -> str:
    cleaned = label.replace("∗", "*")
    cleaned = re.sub(r"\s+\*", "", cleaned)
    cleaned = re.sub(r"\s*,\s*May\s+[0-9]+$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    if cleaned.startswith("Major Crops"):
        return "Major Crops"
    if cleaned.startswith("All Crops"):
        return "All Crops"
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
            source_excerpt="Overall, progress remains very low, with approximately 2% of seeding completed.",
            confidence="high",
        )
    ]
    return rows, document_url


def parse_saskatchewan() -> tuple[list[dict[str, Any]], str]:
    report_link, table_link = latest_saskatchewan_links()
    text, document_url = pdf_to_text(table_link, layout=True)
    report_text, report_url = pdf_to_text(report_link, layout=True)
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
        r"Currently,\s+([A-Za-z0-9.]+)\s+per\s+cent.*?five-year\s+average\s+of\s+([A-Za-z0-9.]+)",
        report_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    previous_year_match = re.search(r"May\s+5,\s+2025\s+([0-9]+(?:\.[0-9]+)?)", report_text)
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
                source_excerpt="Currently, three per cent of the 2026 crop has been planted, behind the five-year average of 12 per cent.",
                confidence="high",
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
                    source_excerpt="Regional Seeding Progress by Crop Type table, period April 28 to May 4, 2026.",
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

    table_start = text.find("Table 1: Alberta Seeding Progress")
    table_end = text.find("Source: AGI/AFSC Crop Reporting Survey", table_start)
    if table_start < 0 or table_end <= table_start:
        raise RuntimeError("Could not locate Alberta Table 1 seeding progress.")

    table_text = text[table_start:table_end]
    parsed_rows: dict[str, list[float | None]] = {}
    five_year_all_crops: list[float | None] | None = None

    for line in table_text.splitlines():
        parsed = values_from_table_line(line, expected_count=6)
        if not parsed:
            continue
        raw_label, values = parsed
        crop_name = clean_alberta_crop_label(raw_label)
        if crop_name.startswith("5-year All Crops"):
            five_year_all_crops = values
            continue
        if crop_name.startswith("10-year All Crops"):
            continue
        parsed_rows[crop_name] = values

    if not parsed_rows:
        raise RuntimeError("Could not parse Alberta Table 1 crop rows.")

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
                    metric="seeded_pct",
                    value_pct=value,
                    five_year_avg_pct=five_year_avg,
                    source_excerpt=f"Table 1: Alberta Seeding Progress as of {report_date}.",
                    confidence="high" if value is not None else "medium",
                    quality_flags=[] if value is not None else ["region_not_reported"],
                )
            )

    return rows, document_url


def collect(provinces: list[str], *, alberta_url: str | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []

    for province in provinces:
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
    return parser.parse_args()


def main() -> int:
    load_env_files()
    args = parse_args()
    requested = args.province or ["all"]
    provinces = ["MB", "SK", "AB"] if "all" in requested else requested

    started_at = utc_now()
    status = "success"
    error_message = None
    source_run_payload = None

    try:
        rows, summaries = collect(provinces, alberta_url=args.alberta_url)
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
                    source_url=SASKATCHEWAN_PAGE_URL if "SK" in provinces else MANITOBA_PAGE_URL,
                    started_at=started_at,
                    metadata={"province_summaries": summaries, "dry_run": False},
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
