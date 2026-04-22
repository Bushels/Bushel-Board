#!/usr/bin/env python3
"""
Write a Phase 1 collector heartbeat trajectory tick.

Invoked by weekday collector routines *after* the mechanical data importer
(Python script, TypeScript importer, or Edge Function) has refreshed the
canonical source table. This CLI writes a single `collector_*` row to
`us_score_trajectory` or `score_trajectory` carrying forward the current
stance/recommendation unchanged and stamping source-specific evidence.

Two-phase contract (see docs/reference/collector-task-configs.md):

  Phase 1 (this script)     : mechanical heartbeat, stance unchanged, scan_type=collector_*
  Phase 2 (write-collector- : Opus soft-review, bounded stance delta, scan_type=opus_review_*
           soft-update.py)

Why it exists:
  Every collector needs to prove (a) data arrived and (b) current thesis state
  at the moment of arrival. Inlining this in every importer duplicates the
  Supabase read/write logic. This CLI is the single writer of `collector_*`
  rows — each importer just provides source-specific evidence JSON.

Usage (US, export sales):
  python scripts/write-collector-heartbeat.py \\
    --side us \\
    --market Wheat \\
    --scan-type collector_export_sales \\
    --trigger "USDA FAS export sales refresh" \\
    --severity normal \\
    --signal-note "Net sales 450 Kt — 62% of marketing-year target" \\
    --source-week-ending 2026-04-17 \\
    --evidence-json '{"net_sales_mt": 450000, "outstanding_mt": 8200000, "export_pace_pct": 62}'

Usage (CAD, grain monitor):
  python scripts/write-collector-heartbeat.py \\
    --side cad \\
    --market Canola \\
    --scan-type collector_grain_monitor \\
    --trigger "Grain Monitor weekly refresh" \\
    --grain-week 37 \\
    --severity elevated \\
    --signal-note "Vancouver vessel queue 18, OCT 41%" \\
    --source-week-ending 2026-04-19 \\
    --evidence-json '{"vessels_vancouver": 18, "oct_pct": 41.2}'

Both phases read the *latest trajectory row* as current state (drift-aware),
falling back to the Friday anchor (`us_market_analysis` / `market_analysis`)
if no trajectory rows exist yet.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

SUPABASE_TIMEOUT_SECONDS = 30

ALLOWED_SCAN_TYPES = {
    "collector_crop_progress",
    "collector_grain_monitor",
    "collector_export_sales",
    "collector_cgc",
    "collector_cftc_cot",
    "collector_wasde",
}

SEVERITIES = {"critical", "elevated", "normal", "unknown"}

SIDE_US = "us"
SIDE_CAD = "cad"

CAD_RECOMMENDATION_VALUES = {"PATIENCE", "WATCH", "SCALE_IN", "ACCELERATE", "HOLD_FIRM", "PRICE"}


class HeartbeatError(Exception):
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
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            value = value.replace("\\n", "").replace("\\r", "")
            os.environ.setdefault(key, value)


def require_env(name: str, *alternates: str) -> str:
    for key in (name, *alternates):
        value = os.environ.get(key)
        if value:
            return value
    raise HeartbeatError(f"Missing required environment variable: {name}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write a Phase 1 collector heartbeat trajectory tick")
    parser.add_argument("--side", choices=(SIDE_US, SIDE_CAD), required=True)
    parser.add_argument(
        "--market",
        required=True,
        help="Market/grain name (e.g. Wheat/Corn for US; Canola/Wheat for CAD)",
    )
    parser.add_argument("--scan-type", required=True, help="e.g. collector_export_sales")
    parser.add_argument(
        "--trigger",
        required=True,
        help='Human-readable trigger, e.g. "USDA Crop Progress refresh"',
    )
    parser.add_argument(
        "--severity",
        default="normal",
        choices=sorted(SEVERITIES),
        help="Signal severity for phase-2 Opus to consider",
    )
    parser.add_argument(
        "--signal-note",
        default="",
        help="Plain-English one-line summary of this data print",
    )
    parser.add_argument(
        "--source-week-ending",
        default=None,
        help="Week ending date of the fresh data (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--evidence-json",
        default=None,
        help="JSON object with source-specific fields to stamp into evidence",
    )
    parser.add_argument(
        "--grain-week",
        type=int,
        default=None,
        help="CAD grain_week override (defaults to current thesis grain_week)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build the row and print it without writing to Supabase",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress stdout summary on success (use when chaining in pipelines)",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if args.scan_type not in ALLOWED_SCAN_TYPES:
        raise HeartbeatError(
            f"scan-type {args.scan_type!r} not allowed. "
            f"Allowed: {sorted(ALLOWED_SCAN_TYPES)}"
        )


def _supabase_get(
    supabase_url: str,
    service_key: str,
    path: str,
    params: dict[str, str],
) -> Any:
    url = f"{supabase_url.rstrip('/')}/rest/v1/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise HeartbeatError(f"Supabase GET {path} failed: HTTP {exc.code} {body[:300]}") from exc


def fetch_current_us_state(
    supabase_url: str,
    service_key: str,
    market_name: str,
) -> dict[str, Any]:
    latest_traj = _supabase_get(
        supabase_url,
        service_key,
        "us_score_trajectory",
        {
            "market_name": f"eq.{market_name}",
            "select": "market_name,crop_year,market_year,stance_score,conviction_pct,recommendation,recorded_at,scan_type",
            "order": "recorded_at.desc",
            "limit": "1",
        },
    )
    if isinstance(latest_traj, list) and latest_traj:
        row = latest_traj[0]
        return {
            "market_name": row["market_name"],
            "crop_year": row["crop_year"],
            "market_year": row["market_year"],
            "stance_score": int(row["stance_score"]),
            "conviction_pct": int(row["conviction_pct"]) if row.get("conviction_pct") is not None else None,
            "recommendation": row["recommendation"],
            "source": f"trajectory:{row.get('scan_type')}",
        }

    anchor = _supabase_get(
        supabase_url,
        service_key,
        "us_market_analysis",
        {
            "market_name": f"eq.{market_name}",
            "select": "market_name,crop_year,market_year,stance_score,confidence_score,recommendation,generated_at",
            "order": "generated_at.desc",
            "limit": "1",
        },
    )
    if not isinstance(anchor, list) or not anchor:
        raise HeartbeatError(
            f"No us_score_trajectory or us_market_analysis row for market={market_name!r}. "
            "Friday swarm must seed thesis before Phase 1 heartbeat can write."
        )
    row = anchor[0]
    return {
        "market_name": row["market_name"],
        "crop_year": row["crop_year"],
        "market_year": row["market_year"],
        "stance_score": int(row["stance_score"]),
        "conviction_pct": int(row["confidence_score"]) if row.get("confidence_score") is not None else None,
        "recommendation": row["recommendation"],
        "source": "us_market_analysis_anchor",
    }


def fetch_current_cad_state(
    supabase_url: str,
    service_key: str,
    grain: str,
    grain_week_override: int | None,
) -> dict[str, Any]:
    latest_traj = _supabase_get(
        supabase_url,
        service_key,
        "score_trajectory",
        {
            "grain": f"eq.{grain}",
            "select": "grain,crop_year,grain_week,stance_score,conviction_pct,recommendation,recorded_at,scan_type",
            "order": "recorded_at.desc",
            "limit": "1",
        },
    )
    if isinstance(latest_traj, list) and latest_traj:
        row = latest_traj[0]
        return {
            "grain": row["grain"],
            "crop_year": row["crop_year"],
            "grain_week": grain_week_override if grain_week_override is not None else int(row["grain_week"]),
            "stance_score": int(row["stance_score"]),
            "conviction_pct": int(row["conviction_pct"]) if row.get("conviction_pct") is not None else None,
            "recommendation": row["recommendation"],
            "source": f"trajectory:{row.get('scan_type')}",
        }

    anchor = _supabase_get(
        supabase_url,
        service_key,
        "market_analysis",
        {
            "grain": f"eq.{grain}",
            "select": "grain,crop_year,grain_week,stance_score,confidence_score,generated_at",
            "order": "generated_at.desc",
            "limit": "1",
        },
    )
    if not isinstance(anchor, list) or not anchor:
        raise HeartbeatError(
            f"No score_trajectory or market_analysis row for grain={grain!r}. "
            "Friday swarm must seed thesis before Phase 1 heartbeat can write."
        )
    row = anchor[0]
    return {
        "grain": row["grain"],
        "crop_year": row["crop_year"],
        "grain_week": grain_week_override if grain_week_override is not None else int(row["grain_week"]),
        "stance_score": int(row["stance_score"]) if row.get("stance_score") is not None else 0,
        "conviction_pct": int(row["confidence_score"]) if row.get("confidence_score") is not None else None,
        "recommendation": "WATCH",
        "source": "market_analysis_anchor",
    }


def build_evidence(args: argparse.Namespace, state: dict[str, Any]) -> dict[str, Any]:
    evidence: dict[str, Any] = {
        "model_role": "collector_heartbeat",
        "collector": args.scan_type,
        "severity": args.severity,
        "signal_note": args.signal_note or None,
        "week_ending": args.source_week_ending,
        "prior_state_source": state.get("source"),
    }
    if args.evidence_json:
        try:
            parsed = json.loads(args.evidence_json)
        except json.JSONDecodeError as exc:
            raise HeartbeatError(f"--evidence-json is not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise HeartbeatError("--evidence-json must be a JSON object")
        for key, value in parsed.items():
            evidence.setdefault(key, value)
    return evidence


def build_us_row(args: argparse.Namespace, state: dict[str, Any]) -> dict[str, Any]:
    evidence = build_evidence(args, state)
    data_freshness = {
        "source": args.scan_type.replace("collector_", ""),
        "week_ending": args.source_week_ending,
    }
    row: dict[str, Any] = {
        "market_name": state["market_name"],
        "crop_year": state["crop_year"],
        "market_year": state["market_year"],
        "scan_type": args.scan_type,
        "stance_score": state["stance_score"],
        "recommendation": state["recommendation"],
        "trigger": args.trigger,
        "evidence": evidence,
        "data_freshness": data_freshness,
        "model_source": args.scan_type,
    }
    if state.get("conviction_pct") is not None:
        row["conviction_pct"] = state["conviction_pct"]
    return row


def build_cad_row(args: argparse.Namespace, state: dict[str, Any]) -> dict[str, Any]:
    evidence = build_evidence(args, state)
    data_freshness = {
        "source": args.scan_type.replace("collector_", ""),
        "week_ending": args.source_week_ending,
    }
    recommendation = state["recommendation"] if state["recommendation"] in CAD_RECOMMENDATION_VALUES else "WATCH"
    row: dict[str, Any] = {
        "grain": state["grain"],
        "crop_year": state["crop_year"],
        "grain_week": state["grain_week"],
        "scan_type": args.scan_type,
        "stance_score": state["stance_score"],
        "recommendation": recommendation,
        "trigger": args.trigger,
        # score_trajectory.evidence is TEXT, not JSONB
        "evidence": json.dumps(evidence),
        "data_freshness": data_freshness,
        "model_source": args.scan_type,
    }
    if state.get("conviction_pct") is not None:
        row["conviction_pct"] = state["conviction_pct"]
    return row


def insert_row(
    supabase_url: str,
    service_key: str,
    side: str,
    row: dict[str, Any],
) -> dict[str, Any]:
    table = "us_score_trajectory" if side == SIDE_US else "score_trajectory"
    url = f"{supabase_url.rstrip('/')}/rest/v1/{table}"
    payload = json.dumps([row]).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            body = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")
        raise HeartbeatError(
            f"Supabase insert into {table} failed: HTTP {exc.code} {detail[:500]}"
        ) from exc
    return body[0] if isinstance(body, list) and body else row


def main() -> None:
    load_env_files()
    args = parse_args()
    validate_args(args)

    supabase_url = require_env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    if args.side == SIDE_US:
        state = fetch_current_us_state(supabase_url, service_key, args.market)
        row = build_us_row(args, state)
    else:
        state = fetch_current_cad_state(supabase_url, service_key, args.market, args.grain_week)
        row = build_cad_row(args, state)

    if args.dry_run:
        if not args.quiet:
            print(
                json.dumps(
                    {
                        "status": "dry_run",
                        "side": args.side,
                        "market": args.market,
                        "scan_type": args.scan_type,
                        "prior_state": state,
                        "trajectory_row": row,
                    },
                    indent=2,
                    default=str,
                )
            )
        return

    inserted = insert_row(supabase_url, service_key, args.side, row)
    if not args.quiet:
        print(
            json.dumps(
                {
                    "status": "success",
                    "side": args.side,
                    "market": args.market,
                    "scan_type": args.scan_type,
                    "stance_score": row["stance_score"],
                    "conviction_pct": row.get("conviction_pct"),
                    "severity": args.severity,
                    "trajectory_row": inserted,
                },
                indent=2,
                default=str,
            )
        )


if __name__ == "__main__":
    try:
        main()
    except HeartbeatError as exc:
        eprint(f"Fatal: {exc}")
        sys.exit(1)
    except KeyboardInterrupt:
        eprint("Interrupted")
        sys.exit(130)
