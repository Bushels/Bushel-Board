#!/usr/bin/env python3
"""Statistics Canada WDS importer for Bushel Board.

Covers three admitted lanes:
  - field_crops: 32100359 (seeded area / production) + 32100007 (tri-annual stocks)
  - crush:       32100352 (monthly canola crushing operations, via pinned vectors)
  - biofuel:     25100082 (monthly aggregate vegetable-oil input and
                 non-ethanol renewable-fuel output, via pinned vectors)

Writes long-format rows into statcan_wds_raw and a source_runs ledger entry per group.
Idempotent upsert keyed (product_id, coordinate, ref_date).

Usage:
  python scripts/import-statcan-wds.py --group all --periods 4 --dry-run
  python scripts/import-statcan-wds.py --group field_crops --periods 12
  python scripts/import-statcan-wds.py --group biofuel --periods 12
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
import urllib.error
import urllib.request
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from source_run import SourceRunError, write_source_run  # noqa: E402

WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"
TIMEOUT = 60
UPSERT_BATCH_SIZE = 200

GEOS = {1: "Canada", 9: "Manitoba", 10: "Saskatchewan", 11: "Alberta"}

# 32100359 - seeded area / production (annual; refPer = Jan 1 of crop year)
FIELD_CROP_DISPOSITIONS = {1: "Seeded area (acres)", 19: "Production (metric tonnes)"}
FIELD_CROPS_32100359 = {
    1: "Wheat, all", 2: "Wheat, spring", 4: "Wheat, durum", 16: "Canola",
    6: "Barley", 5: "Oats", 11: "Corn for grain", 15: "Soybeans",
}

# 32100007 - stocks (thousand tonnes; refPers Mar 1 / Jul 1 / Dec 1).
# Provincial commercial stocks do not exist (verified: status FAILED); request
# total + farm and let per-coordinate failures drop gracefully.
STOCK_TYPES = {1: "Total stocks", 2: "Farm stocks"}
STOCK_CROPS_32100007 = {
    1: "Wheat, all", 2: "Wheat, durum", 7: "Canola", 4: "Barley",
    3: "Oats", 8: "Corn", 9: "Soybeans",
}

# 32100352 - monthly crushing operations, pinned vectors (verified live values Apr 2026).
CRUSH_VECTORS = {
    383417: ("Seed crushed", "Canola"),
    383418: ("Oil produced", "Canola"),
    383419: ("Meal produced", "Canola"),
    41714056: ("Seed stocks", "Canola"),
    1459124: ("Oil stocks", "Canola"),
    1459125: ("Meal stocks", "Canola"),
}

# 25-10-0082-01 - monthly renewable-fuel supply and disposition. These are
# aggregate Canadian operating measures: the input is all vegetable oils, not
# Canola alone, and the output combines renewable fuels other than ethanol.
# Vector identities verified against the full StatsCan CSV on 2026-07-29.
BIOFUEL_VECTORS = {
    1277885567: ("Inputs", "Vegetable oils, total", "Metric tonnes"),
    1277885586: (
        "Production",
        "Renewable fuels except fuel ethanol",
        "Cubic metres",
    ),
}

# Exact source identities verified against the live WDS response on 2026-07-29.
# A known vector returned under a different product or coordinate is a schema
# drift event, not valid coverage.
REQUIRED_VECTOR_IDENTITIES = {
    "crush": {
        (32100352, 383417, "1.1.6.0.0.0.0.0.0.0"),
        (32100352, 383418, "1.2.6.0.0.0.0.0.0.0"),
        (32100352, 383419, "1.3.6.0.0.0.0.0.0.0"),
        (32100352, 1459124, "1.4.6.0.0.0.0.0.0.0"),
        (32100352, 1459125, "1.5.6.0.0.0.0.0.0.0"),
        (32100352, 41714056, "1.6.6.0.0.0.0.0.0.0"),
    },
    "biofuel": {
        (25100082, 1277885567, "1.3.3.0.0.0.0.0.0.0"),
        (25100082, 1277885586, "1.4.7.0.0.0.0.0.0.0"),
    },
}

# These 13 Canola series are the minimum field/stocks contract consumed by the
# Canola balance sheet: seeded area and production for Canada plus the Prairies,
# Canada total/farm stocks, and provincial farm stocks. Provincial commercial
# stock coordinates are intentionally excluded because StatsCan does not publish
# them. A series is covered when at least one usable point exists in the
# requested latestN window.
REQUIRED_CANOLA_FIELD_SERIES = {
    *((32100359, geo_id, disposition_id, 16) for geo_id in GEOS for disposition_id in FIELD_CROP_DISPOSITIONS),
    (32100007, 1, 1, 7),
    (32100007, 1, 2, 7),
    *((32100007, geo_id, 2, 7) for geo_id in (9, 10, 11)),
}

# Series in each cohort are published on the same cadence. They must share the
# newest available observation date or the source is mid-release/stale.
REQUIRED_CANOLA_FIELD_COHORTS = {
    "seeded_area": {
        (32100359, geo_id, 1, 16)
        for geo_id in GEOS
    },
    "production": {
        (32100359, geo_id, 19, 16)
        for geo_id in GEOS
    },
    "stocks": {
        (32100007, 1, 1, 7),
        *((32100007, geo_id, 2, 7) for geo_id in GEOS),
    },
}


class ImporterError(RuntimeError):
    pass


def log(message: str) -> None:
    print(message, file=sys.stderr)


def wds_post(endpoint: str, payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    req = urllib.request.Request(
        f"{WDS_BASE}/{endpoint}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "bushel-board-importer/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(f"WDS {endpoint} failed: HTTP {exc.code} {body[:300]}") from exc


def coordinate(geo: int, dim2: int, dim3: int) -> str:
    return f"{geo}.{dim2}.{dim3}.0.0.0.0.0.0.0"


def rows_from_response(
    entries: list[dict[str, Any]],
    request_meta: dict[str, tuple[int, str, str, str]],
) -> list[dict[str, Any]]:
    """Map WDS SUCCESS entries into statcan_wds_raw rows.

    statusCode != 0 or null value means 'not yet available' - skipped, never zero.
    FAILED entries (e.g. provincial commercial stocks) are dropped silently by design.
    """
    rows: list[dict[str, Any]] = []
    for entry in entries:
        if entry.get("status") != "SUCCESS":
            continue
        obj = entry.get("object") or {}
        coord = str(obj.get("coordinate") or "")
        product_id = int(obj.get("productId") or 0)
        vector_id = obj.get("vectorId")
        meta = request_meta.get(f"{product_id}:{coord}") or request_meta.get(f"v{vector_id}")
        if not meta:
            continue
        _, geo, dim_group, item = meta
        for point in obj.get("vectorDataPoint") or []:
            value = point.get("value")
            if value is None or int(point.get("statusCode") or 0) != 0:
                continue
            rows.append(
                {
                    "product_id": product_id,
                    "coordinate": coord or f"v{vector_id}",
                    "vector_id": int(vector_id) if vector_id is not None else None,
                    "ref_date": str(point.get("refPer")),
                    "geo": geo,
                    "dim_group": dim_group,
                    "item": item,
                    "value": value,
                    "unit": None,
                    "scalar_factor": int(point.get("scalarFactorCode") or 0),
                    "status_code": int(point.get("statusCode") or 0),
                    "release_time": point.get("releaseTime"),
                }
            )
    return rows


def fetch_field_crops(periods: int) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    request_meta: dict[str, tuple[int, str, str, str]] = {}

    for geo_id, geo in GEOS.items():
        for disp_id, disp in FIELD_CROP_DISPOSITIONS.items():
            for crop_id, crop in FIELD_CROPS_32100359.items():
                coord = coordinate(geo_id, disp_id, crop_id)
                payload.append({"productId": 32100359, "coordinate": coord, "latestN": periods})
                request_meta[f"32100359:{coord}"] = (32100359, geo, disp, crop)
        for stock_id, stock in STOCK_TYPES.items():
            for crop_id, crop in STOCK_CROPS_32100007.items():
                coord = coordinate(geo_id, stock_id, crop_id)
                payload.append({"productId": 32100007, "coordinate": coord, "latestN": periods})
                request_meta[f"32100007:{coord}"] = (32100007, geo, stock, crop)

    entries = wds_post("getDataFromCubePidCoordAndLatestNPeriods", payload)
    return rows_from_response(entries, request_meta)


def fetch_crush(periods: int) -> list[dict[str, Any]]:
    payload = [{"vectorId": vector_id, "latestN": periods} for vector_id in CRUSH_VECTORS]
    request_meta = {
        f"v{vector_id}": (32100352, "Canada", process, item)
        for vector_id, (process, item) in CRUSH_VECTORS.items()
    }
    entries = wds_post("getDataFromVectorsAndLatestNPeriods", payload)
    return rows_from_response(entries, request_meta)


def fetch_biofuel(periods: int) -> list[dict[str, Any]]:
    payload = [
        {"vectorId": vector_id, "latestN": periods}
        for vector_id in BIOFUEL_VECTORS
    ]
    request_meta = {
        f"v{vector_id}": (25100082, "Canada", disposition, product)
        for vector_id, (disposition, product, _unit) in BIOFUEL_VECTORS.items()
    }
    entries = wds_post("getDataFromVectorsAndLatestNPeriods", payload)
    rows = rows_from_response(entries, request_meta)
    for row in rows:
        vector_id = row.get("vector_id")
        if vector_id in BIOFUEL_VECTORS:
            row["unit"] = BIOFUEL_VECTORS[vector_id][2]
    return rows


def require_group_coverage(group: str, rows: list[dict[str, Any]]) -> None:
    """Reject partial StatsCan payloads before any raw-table write."""
    for row in rows:
        try:
            dt.date.fromisoformat(str(row.get("ref_date") or ""))
        except ValueError as exc:
            raise ImporterError(
                f"StatsCan {group} row has invalid ref_date "
                f"{row.get('ref_date')!r}"
            ) from exc
        try:
            release_time = str(row.get("release_time") or "").replace(
                "Z", "+00:00"
            )
            dt.datetime.fromisoformat(release_time)
        except ValueError as exc:
            raise ImporterError(
                f"StatsCan {group} row has invalid release_time "
                f"{row.get('release_time')!r}"
            ) from exc
        try:
            value_is_finite = math.isfinite(float(row.get("value")))
        except (TypeError, ValueError):
            value_is_finite = False
        if not value_is_finite:
            raise ImporterError(
                f"StatsCan {group} row has non-finite value "
                f"{row.get('value')!r}"
            )

    if group == "field_crops":
        dates_by_series: dict[tuple[int, str], set[str]] = {}
        for row in rows:
            series = (
                int(row.get("product_id") or 0),
                str(row.get("coordinate") or ""),
            )
            dates_by_series.setdefault(series, set()).add(str(row["ref_date"]))
        present = set(dates_by_series)
        expected = {
            (product_id, coordinate(geo_id, dim2, crop_id))
            for product_id, geo_id, dim2, crop_id in REQUIRED_CANOLA_FIELD_SERIES
        }
        missing = sorted(expected - present)
        if missing:
            rendered = ", ".join(
                f"{product_id}:{coord}" for product_id, coord in missing
            )
            raise ImporterError(
                "StatsCan field_crops response is missing required Canola "
                f"series: {rendered}"
            )

        for cohort_name, cohort_specs in REQUIRED_CANOLA_FIELD_COHORTS.items():
            cohort = {
                (product_id, coordinate(geo_id, dim2, crop_id))
                for product_id, geo_id, dim2, crop_id in cohort_specs
            }
            newest_ref_date = max(
                ref_date
                for series in cohort
                for ref_date in dates_by_series[series]
            )
            stale_series = sorted(
                series
                for series in cohort
                if newest_ref_date not in dates_by_series[series]
            )
            if stale_series:
                rendered = ", ".join(
                    f"{product_id}:{coord}"
                    for product_id, coord in stale_series
                )
                raise ImporterError(
                    f"StatsCan field_crops {cohort_name} cohort does not "
                    f"share newest ref_date {newest_ref_date}: {rendered}"
                )
        return

    expected_identities = REQUIRED_VECTOR_IDENTITIES.get(group, set())
    pinned_vector_ids = {
        vector_id for _product_id, vector_id, _coord in expected_identities
    }
    dates_by_identity: dict[tuple[int, int, str], set[str]] = {}
    unexpected_identities: set[tuple[int, int, str]] = set()
    for row in rows:
        if row.get("vector_id") is None or row.get("value") is None:
            continue
        identity = (
            int(row.get("product_id") or 0),
            int(row["vector_id"]),
            str(row.get("coordinate") or ""),
        )
        if identity[1] in pinned_vector_ids and identity not in expected_identities:
            unexpected_identities.add(identity)
        if identity not in expected_identities:
            continue
        dates_by_identity.setdefault(identity, set()).add(
            str(row.get("ref_date") or "")
        )

    if unexpected_identities:
        rendered = ", ".join(
            f"{product_id}:{vector_id}:{coord}"
            for product_id, vector_id, coord in sorted(unexpected_identities)
        )
        raise ImporterError(
            f"StatsCan {group} response returned pinned vector under "
            f"unexpected source identity: {rendered}"
        )

    missing_identities = sorted(expected_identities - set(dates_by_identity))
    if missing_identities:
        rendered = ", ".join(
            f"{product_id}:{vector_id}:{coord}"
            for product_id, vector_id, coord in missing_identities
        )
        raise ImporterError(
            f"StatsCan {group} response is missing required source identity "
            f"(product:vector:coordinate): {rendered}"
        )

    if expected_identities:
        newest_ref_date = max(
            ref_date
            for ref_dates in dates_by_identity.values()
            for ref_date in ref_dates
        )
        stale_identities = sorted(
            identity
            for identity in expected_identities
            if newest_ref_date not in dates_by_identity[identity]
        )
        if stale_identities:
            rendered = ", ".join(
                f"{product_id}:{vector_id}:{coord}"
                for product_id, vector_id, coord in stale_identities
            )
            raise ImporterError(
                f"StatsCan {group} vectors do not share newest ref_date "
                f"{newest_ref_date}: {rendered}"
            )


def upsert_rows(supabase_url: str, service_key: str, rows: list[dict[str, Any]]) -> None:
    url = supabase_url.rstrip("/") + "/rest/v1/statcan_wds_raw?on_conflict=product_id,coordinate,ref_date"
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
    *,
    group: str,
    **kwargs: Any,
) -> dict[str, Any]:
    """Record collector freshness or fail after the idempotent raw upsert."""
    try:
        return write_source_run(supabase_url, service_key, **kwargs)
    except SourceRunError as exc:
        raise ImporterError(
            f"StatsCan {group} rows were upserted, but the source_runs ledger "
            f"write failed; replay is safe and this run is not successful: {exc}"
        ) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--group",
        choices=["field_crops", "crush", "biofuel", "all"],
        default="all",
    )
    parser.add_argument("--periods", type=int, default=4, help="latestN periods per series (default 4)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env_files()
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()

    groups = (
        ["field_crops", "crush", "biofuel"]
        if args.group == "all"
        else [args.group]
    )
    summary: dict[str, Any] = {"status": "success", "dry_run": args.dry_run, "groups": {}}

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not args.dry_run and (not supabase_url or not service_key):
        raise ImporterError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    rows_by_group: dict[str, list[dict[str, Any]]] = {}
    for group in groups:
        if group == "field_crops":
            rows = fetch_field_crops(args.periods)
        elif group == "crush":
            rows = fetch_crush(args.periods)
        else:
            rows = fetch_biofuel(args.periods)
        log(f"[{group}] fetched {len(rows)} rows")
        if not rows:
            raise ImporterError(
                f"StatsCan WDS returned no usable rows for group {group!r}"
            )
        require_group_coverage(group, rows)
        rows_by_group[group] = rows
        summary["groups"][group] = {"rows": len(rows), "sample": rows[:3]}

    # Validate every selected group before the first write. A partial crush or
    # biofuel response must not leave field_crops updated under an overall
    # failed --group all run.
    for group in groups:
        rows = rows_by_group[group]
        if not args.dry_run:
            upsert_rows(supabase_url, service_key, rows)
            ref_dates = sorted(row["ref_date"] for row in rows) or [None]
            record_source_run_or_fail(
                supabase_url,
                service_key,
                group=group,
                source_name=f"statcan_{group}",
                source_lane="canada",
                collector_name="import-statcan-wds",
                status="success",
                source_period_start=ref_dates[0],
                source_period_end=ref_dates[-1],
                latest_source_label=ref_dates[-1],
                rows_inserted=len(rows),
                started_at=started_at,
                metadata={"periods": args.periods},
            )

    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ImporterError as exc:
        print(json.dumps({"status": "error", "message": str(exc)}))
        sys.exit(1)
