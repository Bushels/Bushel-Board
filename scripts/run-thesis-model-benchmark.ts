#!/usr/bin/env tsx

import { readFileSync } from "node:fs";

import {
  runThesisModelBenchmark,
  type ThesisBenchmarkInput,
} from "../lib/thesis/benchmark/run-benchmark";

function usage(): void {
  process.stderr.write("Usage: npx tsx scripts/run-thesis-model-benchmark.ts <input.json>\n");
}

function main(): void {
  const arg = process.argv[2];
  if (!arg || arg === "--help" || arg === "-h") {
    usage();
    process.exit(arg ? 0 : 1);
  }

  const payload = JSON.parse(readFileSync(arg, "utf8")) as ThesisBenchmarkInput;
  const result = runThesisModelBenchmark(payload);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
