#!/usr/bin/env node
/**
 * Run the GEE crop-stress collector across all wheat belts (US_HRW, RU_WINTER,
 * RU_SPRING). Wrapped by `npm run collect:gee-crop-stress` (which refreshes the
 * thesis cache on success). Extra args (e.g. --dry-run, --date YYYY-MM-DD) are
 * forwarded to each belt run. Exits non-zero if ANY belt fails.
 *
 * Auth: personal Earth Engine refresh token (no SA key needed — org policy blocks
 * SA keys; see docs/reference/gee/service-account-setup.md). Uses py -3.13 (the
 * interpreter with earthengine-api). Override with GEE_PYTHON / GEE_PROJECT env.
 */
import { spawn } from "node:child_process";

const BELTS = ["US_HRW", "RU_WINTER", "RU_SPRING"];
const PROJECT = process.env.GEE_PROJECT || "monette-494717";
const PY = process.env.GEE_PYTHON || "py";
const PY_PREFIX = process.env.GEE_PYTHON ? [] : ["-3.13"]; // py launcher selects 3.13 (has ee)
const passthrough = process.argv.slice(2); // e.g. --dry-run, --date 2026-06-14

function runBelt(belt) {
  return new Promise((resolve) => {
    const args = [
      ...PY_PREFIX,
      "scripts/gee/import-gee-crop-stress.py",
      "--belt", belt,
      "--project", PROJECT,
      ...passthrough,
    ];
    console.error(`[gee-all] ${belt}: ${PY} ${args.join(" ")}`);
    const child = spawn(PY, args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    child.on("error", (e) => {
      console.error(`[gee-all] ${belt} failed to start: ${e.message}`);
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

let failures = 0;
for (const belt of BELTS) {
  const code = await runBelt(belt);
  if (code !== 0) {
    console.error(`[gee-all] ${belt} exited ${code}`);
    failures += 1;
  }
}
if (failures > 0) {
  console.error(`[gee-all] ${failures}/${BELTS.length} belt(s) failed`);
}
process.exitCode = failures > 0 ? 1 : 0;
