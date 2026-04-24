#!/usr/bin/env python3
"""
collect-cgc — Phase 1 wrapper around the CGC weekly import pipeline.

Default path (2026-04-24 onward):
  POST to the Vercel proxy at /api/cron/import-cgc. Vercel scrapes the CGC
  weekly CSV from a non-blocklisted egress IP and forwards it to the
  import-cgc-weekly Edge Function via the csv_data body parameter.

Why the proxy:
  CGC drops Supabase edge-region IPs at the TCP layer (ECONNRESET), so the
  EF's built-in fetch path fails in production. Vercel's residential/cloud
  egress still reaches CGC cleanly.

Escape hatch:
  --direct-ef calls import-cgc-weekly directly. Only useful in emergencies
  when the proxy is down and you're running the wrapper from a machine that
  can reach CGC (CGC will still block if invoked from Supabase-egress IPs).

After the import lands, this wrapper fans out Phase 1 heartbeat ticks to each
of the 16 canonical CAD grains on score_trajectory. That heartbeat layer is
what the Friday swarm and UI use to distinguish "CGC data arrived" from
"no weekday signal yet."

Usage:
  python3 scripts/collect-cgc.py
  python3 scripts/collect-cgc.py --dry-run
  python3 scripts/collect-cgc.py --direct-ef           # legacy path
  python3 scripts/collect-cgc.py --skip-ef             # heartbeats only
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

EDGE_FUNCTION_NAME = "import-cgc-weekly"
VERCEL_PROXY_PATH = "/api/cron/import-cgc"
HEARTBEAT_CLI = Path(__file__).with_name("write-collector-heartbeat.py")
TRAJECTORY_SCAN_TYPE = "collector_cgc"
TRAJECTORY_TRIGGER = "CGC weekly grain stats refresh"

CAD_GRAINS_CANONICAL = [
    "Amber Durum", "Barley", "Beans", "Canaryseed", "Canola", "Chick Peas",
    "Corn", "Flaxseed", "Lentils", "Mustard Seed", "Oats", "Peas", "Rye",
    "Soybeans", "Sunflower", "Wheat",
]

IMPORT_TIMEOUT_SECONDS = 300
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
    p = argparse.ArgumentParser(description="Trigger CGC import + emit Phase 1 heartbeats")
    p.add_argument("--dry-run", action="store_true",
                   help="Skip import trigger and heartbeat writes; print planned payload only.")
    p.add_argument("--skip-ef", action="store_true",
                   help="Skip import trigger (assume already imported); only emit heartbeats.")
    p.add_argument("--direct-ef", action="store_true",
                   help=("Legacy: call import-cgc-weekly EF directly instead of via the "
                         "Vercel proxy. Only works from non-blocklisted egress."))
    p.add_argument("--week", type=int, default=None,
                   help="Optional target grain_week to pass to the import (default: let EF decide).")
    return p.parse_args()


def trigger_vercel_proxy(vercel_url: str, cron_secret: str,
                         week: int | None) -> dict[str, Any]:
    """Call the Vercel proxy at /api/cron/import-cgc.

    Vercel scrapes CGC from its own egress (residential/cloud IPs aren't in
    CGC's blocklist) and forwards the CSV to the Edge Function via csv_data.
    """
    url = vercel_url.rstrip("/") + VERCEL_PROXY_PATH
    body: dict[str, Any] = {}
    if week is not None:
        body["week"] = week
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cron_secret}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=IMPORT_TIMEOUT_SECONDS) as response:
            body_text = response.read().decode("utf-8", "ignore")
            return json.loads(body_text) if body_text else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:500]
        raise WrapperError(
            f"Vercel proxy {VERCEL_PROXY_PATH} failed: HTTP {exc.code} {detail}"
        ) from exc


def trigger_edge_function(supabase_url: str, service_key: str,
                          internal_secret: str,
                          week: int | None) -> dict[str, Any]:
    """Legacy: call the EF directly. Retained for --direct-ef emergency use."""
    url = supabase_url.rstrip("/") + f"/functions/v1/{EDGE_FUNCTION_NAME}"
    body: dict[str, Any] = {}
    if week is not None:
        body["week"] = week
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {service_key}",
            "x-bushel-internal-secret": internal_secret,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=IMPORT_TIMEOUT_SECONDS) as response:
            body_text = response.read().decode("utf-8", "ignore")
            return json.loads(body_text) if body_text else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:500]
        raise WrapperError(f"EF {EDGE_FUNCTION_NAME} failed: HTTP {exc.code} {detail}") from exc


def fetch_latest_cgc_week(supabase_url: str, service_key: str) -> tuple[str, int, str | None]:
    """Return (crop_year, grain_week, latest_week_ending) from cgc_observations.

    Ordering gotcha: cgc_observations pools ~5 crop years. Sorting by grain_week
    first picks the historical max (~52) across any year, not the current week.
    Sort by week_ending_date — it increases monotonically across crop-year
    boundaries, so the newest row is always the one we want.
    """
    url = supabase_url.rstrip("/") + "/rest/v1/cgc_observations"
    qs = urllib.parse.urlencode({
        "select": "crop_year,grain_week,week_ending_date",
        "order": "week_ending_date.desc,grain_week.desc",
        "limit": "1",
    })
    req = urllib.request.Request(
        f"{url}?{qs}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
        rows = json.loads(response.read().decode("utf-8", "ignore") or "[]")
    if not rows:
        raise WrapperError("cgc_observations is empty; cannot emit heartbeats")
    top = rows[0]
    return str(top["crop_year"]), int(top["grain_week"]), top.get("week_ending_date")


def fetch_grain_weeks_present(supabase_url: str, service_key: str,
                              crop_year: str, grain_week: int) -> set[str]:
    """Which canonical CAD grains have any current-week rows in cgc_observations?"""
    url = supabase_url.rstrip("/") + "/rest/v1/cgc_observations"
    qs = urllib.parse.urlencode({
        "select": "grain",
        "crop_year": f"eq.{crop_year}",
        "grain_week": f"eq.{grain_week}",
        "limit": "5000",
    })
    req = urllib.request.Request(
        f"{url}?{qs}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
        rows = json.loads(response.read().decode("utf-8", "ignore") or "[]")
    return {row["grain"] for row in rows if row.get("grain")}


def invoke_heartbeat(grain: str, crop_year: str, grain_week: int,
                     week_ending: str | None) -> dict[str, Any]:
    evidence = {
        "collector": "collect-cgc",
        "crop_year": crop_year,
        "grain_week": grain_week,
        "week_ending_date": week_ending,
    }
    signal_note = f"CGC week {grain_week} refreshed ({week_ending or 'unknown date'})"
    cmd = [
        "python", str(HEARTBEAT_CLI),
        "--side", "cad",
        "--market", grain,
        "--scan-type", TRAJECTORY_SCAN_TYPE,
        "--trigger", TRAJECTORY_TRIGGER,
        "--severity", "normal",
        "--signal-note", signal_note,
        "--grain-week", str(grain_week),
        "--evidence-json", json.dumps(evidence),
        "--quiet",
    ]
    if week_ending:
        cmd.extend(["--source-week-ending", week_ending])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return {
            "grain": grain,
            "ok": r.returncode == 0,
            "stderr": r.stderr.strip()[:500] if r.returncode != 0 else None,
        }
    except Exception as exc:
        return {"grain": grain, "ok": False, "stderr": str(exc)[:500]}


def main() -> None:
    load_env_files()
    args = parse_args()

    # Supabase is always needed — the heartbeat fan-out queries cgc_observations
    # directly to learn which grain_week to stamp on the trajectory rows.
    supabase_url = require_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    ef_response: dict[str, Any] | None = None
    trigger_mode: str | None = None

    if not args.dry_run and not args.skip_ef:
        if args.direct_ef:
            # Legacy emergency path — only works if the caller's IP isn't in
            # CGC's blocklist.
            internal_secret = require_env("BUSHEL_INTERNAL_FUNCTION_SECRET")
            trigger_mode = "edge_function_direct"
            print(f"Triggering {EDGE_FUNCTION_NAME} directly...", file=os.sys.stderr)
            ef_response = trigger_edge_function(
                supabase_url, service_key, internal_secret, args.week,
            )
            print(f"EF response: {json.dumps(ef_response)}", file=os.sys.stderr)
        else:
            # Default path: Vercel proxy scrapes CGC + forwards CSV to EF.
            vercel_url = require_env("BUSHEL_VERCEL_URL", "VERCEL_URL")
            cron_secret = require_env("CRON_SECRET")
            trigger_mode = "vercel_proxy"
            print(
                f"Triggering Vercel proxy {vercel_url.rstrip('/')}{VERCEL_PROXY_PATH}...",
                file=os.sys.stderr,
            )
            ef_response = trigger_vercel_proxy(vercel_url, cron_secret, args.week)
            print(f"Proxy response: {json.dumps(ef_response)[:500]}", file=os.sys.stderr)

    # Determine what week the heartbeats should anchor to.
    if args.dry_run:
        # Preview only: query latest from Supabase without triggering EF.
        crop_year, grain_week, week_ending = fetch_latest_cgc_week(supabase_url, service_key)
        grains_present = fetch_grain_weeks_present(supabase_url, service_key, crop_year, grain_week)
    else:
        crop_year, grain_week, week_ending = fetch_latest_cgc_week(supabase_url, service_key)
        grains_present = fetch_grain_weeks_present(supabase_url, service_key, crop_year, grain_week)

    heartbeat_plan = []
    for grain in CAD_GRAINS_CANONICAL:
        heartbeat_plan.append({
            "grain": grain,
            "has_current_week_rows": grain in grains_present,
        })

    trajectory: dict[str, Any] = {
        "crop_year": crop_year,
        "grain_week": grain_week,
        "week_ending": week_ending,
        "plan": heartbeat_plan,
    }
    warnings: list[str] = []

    if not args.dry_run:
        try:
            results = [
                invoke_heartbeat(grain, crop_year, grain_week, week_ending)
                for grain in CAD_GRAINS_CANONICAL
            ]
            trajectory["results"] = results
            trajectory["written"] = sum(1 for r in results if r["ok"])
            trajectory["total"] = len(results)
        except Exception as exc:
            warnings.append(f"heartbeat_write_failed: {exc!s}"[:500])

    payload = {
        "status": "success",
        "dry_run": args.dry_run,
        "trigger_mode": trigger_mode,
        "import_response": ef_response,
        "trajectory": trajectory,
    }
    if warnings:
        payload["warnings"] = warnings
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
