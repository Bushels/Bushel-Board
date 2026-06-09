#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { inspectGrokCredentialState } from "./build-track54-readiness-report";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Track 54 Grok Runner Preflight

Usage:
  npm run track54:grok-preflight

Checks:
  - Grok CLI binary/version is available.
  - Either XAI_API_KEY is present or local Grok CLI auth has not expired.

This command does not run Grok search, does not write Supabase rows, and does not
enable any Track 54 write-mode automation.
`);
  process.exit(0);
}

const versionResult = spawnSync("grok", ["--version"], {
  cwd: process.cwd(),
  encoding: "utf-8",
  env: process.env,
  shell: true,
});

const versionOutput = `${versionResult.stdout ?? ""}\n${versionResult.stderr ?? ""}\n${versionResult.error?.message ?? ""}`
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, 8);
const credentialState = inspectGrokCredentialState();
const ok = versionResult.status === 0 && credentialState.ok;

const result = {
  schema_version: "track54_grok_runner_preflight_v1",
  checked_at: new Date().toISOString(),
  dry_run_only: true,
  production_writes_enabled: false,
  command: "grok --version + Track54 credential preflight",
  grok_version_ok: versionResult.status === 0,
  credential_ok: credentialState.ok,
  credential_source: credentialState.credential_source,
  credential_issue: credentialState.credential_issue,
  xai_api_key_present: credentialState.xai_api_key_present,
  cli_auth_file_present: credentialState.cli_auth_file_present,
  cli_auth_expires_at: credentialState.cli_auth_expires_at,
  cli_auth_expired: credentialState.cli_auth_expired,
  ok,
  output: [...versionOutput, ...credentialState.output],
  next_actions: ok
    ? ["Grok runner credential source is ready for the next no-write Track 54 scout."]
    : ["Run `grok login` locally or add XAI_API_KEY to `.env.local` before retrying Track 54 scout jobs."],
};

console.log(JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 1);
