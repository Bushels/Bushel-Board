#!/usr/bin/env python3
"""
USDA FAS weekly export sales importer.

Fetches USDA Export Sales Reporting (ESR) data, aggregates it to weekly totals per
commodity/marketing year, and upserts the result to Supabase via PostgREST.

Usage:
  python3 scripts/import-usda-export-sales.py
  python3 scripts/import-usda-export-sales.py --dry-run
  python3 scripts/import-usda-export-sales.py --market-year 2026
  python3 scripts/import-usda-export-sales.py --market-year 2026 --no-next-year
  python3 scripts/import-usda-export-sales.py --commodity Wheat --commodity Corn

Environment variables:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  FAS_API_KEY
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

FAS_BASE_URL = "https://apps.fas.usda.gov/OpenData/api/esr"
SUPABASE_TIMEOUT_SECONDS = 60
USDA_TIMEOUT_SECONDS = 60
USDA_RATE_LIMIT_SECONDS = 2.0
UPSERT_BATCH_SIZE = 200

COMMODITIES = [
    {"commodity_code": 107, "commodity": "ALL WHEAT", "cgc_grain": "Wheat", "mapping_type": "primary"},
    {"commodity_code": 104, "commodity": "CORN", "cgc_grain": "Corn", "mapping_type": "primary"},
    {"commodity_code": 201, "commodity": "SOYBEANS", "cgc_grain": "Canola", "mapping_type": "proxy"},
    {"commodity_code": 207, "commodity": "SOYBEAN OIL", "cgc_grain": "Canola", "mapping_type": "proxy"},
    {"commodity_code": 206, "commodity": "SOYBEAN MEAL", "cgc_grain": "Canola", "mapping_type": "proxy"},
    {"commodity_code": 101, "commodity": "BARLEY", "cgc_grain": "Barley", "mapping_type": "primary"},
    {"commodity_code": 105, "commodity": "OATS", "cgc_grain": "Oats", "mapping_type": "primary"},
    {"commodity_code": 108, "commodity": "SORGHUM", "cgc_grain": "Sorghum", "mapping_type": "reference"},
]


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
            os.environ.setdefault(key, value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import USDA export sales into Supabase")
    parser.add_argument(
        "--market-year",
        type=int,
        action="append",
        dest="market_years",
        help="USDA marketing year end as integer (repeatable). Defaults to current UTC year.",
    )
    parser.add_argument(
        "--no-next-year",
        action="store_true",
        help="Do not also fetch the next marketing year.",
    )
    parser.add_argument(
        "--commodity",
        action="append",
        help="Limit import to specific commodity names from the COMMODITIES list (repeatable).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and aggregate data but do not write to Supabase.",
    )
    parser.add_argument(
        "--max-buyers",
        type=int,
        default=5,
        help="How many top buyers to keep per week (default: 5).",
    )
    return parser.parse_args()


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    readable = ", ".join((name, *alternates))
    raise ImporterError(f"Missing required environment variable: {readable}")


def current_market_year() -> int:
    return dt.datetime.now(dt.timezone.utc).year


def format_market_year(market_year_end: int) -> str:
    return f"{market_year_end - 1}-{market_year_end}"


def choose_commodities(filters: list[str] | None) -> list[dict[str, Any]]:
    if not filters:
        return COMMODITIES
    wanted = {item.strip().lower() for item in filters}
    selected = [c for c in COMMODITIES if c["commodity"].lower() in wanted]
    if not selected:
        raise ImporterError(
            f"No commodities matched filter(s): {', '.join(filters)}"
        )
    return selected


def request_json(url: str, *, timeout: int, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
            "Accept": "application/json",
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def fetch_countries(fas_api_key: str) -> dict[int, str]:
    url = f"{FAS_BASE_URL}/countries?apikey={urllib.parse.quote(fas_api_key)}"
    rows = request_json(url, timeout=USDA_TIMEOUT_SECONDS)
    countries: dict[int, str] = {}
    for row in rows:
        code = row.get("countryCode")
        if code is None:
            continue
        label = (row.get("countryDescription") or row.get("countryName") or str(code)).strip()
        countries[int(code)] = " ".join(label.split())
    return countries


def fetch_export_rows(commodity_code: int, market_year: int, fas_api_key: str) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({"apikey": fas_api_key})
    url = (
        f"{FAS_BASE_URL}/exports/commodityCode/{commodity_code}"
        f"/allCountries/marketYear/{market_year}?{query}"
    )
    try:
        data = request_json(url, timeout=USDA_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            f"USDA request failed for commodity_code={commodity_code}, market_year={market_year}: HTTP {exc.code} {body[:300]}"
        ) from exc
    if not isinstance(data, list):
        raise ImporterError(
            f"Unexpected USDA response for commodity_code={commodity_code}, market_year={market_year}: {type(data).__name__}"
        )
    return data


def iso_week_date(value: str) -> str:
    return value[:10]


def number(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return float(value)


def aggregate_rows(
    rows: list[dict[str, Any]],
    commodity_meta: dict[str, Any],
    market_year: int,
    country_names: dict[int, str],
    max_buyers: int,
) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    buyers_by_week: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))

    for row in rows:
        week_ending = iso_week_date(str(row.get("weekEndingDate", "")))
        if not week_ending:
            continue

        group = grouped.setdefault(
            week_ending,
            {
                "commodity_code": commodity_meta["commodity_code"],
                "commodity": commodity_meta["commodity"],
                "cgc_grain": commodity_meta["cgc_grain"],
                "mapping_type": commodity_meta["mapping_type"],
                "market_year": format_market_year(market_year),
                "week_ending": week_ending,
                "net_sales_mt": 0.0,
                "exports_mt": 0.0,
                "outstanding_mt": 0.0,
                "cumulative_exports_mt": 0.0,
                "total_commitments_mt": 0.0,
                "net_sales_next_yr_mt": 0.0,
                "source": "usda_esr_api",
                "export_pace_pct": None,
                "usda_projection_mt": None,
            },
        )

        group["net_sales_mt"] += number(row.get("currentMYNetSales"))
        group["exports_mt"] += number(row.get("weeklyExports"))
        group["outstanding_mt"] += number(row.get("outstandingSales"))
        group["cumulative_exports_mt"] += number(row.get("accumulatedExports"))
        group["total_commitments_mt"] += number(row.get("currentMYTotalCommitment"))
        group["net_sales_next_yr_mt"] += number(row.get("nextMYNetSales"))

        country_code = row.get("countryCode")
        if country_code is not None:
            buyers_by_week[week_ending][int(country_code)] += number(row.get("currentMYNetSales"))

    results: list[dict[str, Any]] = []
    for week_ending in sorted(grouped.keys()):
        record = grouped[week_ending]
        buyer_rows = sorted(
            buyers_by_week[week_ending].items(),
            key=lambda item: item[1],
            reverse=True,
        )
        record["top_buyers"] = json.dumps(
            [
                {
                    "country": country_names.get(country_code, str(country_code)).title(),
                    "country_code": country_code,
                    "volume_mt": round(mt, 3),
                }
                for country_code, mt in buyer_rows
                if mt != 0
            ][:max_buyers]
        )

        for key in (
            "net_sales_mt",
            "exports_mt",
            "outstanding_mt",
            "cumulative_exports_mt",
            "total_commitments_mt",
            "net_sales_next_yr_mt",
        ):
            record[key] = round(record[key], 3)

        results.append(record)

    return results


def validate_aggregates(records: list[dict[str, Any]], commodity: str, market_year: str) -> list[str]:
    warnings: list[str] = []
    negatives = 0
    prev_cumulative: float | None = None

    for record in sorted(records, key=lambda r: r["week_ending"]):
        net_sales = float(record["net_sales_mt"] or 0)
        outstanding = float(record["outstanding_mt"] or 0)
        cumulative = float(record["cumulative_exports_mt"] or 0)

        if net_sales < 0:
            negatives += 1
            if negatives > 3:
                warnings.append(
                    f"{commodity} {market_year}: more than 3 consecutive negative net-sales weeks by {record['week_ending']}"
                )
                negatives = 0
        else:
            negatives = 0

        if prev_cumulative is not None and cumulative + 1e-6 < prev_cumulative:
            warnings.append(
                f"{commodity} {market_year}: cumulative exports fell from {prev_cumulative} to {cumulative} on {record['week_ending']}"
            )
        prev_cumulative = cumulative

        if outstanding < 0:
            warnings.append(
                f"{commodity} {market_year}: negative outstanding sales on {record['week_ending']} ({outstanding})"
            )

    return warnings


def postgrest_upsert(
    supabase_url: str,
    service_role_key: str,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0

    total = 0
    for i in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[i : i + UPSERT_BATCH_SIZE]
        url = (
            f"{supabase_url.rstrip('/')}/rest/v1/usda_export_sales"
            "?on_conflict=commodity,market_year,week_ending"
        )
        body = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": "resolution=merge-duplicates,return=representation",
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            raise ImporterError(
                f"Supabase upsert failed: HTTP {exc.code} {body[:500]}"
            ) from exc
        total += len(payload) if isinstance(payload, list) else len(batch)
    return total


def fetch_latest_week(
    supabase_url: str,
    service_role_key: str,
    commodity: str,
    market_year: str,
) -> dict[str, Any] | None:
    params = urllib.parse.urlencode(
        {
            "commodity": f"eq.{commodity}",
            "market_year": f"eq.{market_year}",
            "select": "commodity_code,commodity,market_year,week_ending,net_sales_mt,exports_mt,outstanding_mt,top_buyers",
            "order": "week_ending.desc",
            "limit": "1",
        }
    )
    url = f"{supabase_url.rstrip('/')}/rest/v1/usda_export_sales?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
        payload = json.load(response)
    if isinstance(payload, list) and payload:
        return payload[0]
    return None


def main() -> None:
    start = time.time()
    load_env_files()
    args = parse_args()

    market_years = args.market_years[:] if args.market_years else [current_market_year()]
    if not args.no_next_year:
        next_year = max(market_years) + 1
        if next_year not in market_years:
            market_years.append(next_year)

    commodities = choose_commodities(args.commodity)
    fas_api_key = require_env("FAS_API_KEY")
    supabase_url = require_env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    eprint(
        f"Importing USDA export sales for {len(commodities)} commodities across market years: {', '.join(str(y) for y in market_years)}"
    )

    countries = fetch_countries(fas_api_key)
    eprint(f"Loaded {len(countries)} USDA country names")

    all_rows: list[dict[str, Any]] = []
    latest_week: str | None = None
    warnings: list[str] = []
    errors: list[str] = []
    commodities_imported = 0

    for commodity in commodities:
        commodity_had_data = False
        for market_year in market_years:
            eprint(f"Fetching {commodity['commodity']} ({commodity['commodity_code']}) for market year {market_year}...")
            try:
                rows = fetch_export_rows(commodity["commodity_code"], market_year, fas_api_key)
            except ImporterError as exc:
                errors.append(str(exc))
                eprint(f"  ERROR: {exc}")
                continue

            if not rows:
                warning = (
                    f"{commodity['commodity']} {market_year}: USDA returned empty response; skipped without deleting prior data"
                )
                warnings.append(warning)
                eprint(f"  WARNING: {warning}")
                continue

            aggregated = aggregate_rows(rows, commodity, market_year, countries, args.max_buyers)
            warnings.extend(
                validate_aggregates(aggregated, commodity["commodity"], str(market_year))
            )

            if aggregated:
                commodity_had_data = True
                all_rows.extend(aggregated)
                latest_week = max(latest_week or aggregated[0]["week_ending"], aggregated[-1]["week_ending"])
                eprint(
                    f"  {len(rows)} country rows -> {len(aggregated)} weekly rows (latest {aggregated[-1]['week_ending']})"
                )

            time.sleep(USDA_RATE_LIMIT_SECONDS)

        if commodity_had_data:
            commodities_imported += 1

    if args.dry_run:
        duration_ms = round((time.time() - start) * 1000)
        summary = {
            "status": "dry_run",
            "commodities_imported": commodities_imported,
            "total_rows_upserted": 0,
            "latest_week": latest_week,
            "market_years": [str(y) for y in market_years],
            "warnings": warnings,
            "errors": errors,
            "duration_ms": duration_ms,
            "sample_rows": all_rows[:5],
        }
        print(json.dumps(summary, indent=2))
        return

    upserted = postgrest_upsert(supabase_url, service_role_key, all_rows)

    verification: list[dict[str, Any]] = []
    for commodity in commodities[: min(3, len(commodities))]:
        latest = fetch_latest_week(
            supabase_url,
            service_role_key,
            commodity["commodity"],
            format_market_year(market_years[0]),
        )
        if latest:
            verification.append(latest)

    duration_ms = round((time.time() - start) * 1000)
    status = "success" if not errors else "partial"
    summary = {
        "status": status,
        "commodities_imported": commodities_imported,
        "total_rows_upserted": upserted,
        "latest_week": latest_week,
        "market_years": [str(y) for y in market_years],
        "warnings": warnings,
        "errors": errors,
        "verification": verification,
        "duration_ms": duration_ms,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except ImporterError as exc:
        eprint(f"Fatal error: {exc}")
        sys.exit(1)
    except KeyboardInterrupt:
        eprint("Interrupted")
        sys.exit(130)
