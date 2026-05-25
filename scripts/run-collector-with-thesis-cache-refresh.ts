#!/usr/bin/env npx tsx
/**
 * Runs a data collector, then force-refreshes the cached Bull/Bear Thesis packets.
 *
 * Output: child process output is passed through; diagnostics go to stderr.
 */

import { spawn } from "node:child_process";

const helpText = `
Run Collector With Thesis Cache Refresh

Usage:
  npx tsx scripts/run-collector-with-thesis-cache-refresh.ts --name collect-cgc node scripts/import-cgc-weekly-codex.mjs
  npx tsx scripts/run-collector-with-thesis-cache-refresh.ts --name collect-export-sales python3 scripts/import-usda-export-sales.py

Options:
  --name <name>       Collector label for diagnostics.
  --skip-refresh      Run the collector but do not refresh thesis cache.
  --help              Show this help.

Behavior:
  - Wrapper options must appear before the collector command.
  - Passes collector output through unchanged.
  - Skips thesis cache refresh if the collector command includes --help, -h, or --dry-run.
  - Force-refreshes thesis cache only after a successful collector exit so a stale cached watermark cannot hide newly imported source data.
  - Exits non-zero if the refresh fails so stale thesis cache is visible.
  - Collector commands must stay idempotent because external orchestrators may retry the full command.
`;

export interface WrapperOptions {
  name: string | null;
  skipRefresh: boolean;
  help: boolean;
}

export interface RefreshCommand {
  command: string;
  args: string[];
}

export function parseWrapperArgs(args: string[]): { options: WrapperOptions; collectorCommand: string[] } {
  const options: WrapperOptions = { name: null, skipRefresh: false, help: false };
  let index = 0;

  while (index < args.length) {
    const arg = args[index];
    if (arg === "--") {
      index += 1;
      break;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      index += 1;
      continue;
    }
    if (arg === "--skip-refresh") {
      options.skipRefresh = true;
      index += 1;
      continue;
    }
    if (arg === "--name") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --name");
      }
      options.name = value;
      index += 2;
      continue;
    }
    break;
  }

  return { options, collectorCommand: args.slice(index) };
}

const windowsCommandShims = new Set(["jest", "npm", "npx", "pnpm", "tsc", "tsx", "vitest", "yarn"]);

function needsWindowsShell(command: string): boolean {
  const normalized = command.toLowerCase();
  return (
    process.platform === "win32" &&
    (windowsCommandShims.has(normalized) || normalized.endsWith(".cmd") || normalized.endsWith(".bat"))
  );
}

function formatCommandForLog(command: string, args: string[]): string {
  return [command, ...args]
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function run(command: string, args: string[], label: string): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };

    console.error(`[${label}] started: ${formatCommandForLog(command, args)}`);

    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: needsWindowsShell(command),
    });

    child.on("error", (error) => {
      console.error(`[${label}] failed to start: ${error.message}`);
      finish(127);
    });
    child.on("close", (code) => {
      finish(code ?? 1);
    });
  });
}

export function shouldSkipRefresh(options: WrapperOptions, collectorCommand: string[]): boolean {
  return (
    options.skipRefresh ||
    collectorCommand.some((arg) => arg === "--help" || arg === "-h" || arg.startsWith("--dry-run"))
  );
}

export function buildRefreshCommand(): RefreshCommand {
  return {
    command: "npx",
    args: ["tsx", "scripts/refresh-thesis-packet-cache.ts", "--force"],
  };
}

export async function main(args = process.argv.slice(2)) {
  const { options, collectorCommand } = parseWrapperArgs(args);

  if (options.help) {
    console.error(helpText);
    return 0;
  }

  if (collectorCommand.length === 0) {
    console.error(helpText);
    console.error("Missing collector command.");
    return 2;
  }

  const collectorName = options.name ?? collectorCommand[0] ?? "collector";
  const [command, ...collectorArgs] = collectorCommand;

  const collectorExitCode = await run(command, collectorArgs, collectorName);
  if (collectorExitCode !== 0) {
    console.error(`[${collectorName}] collector failed; thesis cache refresh skipped.`);
    return collectorExitCode;
  }

  if (shouldSkipRefresh(options, collectorCommand)) {
    console.error(`[${collectorName}] thesis cache refresh skipped by option/help/dry-run.`);
    return 0;
  }

  const refreshCommand = buildRefreshCommand();
  const refreshExitCode = await run(
    refreshCommand.command,
    refreshCommand.args,
    "refresh-thesis-cache",
  );
  if (refreshExitCode !== 0) {
    console.error(`[${collectorName}] collector succeeded, but thesis cache refresh failed.`);
    return refreshExitCode;
  }

  return 0;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/run-collector-with-thesis-cache-refresh.ts")) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
