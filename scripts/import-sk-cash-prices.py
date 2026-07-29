#!/usr/bin/env python3
"""Saskatchewan Dashboard weekly cash price importer for Bushel Board.

Source (research-verified live 2026-06-10): dashboard.saskatchewan.ca per-crop CSV
export endpoints - weekly Saskatchewan provincial AVERAGE cash prices (Wednesday
observation dates, history to 1980). This is a provincial average price series,
NOT local elevator basis; it feeds provincial cash-vs-futures context.

Gotcha: the server returns 403 to non-browser User-Agents - a browser UA is required.
Idempotent upsert keyed (series_name, price_date) into sk_cash_prices.

Usage:
  python scripts/import-sk-cash-prices.py --dry-run --since 2026-01-01
  python scripts/import-sk-cash-prices.py --since 1980-01-01   # backfill
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from source_run import SourceRunError, write_source_run  # noqa: E402

BASE = "https://dashboard.saskatchewan.ca/export"
TIMEOUT = 60
UPSERT_BATCH_SIZE = 500
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# Verified export ids (2026-06-10). Crop key = URL path segment.
CROP_SERIES = {
    "canola": 4954,
    "wheat": 4956,
    "barley": 4959,
    "oats": 4962,
    "flax": 4965,
    "mustard": 4968,
    "lentils": 4971,
    "chickpeas": 4974,
    "canary-seed": 4977,
    "field-peas": 4980,
}


class ImporterError(RuntimeError):
    pass


def log(message: str) -> None:
    print(message, file=sys.stderr)


def fetch_csv(crop: str, export_id: int) -> str:
    req = urllib.request.Request(
        f"{BASE}/{crop}/{export_id}.csv",
        headers={"User-Agent": BROWSER_UA, "Accept": "text/csv"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            return response.read().decode("utf-8-sig")
    except urllib.error.HTTPError as exc:
        raise ImporterError(f"{crop} CSV fetch failed: HTTP {exc.code}") from exc


def parse_rows(crop: str, raw_csv: str, since: dt.date) -> list[dict[str, Any]]:
    """One row per (series column, date). Dates are YYYY/MM/DD; blanks skipped."""
    reader = csv.reader(io.StringIO(raw_csv))
    header = next(reader, None)
    if not header or not header[0].strip().lower().startswith("date"):
        raise ImporterError(f"{crop}: unexpected CSV header {header!r}")

    series_names = [name.strip() for name in header[1:]]
    rows: list[dict[str, Any]] = []
    for record in reader:
        if not record or not record[0].strip():
            continue
        try:
            price_date = dt.datetime.strptime(record[0].strip(), "%Y/%m/%d").date()
        except ValueError:
            continue
        if price_date < since:
            continue
        for index, series in enumerate(series_names, start=1):
            cell = record[index].strip() if index < len(record) else ""
            if not cell:
                continue
            try:
                value = float(cell.replace(",", "").replace("$", ""))
            except ValueError:
                continue
            lowered = series.lower()
            if "tonne" in lowered:
                unit = "$/tonne"
            elif "cwt" in lowered:
                unit = "$/cwt"
            elif "bu" in lowered:
                unit = "$/bu"
            else:
                unit = "$"
            rows.append(
                {
                    "crop": crop,
                    "series_name": f"{crop}: {series}",
                    "price_date": price_date.isoformat(),
                    "value": value,
                    "unit": unit,
                }
            )
    return rows


def upsert_rows(supabase_url: str, service_key: str, rows: list[dict[str, Any]]) -> None:
    url = supabase_url.rstrip("/") + "/rest/v1/sk_cash_prices?on_conflict=series_name,price_date"
    for start in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[start : start + UPSERT_BATCH_SIZE]
        req = urllib.request.Request(
            url,
            data=json.dumps(batch).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            raise ImporterError(f"Supabase upsert failed: HTTP {exc.code} {body[:400]}") from exc


def load_env_files() -> None:
    for name in (".env.local", ".env"):
        path = os.path.join(os.getcwd(), name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"'))


def record_source_run_or_fail(
    supabase_url: str,
    service_key: str,
    **kwargs: Any,
) -> dict[str, Any]:
    """Record collector freshness or fail the run after the idempotent upsert."""
    try:
        return write_source_run(supabase_url, service_key, **kwargs)
    except SourceRunError as exc:
        raise ImporterError(
            "SK cash-price rows were upserted, but the source_runs ledger write "
            f"failed; replay is safe and this run is not successful: {exc}"
        ) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since", default=None, help="ISO date floor (default: 90 days back)")
    parser.add_argument("--crops", default="all", help="comma list of crop keys or 'all'")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env_files()
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    since = (
        dt.date.fromisoformat(args.since)
        if args.since
        else dt.date.today() - dt.timedelta(days=90)
    )
    crops = list(CROP_SERIES) if args.crops == "all" else [c.strip() for c in args.crops.split(",")]

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not args.dry_run and (not supabase_url or not service_key):
        raise ImporterError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    all_rows: list[dict[str, Any]] = []
    per_crop: dict[str, int] = {}
    for crop in crops:
        export_id = CROP_SERIES.get(crop)
        if export_id is None:
            raise ImporterError(f"Unknown crop key {crop!r}; known: {', '.join(CROP_SERIES)}")
        rows = parse_rows(crop, fetch_csv(crop, export_id), since)
        per_crop[crop] = len(rows)
        all_rows.extend(rows)
        log(f"[{crop}] {len(rows)} rows since {since}")

    empty_crops = [crop for crop in crops if per_crop.get(crop, 0) == 0]
    if empty_crops:
        raise ImporterError(
            "Saskatchewan cash-price source returned no usable rows for "
            f"requested crop(s): {', '.join(empty_crops)}"
        )

    if not args.dry_run and all_rows:
        upsert_rows(supabase_url, service_key, all_rows)
        dates = sorted(row["price_date"] for row in all_rows)
        record_source_run_or_fail(
            supabase_url,
            service_key,
            source_name="sk_cash_prices",
            source_lane="canada",
            collector_name="import-sk-cash-prices",
            status="success",
            source_period_start=dates[0],
            source_period_end=dates[-1],
            latest_source_label=dates[-1],
            rows_inserted=len(all_rows),
            started_at=started_at,
            metadata={"since": since.isoformat(), "per_crop": per_crop},
        )

    print(
        json.dumps(
            {
                "status": "success",
                "dry_run": args.dry_run,
                "since": since.isoformat(),
                "rows": len(all_rows),
                "per_crop": per_crop,
                "sample": all_rows[:3],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ImporterError as exc:
        print(json.dumps({"status": "error", "message": str(exc)}))
        sys.exit(1)
