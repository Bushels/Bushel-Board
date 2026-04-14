#!/usr/bin/env python3
"""
USDA NASS weekly crop progress / crop condition importer.

Fetches national weekly field-crop progress and condition rows from the USDA NASS
QuickStats API and upserts them to the usda_crop_progress table in Supabase.

Usage:
  python3 scripts/import-usda-crop-progress.py
  python3 scripts/import-usda-crop-progress.py --dry-run
  python3 scripts/import-usda-crop-progress.py --year 2025
  python3 scripts/import-usda-crop-progress.py --market Corn --market Soybeans
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

NASS_BASE_URL = "https://quickstats.nass.usda.gov/api/api_GET/"
SUPABASE_TIMEOUT_SECONDS = 60
USDA_TIMEOUT_SECONDS = 60
UPSERT_BATCH_SIZE = 500

MARKETS = [
    {"market_name": "Corn", "commodity": "CORN", "class_desc": None},
    {"market_name": "Soybeans", "commodity": "SOYBEANS", "class_desc": None},
    {"market_name": "Winter Wheat", "commodity": "WHEAT", "class_desc": "WINTER"},
    {"market_name": "Spring Wheat", "commodity": "WHEAT", "class_desc": "SPRING, (EXCL DURUM)"},
    {"market_name": "Oats", "commodity": "OATS", "class_desc": None},
]

ALLOWED_STAT_CATEGORIES = {
    "CONDITION",
    "CONDITION, 5 YEAR AVG",
    "CONDITION, PREVIOUS YEAR",
    "PROGRESS",
    "PROGRESS, 5 YEAR AVG",
    "PROGRESS, PREVIOUS YEAR",
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
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import USDA crop progress into Supabase")
    parser.add_argument("--year", type=int, action="append", dest="years", help="Report year to import (repeatable). Defaults to current UTC year.")
    parser.add_argument("--market", action="append", help="Limit import to specific market_name values from MARKETS (repeatable).")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and normalize data without writing to Supabase.")
    return parser.parse_args()


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    raise ImporterError(f"Missing required environment variable: {', '.join((name, *alternates))}")


def current_year() -> int:
    return dt.datetime.now(dt.timezone.utc).year


def choose_markets(filters: list[str] | None) -> list[dict[str, Any]]:
    if not filters:
        return MARKETS
    wanted = {item.strip().lower() for item in filters}
    selected = [m for m in MARKETS if m["market_name"].lower() in wanted]
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


def fetch_rows(market: dict[str, Any], year: int, api_key: str) -> list[dict[str, Any]]:
    params = {
        "key": api_key,
        "source_desc": "SURVEY",
        "sector_desc": "CROPS",
        "group_desc": "FIELD CROPS",
        "commodity_desc": market["commodity"],
        "freq_desc": "WEEKLY",
        "agg_level_desc": "NATIONAL",
        "year": str(year),
        "format": "JSON",
    }
    if market.get("class_desc"):
        params["class_desc"] = str(market["class_desc"])
    url = NASS_BASE_URL + "?" + urllib.parse.urlencode(params)
    data = request_json(url, timeout=USDA_TIMEOUT_SECONDS)
    if not isinstance(data, dict) or "data" not in data:
        raise ImporterError(f"Unexpected USDA NASS response for {market['market_name']} {year}")
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


def normalize_rows(rows: list[dict[str, Any]], market: dict[str, Any], year: int) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        statcat = str(row.get("statisticcat_desc") or "").strip()
        if statcat not in ALLOWED_STAT_CATEGORIES:
            continue
        normalized.append(
            {
                "crop_year": str(year),
                "state": str(row.get("state_name") or row.get("location_desc") or "US TOTAL").strip() or "US TOTAL",
                "market_name": market["market_name"],
                "commodity": str(row.get("commodity_desc") or market["commodity"]).strip(),
                "class_desc": str(row.get("class_desc") or market.get("class_desc") or "").strip(),
                "statisticcat_desc": statcat,
                "unit_desc": str(row.get("unit_desc") or "").strip(),
                "short_desc": str(row.get("short_desc") or "").strip(),
                "week_ending": str(row.get("week_ending") or "").strip(),
                "report_year": year,
                "reference_period_desc": str(row.get("reference_period_desc") or "").strip() or None,
                "value_pct": to_number(row.get("Value")),
                "location_desc": str(row.get("location_desc") or "US TOTAL").strip() or "US TOTAL",
                "agg_level_desc": str(row.get("agg_level_desc") or "NATIONAL").strip() or "NATIONAL",
                "source": "usda_nass_quickstats",
                "nass_load_time": parse_timestamp(row.get("load_time")),
                "imported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
        )
    return normalized


def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def upsert_rows(supabase_url: str, service_key: str, rows: list[dict[str, Any]]) -> None:
    url = supabase_url.rstrip("/") + "/rest/v1/usda_crop_progress"
    conflict = urllib.parse.quote("market_name,commodity,class_desc,week_ending,statisticcat_desc,unit_desc,location_desc", safe=",")
    for batch in chunked(rows, UPSERT_BATCH_SIZE):
        payload = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            f"{url}?on_conflict={conflict}",
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            raise ImporterError(f"Supabase upsert failed: HTTP {exc.code} {body[:500]}") from exc


def main() -> None:
    load_env_files()
    args = parse_args()

    supabase_url = require_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    nass_api_key = require_env("USDA_NASS_API_KEY", "NASS_API_KEY")

    years = args.years or [current_year()]
    markets = choose_markets(args.market)

    eprint(f"Importing USDA crop progress for markets: {', '.join(m['market_name'] for m in markets)} years: {', '.join(str(y) for y in years)}")

    all_rows: list[dict[str, Any]] = []
    summary: list[dict[str, Any]] = []

    for year in years:
        for market in markets:
            eprint(f"Fetching {market['market_name']} for {year}...")
            rows = fetch_rows(market, year, nass_api_key)
            normalized = normalize_rows(rows, market, year)
            all_rows.extend(normalized)
            latest_week = max((r["week_ending"] for r in normalized), default=None)
            summary.append({
                "market_name": market["market_name"],
                "year": year,
                "rows_fetched": len(rows),
                "rows_normalized": len(normalized),
                "latest_week": latest_week,
            })
            eprint(f"  {len(rows)} raw rows -> {len(normalized)} normalized rows (latest {latest_week})")

    if not args.dry_run:
        upsert_rows(supabase_url, service_key, all_rows)

    print(json.dumps({
        "status": "success",
        "dry_run": args.dry_run,
        "years": years,
        "markets": [m["market_name"] for m in markets],
        "rows_total": len(all_rows),
        "summary": summary,
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        eprint(f"ERROR: {exc}")
        raise
