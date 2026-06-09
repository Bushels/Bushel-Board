#!/usr/bin/env npx tsx
/**
 * Runs the Hermes CLI with Grok 4.3 for a Track 54 X scout shadow artifact.
 * This writes local prompt/raw/summary files only and never writes Supabase rows.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  buildHermesXScoutArtifact,
  type HermesXScoutBridgeResult,
} from "@/scripts/build-hermes-x-scout-artifact";
import { track54AutomationDateKey } from "@/lib/x-api/track54-date";
import type { XScoutMode } from "@/lib/x-api/x-scout-contract";
import type { PriceSnapshotStatus } from "@/lib/x-api/x-signal-valuation";

const args = process.argv.slice(2);
const MODES = ["daily_pulse", "friday_deep", "manual_test"] as const;
const PRICE_STATUSES = ["auto", "not_checked", "fresh", "stale", "missing", "partial"] as const;
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

export interface HermesCliInvocation {
  status: number | null;
  stdout: string;
  stderr: string;
  command: string[];
}

export interface HermesXScoutTerminalOptions {
  cwd?: string;
  mode?: XScoutMode;
  runDate?: string;
  artifactRoot?: string;
  scratchDir?: string;
  priceSnapshotStatus?: PriceSnapshotStatus | "auto";
  provider?: string;
  model?: string;
  toolsets?: string;
  timeoutMs?: number;
  artifactStem?: string;
}

export interface HermesXScoutTerminalResult {
  schema_version: "hermes_x_scout_terminal_runner_v1";
  dry_run: true;
  write: false;
  mode: XScoutMode;
  run_date: string;
  provider: string;
  model: string;
  toolsets: string;
  hermes_command: string[];
  hermes_exit_status: number | null;
  prompt_path: string;
  raw_response_path: string;
  import_result: HermesXScoutBridgeResult;
  next_actions: string[];
}

function optionValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const envValue = process.env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`];
  return envValue && envValue !== "true" ? envValue : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag) || process.env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`] === "true";
}

if (IS_CLI && (hasFlag("--help") || hasFlag("-h"))) {
  console.error(`
Hermes X Scout Terminal Runner

Usage:
  npx tsx scripts/run-hermes-x-scout-terminal.ts --mode daily_pulse --date 2026-06-08

Options:
  --mode daily_pulse|friday_deep|manual_test   Defaults to daily_pulse.
  --date YYYY-MM-DD                            Defaults to the current Track 54 local automation date.
  --artifact-root <path>                       Defaults to data/X Scout Runs.
  --scratch-dir <path>                         Defaults to scratch/hermes-x-scout.
  --price-snapshot-status <status>             auto|not_checked|fresh|stale|missing|partial. Defaults to auto.
  --provider <provider>                        Defaults to xai-oauth.
  --model <model>                              Defaults to grok-4.3.
  --toolsets <toolsets>                        Defaults to x_search.
  --timeout-ms <ms>                            Defaults to 240000.

This runner uses Hermes one-shot mode and requests only the x_search toolset.
It writes local no-write artifacts only. It does not run daily thesis review,
does not write Supabase rows, and does not call retired Grok pipeline paths.
`);
  process.exit(0);
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseMode(value: string | undefined): XScoutMode {
  if (!value) return "daily_pulse";
  if ((MODES as readonly string[]).includes(value)) return value as XScoutMode;
  throw new Error(`Unsupported --mode ${value}`);
}

function parsePriceSnapshotStatus(value: string | undefined): PriceSnapshotStatus | "auto" {
  if (!value) return "auto";
  if ((PRICE_STATUSES as readonly string[]).includes(value)) return value as PriceSnapshotStatus | "auto";
  throw new Error(`Unsupported --price-snapshot-status ${value}`);
}

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ||= value;
    }
  } catch {
    // Env may already be supplied by the runner.
  }
}

async function getPriceSnapshotStatus(cwd: string, runDate: string): Promise<PriceSnapshotStatus> {
  try {
    loadEnvFile(resolve(cwd, ".env.local"));
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return "not_checked";

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from("grain_prices")
      .select("price_date")
      .lte("price_date", runDate)
      .order("price_date", { ascending: false })
      .limit(1);

    if (error) return "not_checked";
    const latestDate = data?.[0]?.price_date;
    if (typeof latestDate !== "string") return "missing";

    const latest = new Date(`${latestDate}T00:00:00Z`);
    const target = new Date(`${runDate}T00:00:00Z`);
    const ageDays = Math.floor((target.getTime() - latest.getTime()) / 86_400_000);
    if (ageDays <= 2) return "fresh";
    return "stale";
  } catch {
    return "not_checked";
  }
}

function defaultHermesInvoker(params: {
  prompt: string;
  provider: string;
  model: string;
  toolsets: string;
  timeoutMs: number;
}): HermesCliInvocation {
  const command = [
    "hermes",
    "-z",
    "<prompt>",
    "--provider",
    params.provider,
    "-m",
    params.model,
    "-t",
    params.toolsets,
  ];
  const result = spawnSync(
    "hermes",
    [
      "-z",
      params.prompt,
      "--provider",
      params.provider,
      "-m",
      params.model,
      "-t",
      params.toolsets,
    ],
    {
      encoding: "utf-8",
      timeout: params.timeoutMs,
      windowsHide: true,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    command,
  };
}

export async function runHermesXScoutTerminal(
  options: HermesXScoutTerminalOptions = {},
  invokeHermes = defaultHermesInvoker,
): Promise<HermesXScoutTerminalResult> {
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode ?? "daily_pulse";
  const runDate = options.runDate ?? track54AutomationDateKey();
  const artifactRoot = options.artifactRoot ?? resolve("data", "X Scout Runs");
  const scratchDir = resolve(cwd, options.scratchDir ?? "scratch/hermes-x-scout");
  const requestedPriceSnapshotStatus = options.priceSnapshotStatus ?? "auto";
  const priceSnapshotStatus =
    requestedPriceSnapshotStatus === "auto"
      ? await getPriceSnapshotStatus(cwd, runDate)
      : requestedPriceSnapshotStatus;
  const provider = options.provider ?? "xai-oauth";
  const model = options.model ?? "grok-4.3";
  const toolsets = options.toolsets ?? "x_search";
  const timeoutMs = options.timeoutMs ?? 240_000;
  const artifactStem = options.artifactStem ?? `${mode}-hermes-terminal-${timestampSuffix()}`;

  const promptResult = buildHermesXScoutArtifact({
    cwd,
    mode,
    runDate,
    artifactRoot,
    artifactStem,
    priceSnapshotStatus,
    promptOnly: true,
  });
  const prompt = readFileSync(promptResult.prompt_path, "utf-8");

  const hermes = invokeHermes({ prompt, provider, model, toolsets, timeoutMs });
  mkdirSync(scratchDir, { recursive: true });
  const rawResponsePath = resolve(scratchDir, `${runDate}-${mode}-hermes-terminal-output.json`);
  writeFileSync(rawResponsePath, hermes.stdout, "utf-8");

  if (hermes.status !== 0) {
    throw new Error(
      `Hermes exited with status ${hermes.status}. Raw stdout was saved to ${rawResponsePath}. stderr: ${hermes.stderr.slice(0, 500)}`,
    );
  }

  const importResult = buildHermesXScoutArtifact({
    cwd,
    mode,
    runDate,
    artifactRoot,
    artifactStem,
    priceSnapshotStatus,
    rawInput: hermes.stdout,
    rawFile: rawResponsePath,
  });

  return {
    schema_version: "hermes_x_scout_terminal_runner_v1",
    dry_run: true,
    write: false,
    mode,
    run_date: runDate,
    provider,
    model,
    toolsets,
    hermes_command: hermes.command,
    hermes_exit_status: hermes.status,
    prompt_path: promptResult.prompt_path,
    raw_response_path: rawResponsePath,
    import_result: importResult,
    next_actions: [
      "Run the existing Track 54 artifact reviewer before treating this Hermes output as gate evidence.",
      "Do not enable write-mode automation from this shadow artifact.",
    ],
  };
}

if (IS_CLI) {
  const positionalMode = args.find((arg): arg is XScoutMode => (MODES as readonly string[]).includes(arg));
  const positionalDate = args.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  runHermesXScoutTerminal({
    mode: parseMode(optionValue("--mode") ?? positionalMode),
    runDate: optionValue("--date") ?? positionalDate ?? track54AutomationDateKey(),
    artifactRoot: optionValue("--artifact-root"),
    scratchDir: optionValue("--scratch-dir"),
    priceSnapshotStatus: parsePriceSnapshotStatus(optionValue("--price-snapshot-status")),
    provider: optionValue("--provider"),
    model: optionValue("--model"),
    toolsets: optionValue("--toolsets"),
    timeoutMs: Number(optionValue("--timeout-ms") ?? 240_000),
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
