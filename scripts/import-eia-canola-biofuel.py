#!/usr/bin/env python3
"""Import official monthly U.S. Canola-oil biofuel feedstock consumption.

Source:
  U.S. Energy Information Administration, Monthly Biofuels Capacity and
  Feedstocks Update.

Meaning:
  The series is U.S. Canola oil consumed for biofuel production, measured in
  million pounds. It is demand confirmation only. EIA does not identify the
  country of origin of the Canola oil in this series.

Usage:
  python scripts/import-eia-canola-biofuel.py --dry-run
  python scripts/import-eia-canola-biofuel.py --help

Environment for write runs:
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

SOURCE_URL = (
    "https://www.eia.gov/dnav/pet/"
    "pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm"
)
SERIES_ID = "M_EPOOBDCO_YIFBP_NUS_MMLB"
GEOGRAPHY = "United States"
FEEDSTOCK = "Canola oil"
UNIT = "million pounds"
SOURCE_NAME = "us_eia_canola_biofuel_feedstock"
SOURCE_LANE = "us"
COLLECTOR_NAME = "import-eia-canola-biofuel"
EXPECTED_DISPLAY_MONTHS = 6
TIMEOUT_SECONDS = 60


class ImporterError(RuntimeError):
    """Fail-closed collector error."""


def eprint(message: str) -> None:
    print(message, file=sys.stderr)


def load_env_files() -> None:
    """Load local env files without replacing process environment values."""
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
                value.strip()
                .strip('"')
                .strip("'")
                .replace("\\n", "")
                .replace("\\r", ""),
            )


def require_env(name: str, *alternates: str) -> str:
    for candidate in (name, *alternates):
        value = os.environ.get(candidate)
        if value:
            return value
    raise ImporterError(
        "Missing required environment variable: "
        + ", ".join((name, *alternates))
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Import EIA monthly U.S. Canola-oil biofuel feedstock consumption "
            "in million pounds. Demand confirmation only; origin is unreported."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Fetch and validate the official EIA page without writing "
            "Supabase or source_runs."
        ),
    )
    return parser.parse_args(argv)


class EiaPageParser(HTMLParser):
    """Extract only the six-month U.S. row from the pinned EIA page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.month_labels: list[str] = []
        self.us_cells: list[tuple[str, str]] = []
        self.title_parts: list[str] = []
        self.unit_parts: list[str] = []
        self.all_text: list[str] = []
        self._capture_month = False
        self._capture_title = False
        self._capture_unit = False
        self._in_data_row = False
        self._data_row_depth = 0
        self._cell_class: str | None = None
        self._cell_parts: list[str] = []

    @staticmethod
    def _attrs(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {key.lower(): value or "" for key, value in attrs}

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = self._attrs(attrs)
        css_class = attributes.get("class", "")
        if tag.lower() == "title":
            self._capture_title = True
        elif tag.lower() == "th" and "Series5" in css_class.split():
            self._capture_month = True
            self._cell_parts = []
        elif tag.lower() == "tr":
            if self._in_data_row:
                self._data_row_depth += 1
            elif "DataRow" in css_class.split():
                self._in_data_row = True
                self._data_row_depth = 1
        elif (
            tag.lower() == "td"
            and self._in_data_row
            and css_class in {"DataStub1", "DataB", "Current2", "DataHist"}
        ):
            self._cell_class = css_class
            self._cell_parts = []
        elif tag.lower() == "td" and "TitleUnit" in css_class.split():
            self._capture_unit = True

    def handle_endtag(self, tag: str) -> None:
        lower = tag.lower()
        if lower == "title":
            self._capture_title = False
        elif lower == "th" and self._capture_month:
            label = " ".join("".join(self._cell_parts).split())
            if label:
                self.month_labels.append(label)
            self._capture_month = False
            self._cell_parts = []
        elif lower == "td" and self._cell_class is not None:
            value = " ".join("".join(self._cell_parts).split())
            self.us_cells.append((self._cell_class, value))
            self._cell_class = None
            self._cell_parts = []
        elif lower == "td" and self._capture_unit:
            self._capture_unit = False
        elif lower == "tr" and self._in_data_row:
            self._data_row_depth -= 1
            if self._data_row_depth == 0:
                self._in_data_row = False

    def handle_data(self, data: str) -> None:
        self.all_text.append(data)
        if self._capture_title:
            self.title_parts.append(data)
        if self._capture_unit:
            self.unit_parts.append(data)
        if self._capture_month or self._cell_class is not None:
            self._cell_parts.append(data)


def _parse_page_date(value: str, *, label: str) -> dt.date:
    try:
        return dt.datetime.strptime(value, "%m/%d/%Y").date()
    except ValueError as exc:
        raise ImporterError(f"EIA {label} is not a valid date: {value!r}") from exc


def _parse_month_label(value: str) -> dt.date:
    try:
        parsed = dt.datetime.strptime(value, "%b-%y").date()
    except ValueError as exc:
        raise ImporterError(
            f"EIA report-month label changed or is invalid: {value!r}"
        ) from exc
    return parsed.replace(day=1)


def _parse_value(value: str, *, report_month: dt.date) -> Decimal:
    normalized = value.replace(",", "").strip()
    if normalized in {"", "-", "--", "NA", "W"}:
        raise ImporterError(
            f"EIA value for {report_month.isoformat()} is unavailable or "
            f"withheld ({value!r}); refusing to publish it as zero"
        )
    try:
        parsed = Decimal(normalized)
    except InvalidOperation as exc:
        raise ImporterError(
            f"EIA value for {report_month.isoformat()} is not numeric: "
            f"{value!r}"
        ) from exc
    if not parsed.is_finite() or parsed < 0:
        raise ImporterError(
            f"EIA value for {report_month.isoformat()} must be finite and "
            "nonnegative"
        )
    return parsed


def _require_consecutive_months(months: list[dt.date]) -> None:
    for earlier, later in zip(months, months[1:]):
        expected_year = earlier.year + (1 if earlier.month == 12 else 0)
        expected_month = 1 if earlier.month == 12 else earlier.month + 1
        if later != dt.date(expected_year, expected_month, 1):
            raise ImporterError(
                "EIA page does not contain six consecutive report months: "
                f"{earlier.isoformat()} is followed by {later.isoformat()}"
            )


def parse_eia_html(
    html: str,
    *,
    retrieved_at: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    parser = EiaPageParser()
    parser.feed(html)
    parser.close()

    title = " ".join("".join(parser.title_parts).split())
    if title != "Total Canola Oil":
        raise ImporterError(
            f"EIA page title contract changed: expected 'Total Canola Oil', "
            f"received {title!r}"
        )

    displayed_unit = " ".join("".join(parser.unit_parts).split())
    if displayed_unit.casefold() != "(million pounds)":
        raise ImporterError(
            "EIA unit contract changed: expected '(Million Pounds)', "
            f"received {displayed_unit!r}"
        )

    if SERIES_ID not in html:
        raise ImporterError(
            f"EIA series contract changed: {SERIES_ID} was not found"
        )

    all_text = " ".join(" ".join(parser.all_text).split())
    release_match = re.search(
        r"(?<!Next )Release Date:\s*(\d{1,2}/\d{1,2}/\d{4})",
        all_text,
    )
    next_release_match = re.search(
        r"Next Release Date:\s*(\d{1,2}/\d{1,2}/\d{4})",
        all_text,
    )
    if release_match is None or next_release_match is None:
        raise ImporterError(
            "EIA page is missing its release or next-release date"
        )
    release_date = _parse_page_date(
        release_match.group(1),
        label="release date",
    )
    next_release_date = _parse_page_date(
        next_release_match.group(1),
        label="next-release date",
    )
    if next_release_date <= release_date:
        raise ImporterError(
            "EIA next-release date must be after the page release date"
        )

    if len(parser.month_labels) != EXPECTED_DISPLAY_MONTHS:
        raise ImporterError(
            "EIA page must expose exactly six report-month headers; "
            f"received {len(parser.month_labels)}"
        )
    months = [_parse_month_label(label) for label in parser.month_labels]
    if len(set(months)) != EXPECTED_DISPLAY_MONTHS:
        raise ImporterError("EIA page contains duplicate report months")
    _require_consecutive_months(months)

    stubs = [
        value
        for css_class, value in parser.us_cells
        if css_class == "DataStub1"
    ]
    values = [
        value
        for css_class, value in parser.us_cells
        if css_class in {"DataB", "Current2"}
    ]
    if stubs != ["U.S."]:
        raise ImporterError(
            f"EIA geography contract changed: expected one U.S. row, "
            f"received {stubs!r}"
        )
    if len(values) != EXPECTED_DISPLAY_MONTHS:
        raise ImporterError(
            "EIA U.S. row must contain exactly six monthly values; "
            f"received {len(values)}"
        )
    if release_date < months[-1]:
        raise ImporterError(
            "EIA release date precedes the latest report month"
        )

    rows: list[dict[str, Any]] = []
    for report_month, raw_value in zip(months, values):
        value = _parse_value(raw_value, report_month=report_month)
        rows.append(
            {
                "report_month": report_month.isoformat(),
                "geography": GEOGRAPHY,
                "feedstock": FEEDSTOCK,
                "consumed_million_lb": str(value),
                "unit": UNIT,
                "series_id": SERIES_ID,
                "source_page_release_date": release_date.isoformat(),
                "next_release_date": next_release_date.isoformat(),
                "source_url": SOURCE_URL,
                "retrieved_at": retrieved_at,
            }
        )

    metadata = {
        "series_id": SERIES_ID,
        "unit": UNIT,
        "release_date": release_date.isoformat(),
        "next_release_date": next_release_date.isoformat(),
        "origin_scope": "not_reported",
        "demand_confirmation_only": True,
        "displayed_month_count": EXPECTED_DISPLAY_MONTHS,
    }
    return rows, metadata


def fetch_html() -> str:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={
            "Accept": "text/html",
            "User-Agent": "BushelBoard/1.0 (+official-market-data)",
        },
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=TIMEOUT_SECONDS,
        ) as response:
            content_type = response.headers.get_content_type()
            if content_type not in {"text/html", "application/xhtml+xml"}:
                raise ImporterError(
                    f"EIA returned unexpected content type {content_type!r}"
                )
            return response.read().decode(
                response.headers.get_content_charset() or "utf-8",
                errors="strict",
            )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            f"EIA request failed: HTTP {exc.code} {body[:300]}"
        ) from exc
    except urllib.error.URLError as exc:
        raise ImporterError(f"EIA request failed: {exc.reason}") from exc
    except UnicodeDecodeError as exc:
        raise ImporterError("EIA page was not valid declared text") from exc


