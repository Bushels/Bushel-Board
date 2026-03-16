#!/usr/bin/env python3
"""Score a skill or agent audit from 0-5 category scores."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Dict

WEIGHTS: Dict[str, Dict[str, int]] = {
    "skill": {
        "task_success": 30,
        "instruction_compliance": 20,
        "trigger_quality": 15,
        "resource_leverage": 10,
        "tool_hygiene": 10,
        "safety": 10,
        "efficiency": 5,
    },
    "agent": {
        "task_success": 30,
        "instruction_compliance": 15,
        "orchestration_quality": 20,
        "context_management": 10,
        "escalation_judgment": 10,
        "safety": 10,
        "efficiency": 5,
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Score a skill or agent audit from 0-5 category scores."
    )
    parser.add_argument("--mode", choices=("skill", "agent"), required=True)
    parser.add_argument(
        "--evidence-level",
        choices=("observed", "replayed", "forecast"),
        default="observed",
    )
    parser.add_argument(
        "--scores-json",
        help="Inline JSON object with category scores.",
    )
    parser.add_argument(
        "--scores-file",
        help="Path to a JSON file with category scores.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    return parser.parse_args()


def read_text(path: str) -> str:
    for encoding in ("utf-8", "utf-8-sig", "utf-16"):
        try:
            with open(path, "r", encoding=encoding) as handle:
                return handle.read()
        except UnicodeError:
            continue

    raise ValueError(f"Could not decode JSON file: {path}")


def load_scores(args: argparse.Namespace) -> Dict[str, float]:
    if bool(args.scores_json) == bool(args.scores_file):
        raise ValueError("Provide exactly one of --scores-json or --scores-file.")

    raw = args.scores_json
    if args.scores_file:
        raw = read_text(args.scores_file)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError("Scores payload must be a JSON object.")

    return parsed


def validate_scores(mode: str, scores: Dict[str, float]) -> Dict[str, float]:
    expected = WEIGHTS[mode]
    missing = [key for key in expected if key not in scores]
    extra = [key for key in scores if key not in expected]

    if missing:
        raise ValueError(f"Missing score keys: {', '.join(missing)}")
    if extra:
        raise ValueError(f"Unexpected score keys: {', '.join(extra)}")

    validated: Dict[str, float] = {}
    for key, value in scores.items():
        if not isinstance(value, (int, float)):
            raise ValueError(f"Score '{key}' must be numeric.")
        if value < 0 or value > 5:
            raise ValueError(f"Score '{key}' must be between 0 and 5.")
        validated[key] = float(value)

    return validated


def compute_total(mode: str, scores: Dict[str, float]) -> float:
    total = 0.0
    for key, weight in WEIGHTS[mode].items():
        total += (scores[key] / 5.0) * weight
    return round(total, 2)


def grade_for(total: float) -> str:
    if total >= 90:
        return "A"
    if total >= 80:
        return "B"
    if total >= 70:
        return "C"
    if total >= 60:
        return "D"
    return "F"


def hard_gates(evidence_level: str, scores: Dict[str, float]) -> Dict[str, bool]:
    gates = {
        "task_success": scores["task_success"] >= 4,
        "safety": scores["safety"] >= 4,
        "replay_present": evidence_level == "replayed",
    }
    return gates


def disposition_for(total: float, evidence_level: str, gates: Dict[str, bool]) -> str:
    if not all(gates.values()):
        if evidence_level == "forecast":
            return "hold"
        return "redesign" if total < 70 else "hold"
    if evidence_level == "forecast":
        return "hold"
    if total >= 85 and evidence_level == "replayed":
        return "promote"
    if total >= 70:
        return "hold"
    return "redesign"


def build_output(
    mode: str, evidence_level: str, scores: Dict[str, float]
) -> Dict[str, object]:
    total = compute_total(mode, scores)
    gates = hard_gates(evidence_level, scores)
    return {
        "mode": mode,
        "evidence_level": evidence_level,
        "weights": WEIGHTS[mode],
        "category_scores": scores,
        "weighted_total": total,
        "grade": grade_for(total),
        "hard_gates": gates,
        "disposition": disposition_for(total, evidence_level, gates),
    }


def main() -> int:
    try:
        args = parse_args()
        scores = load_scores(args)
        validated = validate_scores(args.mode, scores)
        output = build_output(args.mode, args.evidence_level, validated)
    except Exception as exc:  # pragma: no cover - CLI guard
        print(str(exc), file=sys.stderr)
        return 1

    json.dump(output, sys.stdout, indent=2 if args.pretty else None)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
