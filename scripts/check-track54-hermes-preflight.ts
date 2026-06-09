#!/usr/bin/env npx tsx
import { runHermesTerminalProof } from "./build-track54-readiness-report";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Track 54 Hermes Terminal Preflight

Usage:
  npm run track54:hermes-preflight

Checks:
  - Hermes CLI is available.
  - Hermes xAI OAuth is logged in.
  - Hermes can call the configured Grok model without X search.
  - Hermes can see the x_search toolset needed by the terminal shadow scout.

This command does not run X search, does not write Supabase rows, does not run
daily thesis review, and does not enable any Track 54 write-mode automation.
`);
  process.exit(0);
}

const proof = runHermesTerminalProof();
const result = {
  schema_version: "track54_hermes_terminal_preflight_v1",
  checked_at: new Date().toISOString(),
  dry_run_only: true,
  production_writes_enabled: false,
  ...proof,
  next_actions: proof.ok
    ? ["Hermes terminal shadow scout is ready for no-write artifact recovery."]
    : ["Open Hermes/xAI OAuth locally, then rerun `npm run track54:hermes-preflight` before relying on the Hermes terminal shadow scout."],
};

console.log(JSON.stringify(result, null, 2));
process.exit(proof.ok ? 0 : 1);
