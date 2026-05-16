#!/usr/bin/env tsx

import { readFileSync } from "node:fs";

import {
  buildThesisBenchmarkReport,
  type BenchmarkReportInput,
} from "../lib/thesis/benchmark/build-report";

function usage(): void {
  process.stderr.write("Usage: npx tsx scripts/build-thesis-benchmark-report.ts <input.json>\n");
}

function main(): void {
  const arg = process.argv[2];
  if (!arg || arg === "--help" || arg === "-h") {
    usage();
    process.exit(arg ? 0 : 1);
  }

  const payload = JSON.parse(readFileSync(arg, "utf8")) as BenchmarkReportInput;
  const result = buildThesisBenchmarkReport(payload);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
