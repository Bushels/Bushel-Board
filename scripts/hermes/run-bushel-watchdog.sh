#!/usr/bin/env bash
# Hermes script-only watchdog wrapper.
# Prints nothing (silent) on success; prints FAIL details on nonzero exit.
# Usage: run-bushel-watchdog.sh <npm-script-name> [args...]
set -euo pipefail

ROOT="${BUSHEL_BOARD_ROOT:-/c/Users/kyle/Agriculture/bushel-board-app}"
SCRIPT_NAME="${1:-}"
shift || true

if [[ -z "$SCRIPT_NAME" ]]; then
  echo "ERROR: missing npm script name" >&2
  exit 2
fi

cd "$ROOT"

if command -v npm >/dev/null 2>&1; then
  NPM_BIN="$(command -v npm)"
else
  NPM_BIN="/c/Program Files/nodejs/npm"
fi

set +e
OUT=$("$NPM_BIN" run "$SCRIPT_NAME" -- "$@" 2>&1)
CODE=$?
set -e

if [[ $CODE -ne 0 ]]; then
  echo "FAIL bushel watchdog $SCRIPT_NAME exit=$CODE"
  echo "$OUT" | tail -n 80
  exit $CODE
fi

# silent success for Hermes no_agent delivery
exit 0
