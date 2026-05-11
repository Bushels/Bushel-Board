#!/usr/bin/env npx tsx
/**
 * Read-only Kalshi commodity snapshot capture.
 *
 * Usage:
 *   npx tsx scripts/capture-kalshi-commodity-snapshot.ts
 *   npx tsx scripts/capture-kalshi-commodity-snapshot.ts --help
 *
 * This script writes JSON to stdout only. It does not write Supabase rows,
 * local files, or prediction/training artifacts.
 */

import {
  KALSHI_COMMODITY_SERIES,
  fetchKalshiCommoditySnapshot,
} from "@/lib/kalshi/commodity-markets";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Kalshi Commodity Snapshot Capture

Usage:
  npx tsx scripts/capture-kalshi-commodity-snapshot.ts
  npx tsx scripts/capture-kalshi-commodity-snapshot.ts --help

Output:
  JSON to stdout with captured_at, watched series, normalized markets, and warnings.

Guardrails:
  - Read-only Kalshi public market metadata.
  - No Supabase writes.
  - No production scorecard writes.
  - No model-training claims.
`);
  process.exit(0);
}

async function main() {
  const snapshot = await fetchKalshiCommoditySnapshot();
  const output = {
    captured_at: snapshot.capturedAt,
    source: "kalshi",
    mode: "read_only_calibration",
    watched_series: KALSHI_COMMODITY_SERIES,
    market_count: snapshot.markets.length,
    markets: snapshot.markets,
    warnings: snapshot.warnings,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
