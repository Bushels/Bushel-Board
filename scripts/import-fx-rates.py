#!/usr/bin/env python3
"""
Daily FX importer for Bushel Board.

Fetches daily USD/CAD exchange rates from Yahoo Finance, upserts them into the
fx_rates Supabase table, then backfills grain_prices.cad_price for matching
price dates.

Usage:
  python3 scripts/import-fx-rates.py
  python3 scripts/import-fx-rates.py --days 30
  python3 scripts/import-fx-rates.py --dry-run
  python3 scripts/import-fx-rates.py --help

Environment variables:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
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
from pathlib import Path
from typing import Any

YAHOO_BASE_URL = "https://query2.finance.yahoo.com/v8/finance/chart"
SUPABASE_TIMEOUT_SECONDS = 60
YAHOO_TIMEOUT_SECONDS = 60
YAHOO_RETRY_WAIT_SECONDS = 2.0
UPSERT_BATCH_SIZE = 200
DEFAULT_DAYS = 370
PAIR = "USD/CAD"
PRIMARY_SYMBOL = "USDCAD=X"
FALLBACK_SYMBOL = "CADUSD=X"


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


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    raise ImporterError(f"Missing required environment variable: {', '.join((name, *alternates))}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import daily USD/CAD FX rates into Supabase")
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_DAYS,
        help=f"Look back this many calendar days (default: {DEFAULT_DAYS}).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and transform data but do not write to Supabase.",
    )
    return parser.parse_args()


def request_json(url: str, *, timeout: int) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BushelBoard/1.0)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def fetch_chart(symbol: str, days: int) -> dict[str, Any]:
    url = (
        f"{YAHOO_BASE_URL}/{urllib.parse.quote(symbol)}"
        f"?range={days + 7}d&interval=1d&includePrePost=false"
    )

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            payload = request_json(url, timeout=YAHOO_TIMEOUT_SECONDS)
            chart = payload.get("chart", {})
            result = chart.get("result") or []
            if not result:
                raise ImporterError(f"Yahoo returned no chart result for {symbol}")
            return result[0]
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            last_error = ImporterError(f"Yahoo request failed for {symbol}: HTTP {exc.code} {body[:300]}")
            if exc.code in (429, 500, 502, 503, 504) and attempt == 0:
                time.sleep(YAHOO_RETRY_WAIT_SECONDS)
                continue
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt == 0:
                time.sleep(YAHOO_RETRY_WAIT_SECONDS)
                continue
            break

    raise ImporterError(str(last_error or f"Failed to fetch {symbol}"))


def build_fx_rows(days: int) -> tuple[list[dict[str, Any]], str, bool]:
    charts_to_try = [
        (PRIMARY_SYMBOL, False),
        (FALLBACK_SYMBOL, True),
    ]
    last_error: Exception | None = None

    for symbol, invert in charts_to_try:
        try:
            chart = fetch_chart(symbol, days)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            eprint(f"  {symbol} failed: {exc}")
            continue

        timestamps = chart.get("timestamp") or []
        closes = ((chart.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
        rows: list[dict[str, Any]] = []

        for ts, close in zip(timestamps, closes, strict=False):
            if close in (None, 0):
                continue
            rate = (1 / float(close)) if invert else float(close)
            date_value = time.strftime("%Y-%m-%d", time.gmtime(int(ts)))
            rows.append(
                {
                    "date": date_value,
                    "pair": PAIR,
                    "rate": round(rate, 6),
                    "source": f"yahoo-finance:{symbol}{':inverted' if invert else ''}",
                }
            )

        deduped: dict[str, dict[str, Any]] = {row["date"]: row for row in rows}
        ordered = [deduped[date] for date in sorted(deduped.keys())]
        if not ordered:
            raise ImporterError(f"Yahoo returned no usable closes for {symbol}")

        latest_date = dt.date.fromisoformat(ordered[-1]["date"])
        cutoff_date = latest_date - dt.timedelta(days=days)
        filtered = [row for row in ordered if dt.date.fromisoformat(row["date"]) >= cutoff_date]
        if not filtered:
            raise ImporterError(f"Yahoo returned no rows inside the requested {days}-day window for {symbol}")

        return filtered, symbol, invert

    raise ImporterError(str(last_error or "Unable to fetch FX data from Yahoo Finance"))


def postgrest_request(
    supabase_url: str,
    service_role_key: str,
    path: str,
    *,
    method: str = "GET",
    payload: Any | None = None,
    headers: dict[str, str] | None = None,
) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{supabase_url.rstrip('/')}{path}",
        data=body,
        method=method,
        headers={
            "Accept": "application/json",
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            **({"Content-Type": "application/json"} if payload is not None else {}),
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            if response.status == 204:
                return None
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", "ignore")
        raise ImporterError(f"Supabase request failed ({method} {path}): HTTP {exc.code} {body_text[:500]}") from exc


def upsert_fx_rows(supabase_url: str, service_role_key: str, rows: list[dict[str, Any]]) -> int:
    total = 0
    for start in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[start : start + UPSERT_BATCH_SIZE]
        payload = postgrest_request(
            supabase_url,
            service_role_key,
            "/rest/v1/fx_rates?on_conflict=date,pair",
            method="POST",
            payload=batch,
            headers={
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
        )
        total += len(payload) if isinstance(payload, list) else len(batch)
    return total


def recalculate_cad_prices(
    supabase_url: str,
    service_role_key: str,
    start_date: str,
    end_date: str,
) -> dict[str, int]:
    payload = postgrest_request(
        supabase_url,
        service_role_key,
        "/rest/v1/rpc/recalculate_grain_prices_cad",
        method="POST",
        payload={
            "p_start_date": start_date,
            "p_end_date": end_date,
        },
    )
    if isinstance(payload, list) and payload:
        payload = payload[0]
    if not isinstance(payload, dict):
        raise ImporterError(f"Unexpected recalculate_grain_prices_cad response: {payload!r}")
    return {
        "usd_rows_updated": int(payload.get("usd_rows_updated", 0) or 0),
        "cad_rows_updated": int(payload.get("cad_rows_updated", 0) or 0),
        "missing_fx_rows": int(payload.get("missing_fx_rows", 0) or 0),
    }


def fetch_verification_rows(
    supabase_url: str,
    service_role_key: str,
    start_date: str,
) -> dict[str, Any]:
    fx_rows = postgrest_request(
        supabase_url,
        service_role_key,
        "/rest/v1/fx_rates"
        f"?pair=eq.{urllib.parse.quote(PAIR)}"
        f"&date=gte.{start_date}"
        "&select=date,pair,rate,source"
        "&order=date.desc"
        "&limit=5",
    )
    grain_rows = postgrest_request(
        supabase_url,
        service_role_key,
        "/rest/v1/grain_prices"
        f"?price_date=gte.{start_date}"
        "&currency=eq.USD"
        "&cad_price=not.is.null"
        "&select=grain,contract,price_date,settlement_price,cad_price,currency"
        "&order=price_date.desc"
        "&limit=5",
    )
    return {
        "fx_rates": fx_rows if isinstance(fx_rows, list) else [],
        "grain_prices": grain_rows if isinstance(grain_rows, list) else [],
    }


def main() -> None:
    start_time = time.time()
    load_env_files()
    args = parse_args()

    if args.days < 1 or args.days > 3650:
        raise ImporterError("--days must be between 1 and 3650")

    supabase_url = require_env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    eprint(f"Fetching {PAIR} for the last {args.days} days from Yahoo Finance...")
    rows, symbol_used, inverted = build_fx_rows(args.days)
    start_date = rows[0]["date"]
    end_date = rows[-1]["date"]

    if args.dry_run:
        summary = {
            "status": "dry_run",
            "pair": PAIR,
            "symbol_used": symbol_used,
            "inverted": inverted,
            "rows_fetched": len(rows),
            "date_range": {"start": start_date, "end": end_date},
            "sample_rows": rows[:5],
            "duration_ms": round((time.time() - start_time) * 1000),
        }
        print(json.dumps(summary, indent=2))
        return

    upserted = upsert_fx_rows(supabase_url, service_role_key, rows)
    recalculation = recalculate_cad_prices(supabase_url, service_role_key, start_date, end_date)
    verification = fetch_verification_rows(supabase_url, service_role_key, start_date)

    summary = {
        "status": "success",
        "pair": PAIR,
        "symbol_used": symbol_used,
        "inverted": inverted,
        "rows_upserted": upserted,
        "date_range": {"start": start_date, "end": end_date},
        "cad_backfill": recalculation,
        "verification": verification,
        "duration_ms": round((time.time() - start_time) * 1000),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        eprint("Interrupted")
        raise SystemExit(130)
    except Exception as exc:  # noqa: BLE001
        eprint(f"ERROR: {exc}")
        raise SystemExit(1)
