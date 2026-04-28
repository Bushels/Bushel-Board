#!/usr/bin/env python3
"""
USDA NASS planted-acreage importer.

Fetches annual AREA PLANTED estimates for the 5 US grain markets (Corn,
Soybeans, Wheat, Barley, Oats) at NATIONAL and STATE aggregation levels,
upserts them into crop_acreage_estimates. The /seeding card badges and
focus-map tooltips JOIN this table to render "X% planted of Y M ac" context.

Usage:
  python3 scripts/import-usda-acreage.py
  python3 scripts/import-usda-acreage.py --year 2026
  python3 scripts/import-usda-acreage.py --dry-run
  python3 scripts/import-usda-acreage.py --market Corn --market Soybeans

Source: USDA NASS QuickStats API (same as crop-progress importer).
Source programs caught:
  - PROSPECTIVE PLANTINGS (released ~March 31, intentions)
  - ACREAGE (released ~June 30, refined)
  - SURVEY (later refinements through the year)
The most-recent source_release_date per (region, commodity) wins for display
via the get_seeding_seismograph and get_us_total_acreage RPCs.
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

MARKETS = [
    {"market_name": "Corn", "commodity": "CORN", "cgc_grain": "Corn", "class_desc": None},
    {"market_name": "Soybeans", "commodity": "SOYBEANS", "cgc_grain": "Soybeans", "class_desc": None},
    {"market_name": "Wheat", "commodity": "WHEAT", "cgc_grain": "Wheat", "class_desc": None},
    {"market_name": "Barley", "commodity": "BARLEY", "cgc_grain": "Barley", "class_desc": None},
    {"market_name": "Oats", "commodity": "OATS", "cgc_grain": "Oats", "class_desc": None},
]

GRAIN_BELT_STATES = {
    "IOWA", "ILLINOIS", "INDIANA", "OHIO", "NEBRASKA", "KANSAS",
    "MISSOURI", "SOUTH DAKOTA", "NORTH DAKOTA", "MINNESOTA",
    "WISCONSIN", "MICHIGAN", "KENTUCKY", "ARKANSAS", "TEXAS",
}

# state_alpha → display name; for the remaining grain-belt states above,
# we'll resolve via a static map below.
STATE_NAME_TO_CODE = {
    "IOWA": "IA", "ILLINOIS": "IL", "INDIANA": "IN", "OHIO": "OH",
    "NEBRASKA": "NE", "KANSAS": "KS", "MISSOURI": "MO",
    "SOUTH DAKOTA": "SD", "NORTH DAKOTA": "ND", "MINNESOTA": "MN",
    "WISCONSIN": "WI", "MICHIGAN": "MI", "KENTUCKY": "KY",
    "ARKANSAS": "AR", "TEXAS": "TX",
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


def require_env(name: str, *alternates: str) -> str:
    for n in (name, *alternates):
        value = os.environ.get(n)
        if value:
            return value
    raise ImporterError(f"Missing required environment variable: {', '.join((name, *alternates))}")


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


def fetch_acreage(
    commodity: str,
    year: int,
    api_key: str,
    agg_level: str,
) -> list[dict[str, Any]]:
    params = {
        "key": api_key,
        "source_desc": "SURVEY",
        "sector_desc": "CROPS",
        "group_desc": "FIELD CROPS",
        "commodity_desc": commodity,
        "statisticcat_desc": "AREA PLANTED",
        "unit_desc": "ACRES",
        "freq_desc": "ANNUAL",
        "agg_level_desc": agg_level,
        "year": str(year),
        "format": "JSON",
    }
    url = NASS_BASE_URL + "?" + urllib.parse.urlencode(params)
    try:
        data = request_json(url, timeout=USDA_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        if exc.code == 404:
            return []
        raise ImporterError(
            f"USDA acreage request failed for {commodity} {year} {agg_level}: HTTP {exc.code} {body[:300]}"
        ) from exc
    if not isinstance(data, dict) or "data" not in data:
        return []
    return data["data"]


def parse_acres(value: Any) -> float | None:
    if value in (None, "", "(D)", "(NA)", "(Z)"):
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def parse_release_date(row: dict[str, Any]) -> dt.date | None:
    """Best-effort release date — prefer load_time, fall back to begin_code."""
    for key in ("load_time", "begin_code", "end_code"):
        value = row.get(key)
        if not value:
            continue
        s = str(value).strip()
        if not s:
            continue
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y%m%d"):
            try:
                return dt.datetime.strptime(s[:len(fmt.replace("%Y", "2026"))], fmt).date()
            except ValueError:
                continue
    return None


def normalize_rows(
    rows: list[dict[str, Any]],
    market: dict[str, Any],
    year: int,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        statcat = str(row.get("statisticcat_desc") or "").strip()
        if statcat != "AREA PLANTED":
            continue
        if str(row.get("unit_desc") or "").strip() != "ACRES":
            continue

        state_value = (
            str(row.get("state_name") or row.get("location_desc") or "US TOTAL").strip()
            or "US TOTAL"
        )
        state_upper = state_value.upper()
        is_us_total = state_upper == "US TOTAL"
        if not is_us_total and state_upper not in GRAIN_BELT_STATES:
            continue

        if is_us_total:
            region = "US TOTAL"
            region_code = "US TOTAL"
        else:
            region = state_value.title()
            region_code = STATE_NAME_TO_CODE.get(state_upper, "")
            if not region_code:
                continue

        acres = parse_acres(row.get("Value"))
        if acres is None:
            continue

        program = str(row.get("source_desc") or "SURVEY").strip().upper()
        # NASS short_desc carries useful sub-program context like
        # "CORN - ACRES PLANTED" or distinguishing intentions vs final.
        short_desc = str(row.get("short_desc") or "").upper()
        if "INTENTIONS" in short_desc or "PROSPECTIVE" in short_desc:
            program = "PROSPECTIVE PLANTINGS"
        elif "ACREAGE" in short_desc and "REVISED" in short_desc:
            program = "ACREAGE (REVISED)"
        elif "ACREAGE" in short_desc:
            program = "ACREAGE"

        release_date = parse_release_date(row)

        out.append({
            "country": "US",
            "region": region,
            "region_code": region_code,
            "commodity": market["commodity"],
            "cgc_grain": market["cgc_grain"],
            "market_year": year,
            "planted_acres": acres,
            "source_program": program,
            "source_release_date": release_date.isoformat() if release_date else None,
        })
    return out


def upsert_rows(
    supabase_url: str,
    service_key: str,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0
    url = supabase_url.rstrip("/") + "/rest/v1/crop_acreage_estimates"
    conflict = urllib.parse.quote(
        "country,region_code,commodity,market_year,source_program", safe=","
    )
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[i:i + UPSERT_BATCH_SIZE]
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
                result = json.load(response)
            total += len(result) if isinstance(result, list) else len(batch)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            raise ImporterError(f"Supabase upsert failed: HTTP {exc.code} {body[:500]}") from exc
    return total


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="USDA NASS planted-acreage importer.")
    p.add_argument("--year", type=int, default=dt.datetime.now(dt.timezone.utc).year)
    p.add_argument("--market", action="append", help="Filter to specific market_name(s)")
    p.add_argument("--dry-run", action="store_true", help="Skip the upsert; print row counts and a sample")
    p.add_argument("--help-only", action="store_true", help="Print this help and exit")
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    load_env_files()

    nass_api_key = require_env("USDA_NASS_API_KEY", "NASS_API_KEY")
    supabase_url = require_env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")

    markets = MARKETS
    if args.market:
        wanted = {m.lower() for m in args.market}
        markets = [m for m in MARKETS if m["market_name"].lower() in wanted]
        if not markets:
            raise ImporterError(f"No markets matched filter(s): {', '.join(args.market)}")

    summary: list[dict[str, Any]] = []
    all_rows: list[dict[str, Any]] = []
    errors: list[str] = []

    for market in markets:
        market_normalized: list[dict[str, Any]] = []
        for agg_level in ("NATIONAL", "STATE"):
            eprint(f"Fetching {market['market_name']} acreage ({agg_level}) for {args.year}...")
            try:
                fetched = fetch_acreage(market["commodity"], args.year, nass_api_key, agg_level)
            except ImporterError as exc:
                errors.append(str(exc))
                eprint(f"  ERROR: {exc}")
                continue
            normalized = normalize_rows(fetched, market, args.year)
            market_normalized.extend(normalized)
            eprint(f"  {agg_level}: {len(fetched)} raw -> {len(normalized)} usable rows")

        all_rows.extend(market_normalized)
        summary.append({
            "market_name": market["market_name"],
            "rows": len(market_normalized),
        })

    # Dedupe: NASS sometimes returns multiple rows that map to the same
    # source_program after our short_desc → program collapse. Keep the row
    # with the most recent source_release_date per unique key.
    deduped: dict[tuple, dict[str, Any]] = {}
    for row in all_rows:
        key = (
            row["country"],
            row["region_code"],
            row["commodity"],
            row["market_year"],
            row["source_program"],
        )
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = row
            continue
        # Prefer more recent release date; tie-break on higher acres
        # (USDA refines upward as the season firms up).
        ex_date = existing.get("source_release_date") or ""
        new_date = row.get("source_release_date") or ""
        if new_date > ex_date:
            deduped[key] = row
        elif new_date == ex_date:
            ex_acres = existing.get("planted_acres") or 0
            new_acres = row.get("planted_acres") or 0
            if new_acres > ex_acres:
                deduped[key] = row
    deduped_rows = list(deduped.values())
    eprint(f"Deduped {len(all_rows)} -> {len(deduped_rows)} unique upsert rows")

    upserted = 0
    if not args.dry_run and deduped_rows:
        upserted = upsert_rows(supabase_url, service_key, deduped_rows)

    print(json.dumps({
        "year": args.year,
        "markets": [m["market_name"] for m in markets],
        "rows_fetched": len(all_rows),
        "rows_deduped": len(deduped_rows),
        "rows_upserted": upserted,
        "summary": summary,
        "errors": errors,
        "sample_rows": deduped_rows[:3],
        "dry_run": args.dry_run,
    }, indent=2))

    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
