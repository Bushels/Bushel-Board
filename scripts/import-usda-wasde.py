#!/usr/bin/env python3
"""
USDA FAS PSD / WASDE raw importer.

Imports raw monthly PSD balance-sheet rows from the USDA FAS OpenData API into
usda_wasde_raw. This is the balance-sheet foundation for the future US thesis lane.

Usage:
  python3 scripts/import-usda-wasde.py
  python3 scripts/import-usda-wasde.py --dry-run
  python3 scripts/import-usda-wasde.py --market-year 2025
  python3 scripts/import-usda-wasde.py --report-month 2026-04
  python3 scripts/import-usda-wasde.py --last-n-months 12
  python3 scripts/import-usda-wasde.py --market Corn --market Soybeans
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
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

HEARTBEAT_CLI = Path(__file__).with_name("write-collector-heartbeat.py")
TRAJECTORY_SCAN_TYPE = "collector_wasde"
TRAJECTORY_TRIGGER = "USDA WASDE/PSD monthly refresh"
ENDING_STOCKS_ATTRIBUTE_ID = 176  # PSD "Ending Stocks"

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
    parser.add_argument("--report-month", action="append", dest="report_months", help="Specific WASDE/PSD report month in YYYY-MM format (repeatable).")
    parser.add_argument("--last-n-months", type=int, default=12, help="Backfill the last N calendar report months when --market-year is not supplied. Defaults to 12.")
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


def parse_report_month(value: str) -> dt.date:
    try:
        year, month = value.split("-", 1)
        return dt.date(int(year), int(month), 1)
    except Exception as exc:
        raise ImporterError(f"--report-month must be YYYY-MM, got {value!r}") from exc


def _add_months(month_start: dt.date, delta: int) -> dt.date:
    month_index = (month_start.year * 12 + (month_start.month - 1)) + delta
    return dt.date(month_index // 12, (month_index % 12) + 1, 1)


def latest_report_months(n: int) -> list[dt.date]:
    if n < 1:
        raise ImporterError("--last-n-months must be >= 1")
    today = dt.datetime.now(dt.timezone.utc).date()
    current = dt.date(today.year, today.month, 1)
    return [_add_months(current, -i) for i in range(n)]


def candidate_market_years_for_report_month(report_month: dt.date) -> list[int]:
    # USDA PSD report months can carry old-crop and new-crop rows. Fetch both
    # likely market years, then filter by the report month returned by the API.
    return [report_month.year - 1, report_month.year]


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


def filter_report_month(rows: list[dict[str, Any]], report_month: dt.date) -> list[dict[str, Any]]:
    return [
        row for row in rows
        if row['calendar_year'] == report_month.year and row['month'] == report_month.month
    ]


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


def _wasde_source_week_ending(calendar_year: int, month: int) -> str:
    """PSD is monthly; emit the first of the month so downstream date-based queries sort stably."""
    try:
        return dt.date(int(calendar_year), int(month), 1).isoformat()
    except Exception:
        return dt.date.today().isoformat()


def build_heartbeat_previews(all_rows: list[dict[str, Any]], summary: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One heartbeat per market per market_year — uses latest PSD month in the fetched rows."""
    previews = []
    # Index latest row per (market_name, market_year) keyed on (calendar_year, month)
    latest: dict[tuple[str, str], dict[str, Any]] = {}
    for row in all_rows:
        key = (row['market_name'], row['market_year'])
        cur = latest.get(key)
        if cur is None:
            latest[key] = row
            continue
        if (row['calendar_year'], row['month']) > (cur['calendar_year'], cur['month']):
            latest[key] = row

    # Latest ending-stocks value per (market, market_year) by (calendar_year, month)
    ending_stocks_latest: dict[tuple[str, str], tuple[tuple[int, int], float]] = {}
    for row in all_rows:
        if row.get('attribute_id') != ENDING_STOCKS_ATTRIBUTE_ID:
            continue
        if row.get('value') is None:
            continue
        key = (row['market_name'], row['market_year'])
        ym = (row['calendar_year'], row['month'])
        cur = ending_stocks_latest.get(key)
        if cur is None or ym >= cur[0]:
            ending_stocks_latest[key] = (ym, float(row['value']))
    ending_stocks_by_market = {k: v[1] for k, v in ending_stocks_latest.items()}

    for (market_name, market_year), row in latest.items():
        ending = ending_stocks_by_market.get((market_name, market_year))
        if ending is None:
            signal_note = f"WASDE refresh — {row['calendar_year']}-{row['month']:02d}, ending stocks not yet reported"
            severity = "unknown"
        else:
            signal_note = f"WASDE refresh — {row['calendar_year']}-{row['month']:02d}, ending stocks {ending:.1f}"
            severity = "normal"
        previews.append({
            'market_name': market_name,
            'market_year': market_year,
            'calendar_year': row['calendar_year'],
            'month': row['month'],
            'severity': severity,
            'signal_note': signal_note,
            'source_week_ending': _wasde_source_week_ending(row['calendar_year'], row['month']),
        })
    return previews


