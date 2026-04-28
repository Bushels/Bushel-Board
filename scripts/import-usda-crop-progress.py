#!/usr/bin/env python3
"""
USDA NASS weekly crop progress / crop condition importer.

Fetches weekly national AND grain-belt state-level crop progress and condition
rows from the USDA NASS QuickStats API, pivots them into canonical weekly rows,
and upserts them to the usda_crop_progress table in Supabase. State-level rows
are kept only for the 15 grain-belt states (see GRAIN_BELT_STATES); other states
are skipped to bound row volume.

Usage:
  python3 scripts/import-usda-crop-progress.py
  python3 scripts/import-usda-crop-progress.py --dry-run
  python3 scripts/import-usda-crop-progress.py --year 2026
  python3 scripts/import-usda-crop-progress.py --market Wheat --market Corn
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

NASS_BASE_URL = "https://quickstats.nass.usda.gov/api/api_GET/"
SUPABASE_TIMEOUT_SECONDS = 60
USDA_TIMEOUT_SECONDS = 60
UPSERT_BATCH_SIZE = 200

TRAJECTORY_SCAN_TYPE = "collector_crop_progress"
TRAJECTORY_MODEL_SOURCE = "collector_crop_progress"
TRAJECTORY_TRIGGER = "USDA Crop Progress refresh"

MARKETS = [
    {
        "market_name": "Corn",
        "commodity": "CORN",
        "cgc_grain": "Corn",
        "variants": [
            {"source_key": "primary", "commodity_desc": "CORN", "class_desc": None},
        ],
        "condition_order": ["primary"],
        "planting_order": ["primary"],
        "progress_order": ["primary"],
    },
    {
        "market_name": "Soybeans",
        "commodity": "SOYBEANS",
        "cgc_grain": "Soybeans",
        "variants": [
            {"source_key": "primary", "commodity_desc": "SOYBEANS", "class_desc": None},
        ],
        "condition_order": ["primary"],
        "planting_order": ["primary"],
        "progress_order": ["primary"],
    },
    {
        "market_name": "Wheat",
        "commodity": "WHEAT",
        "cgc_grain": "Wheat",
        "variants": [
            {"source_key": "winter", "commodity_desc": "WHEAT", "class_desc": "WINTER"},
            {"source_key": "spring", "commodity_desc": "WHEAT", "class_desc": "SPRING, (EXCL DURUM)"},
        ],
        # Wheat stays a single v1 market. Use winter first for condition and
        # harvest-style metrics, but spring first for planting/emergence pace.
        "condition_order": ["winter", "spring"],
        "planting_order": ["spring", "winter"],
        "progress_order": ["winter", "spring"],
    },
    {
        "market_name": "Barley",
        "commodity": "BARLEY",
        "cgc_grain": "Barley",
        "variants": [
            {"source_key": "primary", "commodity_desc": "BARLEY", "class_desc": None},
        ],
        "condition_order": ["primary"],
        "planting_order": ["primary"],
        "progress_order": ["primary"],
    },
    {
        "market_name": "Oats",
        "commodity": "OATS",
        "cgc_grain": "Oats",
        "variants": [
            {"source_key": "primary", "commodity_desc": "OATS", "class_desc": None},
        ],
        "condition_order": ["primary"],
        "planting_order": ["primary"],
        "progress_order": ["primary"],
    },
]

MARKETS_BY_COMMODITY = {market["commodity"]: market for market in MARKETS}
CANONICAL_COMMODITIES = {market["commodity"] for market in MARKETS}

ALLOWED_STAT_CATEGORIES = {
    "CONDITION",
    "CONDITION, 5 YEAR AVG",
    "CONDITION, PREVIOUS YEAR",
    "PROGRESS",
    "PROGRESS, 5 YEAR AVG",
    "PROGRESS, PREVIOUS YEAR",
}

PROGRESS_FIELD_BY_UNIT = {
    "PCT PLANTED": "planted_pct",
    "PCT EMERGED": "emerged_pct",
    "PCT HEADED": "headed_pct",
    "PCT BLOOMING": "blooming_pct",
    "PCT SETTING PODS": "setting_pods_pct",
    "PCT TURNING COLOR": "turning_color_pct",
    "PCT DROPPING LEAVES": "turning_color_pct",
    "PCT MATURE": "mature_pct",
    "PCT HARVESTED": "harvested_pct",
}

CONDITION_FIELD_BY_UNIT = {
    "PCT VERY POOR": "condition_very_poor_pct",
    "PCT POOR": "condition_poor_pct",
    "PCT FAIR": "condition_fair_pct",
    "PCT GOOD": "condition_good_pct",
    "PCT EXCELLENT": "condition_excellent_pct",
}

# Aggregation levels fetched from USDA NASS QuickStats per variant.
# NATIONAL gives us the canonical "US TOTAL" rows. STATE gives per-state rows
# that are then filtered to GRAIN_BELT_STATES below — powers /seeding map.
AGG_LEVELS_TO_FETCH = ["NATIONAL", "STATE"]

# 15 US grain-belt states whose state-level rows are retained on import.
# Names must match USDA NASS state_name values (uppercase). All other states
# are dropped during normalization to bound row volume.
GRAIN_BELT_STATES = {
    "IOWA",
    "ILLINOIS",
    "INDIANA",
    "OHIO",
    "NEBRASKA",
    "KANSAS",
    "MISSOURI",
    "SOUTH DAKOTA",
    "NORTH DAKOTA",
    "MINNESOTA",
    "WISCONSIN",
    "MICHIGAN",
    "KENTUCKY",
    "ARKANSAS",
    "TEXAS",
}


class ImporterError(Exception):
    pass


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


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
        for raw_line in path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            value = value.replace("\\n", "").replace("\\r", "")
            os.environ.setdefault(key, value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import USDA crop progress into Supabase")
    parser.add_argument(
        "--year",
        type=int,
        action="append",
        dest="years",
        help="Report year to import (repeatable). Defaults to current UTC year.",
    )
    parser.add_argument(
        "--market",
        action="append",
        help="Limit import to specific canonical market_name values (repeatable).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and normalize data without writing to Supabase.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Upsert even when the latest USDA week already exists in Supabase.",
    )
    return parser.parse_args()


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    readable = ", ".join((name, *alternates))
    raise ImporterError(f"Missing required environment variable: {readable}")


def current_year() -> int:
    return dt.datetime.now(dt.timezone.utc).year


def season_active(today: dt.date | None = None) -> bool:
    current = today or dt.datetime.now(dt.timezone.utc).date()
    return 4 <= current.month <= 11


def choose_markets(filters: list[str] | None) -> list[dict[str, Any]]:
    if not filters:
        return MARKETS
    wanted = {item.strip().lower() for item in filters}
    selected = [market for market in MARKETS if market["market_name"].lower() in wanted]
    if not selected:
        raise ImporterError(f"No markets matched filter(s): {', '.join(filters)}")
    return selected


def request_json(url: str, *, timeout: int) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def fetch_rows(
    variant: dict[str, Any],
    year: int,
    api_key: str,
    agg_level: str = "NATIONAL",
) -> list[dict[str, Any]]:
    params = {
        "key": api_key,
        "source_desc": "SURVEY",
        "sector_desc": "CROPS",
        "group_desc": "FIELD CROPS",
        "commodity_desc": variant["commodity_desc"],
        "freq_desc": "WEEKLY",
        "agg_level_desc": agg_level,
        "year": str(year),
        "format": "JSON",
    }
    if variant.get("class_desc"):
        params["class_desc"] = str(variant["class_desc"])
    url = NASS_BASE_URL + "?" + urllib.parse.urlencode(params)
    try:
        data = request_json(url, timeout=USDA_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            f"USDA request failed for {variant['commodity_desc']} {variant.get('class_desc') or ''} {year} ({agg_level}): HTTP {exc.code} {body[:300]}"
        ) from exc
    if not isinstance(data, dict) or "data" not in data:
        raise ImporterError(
            f"Unexpected USDA NASS response for {variant['commodity_desc']} {variant.get('class_desc') or ''} {year} ({agg_level})"
        )
    return data["data"]


def parse_timestamp(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    return value.replace(" ", "T") + "Z"


def to_number(value: Any) -> float | None:
    if value in (None, "", "(D)", "(NA)"):
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def normalize_rows(
    rows: list[dict[str, Any]],
    market: dict[str, Any],
    variant: dict[str, Any],
    year: int,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        statcat = str(row.get("statisticcat_desc") or "").strip()
        if statcat not in ALLOWED_STAT_CATEGORIES:
            continue

        week_ending = str(row.get("week_ending") or "").strip()
        if not week_ending:
            continue

        state_value = (
            str(row.get("state_name") or row.get("location_desc") or "US TOTAL").strip()
            or "US TOTAL"
        )
        state_upper = state_value.upper()
        # Keep US TOTAL (canonical national) and the grain-belt states only.
        # Everything else is dropped to bound row volume.
        if state_upper != "US TOTAL" and state_upper not in GRAIN_BELT_STATES:
            continue

        normalized.append(
            {
                "market_name": market["market_name"],
                "commodity": market["commodity"],
                "cgc_grain": market["cgc_grain"],
                "source_key": variant["source_key"],
                "state": state_value,
                "week_ending": week_ending,
                "crop_year": year,
                "report_year": year,
                "statisticcat_desc": statcat,
                "unit_desc": str(row.get("unit_desc") or "").strip(),
                "value_pct": to_number(row.get("Value")),
                "nass_load_time": parse_timestamp(row.get("load_time")),
            }
        )
    return normalized


def pick_metric(
    source_metrics: dict[str, dict[tuple[str, str], float | None]],
    source_order: list[str],
    statcat: str,
    *units: str,
) -> float | None:
    for source_key in source_order:
        metrics = source_metrics.get(source_key, {})
        for unit in units:
            value = metrics.get((statcat, unit))
            if value is not None:
                return value
    return None


def build_canonical_rows(
    rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    grouped: dict[tuple[str, str, str], dict[str, Any]] = {}
    warnings: list[str] = []
    imported_at = dt.datetime.now(dt.timezone.utc).isoformat()

    for row in rows:
        key = (row["commodity"], row["state"], row["week_ending"])
        group = grouped.setdefault(
            key,
            {
                "market_name": row["market_name"],
                "commodity": row["commodity"],
                "cgc_grain": row["cgc_grain"],
                "state": row["state"],
                "week_ending": row["week_ending"],
                "crop_year": row["crop_year"],
                "report_year": row["report_year"],
                "nass_load_time": row["nass_load_time"],
                "sources": {},
            },
        )
        source_bucket = group["sources"].setdefault(row["source_key"], {})
        source_bucket[(row["statisticcat_desc"], row["unit_desc"])] = row["value_pct"]

        load_time = row["nass_load_time"]
        if load_time and (group["nass_load_time"] is None or load_time > group["nass_load_time"]):
            group["nass_load_time"] = load_time

    canonical_rows: list[dict[str, Any]] = []

    for group in sorted(grouped.values(), key=lambda item: (item["commodity"], item["state"], item["week_ending"])):
        market = MARKETS_BY_COMMODITY[group["commodity"]]
        condition_order = market["condition_order"]
        planting_order = market["planting_order"]
        progress_order = market["progress_order"]
        sources = group["sources"]

        row: dict[str, Any] = {
            "market_name": group["market_name"],
            "commodity": group["commodity"],
            "cgc_grain": group["cgc_grain"],
            "state": group["state"],
            "week_ending": group["week_ending"],
            "crop_year": group["crop_year"],
            "report_year": group["report_year"],
            "source": "usda_nass_quickstats",
            "imported_at": imported_at,
            "nass_load_time": group["nass_load_time"],
            "class_desc": "",
            "statisticcat_desc": None,
            "unit_desc": None,
            "short_desc": None,
            "reference_period_desc": None,
            "value_pct": None,
            "location_desc": group["state"],
            "agg_level_desc": "NATIONAL",
        }

        for unit_desc, field_name in PROGRESS_FIELD_BY_UNIT.items():
            order = planting_order if field_name in {"planted_pct", "emerged_pct"} else progress_order
            row[field_name] = pick_metric(sources, order, "PROGRESS", unit_desc)

        for unit_desc, field_name in CONDITION_FIELD_BY_UNIT.items():
            row[field_name] = pick_metric(sources, condition_order, "CONDITION", unit_desc)

        condition_values = [row[field] for field in CONDITION_FIELD_BY_UNIT.values()]
        if all(value is not None for value in condition_values):
            condition_total = sum(float(value) for value in condition_values if value is not None)
            if abs(condition_total - 100.0) > 1.0:
                warnings.append(
                    f"{group['market_name']} {group['week_ending']}: condition components sum to {condition_total:.1f}%"
                )

        good = row["condition_good_pct"]
        excellent = row["condition_excellent_pct"]
        if good is not None and excellent is not None:
            row["good_excellent_pct"] = round(float(good) + float(excellent), 3)
        else:
            row["good_excellent_pct"] = None

        if all(value is not None for value in condition_values):
            weighted = (
                float(row["condition_very_poor_pct"]) * 1
                + float(row["condition_poor_pct"]) * 2
                + float(row["condition_fair_pct"]) * 3
                + float(row["condition_good_pct"]) * 4
                + float(row["condition_excellent_pct"]) * 5
            )
            row["condition_index"] = round(weighted / 100.0, 3)
        else:
            row["condition_index"] = None

        prev_good = pick_metric(sources, condition_order, "CONDITION, PREVIOUS YEAR", "PCT GOOD")
        prev_excellent = pick_metric(sources, condition_order, "CONDITION, PREVIOUS YEAR", "PCT EXCELLENT")
        if row["good_excellent_pct"] is not None and prev_good is not None and prev_excellent is not None:
            row["ge_pct_yoy_change"] = round(row["good_excellent_pct"] - float(prev_good) - float(prev_excellent), 3)
        else:
            row["ge_pct_yoy_change"] = None

        planted_avg = pick_metric(sources, planting_order, "PROGRESS, 5 YEAR AVG", "PCT PLANTED")
        if row["planted_pct"] is not None and planted_avg is not None:
            row["planted_pct_vs_avg"] = round(float(row["planted_pct"]) - float(planted_avg), 3)
        else:
            row["planted_pct_vs_avg"] = None
            if row["planted_pct"] is not None and planted_avg is None:
                warnings.append(
                    f"{group['market_name']} {group['week_ending']}: missing 5-year average planting pace"
                )

        canonical_rows.append(row)

    return canonical_rows, warnings


def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def upsert_rows(supabase_url: str, service_key: str, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0

    url = supabase_url.rstrip("/") + "/rest/v1/usda_crop_progress"
    conflict = urllib.parse.quote("commodity,state,week_ending", safe=",")
    total = 0

    for batch in chunked(rows, UPSERT_BATCH_SIZE):
        payload = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            f"{url}?on_conflict={conflict}",
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
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
            raise ImporterError(f"Supabase upsert failed: HTTP {exc.code} {body[:500]}") from exc
        total += len(payload) if isinstance(payload, list) else len(batch)

    return total


def fetch_latest_week(
    supabase_url: str,
    service_key: str,
    commodity: str,
    cgc_grain: str,
) -> dict[str, Any] | None:
    params = urllib.parse.urlencode(
        {
            "commodity": f"eq.{commodity}",
            "cgc_grain": f"eq.{cgc_grain}",
            "state": "eq.US TOTAL",
            "select": "commodity,cgc_grain,state,week_ending,good_excellent_pct,ge_pct_yoy_change,planted_pct,planted_pct_vs_avg",
            "order": "week_ending.desc",
            "limit": "1",
        }
    )
    url = f"{supabase_url.rstrip('/')}/rest/v1/usda_crop_progress?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
        payload = json.load(response)
    if isinstance(payload, list) and payload:
        return payload[0]
    return None


def fetch_verification_rows(supabase_url: str, service_key: str) -> list[dict[str, Any]]:
    url = (
        supabase_url.rstrip("/")
        + "/rest/v1/usda_crop_progress"
        + "?select=commodity,state,week_ending,cgc_grain"
        + "&order=commodity,state,week_ending"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Range-Unit": "items",
            "Range": "0-9999",
        },
    )
    with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
        payload = json.load(response)
    return payload if isinstance(payload, list) else []


def run_verification(
    supabase_url: str,
    service_key: str,
    markets: list[dict[str, Any]],
) -> dict[str, Any]:
    try:
        rows = fetch_verification_rows(supabase_url, service_key)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
        return {
            "checks_passed": False,
            "error": f"fetch failed: {exc}",
        }

    null_cgc_grain = sum(1 for row in rows if not row.get("cgc_grain"))

    key_counts: dict[tuple[str, str, str], int] = {}
    for row in rows:
        key = (row.get("commodity") or "", row.get("state") or "", row.get("week_ending") or "")
        key_counts[key] = key_counts.get(key, 0) + 1
    duplicate_keys = sum(1 for count in key_counts.values() if count > 1)

    distinct_commodities = sorted({row.get("commodity") for row in rows if row.get("commodity")})
    unexpected = [c for c in distinct_commodities if c not in CANONICAL_COMMODITIES]

    latest_week_per_market: dict[str, str | None] = {}
    for market in markets:
        market_rows = [row for row in rows if row.get("commodity") == market["commodity"]]
        latest_week_per_market[market["cgc_grain"]] = (
            max(row.get("week_ending") for row in market_rows) if market_rows else None
        )

    checks_passed = null_cgc_grain == 0 and duplicate_keys == 0 and not unexpected

    return {
        "checks_passed": checks_passed,
        "total_rows": len(rows),
        "latest_week_per_market": latest_week_per_market,
        "null_cgc_grain_rows": null_cgc_grain,
        "duplicate_keys": duplicate_keys,
        "distinct_commodities": distinct_commodities,
        "unexpected_commodities": unexpected,
        "canonical_markets_only": not unexpected,
    }


def fetch_prior_week_ge(
    supabase_url: str,
    service_key: str,
    commodity: str,
    before_week_ending: str,
) -> float | None:
    """Return good_excellent_pct for the most recent US TOTAL week prior to `before_week_ending`."""
    params = urllib.parse.urlencode(
        {
            "commodity": f"eq.{commodity}",
            "state": "eq.US TOTAL",
            "week_ending": f"lt.{before_week_ending}",
            "select": "week_ending,good_excellent_pct",
            "order": "week_ending.desc",
            "limit": "1",
        }
    )
    url = f"{supabase_url.rstrip('/')}/rest/v1/usda_crop_progress?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return None
    if not isinstance(payload, list) or not payload:
        return None
    value = payload[0].get("good_excellent_pct")
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def fetch_current_thesis(
    supabase_url: str,
    service_key: str,
    market_name: str,
) -> dict[str, Any] | None:
    """Return the most recent us_market_analysis row for this market, or None."""
    params = urllib.parse.urlencode(
        {
            "market_name": f"eq.{market_name}",
            "select": "market_name,crop_year,market_year,stance_score,confidence_score,recommendation,data_freshness,generated_at",
            "order": "generated_at.desc",
            "limit": "1",
        }
    )
    url = f"{supabase_url.rstrip('/')}/rest/v1/us_market_analysis?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return None
    if isinstance(payload, list) and payload:
        return payload[0]
    return None


def build_signal_note(
    canonical_row: dict[str, Any],
    ge_wow_change: float | None,
) -> tuple[str, str]:
    """Return (severity, plain-English note) for the condition snapshot."""
    ge = canonical_row.get("good_excellent_pct")
    ge_yoy = canonical_row.get("ge_pct_yoy_change")
    planted_vs_avg = canonical_row.get("planted_pct_vs_avg")
    harvested = canonical_row.get("harvested_pct")

    # Harvest-season signals dominate when present.
    if harvested is not None and float(harvested) > 5:
        pace_note = ""
        if planted_vs_avg is not None and abs(float(planted_vs_avg)) >= 5:
            pace_note = f", planting pace {float(planted_vs_avg):+.0f} pts vs 5yr avg"
        return "normal", f"Harvest underway at {float(harvested):.0f}%{pace_note}"

    # Condition-based signals (primary market driver during growing season).
    if ge is not None:
        ge_f = float(ge)
        wow_phrase = ""
        if ge_wow_change is not None:
            wow_phrase = f", {ge_wow_change:+.0f} pts WoW"
        yoy_phrase = ""
        if ge_yoy is not None:
            yoy_phrase = f", {float(ge_yoy):+.0f} pts YoY"

        if ge_f < 50:
            return (
                "critical",
                f"G/E {ge_f:.0f}% — supply-scare territory{wow_phrase}{yoy_phrase}",
            )
        if ge_wow_change is not None and ge_wow_change <= -5:
            return (
                "elevated",
                f"G/E {ge_f:.0f}% — deteriorated {abs(ge_wow_change):.0f} pts WoW{yoy_phrase}",
            )
        if ge_f < 60:
            return (
                "elevated",
                f"G/E {ge_f:.0f}% — below average{wow_phrase}{yoy_phrase}",
            )
        if ge_f > 70:
            return (
                "normal",
                f"G/E {ge_f:.0f}% — comfortable crop{wow_phrase}{yoy_phrase}",
            )
        return "normal", f"G/E {ge_f:.0f}% — on pace{wow_phrase}{yoy_phrase}"

    # No condition data yet — early-season planting pace is the only signal.
    if planted_vs_avg is not None:
        pvs = float(planted_vs_avg)
        if pvs <= -10:
            return "elevated", f"Planting pace {pvs:+.0f} pts vs 5yr avg — delayed"
        if pvs >= 10:
            return "normal", f"Planting pace {pvs:+.0f} pts vs 5yr avg — ahead"
        return "normal", f"Planting pace {pvs:+.0f} pts vs 5yr avg — on pace"

    return "unknown", "Condition ratings not yet published for this week"


def pick_latest_canonical_row(
    canonical_rows: list[dict[str, Any]],
    commodity: str,
) -> dict[str, Any] | None:
    """Return the US TOTAL canonical row with the latest week_ending for a given commodity."""
    candidates = [
        row
        for row in canonical_rows
        if row.get("commodity") == commodity and row.get("state") == "US TOTAL"
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item.get("week_ending") or "")


def build_trajectory_row(
    market: dict[str, Any],
    canonical_row: dict[str, Any],
    thesis: dict[str, Any],
    ge_wow_change: float | None,
    severity: str,
    note: str,
) -> dict[str, Any]:
    evidence: dict[str, Any] = {
        "collector": "collect-crop-progress",
        "severity": severity,
        "note": note,
        "week_ending": canonical_row.get("week_ending"),
        "good_excellent_pct": canonical_row.get("good_excellent_pct"),
        "ge_pct_wow_change": round(ge_wow_change, 3) if ge_wow_change is not None else None,
        "ge_pct_yoy_change": canonical_row.get("ge_pct_yoy_change"),
        "condition_index": canonical_row.get("condition_index"),
        "planted_pct": canonical_row.get("planted_pct"),
        "planted_pct_vs_avg": canonical_row.get("planted_pct_vs_avg"),
        "harvested_pct": canonical_row.get("harvested_pct"),
    }

    data_freshness: dict[str, Any] = {
        "usda_crop_progress": {
            "week_ending": canonical_row.get("week_ending"),
            "nass_load_time": canonical_row.get("nass_load_time"),
        }
    }

    row: dict[str, Any] = {
        "market_name": market["market_name"],
        "crop_year": thesis["crop_year"],
        "market_year": thesis["market_year"],
        "scan_type": TRAJECTORY_SCAN_TYPE,
        "stance_score": int(thesis["stance_score"]),
        "recommendation": thesis["recommendation"],
        "trigger": TRAJECTORY_TRIGGER,
        "evidence": evidence,
        "data_freshness": data_freshness,
        "model_source": TRAJECTORY_MODEL_SOURCE,
    }

    if thesis.get("confidence_score") is not None:
        try:
            row["conviction_pct"] = int(thesis["confidence_score"])
        except (TypeError, ValueError):
            pass

    return row


def upsert_trajectory_rows(
    supabase_url: str,
    service_key: str,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0

    url = supabase_url.rstrip("/") + "/rest/v1/us_score_trajectory"
    payload = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            body = json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            f"Supabase us_score_trajectory insert failed: HTTP {exc.code} {body[:500]}"
        ) from exc
    return len(body) if isinstance(body, list) else len(rows)


def build_and_write_trajectory(
    supabase_url: str,
    service_key: str,
    markets: list[dict[str, Any]],
    canonical_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build one us_score_trajectory row per market with a newly imported canonical row.

    Carries forward stance_score/recommendation from the latest us_market_analysis
    and stamps the condition snapshot as evidence. Markets without an existing
    thesis row are skipped (logged as warnings) — the Friday swarm seeds the thesis.
    """
    built: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    warnings: list[str] = []

    for market in markets:
        canonical_row = pick_latest_canonical_row(canonical_rows, market["commodity"])
        if not canonical_row:
            skipped.append({"market_name": market["market_name"], "reason": "no_canonical_row"})
            continue

        thesis = fetch_current_thesis(supabase_url, service_key, market["market_name"])
        if not thesis or thesis.get("stance_score") is None or not thesis.get("recommendation"):
            skipped.append(
                {
                    "market_name": market["market_name"],
                    "reason": "no_us_market_analysis_row",
                }
            )
            warnings.append(
                f"{market['market_name']}: no us_market_analysis row — trajectory tick skipped until Friday swarm seeds thesis"
            )
            continue

        prior_ge = fetch_prior_week_ge(
            supabase_url,
            service_key,
            market["commodity"],
            canonical_row["week_ending"],
        )
        current_ge = canonical_row.get("good_excellent_pct")
        ge_wow: float | None = None
        if current_ge is not None and prior_ge is not None:
            ge_wow = round(float(current_ge) - float(prior_ge), 3)

        severity, note = build_signal_note(canonical_row, ge_wow)
        row = build_trajectory_row(market, canonical_row, thesis, ge_wow, severity, note)
        built.append(row)

    inserted = 0
    if built:
        inserted = upsert_trajectory_rows(supabase_url, service_key, built)

    return {
        "rows_built": len(built),
        "rows_inserted": inserted,
        "rows_skipped": skipped,
        "warnings": warnings,
        "sample_rows": built[:5],
    }