def ingest_rows(
    supabase_url: str,
    service_key: str,
    rows: list[dict[str, Any]],
    source_run: dict[str, Any],
) -> dict[str, Any]:
    endpoint = (
        supabase_url.rstrip("/")
        + "/rest/v1/rpc/ingest_eia_canola_biofuel_feedstock"
    )
    request = urllib.request.Request(
        endpoint,
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
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=TIMEOUT_SECONDS,
        ) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise ImporterError(
            "Atomic EIA rows + source_runs ingest failed: "
            f"HTTP {exc.code} {body[:500]}. No successful run was recorded."
        ) from exc
    except urllib.error.URLError as exc:
        raise ImporterError(
            "Atomic EIA rows + source_runs ingest failed: "
            f"{exc.reason}. No successful run was recorded."
        ) from exc

    if not isinstance(payload, dict) or not payload.get("id"):
        raise ImporterError(
            "Atomic EIA ingest did not return a source_runs id; "
            "the run is not successful"
        )
    return payload


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_env_files()
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    eprint(f"[eia-canola-biofuel] fetching {SOURCE_URL}")
    html = fetch_html()
    retrieved_at = dt.datetime.now(dt.timezone.utc).isoformat()
    rows, metadata = parse_eia_html(
        html,
        retrieved_at=retrieved_at,
    )

    summary: dict[str, Any] = {
        "status": "success",
        "dry_run": args.dry_run,
        "source": SOURCE_NAME,
        "source_url": SOURCE_URL,
        "series_id": SERIES_ID,
        "unit": UNIT,
        "interpretation": (
            "U.S. biofuel demand confirmation only; country of origin is "
            "not reported"
        ),
        "source_period_start": rows[0]["report_month"],
        "source_period_end": rows[-1]["report_month"],
        "release_date": metadata["release_date"],
        "next_release_date": metadata["next_release_date"],
        "rows": len(rows),
        "observations": rows,
    }

    if args.dry_run:
        print(json.dumps(summary, indent=2))
        return 0

    supabase_url = require_env(
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_URL",
    )
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    source_run_input = {
        "source_name": SOURCE_NAME,
        "source_lane": SOURCE_LANE,
        "collector_name": COLLECTOR_NAME,
        "status": "success",
        "source_period_start": rows[0]["report_month"],
        "source_period_end": rows[-1]["report_month"],
        "latest_source_label": (
            f"{rows[-1]['report_month'][:7]} released "
            f"{metadata['release_date']}"
        ),
        "rows_updated": len(rows),
        "source_url": SOURCE_URL,
        "started_at": started_at,
        "metadata": metadata,
    }
    source_run = ingest_rows(
        supabase_url,
        service_key,
        rows,
        source_run_input,
    )
    summary["source_run"] = source_run
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ImporterError as exc:
        print(json.dumps({"status": "error", "message": str(exc)}))
        sys.exit(1)
