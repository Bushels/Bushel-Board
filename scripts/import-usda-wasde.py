#!/usr/bin/env python3
"""
USDA FAS PSD / WASDE raw importer.

Imports raw monthly PSD balance-sheet rows from the USDA FAS OpenData API into
usda_wasde_raw. This is the balance-sheet foundation for the future US thesis lane.

Usage:
  python3 scripts/import-usda-wasde.py
  python3 scripts/import-usda-wasde.py --dry-run
  python3 scripts/import-usda-wasde.py --market-year 2025
  python3 scripts/import-usda-wasde.py --market Corn --market Soybeans
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

PSD_BASE_URL = "https://apps.fas.usda.gov/OpenData/api/psd"
SUPABASE_TIMEOUT_SECONDS = 60
USDA_TIMEOUT_SECONDS = 60
UPSERT_BATCH_SIZE = 500

MARKETS = [
    {"market_name": "Corn", "commodity_code": "0440000", "commodity_name": "Corn", "country_code": "US"},
    {"market_name": "Soybeans", "commodity_code": "2222000", "commodity_name": "Soybeans", "country_code": "US"},
    {"market_name": "Barley", "commodity_code": "0430000", "commodity_name": "Barley", "country_code": "US"},
    {"market_name": "Oats", "commodity_code": "0452000", "commodity_name": "Oats", "country_code": "US"},
    {"market_name": "Wheat", "commodity_code": "0410000", "commodity_name": "Wheat", "country_code": "US"},
]

class ImporterError(Exception):
    pass


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
    parser = argparse.ArgumentParser(description="Import USDA PSD/WASDE raw rows into Supabase")
    parser.add_argument("--market-year", type=int, action="append", dest="market_years", help="PSD market year (repeatable). Defaults to current UTC year.")
    parser.add_argument("--market", action="append", help="Limit to specific market_name values from MARKETS.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and normalize without writing to Supabase.")
    return parser.parse_args()


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    raise ImporterError(f"Missing required environment variable: {', '.join((name, *alternates))}")


def current_market_year() -> int:
    return dt.datetime.now(dt.timezone.utc).year


def choose_markets(filters: list[str] | None) -> list[dict[str, Any]]:
    if not filters:
        return MARKETS
    wanted = {item.strip().lower() for item in filters}
    selected = [m for m in MARKETS if m['market_name'].lower() in wanted]
    if not selected:
        raise ImporterError(f"No markets matched filter(s): {', '.join(filters)}")
    return selected


def request_json(url: str, *, timeout: int) -> Any:
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; BushelBoard/1.0)',
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def fetch_rows(market: dict[str, Any], market_year: int, api_key: str) -> list[dict[str, Any]]:
    url = f"{PSD_BASE_URL}/commodity/{market['commodity_code']}/country/{market['country_code']}/year/{market_year}?apikey={urllib.parse.quote(api_key)}"
    try:
        data = request_json(url, timeout=USDA_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', 'ignore')
        raise ImporterError(f"USDA PSD request failed for {market['market_name']} {market_year}: HTTP {exc.code} {body[:300]}") from exc
    if not isinstance(data, list):
        raise ImporterError(f"Unexpected USDA PSD response for {market['market_name']} {market_year}: {type(data).__name__}")
    return data


def normalize_rows(rows: list[dict[str, Any]], market: dict[str, Any], market_year: int) -> list[dict[str, Any]]:
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    out = []
    for row in rows:
        out.append({
            'crop_year': str(market_year),
            'market_name': market['market_name'],
            'commodity_code': str(row.get('commodityCode') or market['commodity_code']),
            'commodity_name': market['commodity_name'],
            'country_code': str(row.get('countryCode') or market['country_code']),
            'market_year': str(row.get('marketYear') or market_year),
            'calendar_year': int(row.get('calendarYear')),
            'month': int(row.get('month')),
            'attribute_id': int(row.get('attributeId')),
            'unit_id': int(row.get('unitId')),
            'value': float(row.get('value')) if row.get('value') is not None else None,
            'source': 'usda_fas_psd_api',
            'imported_at': now,
        })
    return out


def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def upsert_rows(supabase_url: str, service_key: str, rows: list[dict[str, Any]]) -> None:
    url = supabase_url.rstrip('/') + '/rest/v1/usda_wasde_raw'
    conflict = urllib.parse.quote('commodity_code,country_code,market_year,calendar_year,month,attribute_id,unit_id', safe=',')
    for batch in chunked(rows, UPSERT_BATCH_SIZE):
        req = urllib.request.Request(
            f"{url}?on_conflict={conflict}",
            data=json.dumps(batch).encode('utf-8'),
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal',
                'apikey': service_key,
                'Authorization': f'Bearer {service_key}',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode('utf-8', 'ignore')
            raise ImporterError(f"Supabase upsert failed: HTTP {exc.code} {body[:500]}") from exc


def main() -> None:
    load_env_files()
    args = parse_args()
    supabase_url = require_env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
    service_key = require_env('SUPABASE_SERVICE_ROLE_KEY')
    fas_api_key = require_env('FAS_API_KEY')

    market_years = args.market_years or [current_market_year()]
    markets = choose_markets(args.market)

    print(f"Importing USDA PSD/WASDE raw rows for markets: {', '.join(m['market_name'] for m in markets)} years: {', '.join(str(y) for y in market_years)}", file=os.sys.stderr)

    all_rows = []
    summary = []
    for market_year in market_years:
        for market in markets:
            print(f"Fetching {market['market_name']} for market year {market_year}...", file=os.sys.stderr)
            rows = fetch_rows(market, market_year, fas_api_key)
            normalized = normalize_rows(rows, market, market_year)
            all_rows.extend(normalized)
            latest_month = max((r['month'] for r in normalized), default=None)
            latest_calendar_year = max((r['calendar_year'] for r in normalized), default=None)
            summary.append({
                'market_name': market['market_name'],
                'market_year': market_year,
                'rows_fetched': len(rows),
                'rows_normalized': len(normalized),
                'latest_calendar_year': latest_calendar_year,
                'latest_month': latest_month,
            })
            print(f"  {len(rows)} raw rows -> {len(normalized)} normalized rows (latest {latest_calendar_year}-{latest_month:02d} if latest_month else 'n/a')", file=os.sys.stderr)

    if not args.dry_run:
        upsert_rows(supabase_url, service_key, all_rows)

    print(json.dumps({
        'status': 'success',
        'dry_run': args.dry_run,
        'market_years': market_years,
        'markets': [m['market_name'] for m in markets],
        'rows_total': len(all_rows),
        'summary': summary,
    }, indent=2))

if __name__ == '__main__':
    main()