def verification_warning(verification: dict[str, Any]) -> str | None:
    if verification.get("checks_passed"):
        return None
    if "error" in verification:
        return f"verification skipped: {verification['error']}"
    parts = [
        f"null_cgc_grain={verification.get('null_cgc_grain_rows')}",
        f"duplicate_keys={verification.get('duplicate_keys')}",
        f"unexpected_commodities={verification.get('unexpected_commodities') or []}",
    ]
    return "verification failed: " + ", ".join(parts)


def main() -> None:
    load_env_files()
    args = parse_args()

    if not args.years and not season_active():
        print(
            json.dumps(
                {
                    "status": "skipped",
                    "reason": "off_season",
                    "season_active": False,
                    "latest_week": None,
                    "rows_total": 0,
                    "summary": [],
                    "warnings": [],
                    "errors": [],
                },
                indent=2,
            )
        )
        return

    supabase_url = require_env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    nass_api_key = require_env("USDA_NASS_API_KEY", "NASS_API_KEY")

    years = args.years or [current_year()]
    markets = choose_markets(args.market)

    eprint(
        f"Importing USDA crop progress for markets: {', '.join(m['market_name'] for m in markets)} years: {', '.join(str(y) for y in years)}"
    )

    all_rows: list[dict[str, Any]] = []
    summary: list[dict[str, Any]] = []
    warnings: list[str] = []
    errors: list[str] = []
    latest_source_week: str | None = None

    for year in years:
        for market in markets:
            raw_rows: list[dict[str, Any]] = []
            variant_counts: list[dict[str, Any]] = []

            for variant in market["variants"]:
                label = variant["commodity_desc"]
                if variant.get("class_desc"):
                    label += f" / {variant['class_desc']}"

                variant_fetched_total = 0
                variant_normalized_total = 0

                for agg_level in AGG_LEVELS_TO_FETCH:
                    eprint(f"Fetching {market['market_name']} from {label} ({agg_level}) for {year}...")

                    try:
                        fetched = fetch_rows(variant, year, nass_api_key, agg_level=agg_level)
                    except ImporterError as exc:
                        errors.append(str(exc))
                        eprint(f"  ERROR: {exc}")
                        continue

                    normalized = normalize_rows(fetched, market, variant, year)
                    raw_rows.extend(normalized)
                    variant_fetched_total += len(fetched)
                    variant_normalized_total += len(normalized)
                    eprint(f"  {agg_level}: {len(fetched)} raw rows -> {len(normalized)} usable rows")

                variant_counts.append(
                    {
                        "source_key": variant["source_key"],
                        "source_commodity": variant["commodity_desc"],
                        "class_desc": variant.get("class_desc"),
                        "rows_fetched": variant_fetched_total,
                        "rows_normalized": variant_normalized_total,
                    }
                )

            if not raw_rows:
                summary.append(
                    {
                        "market_name": market["market_name"],
                        "year": year,
                        "rows_built": 0,
                        "latest_week": None,
                        "source_variants": variant_counts,
                    }
                )
                continue

            canonical_rows, market_warnings = build_canonical_rows(raw_rows)
            warnings.extend(f"{market['market_name']} {year}: {warning}" for warning in market_warnings)
            all_rows.extend(canonical_rows)

            market_latest_week = max((row["week_ending"] for row in canonical_rows), default=None)
            if market_latest_week:
                latest_source_week = max(latest_source_week or market_latest_week, market_latest_week)

            summary.append(
                {
                    "market_name": market["market_name"],
                    "year": year,
                    "rows_built": len(canonical_rows),
                    "latest_week": market_latest_week,
                    "source_variants": variant_counts,
                }
            )
            eprint(f"  built {len(canonical_rows)} canonical rows (latest {market_latest_week})")

    rows_to_write = list(all_rows)
    skipped_markets: list[dict[str, Any]] = []

    if not args.force and not args.years:
        rows_to_write = []
        for market in markets:
            market_rows = [row for row in all_rows if row["commodity"] == market["commodity"]]
            if not market_rows:
                continue

            source_latest = max(row["week_ending"] for row in market_rows)
            imported = fetch_latest_week(supabase_url, service_key, market["commodity"], market["cgc_grain"])
            imported_week = imported["week_ending"] if imported else None

            if imported_week and imported_week >= source_latest:
                skipped_markets.append(
                    {
                        "market_name": market["market_name"],
                        "latest_imported_week": imported_week,
                        "latest_source_week": source_latest,
                    }
                )
                continue

            rows_to_write.extend(market_rows)

    if args.dry_run:
        verification = run_verification(supabase_url, service_key, markets)
        verify_warning = verification_warning(verification)
        if verify_warning:
            warnings.append(verify_warning)

        # Preview trajectory rows without inserting. Uses rows_to_write so we
        # only project ticks for markets that would actually get fresh canonical
        # data in a live run.
        trajectory_preview_built: list[dict[str, Any]] = []
        trajectory_preview_skipped: list[dict[str, Any]] = []
        if rows_to_write:
            for market in markets:
                canonical_row = pick_latest_canonical_row(rows_to_write, market["commodity"])
                if not canonical_row:
                    trajectory_preview_skipped.append(
                        {"market_name": market["market_name"], "reason": "no_canonical_row"}
                    )
                    continue
                thesis = fetch_current_thesis(supabase_url, service_key, market["market_name"])
                if not thesis or thesis.get("stance_score") is None or not thesis.get("recommendation"):
                    trajectory_preview_skipped.append(
                        {"market_name": market["market_name"], "reason": "no_us_market_analysis_row"}
                    )
                    continue
                prior_ge = fetch_prior_week_ge(
                    supabase_url,
                    service_key,
                    market["commodity"],
                    canonical_row["week_ending"],
                )
                current_ge = canonical_row.get("good_excellent_pct")
                ge_wow = (
                    round(float(current_ge) - float(prior_ge), 3)
                    if current_ge is not None and prior_ge is not None
                    else None
                )
                severity, note = build_signal_note(canonical_row, ge_wow)
                trajectory_preview_built.append(
                    build_trajectory_row(market, canonical_row, thesis, ge_wow, severity, note)
                )

        print(
            json.dumps(
                {
                    "status": "dry_run",
                    "season_active": season_active(),
                    "years": years,
                    "markets": [market["market_name"] for market in markets],
                    "rows_total": len(all_rows),
                    "rows_pending_write": len(rows_to_write),
                    "latest_week": latest_source_week,
                    "summary": summary,
                    "skipped_markets": skipped_markets,
                    "warnings": warnings,
                    "errors": errors,
                    "sample_rows": rows_to_write[:5],
                    "verification": verification,
                    "trajectory_preview": {
                        "rows_built": len(trajectory_preview_built),
                        "rows_skipped": trajectory_preview_skipped,
                        "sample_rows": trajectory_preview_built[:5],
                    },
                },
                indent=2,
            )
        )
        return

    if not rows_to_write:
        verification = run_verification(supabase_url, service_key, markets)
        verify_warning = verification_warning(verification)
        if verify_warning:
            warnings.append(verify_warning)
        print(
            json.dumps(
                {
                    "status": "skipped",
                    "reason": "no_new_data",
                    "season_active": season_active(),
                    "years": years,
                    "markets": [market["market_name"] for market in markets],
                    "rows_total": len(all_rows),
                    "rows_upserted": 0,
                    "latest_week": latest_source_week,
                    "summary": summary,
                    "skipped_markets": skipped_markets,
                    "warnings": warnings,
                    "errors": errors,
                    "verification": verification,
                },
                indent=2,
            )
        )
        return

    upserted = upsert_rows(supabase_url, service_key, rows_to_write)

    verification = run_verification(supabase_url, service_key, markets)
    verify_warning = verification_warning(verification)
    if verify_warning:
        warnings.append(verify_warning)

    # Trajectory ticks: only for markets that received a fresh canonical row.
    trajectory_result: dict[str, Any] = {
        "rows_built": 0,
        "rows_inserted": 0,
        "rows_skipped": [],
        "warnings": [],
        "sample_rows": [],
    }
    try:
        trajectory_result = build_and_write_trajectory(
            supabase_url,
            service_key,
            markets,
            rows_to_write,
        )
        warnings.extend(trajectory_result.get("warnings", []))
    except ImporterError as exc:
        errors.append(f"trajectory write failed: {exc}")
        eprint(f"trajectory write failed: {exc}")

    status = "success" if not errors else "partial"
    print(
        json.dumps(
            {
                "status": status,
                "season_active": season_active(),
                "years": years,
                "markets": [market["market_name"] for market in markets],
                "rows_total": len(all_rows),
                "rows_upserted": upserted,
                "latest_week": latest_source_week,
                "summary": summary,
                "skipped_markets": skipped_markets,
                "warnings": warnings,
                "errors": errors,
                "verification": verification,
                "trajectory": trajectory_result,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except ImporterError as exc:
        eprint(f"Fatal error: {exc}")
        sys.exit(1)
    except KeyboardInterrupt:
        eprint("Interrupted")
        sys.exit(130)
