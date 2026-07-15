#!/usr/bin/env bash
# Hermes no-write Wheat X Pulse launcher (Track 54 boundary preserved).
# Does NOT write Supabase thesis tables. Produces local dry-run artifacts only.
set -euo pipefail

ROOT="${BUSHEL_BOARD_ROOT:-/c/Users/kyle/Agriculture/bushel-board-app}"
MODE="${1:-daily_pulse}"
cd "$ROOT"

if command -v npm >/dev/null 2>&1; then
  NPM_BIN="$(command -v npm)"
else
  NPM_BIN="/c/Program Files/nodejs/npm"
fi

echo "=== wheat x pulse (no-write) mode=$MODE ==="
"$NPM_BIN" run track54:hermes-preflight
"$NPM_BIN" run track54:hermes-x-scout:terminal -- --mode "$MODE"
echo "OK wheat-x-pulse mode=$MODE (no Supabase thesis writes)"
