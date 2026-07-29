#!/usr/bin/env python3
"""Import the latest AAFC Canola supply-disposition table.

The collector discovers the newest Outlook from AAFC's official reports index,
extracts all three Canola crop-year columns, validates the balance equation, and
idempotently upserts one row per crop year into ``supply_disposition``.

Usage:
  python scripts/import-aafc-canola-outlook.py --dry-run
  python scripts/import-aafc-canola-outlook.py
  python scripts/import-aafc-canola-outlook.py --url https://...
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from source_run import SourceRunError, write_source_run  # noqa: E402


INDEX_URL = "https://agriculture.canada.ca/en/sector/crops/reports-statistics"
REPORT_PATH_PATTERN = re.compile(
    r"/en/sector/crops/reports-statistics/"
    r"canada-outlook-principal-field-crops-(\d{4}-\d{2}-\d{2})$"
)
TIMEOUT_SECONDS = 45
HECTARES_TO_ACRES = 2.471053814671653
CANOLA_KG_PER_BUSHEL = 22.6796185
REQUIRED_METRICS = (
    "area_seeded",
    "area_harvested",
    "yield",
    "production",
    "imports",
    "total_supply",
    "exports",
    "food_industrial",
    "feed_waste",
    "total_domestic",
    "carry_out",
    "average_price",
)


class ImporterError(RuntimeError):
    pass


def log(message: str) -> None:
    print(message, file=sys.stderr)


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


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "User-Agent": "BushelBoard-AAFC-Collector/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, "replace")
    except urllib.error.HTTPError as exc:
        raise ImporterError(f"AAFC request failed: HTTP {exc.code} for {url}") from exc
    except urllib.error.URLError as exc:
        raise ImporterError(f"AAFC request failed for {url}: {exc.reason}") from exc


class _LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self.hrefs.append(href)


def discover_latest_report_url(index_html: str, index_url: str = INDEX_URL) -> str:
    parser = _LinkParser()
    parser.feed(index_html)
    candidates: list[tuple[str, str]] = []
    for href in parser.hrefs:
        absolute = urllib.parse.urljoin(index_url, href)
        parsed = urllib.parse.urlparse(absolute)
        match = REPORT_PATH_PATTERN.search(parsed.path.rstrip("/"))
        if match:
            candidates.append((match.group(1), absolute))
    if not candidates:
        raise ImporterError("AAFC reports index contained no dated Outlook links")
    return max(candidates, key=lambda candidate: candidate[0])[1]


class _CanolaTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._heading_depth = 0
        self._heading_text: list[str] = []
        self._seek_table = False
        self._in_table = False
        self._in_row = False
        self._in_cell = False
        self._hidden_depth = 0
        self._cell_text: list[str] = []
        self._row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        lowered = tag.lower()
        attr_map = dict(attrs)
        if lowered == "h3":
            self._heading_depth = 1
            self._heading_text = []
            return
        if self._heading_depth:
            self._heading_depth += 1
            return
        if self._seek_table and lowered == "table":
            self._in_table = True
            self._seek_table = False
            return
        if not self._in_table:
            return
        if lowered == "tr":
            self._in_row = True
            self._row = []
        elif self._in_row and lowered in {"th", "td"}:
            self._in_cell = True
            self._cell_text = []
        elif (
            self._in_cell
            and lowered == "span"
            and "wb-inv" in (attr_map.get("class") or "").split()
        ):
            self._hidden_depth += 1
        elif self._hidden_depth:
            self._hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if self._heading_depth:
            self._heading_depth -= 1
            if self._heading_depth == 0:
                heading = " ".join("".join(self._heading_text).split())
                self._seek_table = heading.casefold() == "canola"
            return
        if not self._in_table:
            return
        if self._hidden_depth:
            self._hidden_depth -= 1
            return
        if lowered in {"th", "td"} and self._in_cell:
            self._row.append(" ".join("".join(self._cell_text).split()))
            self._in_cell = False
            self._cell_text = []
        elif lowered == "tr" and self._in_row:
            if self._row:
                self.rows.append(self._row)
            self._row = []
            self._in_row = False
        elif lowered == "table":
            self._in_table = False

    def handle_data(self, data: str) -> None:
        if self._heading_depth:
            self._heading_text.append(data)
        elif self._in_cell and not self._hidden_depth:
            self._cell_text.append(data)


def _metric_key(label: str) -> str | None:
    normalized = " ".join(html.unescape(label).casefold().split())
    prefixes = {
        "area seeded": "area_seeded",
        "area harvested": "area_harvested",
        "yield": "yield",
        "production": "production",
        "imports": "imports",
        "total supply": "total_supply",
        "exports": "exports",
        "food and industrial use": "food_industrial",
        "feed, waste & dockage": "feed_waste",
        "total domestic use": "total_domestic",
        "carry-out stocks": "carry_out",
        "average price": "average_price",
    }
    return next(
        (key for prefix, key in prefixes.items() if normalized.startswith(prefix)),
        None,
    )


def _number(value: str, label: str) -> float:
    cleaned = value.replace(",", "").replace("$", "").strip()
    try:
        parsed = float(cleaned)
    except ValueError as exc:
        raise ImporterError(f"AAFC {label} is not numeric: {value!r}") from exc
    if not (parsed >= 0):
        raise ImporterError(f"AAFC {label} must be non-negative")
    return parsed


def _release_date_from_url(source_url: str) -> str:
    parsed = urllib.parse.urlparse(source_url)
    match = REPORT_PATH_PATTERN.search(parsed.path.rstrip("/"))
    if not match:
        raise ImporterError("AAFC report URL does not contain an ISO release date")
    dt.date.fromisoformat(match.group(1))
    return match.group(1)


def parse_canola_rows(report_html: str, source_url: str) -> list[dict[str, Any]]:
    parser = _CanolaTableParser()
    parser.feed(report_html)
    if len(parser.rows) < 2:
        raise ImporterError("AAFC report did not contain a readable Canola table")

    header = parser.rows[0]
    crop_years = []
    for cell in header[1:]:
        match = re.search(r"\d{4}[-–]\d{4}", cell)
        if match:
            crop_years.append(match.group(0).replace("–", "-"))
    if len(crop_years) != 3 or len(set(crop_years)) != 3:
        raise ImporterError(f"Expected exactly three Canola crop years, got {crop_years}")

    metrics: dict[str, list[float]] = {}
    for row in parser.rows[1:]:
        if len(row) < 4:
            continue
        key = _metric_key(row[0])
        if key:
            metrics[key] = [
                _number(value, f"{key}/{crop_year}")
                for crop_year, value in zip(crop_years, row[1:4], strict=True)
            ]
    missing = [metric for metric in REQUIRED_METRICS if metric not in metrics]
    if missing:
        raise ImporterError(f"AAFC Canola table is missing required metrics: {missing}")

    release_date = _release_date_from_url(source_url)
    source = f"AAFC_{release_date}"
    source_hash = hashlib.sha256(report_html.encode("utf-8")).hexdigest()
    rows: list[dict[str, Any]] = []
    for index, crop_year in enumerate(crop_years):
        production = metrics["production"][index]
        imports = metrics["imports"][index]
        total_supply = metrics["total_supply"][index]
        exports = metrics["exports"][index]
        total_domestic = metrics["total_domestic"][index]
        carry_out = metrics["carry_out"][index]
        carry_in = total_supply - production - imports
        disposition_total = exports + total_domestic + carry_out
        if abs(disposition_total - total_supply) > 2:
            raise ImporterError(
                f"AAFC {crop_year} balance does not reconcile: "
                f"supply={total_supply}, disposition={disposition_total}"
            )
        if carry_in < 0:
            raise ImporterError(f"AAFC {crop_year} implied carry-in is negative")

        yield_t_per_ha = metrics["yield"][index]
        rows.append(
            {
                "grain_slug": "canola",
                "crop_year": crop_year,
                "carry_in_kt": round(carry_in, 3),
                "production_kt": production,
                "imports_kt": imports,
                "total_supply_kt": total_supply,
                "exports_kt": exports,
                "food_industrial_kt": metrics["food_industrial"][index],
                "feed_waste_kt": metrics["feed_waste"][index],
                "seed_kt": None,
                "total_domestic_kt": total_domestic,
                "carry_out_kt": carry_out,
                "seeded_area_acres": round(
                    metrics["area_seeded"][index] * 1_000 * HECTARES_TO_ACRES
                ),
                "harvested_area_acres": round(
                    metrics["area_harvested"][index] * 1_000 * HECTARES_TO_ACRES
                ),
                "yield_bu_per_acre": round(
                    yield_t_per_ha * 1_000 / HECTARES_TO_ACRES / CANOLA_KG_PER_BUSHEL,
                    2,
                ),
                "intended_seeded_area_acres": None,
                "estimate_stage": (
                    "historical"
                    if index == 0
                    else "current_estimate"
                    if index == 1
                    else "forecast"
                ),
                "source_release_date": release_date,
                "source_url": source_url,
                "source_detail": {
                    "official_table": "Canola",
                    "release_date": release_date,
                    "yield_t_per_ha": yield_t_per_ha,
                    "average_price_cad_per_tonne": metrics["average_price"][index],
                    "source_hash": source_hash,
                    "collector_version": "1.0.0",
                },
                "source": source,
                "is_approximate": False,
            }
        )
    return rows


def upsert_rows(
    supabase_url: str,
    service_key: str,
    rows: list[dict[str, Any]],
) -> None:
    url = (
        supabase_url.rstrip("/")
        + "/rest/v1/supply_disposition"
        + "?on_conflict=grain_slug,crop_year,source"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps(rows).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            f"Supabase AAFC upsert failed: HTTP {exc.code} {body[:500]}"
        ) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--index-url", default=INDEX_URL)
    parser.add_argument(
        "--url",
        default=None,
        help="Explicit AAFC Outlook URL; otherwise discover latest from index",
    )
    args = parser.parse_args()

    load_env_files()
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    report_url = args.url or discover_latest_report_url(
        fetch_text(args.index_url),
        args.index_url,
    )
    report_html = fetch_text(report_url)
    rows = parse_canola_rows(report_html, report_url)
    release_date = rows[0]["source_release_date"]

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not args.dry_run and (not supabase_url or not service_key):
        raise ImporterError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        )

    if not args.dry_run:
        upsert_rows(supabase_url, service_key, rows)
        try:
            write_source_run(
                supabase_url,
                service_key,
                source_name="supply_disposition",
                source_lane="canada",
                collector_name="import-aafc-canola-outlook",
                status="success",
                source_period_start=release_date,
                source_period_end=release_date,
                latest_source_label=f"{release_date} / Canola Outlook",
                rows_inserted=len(rows),
                source_url=report_url,
                started_at=started_at,
                metadata={
                    "crop_years": [row["crop_year"] for row in rows],
                    "collector_version": "1.0.0",
                },
            )
        except SourceRunError as exc:
            raise ImporterError(
                f"AAFC rows were written but source_runs write failed: {exc}"
            ) from exc

    print(
        json.dumps(
            {
                "status": "success",
                "dry_run": args.dry_run,
                "source_url": report_url,
                "source_release_date": release_date,
                "crop_years": [row["crop_year"] for row in rows],
                "rows": len(rows),
                "canola": [
                    {
                        "crop_year": row["crop_year"],
                        "seeded_area_acres": row["seeded_area_acres"],
                        "production_kt": row["production_kt"],
                        "total_supply_kt": row["total_supply_kt"],
                        "food_industrial_kt": row["food_industrial_kt"],
                        "exports_kt": row["exports_kt"],
                        "carry_out_kt": row["carry_out_kt"],
                    }
                    for row in rows
                ],
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
