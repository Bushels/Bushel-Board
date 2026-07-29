#!/usr/bin/env python3
"""Import Canada-origin U.S. Canola seed and oil customs quantities.

Source:
  U.S. Census International Trade API, monthly imports by Harmonized System.

Canonical measure:
  CON_QY1_MO (imports for consumption, quantity 1), only when UNIT_QY1=KG
  and the paired missing-value flag is blank.

Cross-check only:
  GEN_QY1_MO (general imports, quantity 1). This is retained to explain
  bonded-warehouse timing differences; it is not added to CON_QY1_MO.

This collector deliberately does not request or store trade values. A customs
value divided by quantity is not a cash or futures price.

Usage:
  python scripts/import-us-canola-customs.py --dry-run
  python scripts/import-us-canola-customs.py --months 24 --dry-run
  python scripts/import-us-canola-customs.py --month 2026-05
  python scripts/import-us-canola-customs.py --help

Environment:
  CENSUS_API_KEY
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL (write runs only)
  SUPABASE_SERVICE_ROLE_KEY (write runs only)
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

CENSUS_BASE_URL = (
    "https://api.census.gov/data/timeseries/intltrade/imports/hs"
)
CENSUS_SOURCE_URL = (
    "https://api.census.gov/data/timeseries/intltrade/imports/hs.html"
)
CANADA_COUNTRY_CODE = "1220"
CANADA_COUNTRY_NAME = "CANADA"
CANONICAL_MEASURE = "CON_QY1_MO"
CROSS_CHECK_MEASURE = "GEN_QY1_MO"
EXPECTED_UNIT = "KG"
DEFAULT_LOOKBACK_MONTHS = 24
MAX_LOOKBACK_MONTHS = 120
TIMEOUT_SECONDS = 60

PRODUCTS: dict[str, dict[str, str]] = {
    "1205100010": {
        "product_kind": "seed",
        "label": "Low erucic acid rapeseed or canola seed for sowing",
    },
    "1205100020": {
        "product_kind": "seed",
        "label": "Low erucic acid rapeseed or canola seed, other",
    },
    "1205100090": {
        "product_kind": "seed",
        "label": "Other low erucic acid rapeseed or canola seed",
    },
    "1514110000": {
        "product_kind": "oil",
        "label": "Low erucic acid rapeseed or canola oil, crude",
    },
    "1514190000": {
        "product_kind": "oil",
        "label": "Low erucic acid rapeseed or canola oil, other",
    },
}
EXPECTED_PRODUCT_CODES = frozenset(PRODUCTS)

REQUEST_FIELDS = (
    "I_COMMODITY",
    "I_COMMODITY_LDESC",
    "UNIT_QY1",
    CANONICAL_MEASURE,
    f"{CANONICAL_MEASURE}_FLAG",
    CROSS_CHECK_MEASURE,
    f"{CROSS_CHECK_MEASURE}_FLAG",
    "CTY_CODE",
    "CTY_NAME",
    "YEAR",
    "MONTH",
    "LAST_UPDATE",
)
RELEASE_FIELDS = (
    "CTY_CODE",
    "CTY_NAME",
    "YEAR",
    "MONTH",
    "LAST_UPDATE",
)


class ImporterError(RuntimeError):
    """Fail-closed collector error."""


def eprint(message: str) -> None:
    print(message, file=sys.stderr)


def load_env_files() -> None:
    """Load local developer env files without overriding the process env."""
    candidates = (
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
        Path.cwd().parent / ".env.local",
        Path.cwd().parent / ".env",
        Path.home() / ".hermes" / ".env",
    )
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(
                key.strip(),
                value.strip().strip('"').strip("'").replace("\\n", "").replace("\\r", ""),
            )


def require_env(name: str, *alternates: str) -> str:
    for candidate in (name, *alternates):
        value = os.environ.get(candidate)
        if value:
            return value
    raise ImporterError(
        f"Missing required environment variable: {', '.join((name, *alternates))}"
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Import monthly Canada-origin U.S. Canola customs weights from the "
            "official Census International Trade API."
        )
    )
    window = parser.add_mutually_exclusive_group()
    window.add_argument(
        "--month",
        help="Fetch one released calendar month in YYYY-MM format.",
    )
    window.add_argument(
        "--months",
        type=int,
        help=(
            f"Rolling lookback through the latest released month "
            f"(default {DEFAULT_LOOKBACK_MONTHS}, max {MAX_LOOKBACK_MONTHS})."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate data without writing Supabase or source_runs.",
    )
    args = parser.parse_args(argv)

    if args.month is not None:
        parse_report_month(args.month)
    elif args.months is not None and not (
        1 <= args.months <= MAX_LOOKBACK_MONTHS
    ):
        parser.error(
            f"--months must be between 1 and {MAX_LOOKBACK_MONTHS}"
        )
    return args


def parse_report_month(value: str) -> dt.date:
    try:
        parsed = dt.datetime.strptime(value, "%Y-%m").date()
    except ValueError as exc:
        raise ImporterError(
            f"Invalid month {value!r}; expected YYYY-MM"
        ) from exc
    if parsed.year < 2010:
        raise ImporterError(
            f"Invalid month {value!r}; Census monthly trade data begins in 2010"
        )
    return parsed.replace(day=1)


def shift_months(value: dt.date, offset: int) -> dt.date:
    absolute_month = value.year * 12 + value.month - 1 + offset
    year, month_index = divmod(absolute_month, 12)
    return dt.date(year, month_index + 1, 1)


def request_json(url: str, *, request_label: str) -> Any | None:
    """Return a Census matrix, or None for an official HTTP 204 no-row result."""
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "BushelBoard/1.0 (Canola customs collector)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status == 204:
                return None
            return json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 204:
            return None
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            f"Census request failed for {request_label}: "
            f"HTTP {exc.code} {body[:300]}"
        ) from exc
    except urllib.error.URLError as exc:
        raise ImporterError(
            f"Census request failed for {request_label}: {exc.reason}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise ImporterError(
            f"Census returned invalid JSON for {request_label}"
        ) from exc


def build_request_url(
    product_code: str,
    time_selector: str,
    census_api_key: str,
) -> str:
    if product_code not in EXPECTED_PRODUCT_CODES:
        raise ImporterError(f"Unadmitted HTS product code: {product_code}")
    query = urllib.parse.urlencode(
        {
            "get": ",".join(REQUEST_FIELDS),
            "time": time_selector,
            "CTY_CODE": CANADA_COUNTRY_CODE,
            "I_COMMODITY": product_code,
            "key": census_api_key,
        }
    )
    return f"{CENSUS_BASE_URL}?{query}"


def build_release_probe_url(
    time_selector: str,
    census_api_key: str,
) -> str:
    """Build a Canada-total query used only to identify published months."""
    query = urllib.parse.urlencode(
        {
            "get": ",".join(RELEASE_FIELDS),
            "time": time_selector,
            "CTY_CODE": CANADA_COUNTRY_CODE,
            "key": census_api_key,
        }
    )
    return f"{CENSUS_BASE_URL}?{query}"


def parse_release_payload(payload: Any) -> dict[str, str]:
    if not isinstance(payload, list) or not payload:
        raise ImporterError("Census release probe returned no matrix")
    header = payload[0]
    if not isinstance(header, list):
        raise ImporterError("Census release probe returned an invalid header")
    missing_fields = set(RELEASE_FIELDS).difference(str(item) for item in header)
    if missing_fields:
        raise ImporterError(
            "Census release probe omitted fields: "
            + ", ".join(sorted(missing_fields))
        )

    releases: dict[str, str] = {}
    for raw_values in payload[1:]:
        if not isinstance(raw_values, list) or len(raw_values) != len(header):
            raise ImporterError("Census release probe returned a malformed row")
        raw = dict(zip((str(item) for item in header), raw_values, strict=True))
        country_code = str(raw.get("CTY_CODE") or "").strip()
        country_name = str(raw.get("CTY_NAME") or "").strip().upper()
        if country_code != CANADA_COUNTRY_CODE or country_name != CANADA_COUNTRY_NAME:
            raise ImporterError(
                "Census release probe escaped the Canada-only scope"
            )
        year = str(raw.get("YEAR") or "").strip()
        month = str(raw.get("MONTH") or "").strip().zfill(2)
        report_month = parse_report_month(f"{year}-{month}").strftime("%Y-%m")
        last_update = str(raw.get("LAST_UPDATE") or "").strip()
        if not last_update:
            raise ImporterError(
                f"Census release probe omitted LAST_UPDATE for {report_month}"
            )
        existing = releases.get(report_month)
        if existing is not None and existing != last_update:
            raise ImporterError(
                f"Census returned conflicting LAST_UPDATE values for {report_month}"
            )
        releases[report_month] = last_update

    if not releases:
        raise ImporterError("Census release probe returned no released months")
    return releases


def require_contiguous_months(months: list[str]) -> None:
    for previous, current in zip(months, months[1:], strict=False):
        expected = shift_months(parse_report_month(previous), 1).strftime("%Y-%m")
        if current != expected:
            raise ImporterError(
                f"Census release calendar is not contiguous: "
                f"expected {expected}, received {current}"
            )


def discover_released_months(
    census_api_key: str,
    *,
    exact_month: str | None,
    lookback_months: int,
    today: dt.date | None = None,
) -> dict[str, str]:
    """Return exactly the requested number of latest officially released months."""
    if exact_month is not None:
        target = parse_report_month(exact_month).strftime("%Y-%m")
        time_selector = target
    else:
        current_month = (
            today or dt.datetime.now(dt.timezone.utc).date()
        ).replace(day=1)
        # Census trade releases lag the calendar. The extra year makes the
        # discovery window independent of the usual one-to-two-month delay.
        probe_start = shift_months(
            current_month,
            -(lookback_months + 11),
        )
        time_selector = f"from {probe_start:%Y-%m}"

    payload = request_json(
        build_release_probe_url(time_selector, census_api_key),
        request_label="Canada release calendar",
    )
    if payload is None:
        raise ImporterError(
            f"Census has not published the requested release window {time_selector!r}"
        )
    releases = parse_release_payload(payload)

    if exact_month is not None:
        if target not in releases:
            raise ImporterError(
                f"Census has not published Canada import totals for {target}"
            )
        return {target: releases[target]}

    ordered = sorted(releases)
    if len(ordered) < lookback_months:
        raise ImporterError(
            f"Census release probe returned {len(ordered)} months; "
            f"{lookback_months} were required"
        )
    selected = ordered[-lookback_months:]
    require_contiguous_months(selected)
    return {month: releases[month] for month in selected}


def parse_nonnegative_integer(
    value: Any,
    *,
    field: str,
    product_code: str,
    report_month: str,
) -> int:
    if value in (None, ""):
        raise ImporterError(
            f"{product_code} {report_month}: {field} is missing"
        )
    try:
        parsed = int(str(value))
    except ValueError as exc:
        raise ImporterError(
            f"{product_code} {report_month}: {field} is not an integer"
        ) from exc
    if parsed < 0:
        raise ImporterError(
            f"{product_code} {report_month}: {field} cannot be negative"
        )
    return parsed


def require_present_quantity(
    row: dict[str, Any],
    *,
    measure: str,
    product_code: str,
    report_month: str,
) -> int:
    flag = str(row.get(f"{measure}_FLAG") or "").strip().upper()
    if flag:
        raise ImporterError(
            f"{product_code} {report_month}: {measure} is flagged {flag!r}; "
            "the quantity is missing, not a true zero"
        )
    return parse_nonnegative_integer(
        row.get(measure),
        field=measure,
        product_code=product_code,
        report_month=report_month,
    )


def parse_census_payload(
    payload: Any,
    *,
    requested_product_code: str,
    fetched_at: str,
) -> list[dict[str, Any]]:
    """Convert one Census matrix response into validated database rows."""
    if not isinstance(payload, list) or not payload:
        raise ImporterError(
            f"Census returned no matrix for HTS {requested_product_code}"
        )
    header = payload[0]
    if not isinstance(header, list):
        raise ImporterError(
            f"Census returned an invalid header for HTS {requested_product_code}"
        )
    missing_fields = set(REQUEST_FIELDS).difference(str(item) for item in header)
    if missing_fields:
        raise ImporterError(
            f"Census response for HTS {requested_product_code} omitted fields: "
            f"{', '.join(sorted(missing_fields))}"
        )

    results: list[dict[str, Any]] = []
    for raw_values in payload[1:]:
        if not isinstance(raw_values, list) or len(raw_values) != len(header):
            raise ImporterError(
                f"Census returned a malformed row for HTS {requested_product_code}"
            )
        raw = dict(zip((str(item) for item in header), raw_values, strict=True))
        product_code = str(raw.get("I_COMMODITY") or "").strip()
        if product_code != requested_product_code:
            raise ImporterError(
                f"Census product mismatch: requested {requested_product_code}, "
                f"received {product_code or '<blank>'}"
            )
        country_code = str(raw.get("CTY_CODE") or "").strip()
        country_name = str(raw.get("CTY_NAME") or "").strip().upper()
        if country_code != CANADA_COUNTRY_CODE or country_name != CANADA_COUNTRY_NAME:
            raise ImporterError(
                f"{product_code}: expected Canada ({CANADA_COUNTRY_CODE}), "
                f"received {country_name or '<blank>'} ({country_code or '<blank>'})"
            )

        year = str(raw.get("YEAR") or "").strip()
        month = str(raw.get("MONTH") or "").strip().zfill(2)
        report_month = f"{year}-{month}"
        parsed_month = parse_report_month(report_month)

        unit = str(raw.get("UNIT_QY1") or "").strip().upper()
        if unit != EXPECTED_UNIT:
            raise ImporterError(
                f"{product_code} {report_month}: UNIT_QY1 must be "
                f"{EXPECTED_UNIT}, received {unit or '<blank>'}"
            )

        consumption_qty_kg = require_present_quantity(
            raw,
            measure=CANONICAL_MEASURE,
            product_code=product_code,
            report_month=report_month,
        )
        general_qty_kg = require_present_quantity(
            raw,
            measure=CROSS_CHECK_MEASURE,
            product_code=product_code,
            report_month=report_month,
        )
        description = str(raw.get("I_COMMODITY_LDESC") or "").strip()
        api_last_update = str(raw.get("LAST_UPDATE") or "").strip()
        if not description or not api_last_update:
            raise ImporterError(
                f"{product_code} {report_month}: description or LAST_UPDATE is missing"
            )

        results.append(
            {
                "report_month": parsed_month.isoformat(),
                "country_code": country_code,
                "country_name": country_name,
                "product_code": product_code,
                "product_kind": PRODUCTS[product_code]["product_kind"],
                "product_description": description,
                "unit_qy1": unit,
                "consumption_qty_kg": consumption_qty_kg,
                "consumption_qty_flag": None,
                "general_qty_kg": general_qty_kg,
                "general_qty_flag": None,
                "record_status": "reported",
                "api_last_update": api_last_update,
                "source_api": "us_census_intltrade_imports_hs",
                "source_url": CENSUS_SOURCE_URL,
                "retrieved_at": fetched_at,
            }
        )

    return results


def complete_no_trade_rows(
    rows: list[dict[str, Any]],
    *,
    released_months: dict[str, str],
    fetched_at: str,
) -> list[dict[str, Any]]:
    """Materialize released code-month omissions as explicit, sourced zeros.

    Census omits valid HTS/country combinations when there was no trade and can
    return HTTP 204 for an entirely empty query. A zero is admitted only after
    the Canada-total release probe proves that month is published.
    """
    expected_keys = {
        (month, product_code)
        for month in released_months
        for product_code in EXPECTED_PRODUCT_CODES
    }
    rows_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        month = str(row["report_month"])[:7]
        product_code = str(row["product_code"])
        key = (month, product_code)
        if month not in released_months:
            raise ImporterError(
                f"HTS {product_code} returned unexpected month {month}"
            )
        if key in rows_by_key:
            raise ImporterError(
                f"Duplicate Census row for {month} HTS {product_code}"
            )
        rows_by_key[key] = row

    completed = list(rows_by_key.values())
    for month, product_code in sorted(expected_keys.difference(rows_by_key)):
        product = PRODUCTS[product_code]
        completed.append(
            {
                "report_month": f"{month}-01",
                "country_code": CANADA_COUNTRY_CODE,
                "country_name": CANADA_COUNTRY_NAME,
                "product_code": product_code,
                "product_kind": product["product_kind"],
                "product_description": product["label"],
                "unit_qy1": EXPECTED_UNIT,
                "consumption_qty_kg": 0,
                "consumption_qty_flag": None,
                "general_qty_kg": 0,
                "general_qty_flag": None,
                "record_status": "confirmed_no_trade",
                "api_last_update": released_months[month],
                "source_api": "us_census_intltrade_imports_hs",
                "source_url": CENSUS_SOURCE_URL,
                "retrieved_at": fetched_at,
            }
        )
    return completed


def require_complete_coverage(rows: list[dict[str, Any]]) -> None:
    """Require all five admitted HTS codes in every month before any write."""
    if not rows:
        raise ImporterError("Census returned no usable Canola customs rows")

    seen_keys: set[tuple[str, str]] = set()
    codes_by_month: dict[str, set[str]] = {}
    for row in rows:
        report_month = str(row["report_month"])
        product_code = str(row["product_code"])
        key = (report_month, product_code)
        if key in seen_keys:
            raise ImporterError(
                f"Duplicate Census row for {report_month} HTS {product_code}"
            )
        seen_keys.add(key)
        codes_by_month.setdefault(report_month, set()).add(product_code)

    incomplete: list[str] = []
    for report_month, codes in sorted(codes_by_month.items()):
        missing = EXPECTED_PRODUCT_CODES.difference(codes)
        unexpected = codes.difference(EXPECTED_PRODUCT_CODES)
        if missing or unexpected:
            details = []
            if missing:
                details.append(f"missing {','.join(sorted(missing))}")
            if unexpected:
                details.append(f"unexpected {','.join(sorted(unexpected))}")
            incomplete.append(f"{report_month} ({'; '.join(details)})")

    seen_codes = {code for codes in codes_by_month.values() for code in codes}
    globally_missing = EXPECTED_PRODUCT_CODES.difference(seen_codes)
    if globally_missing:
        incomplete.append(
            f"entire response (missing {','.join(sorted(globally_missing))})"
        )
    if incomplete:
        raise ImporterError(
            "Census product coverage is incomplete; refusing all writes: "
            + "; ".join(incomplete)
        )


def fetch_rows(
    census_api_key: str,
    *,
    released_months: dict[str, str],
    fetched_at: str,
) -> list[dict[str, Any]]:
    ordered_months = sorted(released_months)
    if not ordered_months:
        raise ImporterError("No released months were admitted for HTS collection")
    time_selector = (
        ordered_months[0]
        if len(ordered_months) == 1
        else f"from {ordered_months[0]} to {ordered_months[-1]}"
    )

    reported_rows: list[dict[str, Any]] = []
    for product_code in sorted(EXPECTED_PRODUCT_CODES):
        url = build_request_url(product_code, time_selector, census_api_key)
        payload = request_json(url, request_label=f"HTS {product_code}")
        if payload is not None:
            reported_rows.extend(
                parse_census_payload(
                    payload,
                    requested_product_code=product_code,
                    fetched_at=fetched_at,
                )
            )
    rows = complete_no_trade_rows(
        reported_rows,
        released_months=released_months,
        fetched_at=fetched_at,
    )
    require_complete_coverage(rows)
    return sorted(
        rows,
        key=lambda row: (str(row["report_month"]), str(row["product_code"])),
    )


def ingest_rows(
    supabase_url: str,
    service_role_key: str,
    rows: list[dict[str, Any]],
    source_run: dict[str, Any],
) -> dict[str, Any]:
    """Commit raw rows and their source-run ledger entry in one DB transaction."""
    if not rows:
        raise ImporterError("Refusing an empty customs ingest")
    url = (
        f"{supabase_url.rstrip('/')}"
        "/rest/v1/rpc/ingest_canola_us_customs"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps(
            {
                "p_rows": rows,
                "p_source_run": source_run,
            }
        ).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            f"Supabase atomic customs ingest failed: "
            f"HTTP {exc.code} {body[:500]}"
        ) from exc
    if not isinstance(payload, dict):
        raise ImporterError(
            f"Supabase atomic customs ingest returned unexpected payload: {payload!r}"
        )
    return payload


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    months = sorted({str(row["report_month"]) for row in rows})
    totals: dict[str, int] = {"seed": 0, "oil": 0}
    general_totals: dict[str, int] = {"seed": 0, "oil": 0}
    record_statuses: dict[str, int] = {}
    for row in rows:
        kind = str(row["product_kind"])
        totals[kind] += int(row["consumption_qty_kg"])
        general_totals[kind] += int(row["general_qty_kg"])
        status = str(row["record_status"])
        record_statuses[status] = record_statuses.get(status, 0) + 1
    return {
        "rows": len(rows),
        "months": {
            "count": len(months),
            "start": months[0],
            "end": months[-1],
        },
        "imports_for_consumption_kt": {
            kind: round(value / 1_000_000, 3)
            for kind, value in totals.items()
        },
        "general_imports_crosscheck_kt": {
            kind: round(value / 1_000_000, 3)
            for kind, value in general_totals.items()
        },
        "record_statuses": record_statuses,
    }


def main(argv: list[str] | None = None) -> int:
    started_at = dt.datetime.now(dt.timezone.utc)
    started_clock = time.perf_counter()
    load_env_files()
    args = parse_args(argv)
    census_api_key = require_env("CENSUS_API_KEY")
    lookback_months = args.months or DEFAULT_LOOKBACK_MONTHS
    released_months = discover_released_months(
        census_api_key,
        exact_month=args.month,
        lookback_months=lookback_months,
    )
    fetched_at = started_at.isoformat()
    release_labels = sorted(released_months)

    eprint(
        f"Fetching {len(EXPECTED_PRODUCT_CODES)} Canada-origin Canola HTS codes "
        f"for {release_labels[0]} through {release_labels[-1]}..."
    )
    rows = fetch_rows(
        census_api_key,
        released_months=released_months,
        fetched_at=fetched_at,
    )
    row_summary = summarize_rows(rows)

    if args.dry_run:
        print(
            json.dumps(
                {
                    "status": "dry_run",
                    "source": "U.S. Census International Trade imports/hs",
                    "country_code": CANADA_COUNTRY_CODE,
                    "canonical_measure": CANONICAL_MEASURE,
                    "cross_check_measure": CROSS_CHECK_MEASURE,
                    "unit": EXPECTED_UNIT,
                    "released_months": released_months,
                    **row_summary,
                    "sample": rows[:5],
                    "duration_ms": round(
                        (time.perf_counter() - started_clock) * 1000
                    ),
                },
                indent=2,
            )
        )
        return 0

    supabase_url = require_env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    month_start = str(row_summary["months"]["start"])
    month_end = str(row_summary["months"]["end"])
    source_run_input = {
        "source_name": "us_census_canola_customs",
        "source_lane": "cross_border",
        "collector_name": "import-us-canola-customs",
        "status": "success",
        "source_period_start": month_start,
        "source_period_end": month_end,
        "latest_source_label": (
            f"Canada-origin U.S. Canola customs through {month_end[:7]}"
        ),
        "rows_updated": len(rows),
        "source_url": CENSUS_SOURCE_URL,
        "started_at": fetched_at,
        "metadata": {
            "country_code": CANADA_COUNTRY_CODE,
            "canonical_measure": CANONICAL_MEASURE,
            "cross_check_measure": CROSS_CHECK_MEASURE,
            "unit": EXPECTED_UNIT,
            "product_codes": sorted(EXPECTED_PRODUCT_CODES),
            "months": row_summary["months"],
            "released_months": released_months,
            "record_statuses": row_summary["record_statuses"],
            "write_mode": "atomic_idempotent_upsert_with_source_run",
            "trade_values_requested": False,
            "value_is_not_price": True,
        },
    }
    source_run = ingest_rows(
        supabase_url,
        service_role_key,
        rows,
        source_run_input,
    )

    print(
        json.dumps(
            {
                "status": "success",
                "rows_upserted": len(rows),
                "source_run": source_run,
                **row_summary,
                "duration_ms": round(
                    (time.perf_counter() - started_clock) * 1000
                ),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        eprint("Interrupted")
        raise SystemExit(130)
    except ImporterError as exc:
        print(json.dumps({"status": "error", "message": str(exc)}))
        raise SystemExit(1)
