#!/usr/bin/env python3
"""
Write a collector soft-update trajectory tick.

Invoked by the weekday collector routine's Opus agent after the mechanical
data importer has refreshed Supabase. Opus reads the fresh data + the current
thesis, decides on a bounded stance/confidence delta, and calls this script
once per affected market to append a soft-review row to the trajectory tape.

Contract:
- Writes to us_score_trajectory for --side us (free-form scan_type).
- Writes to score_trajectory for --side cad (CHECK constraint extended
  via migration extend_score_trajectory_scan_type_opus_review).
- Does NOT mutate us_market_analysis / market_analysis. Friday's swarm remains
  the sole writer of the thesis-of-record; weekday soft updates are trajectory-
  only and accumulate into Friday's hard review.
- Reads the latest trajectory tick as "current" state so multiple weekday
  reviews compound correctly (drift-aware). Falls back to the Friday anchor
  thesis if no trajectory rows exist yet.

Bounds (enforced server-side by this script, not by DB constraint):
- --stance-delta: integer in [-5, +5]
- --confidence-delta: integer in [-10, +10]

Usage example (US):
  python scripts/write-collector-soft-update.py \\
    --side us \\
    --market Wheat \\
    --scan-type opus_review_crop_progress \\
    --trigger "USDA Crop Progress - Opus soft review" \\
    --stance-delta -2 \\
    --confidence-delta -5 \\
    --severity critical \\
    --signal-note "G/E 30% -- supply-scare territory" \\
    --reasoning "Winter wheat G/E crashed 15 pts YoY and 4 pts WoW." \\
    --bull-case-impact strengthened \\
    --bear-case-impact weakened \\
    --source-week-ending 2026-04-19

Usage example (CAD):
  python scripts/write-collector-soft-update.py \\
    --side cad \\
    --market Canola \\
    --scan-type opus_review_grain_monitor \\
    --trigger "Grain Monitor - Opus soft review" \\
    --stance-delta +2 \\
    --confidence-delta +3 \\
    --severity elevated \\
    --signal-note "Vancouver vessel queue doubled to 18, OCT +3 pts" \\
    --reasoning "Logistics tightening supports the bull export-pace bullet." \\
    --source-week-ending 2026-04-19
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

# Both sides share the same 6 scan_type values. Validated server-side against
# us_score_trajectory (free-form) and score_trajectory (CHECK extended 2026-04-21).
ALLOWED_SCAN_TYPES = {
    "opus_review_crop_progress",
    "opus_review_grain_monitor",
    "opus_review_export_sales",
    "opus_review_cgc",
    "opus_review_cftc_cot",
    "opus_review_wasde",
}

STANCE_DELTA_BOUND = 5
CONFIDENCE_DELTA_BOUND = 10

STANCE_MIN = -100
STANCE_MAX = 100
CONFIDENCE_MIN = 0
CONFIDENCE_MAX = 100

SIDE_US = "us"
SIDE_CAD = "cad"

MODEL_SOURCE = "claude-opus-soft-review"

CASE_IMPACTS = {"strengthened", "weakened", "unchanged"}
SEVERITIES = {"critical", "elevated", "normal", "unknown"}

CAD_RECOMMENDATION_VALUES = {"PATIENCE", "WATCH", "SCALE_IN", "ACCELERATE", "HOLD_FIRM", "PRICE"}


class SoftUpdateError(Exception):
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
    raise SoftUpdateError(f"Missing required environment variable: {name}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write a collector soft-update trajectory tick")
    parser.add_argument("--side", choices=(SIDE_US, SIDE_CAD), required=True)
    parser.add_argument(
        "--market",
        required=True,
        help="Market/grain name (e.g. Wheat, Corn for US; Canola, Wheat, Barley for CAD)",
    )
    parser.add_argument("--scan-type", required=True, help="e.g. opus_review_crop_progress")
    parser.add_argument(
        "--trigger",
        required=True,
        help='Short human-readable trigger, e.g. "USDA Crop Progress - Opus soft review"',
    )
    parser.add_argument("--stance-delta", type=int, default=0)
    parser.add_argument("--confidence-delta", type=int, default=0)
    parser.add_argument(
        "--severity",
        default="normal",
        choices=sorted(SEVERITIES),
    )
    parser.add_argument("--signal-note", default="", help="Plain-English signal description")
    parser.add_argument(
        "--reasoning",
        required=True,
        help="Opus explanation (2-4 sentences) for why the delta is being applied",
    )
    parser.add_argument(
        "--bull-case-impact",
        default="unchanged",
        choices=sorted(CASE_IMPACTS),
    )
    parser.add_argument(
        "--bear-case-impact",
        default="unchanged",
        choices=sorted(CASE_IMPACTS),
    )
    parser.add_argument(
        "--new-bullet-suggested",
        default="",
        help="Optional: suggested new bullet for Friday swarm to consider",
    )
    parser.add_argument(
        "--recommendation",
        default=None,
        help="Override recommendation. Defaults to carry-forward from latest trajectory/anchor.",
    )
    parser.add_argument(
        "--source-week-ending",
        default=None,
        help="Week ending date of the fresh data (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--evidence-extra-json",
        default=None,
        help="JSON object merged into evidence block (freeform fields)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build the row and print it without writing to Supabase",
    )
    return parser.parse_args()


def clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def validate_args(args: argparse.Namespace) -> None:
    if args.scan_type not in ALLOWED_SCAN_TYPES:
        raise SoftUpdateError(
            f"scan-type {args.scan_type!r} not allowed. "
            f"Allowed: {sorted(ALLOWED_SCAN_TYPES)}"
        )
    if abs(args.stance_delta) > STANCE_DELTA_BOUND:
        raise SoftUpdateError(
            f"stance-delta {args.stance_delta} exceeds bound +/-{STANCE_DELTA_BOUND}. "
            "Soft updates must stay small; if you need more, Friday swarm should rewrite."
        )
    if abs(args.confidence_delta) > CONFIDENCE_DELTA_BOUND:
        raise SoftUpdateError(
            f"confidence-delta {args.confidence_delta} exceeds bound +/-{CONFIDENCE_DELTA_BOUND}"
        )
    if args.recommendation and args.side == SIDE_CAD:
        if args.recommendation not in CAD_RECOMMENDATION_VALUES:
            raise SoftUpdateError(
                f"CAD recommendation must be one of {sorted(CAD_RECOMMENDATION_VALUES)}; "
                f"got {args.recommendation!r}"
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
        raise SoftUpdateError(f"Supabase GET {path} failed: HTTP {exc.code} {body[:300]}") from exc


def fetch_current_us_state(
    supabase_url: str,
    service_key: str,
    market_name: str,
) -> dict[str, Any]:
    """Latest us_score_trajectory row (drift-aware); falls back to us_market_analysis anchor."""
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
            "confidence_score": int(row["conviction_pct"]) if row.get("conviction_pct") is not None else None,
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
        raise SoftUpdateError(
            f"No us_score_trajectory or us_market_analysis row found for market={market_name!r}. "
            "Friday swarm must seed the thesis before soft updates can apply."
        )
    row = anchor[0]
    return {
        "market_name": row["market_name"],
        "crop_year": row["crop_year"],
        "market_year": row["market_year"],
        "stance_score": int(row["stance_score"]),
        "confidence_score": int(row["confidence_score"]) if row.get("confidence_score") is not None else None,
        "recommendation": row["recommendation"],
        "source": "us_market_analysis_anchor",
    }


def fetch_current_cad_state(
    supabase_url: str,
    service_key: str,
    grain: str,
) -> dict[str, Any]:
    """Latest score_trajectory row (drift-aware); falls back to market_analysis anchor."""
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
            "grain_week": int(row["grain_week"]),
            "stance_score": int(row["stance_score"]),
            "confidence_score": int(row["conviction_pct"]) if row.get("conviction_pct") is not None else None,
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
        raise SoftUpdateError(
            f"No score_trajectory or market_analysis row found for grain={grain!r}. "
            "Friday swarm must seed the thesis before soft updates can apply."
        )
    row = anchor[0]
    return {
        "grain": row["grain"],
        "crop_year": row["crop_year"],
        "grain_week": int(row["grain_week"]),
        "stance_score": int(row["stance_score"]) if row.get("stance_score") is not None else 0,
        "confidence_score": int(row["confidence_score"]) if row.get("confidence_score") is not None else None,
        # market_analysis has no recommendation column; CAD anchor weekly_debate trajectory carries it.
        # If no trajectory exists yet, default to WATCH (neutral) to satisfy CHECK constraint.
        "recommendation": "WATCH",
        "source": "market_analysis_anchor",
    }


def build_evidence(
    args: argparse.Namespace,
    state: dict[str, Any],
    prior_stance: int,
    prior_confidence: int | None,
    new_stance: int,
    new_confidence: int | None,
) -> dict[str, Any]:
    extra: dict[str, Any] = {}
    if args.evidence_extra_json:
        try:
            parsed = json.loads(args.evidence_extra_json)
        except json.JSONDecodeError as exc:
            raise SoftUpdateError(f"--evidence-extra-json is not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise SoftUpdateError("--evidence-extra-json must be a JSON object")
        extra = parsed

    evidence: dict[str, Any] = {
        "model_role": "opus_soft_reviewer",
        "severity": args.severity,
        "signal_note": args.signal_note or None,
        "reasoning": args.reasoning,
        "stance_delta_applied": args.stance_delta,
        "confidence_delta_applied": args.confidence_delta,
        "prior_stance": prior_stance,
        "prior_confidence": prior_confidence,
        "new_stance": new_stance,
        "new_confidence": new_confidence,
        "bull_case_impact": args.bull_case_impact,
        "bear_case_impact": args.bear_case_impact,
        "new_bullet_suggested": args.new_bullet_suggested or None,
        "source_week_ending": args.source_week_ending,
        "prior_state_source": state.get("source"),
    }
    for key, value in extra.items():
        evidence.setdefault(key, value)
    return evidence


def build_us_trajectory_row(
    args: argparse.Namespace,
    state: dict[str, Any],
) -> dict[str, Any]:
    prior_stance = state["stance_score"]
    prior_confidence = state["confidence_score"]
    new_stance = clamp(prior_stance + args.stance_delta, STANCE_MIN, STANCE_MAX)
    new_confidence = (
        clamp(prior_confidence + args.confidence_delta, CONFIDENCE_MIN, CONFIDENCE_MAX)
        if prior_confidence is not None
        else None
    )
    recommendation = args.recommendation or state["recommendation"]
    evidence = build_evidence(args, state, prior_stance, prior_confidence, new_stance, new_confidence)

    data_freshness = {
        "source": args.scan_type.replace("opus_review_", ""),
        "week_ending": args.source_week_ending,
    }

    row: dict[str, Any] = {
        "market_name": state["market_name"],
        "crop_year": state["crop_year"],
        "market_year": state["market_year"],
        "scan_type": args.scan_type,
        "stance_score": new_stance,
        "recommendation": recommendation,
        "trigger": args.trigger,
        "evidence": evidence,
        "data_freshness": data_freshness,
        "model_source": MODEL_SOURCE,
    }
    if new_confidence is not None:
        row["conviction_pct"] = new_confidence
    return row


def build_cad_trajectory_row(
    args: argparse.Namespace,
    state: dict[str, Any],
) -> dict[str, Any]:
    prior_stance = state["stance_score"]
    prior_confidence = state["confidence_score"]
    new_stance = clamp(prior_stance + args.stance_delta, STANCE_MIN, STANCE_MAX)
    new_confidence = (
        clamp(prior_confidence + args.confidence_delta, CONFIDENCE_MIN, CONFIDENCE_MAX)
        if prior_confidence is not None
        else None
    )
    recommendation = args.recommendation or state["recommendation"]
    if recommendation not in CAD_RECOMMENDATION_VALUES:
        # Fallback: if carry-forward value is unexpected, default to WATCH
        recommendation = "WATCH"

    evidence = build_evidence(args, state, prior_stance, prior_confidence, new_stance, new_confidence)

    data_freshness = {
        "source": args.scan_type.replace("opus_review_", ""),
        "week_ending": args.source_week_ending,
    }

    row: dict[str, Any] = {
        "grain": state["grain"],
        "crop_year": state["crop_year"],
        "grain_week": state["grain_week"],
        "scan_type": args.scan_type,
        "stance_score": new_stance,
        "recommendation": recommendation,
        "trigger": args.trigger,
        # score_trajectory.evidence is TEXT, not JSONB — serialize the dict.
        "evidence": json.dumps(evidence),
        "data_freshness": data_freshness,
        "model_source": MODEL_SOURCE,
    }
    if new_confidence is not None:
        row["conviction_pct"] = new_confidence
    return row


def insert_trajectory_row(
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
        raise SoftUpdateError(
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
        row = build_us_trajectory_row(args, state)
    else:
        state = fetch_current_cad_state(supabase_url, service_key, args.market)
        row = build_cad_trajectory_row(args, state)

    if args.dry_run:
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

    inserted = insert_trajectory_row(supabase_url, service_key, args.side, row)
    print(
        json.dumps(
            {
                "status": "success",
                "side": args.side,
                "market": args.market,
                "scan_type": args.scan_type,
                "stance_delta_applied": args.stance_delta,
                "confidence_delta_applied": args.confidence_delta,
                "new_stance": row["stance_score"],
                "new_confidence": row.get("conviction_pct"),
                "trajectory_row": inserted,
            },
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except SoftUpdateError as exc:
        eprint(f"Fatal: {exc}")
        sys.exit(1)
    except KeyboardInterrupt:
        eprint("Interrupted")
        sys.exit(130)
