#!/usr/bin/env bash
# Hermes script-only collector wrapper for Bushel Board.
# Usage: run-bushel-collector.sh <npm-script-name>
# Example: run-bushel-collector.sh collect:prices
set -euo pipefail

ROOT="${BUSHEL_BOARD_ROOT:-/c/Users/kyle/Agriculture/bushel-board-app}"
SCRIPT_NAME="${1:-}"
LOG_DIR="${BUSHEL_HERMES_LOG_DIR:-$HOME/.hermes/logs/bushel-board-collectors}"

if [[ -z "$SCRIPT_NAME" ]]; then
  echo "ERROR: missing npm script name" >&2
  exit 2
fi

mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%dT%H%M%S)"
SAFE_NAME="$(echo "$SCRIPT_NAME" | tr ':/' '__')"
LOG_FILE="$LOG_DIR/${SAFE_NAME}-${STAMP}.log"

cd "$ROOT"

# Prefer Windows npm when running under git-bash/MSYS.
if command -v npm >/dev/null 2>&1; then
  NPM_BIN="$(command -v npm)"
else
  NPM_BIN="/c/Program Files/nodejs/npm"
fi

{
  echo "=== bushel collector ==="
  echo "script=$SCRIPT_NAME"
  echo "root=$ROOT"
  echo "started=$(date -Iseconds)"
  echo "npm=$NPM_BIN"
} | tee "$LOG_FILE"

set +e
"$NPM_BIN" run "$SCRIPT_NAME" 2>&1 | tee -a "$LOG_FILE"
CODE=${PIPESTATUS[0]}
set -e

{
  echo "finished=$(date -Iseconds)"
  echo "exit_code=$CODE"
} | tee -a "$LOG_FILE"

if [[ $CODE -ne 0 ]]; then
  echo "FAIL bushel collector $SCRIPT_NAME exit=$CODE log=$LOG_FILE"
  exit $CODE
fi

# Quiet success for watchdogs that only want noise on failure:
# print a single OK line so operators still see heartbeat text when delivered.
echo "OK $SCRIPT_NAME"
exit 0
