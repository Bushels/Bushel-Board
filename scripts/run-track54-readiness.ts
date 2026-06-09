#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

function npmConfigKeys(flag: string): string[] {
  const name = flag.replace(/^--/, "");
  return [
    `npm_config_${name.replace(/-/g, "_")}`,
    `npm_config_${name}`,
  ];
}

function npmNegatedConfigKeys(flag: string): string[] {
  if (!flag.startsWith("--no-")) return [];
  const positiveFlag = `--${flag.slice("--no-".length)}`;
  return npmConfigKeys(positiveFlag);
}

function hasEnvKey(inputEnv: NodeJS.ProcessEnv, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(inputEnv, key);
}

function inferNpmStrippedValue(flag: string, inputArgs: string[]): string | undefined {
  if (flag === "--base-url") {
    return inputArgs.find((arg) => /^https?:\/\//i.test(arg));
  }
  if (flag === "--browser-smoke-proof" || flag === "--browser-smoke-proof-out") {
    return inputArgs.find((arg) => /browser-smoke/i.test(arg) && /\.json$/i.test(arg));
  }
  if (flag === "--out") {
    return inputArgs.find((arg) => /readiness/i.test(arg) && /\.json$/i.test(arg));
  }
  if (flag === "--chrome-path") {
    return inputArgs.find((arg) => /\.(exe|cmd|bat)$/i.test(arg));
  }
  if (flag === "--settle-ms") {
    return inputArgs.find((arg) => /^\d+$/.test(arg));
  }
  return undefined;
}

function optionValueFrom(flag: string, inputArgs: string[], inputEnv: NodeJS.ProcessEnv): string | undefined {
  const index = inputArgs.indexOf(flag);
  if (index !== -1) return inputArgs[index + 1];
  const inline = inputArgs.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  for (const key of npmConfigKeys(flag)) {
    if (!hasEnvKey(inputEnv, key)) continue;
    const envValue = inputEnv[key];
    if (envValue && envValue !== "true" && envValue !== "false") return envValue;
    const inferred = inferNpmStrippedValue(flag, inputArgs);
    if (inferred) return inferred;
  }
  return undefined;
}

function optionValue(flag: string): string | undefined {
  return optionValueFrom(flag, args, process.env);
}

function hasFlagFrom(flag: string, inputArgs: string[], inputEnv: NodeJS.ProcessEnv): boolean {
  if (inputArgs.includes(flag)) return true;
  if (npmConfigKeys(flag).some((key) => inputEnv[key] === "true")) return true;
  return npmNegatedConfigKeys(flag).some((key) => hasEnvKey(inputEnv, key) && inputEnv[key] !== "true");
}

function hasFlag(flag: string): boolean {
  return hasFlagFrom(flag, args, process.env);
}

function withoutFlags(inputArgs: string[], flags: Set<string>): string[] {
  const output: string[] = [];
  for (let index = 0; index < inputArgs.length; index += 1) {
    const arg = inputArgs[index]!;
    const [inlineFlag] = arg.split("=", 1);
    if (flags.has(arg) || flags.has(inlineFlag ?? "")) {
      if (!arg.includes("=") && index + 1 < inputArgs.length && !inputArgs[index + 1]!.startsWith("--")) {
        index += 1;
      }
      continue;
    }
    output.push(arg);
  }
  return output;
}

function pickFlags(inputArgs: string[], valueFlags: Set<string>, booleanFlags: Set<string>): string[] {
  const output: string[] = [];
  for (let index = 0; index < inputArgs.length; index += 1) {
    const arg = inputArgs[index]!;
    const [inlineFlag] = arg.split("=", 1);
    if (valueFlags.has(inlineFlag ?? "")) {
      output.push(arg);
      if (!arg.includes("=") && index + 1 < inputArgs.length && !inputArgs[index + 1]!.startsWith("--")) {
        output.push(inputArgs[index + 1]!);
        index += 1;
      }
      continue;
    }
    if (booleanFlags.has(arg)) {
      output.push(arg);
    }
  }
  return output;
}

function hasForwardedValueFlag(output: string[], flag: string): boolean {
  return output.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

export function pickForwardedFlags(inputArgs: string[], inputEnv: NodeJS.ProcessEnv, valueFlags: Set<string>, booleanFlags: Set<string>): string[] {
  const output = pickFlags(inputArgs, valueFlags, booleanFlags);
  for (const flag of valueFlags) {
    const value = optionValueFrom(flag, inputArgs, inputEnv);
    if (value && !hasForwardedValueFlag(output, flag)) {
      output.push(flag, value);
    }
  }
  for (const flag of booleanFlags) {
    if (hasFlagFrom(flag, inputArgs, inputEnv) && !output.includes(flag)) {
      output.push(flag);
    }
  }
  return output;
}

export function stripWrapperNpmValueLeakage(inputArgs: string[], inputEnv: NodeJS.ProcessEnv, wrapperValueFlags: Set<string>, wrapperBooleanFlags: Set<string>): string[] {
  const stripped = withoutFlags(inputArgs, new Set([...wrapperValueFlags, ...wrapperBooleanFlags]));
  const leakedValues = new Set<string>();
  for (const flag of wrapperValueFlags) {
    const value = optionValueFrom(flag, inputArgs, inputEnv);
    if (value) leakedValues.add(value);
  }
  return stripped.filter((arg) => !leakedValues.has(arg));
}

function runNpx(commandArgs: string[], label: string, stdio: "pipe" | "inherit") {
  const result = spawnSync("npx", commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf-8",
    shell: process.platform === "win32",
    stdio,
  });

  if (result.status !== 0) {
    if (stdio === "pipe") {
      const stdout = result.stdout?.trim();
      const stderr = result.stderr?.trim();
      if (stdout) console.error(stdout);
      if (stderr) console.error(stderr);
    }
    if (result.error) console.error(result.error.message);
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

if (IS_CLI && (hasFlag("--help") || hasFlag("-h"))) {
  console.error(`
Track 54 Readiness Operator Check

Usage:
  npm run track54:readiness
  npm run track54:readiness -- --from 2026-06-01 --to 2026-06-05
  npm run track54:readiness -- --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json
  npm run track54:readiness -- --skip-browser-smoke --browser-smoke-proof scratch/track54-browser-smoke/browser-smoke-proof.json

This wrapper runs browser smoke first unless --skip-browser-smoke or --browser-smoke-proof is supplied,
then runs the readiness builder with --browser-smoke-proof and writes the persisted heartbeat report.

Options:
  --skip-browser-smoke                 Reuse the supplied/default browser-smoke proof instead of running smoke.
  --browser-smoke-proof <path>         Defaults to scratch/track54-browser-smoke/browser-smoke-proof.json.
  --browser-smoke-proof-out <path>     Run browser smoke and write proof to this path.
  --out <path>                         Defaults to scratch/track54-readiness/latest-readiness-report.json.
  --base-url <url>                     Passed to browser smoke when running the smoke step.
  --chrome-path <path>                 Passed to browser smoke when running the smoke step.
  --settle-ms <number>                 Passed to browser smoke when running the smoke step.
  --no-start-server                    Passed to browser smoke when running the smoke step.
  Additional options are passed through to scripts/build-track54-readiness-report.ts.
`);
  process.exit(0);
}

function main() {
  const browserSmokeValueFlags = new Set(["--base-url", "--chrome-path", "--settle-ms"]);
  const browserSmokeBooleanFlags = new Set(["--no-start-server"]);
  const browserSmokeProofOut = optionValue("--browser-smoke-proof-out");
  const browserSmokeProof = browserSmokeProofOut
    ?? optionValue("--browser-smoke-proof")
    ?? "scratch/track54-browser-smoke/browser-smoke-proof.json";
  const readinessOut = optionValue("--out") ?? "scratch/track54-readiness/latest-readiness-report.json";
  const skipBrowserSmoke = hasFlag("--skip-browser-smoke")
    || (Boolean(optionValue("--browser-smoke-proof")) && !browserSmokeProofOut);
  const wrapperValueFlags = new Set([
    "--browser-smoke-proof",
    "--browser-smoke-proof-out",
    "--out",
    ...browserSmokeValueFlags,
  ]);
  const wrapperBooleanFlags = new Set([
    "--skip-browser-smoke",
    ...browserSmokeBooleanFlags,
  ]);
  const passThroughArgs = stripWrapperNpmValueLeakage(args, process.env, wrapperValueFlags, wrapperBooleanFlags);
  const browserSmokeArgs = pickForwardedFlags(args, process.env, browserSmokeValueFlags, browserSmokeBooleanFlags);

  if (!skipBrowserSmoke) {
    runNpx([
      "tsx",
      "scripts/run-track54-browser-smoke.ts",
      "--out",
      browserSmokeProof,
      ...browserSmokeArgs,
    ], "Track 54 browser smoke", "pipe");
  }

  runNpx([
    "tsx",
    "scripts/build-track54-readiness-report.ts",
    ...passThroughArgs,
    "--browser-smoke-proof",
    browserSmokeProof,
    "--out",
    readinessOut,
  ], "Track 54 readiness builder", "inherit");
}

if (IS_CLI) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
