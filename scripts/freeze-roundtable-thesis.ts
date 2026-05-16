#!/usr/bin/env tsx

import { readFileSync } from "node:fs";

import {
  evaluateRoundtableThesis,
  freezeRoundtableThesis,
  type JudgeGateInput,
} from "../lib/thesis/roundtable/judge-gate";

function printUsage(): void {
  console.error("Usage: tsx scripts/freeze-roundtable-thesis.ts <input.json>");
}

function main(): void {
  const inputPath = process.argv[2];
  if (!inputPath || inputPath === "--help" || inputPath === "-h") {
    printUsage();
    process.exit(inputPath ? 0 : 1);
  }

  const raw = readFileSync(inputPath, "utf-8");
  const input = JSON.parse(raw) as JudgeGateInput;

  const verdict = evaluateRoundtableThesis(input);
  const frozen = freezeRoundtableThesis(input, verdict);

  process.stdout.write(`${JSON.stringify(frozen, null, 2)}\n`);
}

main();
