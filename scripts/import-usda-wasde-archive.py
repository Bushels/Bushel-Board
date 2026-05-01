#!/usr/bin/env python3
"""
USDA WASDE Cornell/ESMIS archive importer.

Fills the gap left by the live PSD API (which only exposes the latest
estimate per (market, attribute, market_year)). Downloads monthly WASDE
.xls files from USDA's ESMIS archive and upserts into usda_wasde_raw,
giving the desk's revision_direction RPC real month-over-month density.

Usage:
  python scripts/import-usda-wasde-archive.py                   # last 12 months
  python scripts/import-usda-wasde-archive.py --last-n-months 24
  python scripts/import-usda-wasde-archive.py --release 2026-04 # one specific release
  python scripts/import-usda-wasde-archive.py --release 2026-04 --release 2026-03
  python scripts/import-usda-wasde-archive.py --dry-run         # no DB writes
  python scripts/import-usda-wasde-archive.py --keep-files      # don't delete tmp .xls
  python scripts/import-usda-wasde-archive.py --help

Architecture:
- Source: https://esmis.nal.usda.gov/publication/world-agricultural-supply-and-demand-estimates
  - Direct file URLs are stable: /sites/default/release-files/<bucket>/wasdeMMYY.xls
  - The landing page HTML lists the most recent ~24 monthly releases.
- Each .xls release contains pages 8-37; we extract:
  - Page 11: U.S. Wheat
  - Page 12: U.S. Corn (Feed Grains aggregate ignored - we use Corn section)
  - Page 13: U.S. Barley + U.S. Oats (Sorghum ignored - not in our markets list)
  - Page 15: U.S. Soybeans
- Each section has 4 data columns: 2023/24 actual, 2024/25 estimate,
  2025/26 March projection, 2025/26 April projection. We emit raw rows
  for each (market, attribute, marketing_year) using the *current month*
  projection column. The previous-month column is captured separately as
  a synthetic prior-snapshot row, which gives the LAG window in
  get_usda_wasde_context something to compare against even from a single
  release.

Why we DON'T compete with import-usda-wasde.py:
  This script writes to the SAME usda_wasde_raw table with the SAME
  PSD attribute_ids. The two paths complement each other:
  - import-usda-wasde.py: PSD API, latest-only, rich attribute set
  - import-usda-wasde-archive.py: ESMIS XLS, monthly history, narrower
    attribute set
  Upserts conflict on (commodity_code, country_code, market_year,
  calendar_year, month, attribute_id) so re-running either is idempotent
  and they overwrite each other safely (last writer wins per attribute).

Dependencies: xlrd (legacy .xls), urllib (stdlib).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

try:
    import xlrd
except ImportError:
    print("ERROR: xlrd is required. Install with: pip install xlrd", file=sys.stderr)
    sys.exit(1)

ESMIS_LANDING = "https://esmis.nal.usda.gov/publication/world-agricultural-supply-and-demand-estimates"
USDA_LIVE_BASE = "https://www.usda.gov/oce/commodity/wasde"  # mirror for current+prev month
SUPABASE_TIMEOUT_SECONDS = 60
USDA_TIMEOUT_SECONDS = 60
UPSERT_BATCH_SIZE = 500
USER_AGENT = "Mozilla/5.0 (Bushel Board WASDE archive importer; contact kyle@bushelsenergy.com)"

# Bushel-weight to metric-tonnes conversion factors per market.
# Multiplied by Million-Bushels gives kt (kilotonnes).
BU_TO_KT_PER_MBU = {
    "Wheat":    27.2155,   # 60 lb/bu
    "Corn":     25.4012,   # 56 lb/bu
    "Soybeans": 27.2155,   # 60 lb/bu
    "Barley":   21.7724,   # 48 lb/bu
    "Oats":     14.5149,   # 32 lb/bu
}

# Million Acres -> Thousand Hectares (kha)
MAC_TO_KHA = 404.686

# PSD attribute IDs that map cleanly from WASDE rows. The mapped view
# (supabase/migrations/20260414000500_create_usda_wasde_mapped.sql)
# pivots these into named columns used by get_usda_wasde_context.
PSD_ATTR = {
    "Area Planted":          1,    # Not in mapped view; kept for completeness.
    "Area Harvested":        4,
    "Crush":                 7,    # Soybeans only (oilseed processing).
    "Beginning Stocks":     20,
    "Production":           28,
    "Imports":              57,
    "Total Supply":         86,
    "Exports":              88,
    "Domestic Consumption": 125,
    "Feed and Residual":    130,
    "Food, Seed":           149,   # Mapped pivots id 149 to food_use_domestic_consumption.
    "Ending Stocks":        176,
    "Total Distribution":   178,
    "Yield":                184,
}

# WASDE row label -> PSD attribute. Labels are matched case-insensitively
# with leading/trailing whitespace stripped. We match the PREFIX so that
# rows like "Food, Seed & Industrial 2/" still hit "Food, Seed".
WASDE_TO_PSD_PREFIX = [
    ("area planted",          PSD_ATTR["Area Planted"],          "macres"),
    ("area harvested",        PSD_ATTR["Area Harvested"],        "macres"),
    ("yield per harvested",   PSD_ATTR["Yield"],                 "yield_buac"),
    ("beginning stocks",      PSD_ATTR["Beginning Stocks"],      "mbu"),
    ("production",            PSD_ATTR["Production"],            "mbu"),
    ("imports",               PSD_ATTR["Imports"],               "mbu"),
    ("supply, total",         PSD_ATTR["Total Supply"],          "mbu"),
    ("feed and residual",     PSD_ATTR["Feed and Residual"],     "mbu"),
    ("food, seed",            PSD_ATTR["Food, Seed"],            "mbu"),
    ("crushings",             PSD_ATTR["Crush"],                 "mbu"),
    ("domestic, total",       PSD_ATTR["Domestic Consumption"],  "mbu"),
    ("total domestic",        PSD_ATTR["Domestic Consumption"],  "mbu"),
    ("exports",               PSD_ATTR["Exports"],               "mbu"),
    ("use, total",            PSD_ATTR["Total Distribution"],    "mbu"),
    ("ending stocks",         PSD_ATTR["Ending Stocks"],         "mbu"),
]

# Markets we extract. Each entry tells us which sheet to look in and the
# label that marks the start of that commodity's section (column 0). We
# skip sections we don't care about (Sorghum, Soybean Oil, Soybean Meal).
MARKETS = [
    {
        "market_name": "Wheat",
        "commodity_code": "0410000",
        "country_code": "US",
        "sheet_name": "Page 11",
        "section_label": "U.S. Wheat",  # title row; section is the whole sheet
        "value_cols": "wheat",          # see _value_cols_for_release
    },
    {
        "market_name": "Corn",
        "commodity_code": "0440000",
        "country_code": "US",
        "sheet_name": "Page 12",
        "section_label": "CORN",        # in column 0 of header row
        "value_cols": "narrow",
    },
    {
        "market_name": "Barley",
        "commodity_code": "0430000",
        "country_code": "US",
        "sheet_name": "Page 13",
        "section_label": "BARLEY",
        "value_cols": "narrow",
    },
    {
        "market_name": "Oats",
        "commodity_code": "0452000",
        "country_code": "US",
        "sheet_name": "Page 13",
        "section_label": "OATS",
        "value_cols": "narrow",
    },
    {
        "market_name": "Soybeans",
        "commodity_code": "2222000",
        "country_code": "US",
        "sheet_name": "Page 15",
        "section_label": "SOYBEANS",
        "value_cols": "narrow",
    },
]


class ImporterError(Exception):
    pass


# ---------- Env + args ------------------------------------------------------

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
    p = argparse.ArgumentParser(description="Import USDA WASDE archive into usda_wasde_raw")
    p.add_argument("--release", action="append", dest="releases",
                   help="Specific release in YYYY-MM (repeatable). Default: last 12 months.")
    p.add_argument("--last-n-months", type=int, default=12,
                   help="Backfill the last N monthly releases when --release is not set. Default 12.")
    p.add_argument("--dry-run", action="store_true",
                   help="Fetch + parse but do not write to Supabase.")
    p.add_argument("--keep-files", action="store_true",
                   help="Keep downloaded .xls files in tmp dir for debugging.")
    p.add_argument("--output-dir",
                   help="Where to download .xls files. Default: a temp dir cleaned up at exit.")
    return p.parse_args()


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    raise ImporterError(f"Missing required env: {', '.join((name, *alternates))}")


# ---------- Release discovery ----------------------------------------------

def fetch_text(url: str, timeout: int = USDA_TIMEOUT_SECONDS) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_bytes(url: str, timeout: int = USDA_TIMEOUT_SECONDS) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def discover_release_urls() -> dict[str, str]:
    """Return {YYYY-MM: full_url} for every wasde*.xls link on the ESMIS page."""
    html = fetch_text(ESMIS_LANDING)
    out: dict[str, str] = {}
    # Match both URL families seen on the page:
    #  /sites/default/release-files/<numeric>/wasdeMMYY.xls
    #  /sites/default/release-files/3t945q76s/<a>/<b>/wasdeMMYY.xls
    pat = re.compile(r'href="([^"]*?wasde(\d{2})(\d{2})\.xls)"')
    for m in pat.finditer(html):
        href, mm, yy = m.group(1), m.group(2), m.group(3)
        if not href.startswith("http"):
            href = "https://esmis.nal.usda.gov" + href
        # WASDE files use 2-digit YY. Disambiguate: 25 -> 2025, 26 -> 2026, ...
        # Anchor against the current year. Anything > current YY+1 is treated as 19YY.
        cur_yy = dt.datetime.now(dt.timezone.utc).year % 100
        yy_int = int(yy)
        if yy_int > cur_yy + 1:
            year = 1900 + yy_int
        else:
            year = 2000 + yy_int
        key = f"{year:04d}-{int(mm):02d}"
        if key not in out:
            out[key] = href
    return out


def latest_release_keys(n: int) -> list[str]:
    today = dt.datetime.now(dt.timezone.utc).date()
    out: list[str] = []
    y, m = today.year, today.month
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return out


# ---------- xls parsing ----------------------------------------------------

def _value_cols_for_release(value_cols_kind: str, sheet: "xlrd.sheet.Sheet") -> dict[str, int]:
    """Return {marketing_year_label: column_index} for the four data columns.

    There are two layouts:
      - "narrow" (Pages 12, 13, 15, etc): cols 1..4 = old, est, prev_proj, cur_proj
      - "wheat"  (Page 11, 13-col layout): cols 4, 6, 9, 11
    """
    if value_cols_kind == "narrow":
        return {"hist": 1, "est": 2, "prev_proj": 3, "cur_proj": 4}
    if value_cols_kind == "wheat":
        return {"hist": 4, "est": 6, "prev_proj": 9, "cur_proj": 11}
    raise ImporterError(f"Unknown value_cols kind: {value_cols_kind!r}")


def _release_year_month_from_filename(filename: str) -> tuple[int, int] | None:
    m = re.search(r"wasde(\d{2})(\d{2})\.xls", filename)
    if not m:
        return None
    mm = int(m.group(1))
    yy_int = int(m.group(2))
    cur_yy = dt.datetime.now(dt.timezone.utc).year % 100
    year = 1900 + yy_int if yy_int > cur_yy + 1 else 2000 + yy_int
    return year, mm


def _release_year_month_from_key(key: str) -> tuple[int, int]:
    m = re.match(r"(\d{4})-(\d{1,2})$", key)
    if not m:
        raise ImporterError(f"Bad release key {key!r} — expected YYYY-MM")
    return int(m.group(1)), int(m.group(2))


def _section_row_range(sheet: "xlrd.sheet.Sheet", section_label: str) -> tuple[int, int]:
    """Find the row range for `section_label` in column 0.

    Returns (start_row_inclusive, end_row_exclusive). The section ends at
    the next ALL-CAPS commodity-name row that follows, or end of sheet.

    To avoid matching titles like "U.S. Sorghum, Barley, and Oats Supply"
    when looking for "BARLEY" or "OATS", we require the matching row to
    ALSO have a year-pattern (e.g. "2023/24") in one of cols 1..ncols-1.
    Header rows in WASDE always carry the year span in adjacent columns;
    title rows do not.
    """
    target = section_label.lower()
    year_pat = re.compile(r"\d{4}\s*/\s*\d{2,4}")
    start = None
    # First pass: row that contains target in col 0 AND has year header in adjacent columns
    for r in range(sheet.nrows):
        v0 = str(sheet.cell_value(r, 0)).strip().lower()
        if target not in v0:
            continue
        has_year = False
        for c in range(1, sheet.ncols):
            cell = str(sheet.cell_value(r, c)).strip()
            if year_pat.search(cell):
                has_year = True
                break
        if has_year:
            start = r
            break
    # Fallback: title-style match (e.g., "u.s. wheat" on Page 11) where the year
    # header is on a different row. Accept the first containing row.
    if start is None:
        for r in range(sheet.nrows):
            v0 = str(sheet.cell_value(r, 0)).strip().lower()
            if target in v0:
                start = r
                break
    if start is None:
        raise ImporterError(f"Section label not found: {section_label!r}")

    # Section ends at the next commodity row. We look for ALL-CAPS short
    # labels (CORN, SORGHUM, BARLEY, OATS, SOYBEANS, SOYBEAN OIL, SOYBEAN MEAL)
    # that aren't the same label.
    next_section_pat = re.compile(r"^(CORN|SORGHUM|BARLEY|OATS|SOYBEANS?|SOYBEAN OIL|SOYBEAN MEAL|RICE|COTTON|WHEAT)\b", re.IGNORECASE)
    end = sheet.nrows
    for r in range(start + 1, sheet.nrows):
        v0 = str(sheet.cell_value(r, 0)).strip()
        if next_section_pat.match(v0) and v0.lower() != target:
            end = r
            break
    return start, end


def _extract_year_labels(sheet: "xlrd.sheet.Sheet", section_start: int, value_cols: dict[str, int]) -> dict[str, str]:
    """Resolve marketing-year labels (e.g. '2024/2025') for each column key.

    Strategy: walk down from section_start until we find a row that has a
    string like "2023/24" in any of the value-columns. That's our header.
    Convert "2023/24" -> "2024" (PSD market_year = the *later* year, matching
    our existing usda_wasde_raw rows which use "2025" for the 2025/26 MY).
    """
    pat = re.compile(r"(\d{4})\s*/\s*(\d{2,4})")
    for r in range(section_start, min(section_start + 8, sheet.nrows)):
        labels: dict[str, str] = {}
        for key, col in value_cols.items():
            if col >= sheet.ncols:
                continue
            v = str(sheet.cell_value(r, col)).strip()
            m = pat.search(v)
            if m:
                labels[key] = m.group(1)
        if len(labels) >= 3:
            return labels
    raise ImporterError(f"Could not find marketing-year header near row {section_start}")


def _coerce_number(cell) -> float | None:
    if cell is None:
        return None
    if isinstance(cell, (int, float)):
        f = float(cell)
        # Excel uses NaN-ish placeholders sometimes; reject obvious sentinels.
        if f != f:
            return None
        return f
    s = str(cell).strip()
    if not s or s.lower() in ("filler", "n/a", "na", "nd"):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def _convert_to_kt(market_name: str, raw: float, unit: str) -> float | None:
    if raw is None:
        return None
    if unit == "mbu":
        f = BU_TO_KT_PER_MBU.get(market_name)
        if f is None:
            return None
        return raw * f
    if unit == "macres":
        return raw * MAC_TO_KHA
    if unit == "yield_buac":
        # PSD attribute_id 184 is yield in mt/ha. Convert bu/ac -> mt/ha:
        #   1 bu/ac × bushel_kg / acre_to_ha = mt/ha
        f = BU_TO_KT_PER_MBU.get(market_name)
        if f is None:
            return None
        # f is kt per Mbu -> tonnes per bu; divide by acres-per-ha = 1/0.404686
        # bu/ac -> mt/ha: tonnes/bu × bu/ac × 1/(0.404686 ha/ac) = tonnes/ha = mt/ha
        return raw * (f / 1000) / 0.404686  # f / 1000 is tonnes/bu (since f is kt/Mbu = t/Kbu = t/1000bu * 1000)
    return None


def parse_release(xls_path: Path, cal_year: int, cal_month: int) -> list[dict[str, Any]]:
    """Return raw rows (one per market × marketing_year × attribute) for a single .xls release."""
    wb = xlrd.open_workbook(str(xls_path))
    rows: list[dict[str, Any]] = []

    for market in MARKETS:
        try:
            sheet = wb.sheet_by_name(market["sheet_name"])
        except xlrd.biffh.XLRDError:
            print(f"  [skip] {xls_path.name}: missing sheet {market['sheet_name']}", file=sys.stderr)
            continue
        try:
            sec_start, sec_end = _section_row_range(sheet, market["section_label"])
        except ImporterError as exc:
            print(f"  [skip] {xls_path.name} {market['market_name']}: {exc}", file=sys.stderr)
            continue

        value_cols = _value_cols_for_release(market["value_cols"], sheet)
        try:
            year_labels = _extract_year_labels(sheet, sec_start, value_cols)
        except ImporterError as exc:
            print(f"  [skip] {xls_path.name} {market['market_name']}: {exc}", file=sys.stderr)
            continue

        # For each WASDE row in the section, find the matching PSD attribute.
        for r in range(sec_start, sec_end):
            label0 = str(sheet.cell_value(r, 0)).strip().lower()
            attr_id = None
            unit = None
            for prefix, aid, u in WASDE_TO_PSD_PREFIX:
                if label0.startswith(prefix):
                    attr_id = aid
                    unit = u
                    break
            if attr_id is None:
                continue

            # Emit one row per known marketing year.
            # Convention for market_year: use the *later* year of the MY span
            # (matches existing usda_wasde_raw rows which store "2025" for 2025/26).
            #
            # We deliberately SKIP `prev_proj` (the prior-month projection of
            # the current MY shown in this release). That data point is the
            # same as the prior month's release's `cur_proj` and would either
            # collide on the upsert primary key or silently overwrite the
            # latest value depending on dict order. The prior month's release
            # already captured it.
            for col_key, col_idx in value_cols.items():
                if col_key == "prev_proj":
                    continue
                year_label = year_labels.get(col_key)
                if not year_label:
                    continue
                if col_idx >= sheet.ncols:
                    continue
                raw_val = _coerce_number(sheet.cell_value(r, col_idx))
                if raw_val is None:
                    continue
                converted = _convert_to_kt(market["market_name"], raw_val, unit)
                if converted is None:
                    continue
                rows.append({
                    "crop_year": year_label,            # e.g. "2025"
                    "market_name": market["market_name"],
                    "commodity_code": market["commodity_code"],
                    "commodity_name": market["market_name"],
                    "country_code": market["country_code"],
                    "market_year": year_label,
                    "calendar_year": cal_year,
                    "month": cal_month,
                    "attribute_id": attr_id,
                    "unit_id": 4,                        # 1000 MT, matches PSD convention used in usda_wasde_raw
                    "value": round(converted, 3),
                    "source": "usda_esmis_wasde_xls",
                })
    return rows


# ---------- Supabase upsert ------------------------------------------------

def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def upsert_rows(supabase_url: str, service_key: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    endpoint = f"{supabase_url}/rest/v1/usda_wasde_raw"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        # Conflict columns must match existing usda_wasde_raw uniqueness.
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    qs = "?on_conflict=" + urllib.parse.quote(
        "commodity_code,country_code,market_year,calendar_year,month,attribute_id,unit_id"
    )
    for batch in chunked(rows, UPSERT_BATCH_SIZE):
        data = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            endpoint + qs, data=data, headers=headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as resp:
                resp.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise ImporterError(f"Supabase upsert failed: HTTP {exc.code} {body[:500]}") from exc


# ---------- main -----------------------------------------------------------

def main() -> int:
    load_env_files()
    args = parse_args()
    supabase_url = require_env("NEXT_PUBLIC_SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    print("Discovering ESMIS releases...", file=sys.stderr)
    available = discover_release_urls()
    print(f"  found {len(available)} releases on landing page", file=sys.stderr)

    if args.releases:
        wanted = list(args.releases)
    else:
        wanted = latest_release_keys(args.last_n_months)

    missing = [k for k in wanted if k not in available]
    if missing:
        print(f"  [warn] {len(missing)} requested releases not on landing page: {missing[:5]}{'...' if len(missing)>5 else ''}", file=sys.stderr)
    plan = [(k, available[k]) for k in wanted if k in available]
    if not plan:
        raise ImporterError("No releases to download. Check --release values vs landing-page index.")

    if args.output_dir:
        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        cleanup = False
    else:
        tmp = tempfile.mkdtemp(prefix="wasde-archive-")
        out_dir = Path(tmp)
        cleanup = not args.keep_files

    all_rows: list[dict[str, Any]] = []
    summary: list[dict[str, Any]] = []
    try:
        for key, url in plan:
            local = out_dir / f"wasde-{key}.xls"
            if not local.exists():
                print(f"Downloading {key} -> {url}", file=sys.stderr)
                try:
                    data = fetch_bytes(url)
                    local.write_bytes(data)
                except Exception as exc:
                    print(f"  [skip] download failed: {exc}", file=sys.stderr)
                    summary.append({"release": key, "url": url, "status": "download_failed", "error": str(exc)[:200]})
                    continue
                time.sleep(0.5)  # be polite to ESMIS
            else:
                print(f"Using cached {local}", file=sys.stderr)
            try:
                cy, cm = _release_year_month_from_key(key)
                rows = parse_release(local, cy, cm)
            except Exception as exc:
                print(f"  [skip] parse failed: {exc}", file=sys.stderr)
                summary.append({"release": key, "url": url, "status": "parse_failed", "error": str(exc)[:200]})
                continue
            all_rows.extend(rows)
            summary.append({
                "release": key,
                "url": url,
                "status": "parsed",
                "rows": len(rows),
                "markets": sorted({r["market_name"] for r in rows}),
                "marketing_years": sorted({r["market_year"] for r in rows}),
            })
            print(f"  parsed {len(rows)} rows for {key}", file=sys.stderr)

        if not args.dry_run:
            print(f"Upserting {len(all_rows)} rows into usda_wasde_raw...", file=sys.stderr)
            upsert_rows(supabase_url, service_key, all_rows)

        result = {
            "status": "success" if all_rows else "no_rows",
            "dry_run": args.dry_run,
            "releases_requested": wanted,
            "releases_processed": [s["release"] for s in summary if s["status"] == "parsed"],
            "rows_total": len(all_rows),
            "summary": summary,
            "output_dir": str(out_dir),
        }
        print(json.dumps(result, indent=2))
        return 0 if all_rows else 2
    finally:
        if cleanup:
            for p in out_dir.glob("*.xls"):
                p.unlink(missing_ok=True)
            try:
                out_dir.rmdir()
            except OSError:
                pass


if __name__ == "__main__":
    try:
        rc = main()
    except ImporterError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        rc = 1
    sys.exit(rc)
