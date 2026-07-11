#!/usr/bin/env python3
"""Small deterministic scorer for agent/skill audit notes."""

from __future__ import annotations

import argparse
import json
import re
from statistics import mean


def main() -> int:
    parser = argparse.ArgumentParser(description="Score an agent or skill audit.")
    parser.add_argument("--mode", choices=["agent", "skill"], required=True)
    parser.add_argument("--evidence-level", choices=["observed", "partial", "forecast"], required=True)
    parser.add_argument("--scores-json", required=True, help="JSON object of rubric category scores from 1 to 5.")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    try:
        scores = json.loads(args.scores_json)
    except json.JSONDecodeError:
        # PowerShell can strip quotes from JSON passed as a CLI argument.
        # Accept the common {key:4,...} shape so the helper stays usable on Windows.
        normalized = re.sub(r"([,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', args.scores_json)
        scores = json.loads(normalized)
    if not isinstance(scores, dict) or not scores:
        raise SystemExit("scores-json must be a non-empty object")

    invalid = {key: value for key, value in scores.items() if not isinstance(value, (int, float)) or value < 1 or value > 5}
    if invalid:
        raise SystemExit(f"scores must be numeric 1..5: {invalid}")

    avg = mean(float(value) for value in scores.values())
    safety = float(scores.get("safety", 0))
    if args.evidence_level == "forecast":
        disposition = "hold"
    elif safety < 5 or avg < 4:
        disposition = "hold"
    else:
        disposition = "promote"

    payload = {
        "mode": args.mode,
        "evidence_level": args.evidence_level,
        "average_score": round(avg, 2),
        "scores": scores,
        "disposition": disposition,
    }
    print(json.dumps(payload, indent=2 if args.pretty else None, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