def invoke_heartbeat(preview: dict[str, Any]) -> dict[str, Any]:
    """Subprocess-call the Phase 1 heartbeat CLI for a single US market."""
    evidence = {
        'collector': 'import-usda-wasde',
        'calendar_year': preview['calendar_year'],
        'month': preview['month'],
        'market_year': preview['market_year'],
    }
    cmd = [
        'python', str(HEARTBEAT_CLI),
        '--side', 'us',
        '--market', preview['market_name'],
        '--scan-type', TRAJECTORY_SCAN_TYPE,
        '--trigger', TRAJECTORY_TRIGGER,
        '--severity', preview['severity'],
        '--signal-note', preview['signal_note'],
        '--source-week-ending', preview['source_week_ending'],
        '--evidence-json', json.dumps(evidence),
        '--quiet',
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        ok = result.returncode == 0
        return {
            'market_name': preview['market_name'],
            'ok': ok,
            'stderr': result.stderr.strip()[:500] if not ok else None,
        }
    except Exception as exc:
        return {'market_name': preview['market_name'], 'ok': False, 'stderr': str(exc)[:500]}


def write_heartbeats(previews: list[dict[str, Any]]) -> dict[str, Any]:
    results = [invoke_heartbeat(p) for p in previews]
    written = sum(1 for r in results if r['ok'])
    return {'written': written, 'total': len(results), 'results': results}


def main() -> None:
    load_env_files()
    args = parse_args()
    supabase_url = require_env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
    service_key = require_env('SUPABASE_SERVICE_ROLE_KEY')
    fas_api_key = require_env('FAS_API_KEY')

    markets = choose_markets(args.market)
    report_months = [parse_report_month(m) for m in args.report_months] if args.report_months else None
    legacy_market_year_mode = args.market_years and report_months is None

    if report_months is None and not legacy_market_year_mode:
        report_months = latest_report_months(args.last_n_months)

    market_years = args.market_years or [current_market_year()]

    if legacy_market_year_mode:
        print(f"Importing USDA PSD/WASDE raw rows for markets: {', '.join(m['market_name'] for m in markets)} years: {', '.join(str(y) for y in market_years)}", file=os.sys.stderr)
    else:
        assert report_months is not None
        print(f"Importing USDA PSD/WASDE raw rows for markets: {', '.join(m['market_name'] for m in markets)} report months: {', '.join(m.strftime('%Y-%m') for m in report_months)}", file=os.sys.stderr)

    all_rows = []
    summary = []
    if legacy_market_year_mode:
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
                latest_label = f"{latest_calendar_year}-{latest_month:02d}" if latest_month is not None else "n/a"
                print(f"  {len(rows)} raw rows -> {len(normalized)} normalized rows (latest {latest_label})", file=os.sys.stderr)
    else:
        assert report_months is not None
        for report_month in report_months:
            years_for_month = args.market_years or candidate_market_years_for_report_month(report_month)
            for market_year in years_for_month:
                for market in markets:
                    label = report_month.strftime('%Y-%m')
                    print(f"Fetching {market['market_name']} for market year {market_year}, report month {label}...", file=os.sys.stderr)
                    rows = fetch_rows(market, market_year, fas_api_key)
                    normalized = normalize_rows(rows, market, market_year)
                    monthly = filter_report_month(normalized, report_month)
                    all_rows.extend(monthly)
                    summary.append({
                        'market_name': market['market_name'],
                        'market_year': market_year,
                        'report_month': label,
                        'rows_fetched': len(rows),
                        'rows_normalized': len(normalized),
                        'rows_after_report_month_filter': len(monthly),
                    })
                    print(f"  {len(rows)} raw rows -> {len(monthly)} rows for {label}", file=os.sys.stderr)

    heartbeat_previews = build_heartbeat_previews(all_rows, summary)

    if not args.dry_run:
        upsert_rows(supabase_url, service_key, all_rows)

    trajectory: dict[str, Any] = {'previews': heartbeat_previews}
    warnings: list[str] = []
    if not args.dry_run and heartbeat_previews:
        try:
            trajectory.update(write_heartbeats(heartbeat_previews))
        except Exception as exc:  # never fail parent on heartbeat issues
            warnings.append(f"heartbeat_write_failed: {exc!s}"[:500])

    payload: dict[str, Any] = {
        'status': 'success',
        'dry_run': args.dry_run,
        'market_years': market_years if legacy_market_year_mode else None,
        'report_months': [m.strftime('%Y-%m') for m in report_months] if report_months else None,
        'markets': [m['market_name'] for m in markets],
        'rows_total': len(all_rows),
        'summary': summary,
        'trajectory': trajectory,
    }
    if warnings:
        payload['warnings'] = warnings

    print(json.dumps(payload, indent=2))

if __name__ == '__main__':
    main()
