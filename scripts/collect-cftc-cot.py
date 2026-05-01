#!/usr/bin/env python3
"""
collect-cftc-cot — Phase 1 wrapper around the import-cftc-cot Edge Function.

Calls the Edge Function with internal auth, then fans out Phase 1 heartbeat
ticks to both:
  * US markets (us_score_trajectory): Corn, Soybeans, Wheat (Oats has no
    disaggregated CFTC series — skipped).
  * CAD grains (score_trajectory): Canola, Corn, Soybeans, Wheat (the 4
    grains with CFTC COT mappings per supabase/functions/_shared/
    cftc-cot-parser.ts).

Usage:
  python3 scripts/collect-cftc-cot.py
  python3 scripts/collect-cftc-cot.py --dry-run
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

EDGE_FUNCTION_NAME = "import-cftc-cot"
HEARTBEAT_CLI = Path(__file__).with_name("write-collector-heartbeat.py")
TRAJECTORY_SCAN_TYPE = "collector_cftc_cot"
TRAJECTORY_TRIGGER = "CFTC COT weekly refresh"

US_MARKETS_WITH_COT = ["Corn", "Soybeans", "Wheat"]
CAD_GRAINS_WITH_COT = ["Canola", "Corn", "Soybeans", "Wheat"]

EDGE_TIMEOUT_SECONDS = 180
SUPABASE_TIMEOUT_SECONDS = 30


class WrapperError(Exception):
    pass


def load_env_files() -> None:
    for path in [
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
        Path.home() / ".hermes" / ".env",
    ]:
        if not path.exists():
            continue
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    raise WrapperError(f"Missing env var: {', '.join((name, *alternates))}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Trigger import-cftc-cot EF + emit Phase 1 heartbeats")
    p.add_argument("--dry-run", action="store_true",
                   help="Skip EF trigger and heartbeat writes; print planned payload only.")
    p.add_argument("--skip-ef", action="store_true",
                   help="Skip EF trigger (assume already imported); only emit heartbeats.")
    p.add_argument("--report-date", help="Optional explicit report_date for EF trigger.")
    return p.parse_args()


def trigger_edge_function(supabase_url: str, service_key: str, internal_secret: str,
                          report_date: str | None) -> dict[str, Any]:
    url = supabase_url.rstrip("/") + f"/functions/v1/{EDGE_FUNCTION_NAME}"
    body = json.dumps({"report_date": report_date} if report_date else {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {service_key}",
            "x-bushel-internal-secret": internal_secret,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=EDGE_TIMEOUT_SECONDS) as response:
            body_raw = response.read().decode("utf-8", "ignore")
            return json.loads(body_raw) if body_raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:500]
        raise WrapperError(f"EF {EDGE_FUNCTION_NAME} failed: HTTP {exc.code} {detail}") from exc


def fetch_latest_cot_report(supabase_url: str, service_key: str) -> tuple[str, list[dict[str, Any]]]:
    """Return (latest_report_date, rows) from cftc_cot_positions for that date."""
    url = supabase_url.rstrip("/") + "/rest/v1/cftc_cot_positions"
    qs_latest = urllib.parse.urlencode({
        "select": "report_date",
        "order": "report_date.desc",
        "limit": "1",
    })
    req = urllib.request.Request(
        f"{url}?{qs_latest}",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
    )
    with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
        rows = json.loads(response.read().decode("utf-8", "ignore") or "[]")
    if not rows:
        raise WrapperError("cftc_cot_positions is empty; cannot emit heartbeats")
    report_date = rows[0]["report_date"]

    # Pull all rows for that report_date.
    qs_rows = urllib.parse.urlencode({
        "select": "report_date,commodity,cgc_grain,mapping_type,managed_money_long,managed_money_short,prod_merc_long,prod_merc_short,crop_year,grain_week",
        "report_date": f"eq.{report_date}",
        "limit": "100",
    })
    req2 = urllib.request.Request(
        f"{url}?{qs_rows}",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
    )
    with urllib.request.urlopen(req2, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
        detail_rows = json.loads(response.read().decode("utf-8", "ignore") or "[]")
    return report_date, detail_rows


def _net(row: dict[str, Any], long_key: str, short_key: str) -> int | None:
    l = row.get(long_key)
    s = row.get(short_key)
    if l is None or s is None:
        return None
    return int(l) - int(s)


def cot_signal_note(market: str, rows: list[dict[str, Any]]) -> tuple[str, str]:
    """Build signal note from managed-money net position for a market.

    Severity:
    - critical if |mm_net| > 150,000 (extreme positioning)
    - elevated if |mm_net| > 75,000
    - normal otherwise
    """
    primary = next((r for r in rows if r.get("mapping_type") == "primary"), None)
    row = primary or (rows[0] if rows else None)
    if not row:
        return "unknown", f"CFTC COT refresh — no rows for {market}"
    mm_net = _net(row, "managed_money_long", "managed_money_short")
    if mm_net is None:
        return "normal", f"CFTC COT refresh — {market} MM position unavailable"
    abs_net = abs(mm_net)
    if abs_net > 150_000:
        severity = "critical"
    elif abs_net > 75_000:
        severity = "elevated"
    else:
        severity = "normal"
    sign = "long" if mm_net > 0 else "short"
    return severity, f"CFTC COT — {market} MM net {mm_net:+,} ({sign})"


def invoke_heartbeat(side: str, market: str, severity: str, signal_note: str,
                     report_date: str, evidence: dict[str, Any],
                     grain_week: int | None = None) -> dict[str, Any]:
    cmd = [
        "python", str(HEARTBEAT_CLI),
        "--side", side,
        "--market", market,
        "--scan-type", TRAJECTORY_SCAN_TYPE,
        "--trigger", TRAJECTORY_TRIGGER,
        "--severity", severity,
        "--signal-note", signal_note,
        "--source-week-ending", report_date,
        "--evidence-json", json.dumps(evidence),
        "--quiet",
    ]
    if grain_week is not None:
        cmd.extend(["--grain-week", str(grain_week)])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return {
            "side": side,
            "market": market,
            "ok": r.returncode == 0,
            "stderr": r.stderr.strip()[:500] if r.returncode != 0 else None,
        }
    except Exception as exc:
        return {"side": side, "market": market, "ok": False, "stderr": str(exc)[:500]}


def build_and_emit(report_date: str, rows: list[dict[str, Any]], dry_run: bool) -> dict[str, Any]:
    # Group rows by cgc_grain (which also aligns 1:1 with US market names for
    # Corn / Soybeans / Wheat — since we use the same canonical English name).
    by_grain: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        g = row.get("cgc_grain")
        if g:
            by_grain.setdefault(g, []).append(row)

    grain_week_by_grain = {g: rs[0].get("grain_week") for g, rs in by_grain.items()}

    plan: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []

    for market in US_MARKETS_WITH_COT:
        rs = by_grain.get(market, [])
        severity, note = cot_signal_note(market, rs)
        evidence = {
            "collector": "collect-cftc-cot",
            "report_date": report_date,
            "commodities": sorted({r["commodity"] for r in rs}),
            "primary_row": next((r for r in rs if r.get("mapping_type") == "primary"), rs[0] if rs else None),
        }
        plan.append({"side": "us", "market": market, "severity": severity,
                     "signal_note": note, "rows": len(rs)})
        if not dry_run:
            results.append(invoke_heartbeat("us", market, severity, note, report_date, evidence))

    for grain in CAD_GRAINS_WITH_COT:
        rs = by_grain.get(grain, [])
        severity, note = cot_signal_note(grain, rs)
        evidence = {
            "collector": "collect-cftc-cot",
            "report_date": report_date,
            "commodities": sorted({r["commodity"] for r in rs}),
            "primary_row": next((r for r in rs if r.get("mapping_type") == "primary"), rs[0] if rs else None),
        }
        plan.append({"side": "cad", "market": grain, "severity": severity,
                     "signal_note": note, "rows": len(rs)})
        if not dry_run:
            results.append(invoke_heartbeat(
                "cad", grain, severity, note, report_date, evidence,
                grain_week=grain_week_by_grain.get(grain),
            ))

    return {
        "report_date": report_date,
        "plan": plan,
        "results": results if not dry_run else None,
        "written": sum(1 for r in results if r.get("ok")) if not dry_run else None,
        "total": len(results) if not dry_run else len(plan),
    }


def main() -> None:
    load_env_files()
    args = parse_args()

    supabase_url = require_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    internal_secret = require_env("BUSHEL_INTERNAL_FUNCTION_SECRET")

    ef_response: dict[str, Any] | None = None
    if not args.dry_run and not args.skip_ef:
        print(f"Triggering {EDGE_FUNCTION_NAME}...", file=os.sys.stderr)
        ef_response = trigger_edge_function(supabase_url, service_key, internal_secret,
                                            args.report_date)
        print(f"EF response: {json.dumps(ef_response)}", file=os.sys.stderr)

    report_date, rows = fetch_latest_cot_report(supabase_url, service_key)

    trajectory: dict[str, Any] = {"report_date": report_date, "rows_considered": len(rows)}
    warnings: list[str] = []
    try:
        trajectory.update(build_and_emit(report_date, rows, args.dry_run))
    except Exception as exc:
        warnings.append(f"heartbeat_write_failed: {exc!s}"[:500])

    payload = {
        "status": "success",
        "dry_run": args.dry_run,
        "ef_response": ef_response,
        "trajectory": trajectory,
    }
    if warnings:
        payload["warnings"] = warnings
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
