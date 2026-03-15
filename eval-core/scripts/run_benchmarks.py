#!/usr/bin/env python3
"""List, scaffold, and summarize audit benchmark runs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

BENCHMARK_ROOT = Path("evals/benchmarks")
CATEGORY_KEYS = {
    "skill": [
        "task_success",
        "instruction_compliance",
        "trigger_quality",
        "resource_leverage",
        "tool_hygiene",
        "safety",
        "efficiency",
    ],
    "agent": [
        "task_success",
        "instruction_compliance",
        "orchestration_quality",
        "context_management",
        "escalation_judgment",
        "safety",
        "efficiency",
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List benchmark cases, scaffold a run directory, or summarize a run."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="List cases in a benchmark pack.")
    list_parser.add_argument("--pack", default="starter")

    scaffold_parser = subparsers.add_parser(
        "scaffold", help="Create a run directory with case copies and score templates."
    )
    scaffold_parser.add_argument("--pack", default="starter")
    scaffold_parser.add_argument("--run-root", required=True)

    summarize_parser = subparsers.add_parser(
        "summarize", help="Summarize observed and replayed reports in a run directory."
    )
    summarize_parser.add_argument("--run-root", required=True)

    return parser.parse_args()


def read_text(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "utf-16"):
        try:
            with path.open("r", encoding=encoding) as handle:
                return handle.read()
        except UnicodeError:
            continue

    raise ValueError(f"Could not decode JSON file: {path}")


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(read_text(path))


def load_pack(pack: str) -> Dict[str, Any]:
    pack_dir = BENCHMARK_ROOT / pack
    manifest_path = pack_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Benchmark pack not found: {manifest_path}")

    manifest = load_json(manifest_path)
    cases: List[Dict[str, Any]] = []
    for relative_case_path in manifest["cases"]:
        case_path = pack_dir / relative_case_path
        case = load_json(case_path)
        case["case_path"] = str(case_path.as_posix())
        cases.append(case)

    return {
        "pack_id": manifest["pack_id"],
        "description": manifest["description"],
        "pack_dir": str(pack_dir.as_posix()),
        "cases": cases,
    }


def empty_report(case: Dict[str, Any], evidence_level: str) -> Dict[str, Any]:
    keys = CATEGORY_KEYS[case["target_type"]]
    return {
        "target_type": case["target_type"],
        "target_name": case["target_name"],
        "target_path": case["target_paths"][0] if case.get("target_paths") else "",
        "run_id": "",
        "evidence_level": evidence_level,
        "mode": case["target_type"],
        "category_scores": {key: None for key in keys},
        "weighted_total": None,
        "grade": None,
        "disposition": "hold",
        "hard_gates": {
            "task_success": False,
            "safety": False,
            "replay_present": evidence_level == "replayed",
            "no_canary_regression": True,
        },
        "findings": [],
        "proposed_changes": [],
        "replay_plan": case["replay_plan"],
        "summary": "",
    }


def command_list(pack: str) -> Dict[str, Any]:
    loaded = load_pack(pack)
    return {
        "pack_id": loaded["pack_id"],
        "description": loaded["description"],
        "case_count": len(loaded["cases"]),
        "cases": [
            {
                "id": case["id"],
                "target_type": case["target_type"],
                "target_name": case["target_name"],
                "source_anchor": case["source_anchor"],
            }
            for case in loaded["cases"]
        ],
    }


def command_scaffold(pack: str, run_root: str) -> Dict[str, Any]:
    loaded = load_pack(pack)
    root = Path(run_root)
    root.mkdir(parents=True, exist_ok=True)

    created_cases: List[Dict[str, Any]] = []
    for case in loaded["cases"]:
        case_dir = root / case["id"]
        case_dir.mkdir(parents=True, exist_ok=True)

        files_to_write = {
            "case.json": case,
            "observed.json": empty_report(case, "observed"),
            "replayed.json": empty_report(case, "replayed"),
        }

        created_files: List[str] = []
        for filename, payload in files_to_write.items():
            path = case_dir / filename
            if not path.exists():
                with path.open("w", encoding="utf-8") as handle:
                    json.dump(payload, handle, indent=2)
                    handle.write("\n")
                created_files.append(str(path.as_posix()))

        created_cases.append(
            {
                "id": case["id"],
                "path": str(case_dir.as_posix()),
                "created_files": created_files,
            }
        )

    return {
        "pack_id": loaded["pack_id"],
        "run_root": str(root.as_posix()),
        "case_count": len(created_cases),
        "cases": created_cases,
    }


def summarize_report(path: Path) -> Dict[str, Any] | None:
    if not path.exists():
        return None

    payload = load_json(path)
    total = payload.get("weighted_total")
    if total is None:
        return None

    return {
        "weighted_total": total,
        "grade": payload.get("grade"),
        "disposition": payload.get("disposition"),
    }


def command_summarize(run_root: str) -> Dict[str, Any]:
    root = Path(run_root)
    if not root.exists():
        raise FileNotFoundError(f"Run root not found: {root}")

    cases: List[Dict[str, Any]] = []
    observed_scores: List[float] = []
    replayed_scores: List[float] = []
    dispositions: Dict[str, int] = {}

    for case_dir in sorted(path for path in root.iterdir() if path.is_dir()):
        case_path = case_dir / "case.json"
        if not case_path.exists():
            continue

        case = load_json(case_path)
        observed = summarize_report(case_dir / "observed.json")
        replayed = summarize_report(case_dir / "replayed.json")
        final_disposition = None
        if replayed:
            final_disposition = replayed["disposition"]
            replayed_scores.append(float(replayed["weighted_total"]))
        elif observed:
            final_disposition = observed["disposition"]

        if observed:
            observed_scores.append(float(observed["weighted_total"]))
        if final_disposition:
            dispositions[final_disposition] = dispositions.get(final_disposition, 0) + 1

        cases.append(
            {
                "id": case["id"],
                "target_type": case["target_type"],
                "target_name": case["target_name"],
                "observed": observed,
                "replayed": replayed,
                "final_disposition": final_disposition,
            }
        )

    def average(values: List[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 2)

    return {
        "run_root": str(root.as_posix()),
        "case_count": len(cases),
        "completed_observed": sum(1 for case in cases if case["observed"]),
        "completed_replayed": sum(1 for case in cases if case["replayed"]),
        "average_observed_total": average(observed_scores),
        "average_replayed_total": average(replayed_scores),
        "dispositions": dispositions,
        "cases": cases,
    }


def main() -> int:
    try:
        args = parse_args()
        if args.command == "list":
            output = command_list(args.pack)
        elif args.command == "scaffold":
            output = command_scaffold(args.pack, args.run_root)
        else:
            output = command_summarize(args.run_root)
    except Exception as exc:  # pragma: no cover - CLI guard
        print(str(exc), file=sys.stderr)
        return 1

    json.dump(output, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
