#!/usr/bin/env python3
"""Windows-native Hermes launcher for Bushel Board scheduled work.

Hermes runs ``.sh`` jobs through Bash. On this Windows workstation that added
an unnecessary WSL dependency and stripped drive-path separators. Hermes runs
all other script extensions with Python, so installed ``bushel-*.py`` aliases
of this file can execute the existing npm targets directly with ``npm.cmd``.

The invoked filename selects the admitted job. No arbitrary npm target or shell
command can be supplied by a cron definition.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


@dataclass(frozen=True)
class Job:
    commands: tuple[tuple[str, ...], ...]
    mode: Literal["collector", "watchdog", "x_pulse"]


JOBS: dict[str, Job] = {
    "bushel-collect-crop-progress": Job(
        (("run", "collect:crop-progress"),), "collector"
    ),
    "bushel-collect-canada-mb": Job(
        (("run", "collect:canada-crop-progress:mb"),), "collector"
    ),
    "bushel-collect-canada-mb-sk": Job(
        (("run", "collect:canada-crop-progress:mb-sk"),), "collector"
    ),
    "bushel-collect-canada-all": Job(
        (("run", "collect:canada-crop-progress:all"),), "collector"
    ),
    "bushel-collect-grain-monitor": Job(
        (("run", "collect:grain-monitor"),), "collector"
    ),
    "bushel-collect-export-sales": Job(
        (("run", "collect:export-sales"),), "collector"
    ),
    "bushel-collect-cgc": Job((("run", "collect:cgc"),), "collector"),
    "bushel-collect-producer-cars": Job(
        (("run", "collect:producer-cars"),), "collector"
    ),
    "bushel-collect-cftc-cot": Job(
        (("run", "collect:cftc-cot"),), "collector"
    ),
    "bushel-collect-gee-crop-stress": Job(
        (("run", "collect:gee-crop-stress"),), "collector"
    ),
    "bushel-collect-prices": Job((("run", "collect:prices"),), "collector"),
    "bushel-collect-wasde": Job((("run", "collect:wasde"),), "collector"),
    "bushel-collect-statcan": Job(
        (("run", "collect:statcan"),), "collector"
    ),
    "bushel-collect-sk-prices": Job(
        (("run", "collect:sk-prices"),), "collector"
    ),
    "bushel-collect-us-customs": Job(
        (("run", "collect:us-customs"),), "collector"
    ),
    "bushel-collect-aafc-canola": Job(
        (("run", "collect:aafc-canola"),), "collector"
    ),
    "bushel-collect-eia-canola": Job(
        (("run", "collect:eia-canola"),), "collector"
    ),
    "bushel-source-freshness": Job(
        (("run", "check:source-freshness"),), "watchdog"
    ),
    "bushel-desk-freshness": Job(
        (("run", "check:desk-freshness"),), "watchdog"
    ),
    "bushel-wheat-x-pulse-daily": Job(
        (
            ("run", "track54:hermes-preflight"),
            (
                "run",
                "track54:hermes-x-scout:terminal",
                "--",
                "--mode",
                "daily_pulse",
            ),
        ),
        "x_pulse",
    ),
    "bushel-wheat-x-pulse-friday": Job(
        (
            ("run", "track54:hermes-preflight"),
            (
                "run",
                "track54:hermes-x-scout:terminal",
                "--",
                "--mode",
                "friday_deep",
            ),
        ),
        "x_pulse",
    ),
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run one admitted Bushel Board Hermes job."
    )
    parser.add_argument(
        "--job",
        choices=sorted(JOBS),
        help=(
            "Explicit job name for local verification. Scheduled aliases infer "
            "the job from their filename."
        ),
    )
    return parser.parse_args(argv)


def resolve_job_name(
    explicit_job: str | None,
    invoked_path: str | Path | None = None,
) -> str:
    name = explicit_job or Path(invoked_path or sys.argv[0]).stem
    if name not in JOBS:
        raise ValueError(
            f"Unadmitted Hermes job {name!r}; expected one of "
            f"{', '.join(sorted(JOBS))}"
        )
    return name


def resolve_root() -> Path:
    configured = os.environ.get("BUSHEL_BOARD_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()

    source_checkout = Path(__file__).resolve().parents[2]
    if (source_checkout / "package.json").exists():
        return source_checkout

    return Path(r"C:\Users\kyle\Agriculture\bushel-board-app")


def resolve_npm() -> str:
    candidates = ("npm.cmd", "npm") if os.name == "nt" else ("npm",)
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    raise FileNotFoundError("npm executable is not available")


def log_path(job_name: str, started: dt.datetime) -> Path:
    configured = os.environ.get("BUSHEL_HERMES_LOG_DIR")
    directory = (
        Path(configured).expanduser()
        if configured
        else Path.home() / ".hermes" / "logs" / "bushel-board-collectors"
    )
    directory.mkdir(parents=True, exist_ok=True)
    stamp = started.strftime("%Y%m%dT%H%M%S")
    return directory / f"{job_name}-{stamp}.log"


def run_npm(
    npm: str,
    args: tuple[str, ...],
    *,
    root: Path,
    timeout_seconds: int = 1_800,
) -> subprocess.CompletedProcess[str]:
    creation_flags = (
        subprocess.CREATE_NO_WINDOW
        if os.name == "nt" and hasattr(subprocess, "CREATE_NO_WINDOW")
        else 0
    )
    return subprocess.run(
        [npm, *args],
        cwd=root,
        env=os.environ.copy(),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout_seconds,
        check=False,
        creationflags=creation_flags,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        job_name = resolve_job_name(args.job)
        job = JOBS[job_name]
        root = resolve_root()
        if not root.is_dir() or not (root / "package.json").is_file():
            raise FileNotFoundError(f"Bushel Board root is invalid: {root}")
        npm = resolve_npm()
    except (FileNotFoundError, ValueError) as exc:
        print(f"FAIL Hermes launcher: {exc}", file=sys.stderr)
        return 2

    started = dt.datetime.now(dt.timezone.utc)
    output: list[str] = [
        "=== bushel Hermes job ===",
        f"job={job_name}",
        f"mode={job.mode}",
        f"root={root}",
        f"started={started.isoformat()}",
        f"npm={npm}",
    ]
    exit_code = 0

    try:
        for command in job.commands:
            output.append(f"command=npm {' '.join(command)}")
            result = run_npm(npm, command, root=root)
            if result.stdout:
                output.append(result.stdout.rstrip())
            if result.stderr:
                output.append(result.stderr.rstrip())
            if result.returncode:
                exit_code = result.returncode
                break
    except subprocess.TimeoutExpired as exc:
        output.append(
            f"timeout after {exc.timeout} seconds while running npm"
        )
        exit_code = 124

    finished = dt.datetime.now(dt.timezone.utc)
    output.extend(
        [
            f"finished={finished.isoformat()}",
            f"exit_code={exit_code}",
        ]
    )
    rendered = "\n".join(output) + "\n"
    path = log_path(job_name, started)
    path.write_text(rendered, encoding="utf-8")

    if exit_code:
        tail = "\n".join(rendered.splitlines()[-80:])
        print(
            f"FAIL {job_name} exit={exit_code} log={path}\n{tail}",
            file=sys.stderr,
        )
        return exit_code

    if job.mode == "watchdog":
        return 0

    boundary = " no-write" if job.mode == "x_pulse" else ""
    print(f"OK {job_name}{boundary} log={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
