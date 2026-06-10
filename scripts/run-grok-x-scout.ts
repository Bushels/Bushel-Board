#!/usr/bin/env npx tsx
/**
 * Runs the quarantined Grok/X scout lane.
 *
 * Dry run saves local artifacts and validates signals, but does not write Supabase.
 * Write mode records x_scout_runs and accepted x_market_signals only.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { parseGrokXScoutJson, type XScoutMode, type XScoutOutput } from "@/lib/x-api/x-scout-contract";
import { mergeXScoutOutputs } from "@/lib/x-api/x-scout-output-merge";
import { groupAllowedHandles } from "@/lib/x-api/trusted-accounts";
import { track54AutomationDateKey } from "@/lib/x-api/track54-date";
import { scoreXSignalImpact, type PriceSnapshotStatus } from "@/lib/x-api/x-signal-valuation";
import { validateXScoutSignal } from "@/lib/x-api/x-signal-validation";
import { assertTrack54WriteGate } from "./track54-write-gate";

type Runner = "auto" | "grok_cli" | "xai_api" | "manual";
type ResolvedRunner = Exclude<Runner, "auto">;

const args = process.argv.slice(2);
const POSITIONAL_ARGS = args.filter((arg) => !arg.startsWith("--"));
const MODES = ["daily_pulse", "friday_deep", "manual_test"] as const;
const RUNNERS = ["auto", "grok_cli", "xai_api", "manual"] as const;
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

function optionValueFromArgs(inputArgs: string[], env: NodeJS.ProcessEnv, flag: string): string | undefined {
  const index = inputArgs.indexOf(flag);
  if (index !== -1) return inputArgs[index + 1];
  const inline = inputArgs.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const envValue = env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`];
  return envValue && envValue !== "true" ? envValue : undefined;
}

function optionValue(flag: string): string | undefined {
  return optionValueFromArgs(args, process.env, flag);
}

function hasFlag(flag: string): boolean {
  return args.includes(flag) || process.env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`] === "true";
}

export function resolveGrokCliModel(inputArgs: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  const modelFromFlag = optionValueFromArgs(inputArgs, env, "--grok-cli-model");
  if (modelFromFlag) return modelFromFlag;
  if (env.GROK_CLI_MODEL) return env.GROK_CLI_MODEL;

  const positional = inputArgs.filter((arg) => !arg.startsWith("--"));
  const runnerIndex = positional.findIndex((arg) => (RUNNERS as readonly string[]).includes(arg));
  if (runnerIndex === -1) return null;

  const modelCandidate = positional.slice(runnerIndex + 1).find((arg) => {
    if ((MODES as readonly string[]).includes(arg)) return false;
    if ((RUNNERS as readonly string[]).includes(arg)) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return false;
    if (/^\d+$/.test(arg)) return false;
    return /^(grok|cursor|composer)[\w.-]+$/i.test(arg);
  });

  return modelCandidate ?? null;
}

if (IS_CLI && (hasFlag("--help") || hasFlag("-h"))) {
  console.error(`
Grok X Scout

Usage:
  npm run grok:x-scout -- --mode manual_test --dry-run
  npm run grok:x-scout -- --mode daily_pulse --runner auto --dry-run
  npm run grok:x-scout -- --mode daily_pulse --runner auto --write --approval-phrase "<approval phrase>" --approval-review-from YYYY-MM-DD --approval-review-to YYYY-MM-DD

Options:
  --mode daily_pulse|friday_deep|manual_test
        Positional mode is also accepted, for example: npm run grok:x-scout -- friday_deep --dry-run
  --date YYYY-MM-DD
  --runner auto|grok_cli|xai_api|manual
  --dry-run
  --write
  --approval-phrase <phrase> Required with --write after candidate promotion brief and human approval.
  --approval-review-from YYYY-MM-DD  Required reviewed artifact window start from the promotion brief.
  --approval-review-to YYYY-MM-DD    Required reviewed artifact window end from the promotion brief.
  --grain-week <number>   Optional write-mode override. Defaults to latest CGC grain week.
  --crop-year <YYYY-YYYY> Defaults to current crop year.
  --timeout-ms <number>   Optional scout runner timeout. Defaults to 210000 for daily pulse, 420000 for Friday deep.
  --max-turns <number>    Optional Grok CLI turn budget. Defaults to 12 for daily pulse, 18 for Friday deep.
  --grok-cli-model <model> Optional Grok Build model for --runner grok_cli. Also accepted via GROK_CLI_MODEL or as positional after runner.
`);
  process.exit(0);
}

const positionalMode = POSITIONAL_ARGS.find((arg): arg is XScoutMode =>
  (MODES as readonly string[]).includes(arg),
);
const modeFromFlag = optionValue("--mode");
const MODE = ((modeFromFlag && (MODES as readonly string[]).includes(modeFromFlag)
  ? modeFromFlag
  : positionalMode) ?? "manual_test") as XScoutMode;
const positionalDate = POSITIONAL_ARGS.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
const RUN_DATE = optionValue("--date") ?? positionalDate ?? track54AutomationDateKey();
const positionalRunner = POSITIONAL_ARGS.find((arg): arg is Runner =>
  (RUNNERS as readonly string[]).includes(arg),
);
const runnerFromFlag = optionValue("--runner");
const RUNNER = ((runnerFromFlag && (RUNNERS as readonly string[]).includes(runnerFromFlag)
  ? runnerFromFlag
  : positionalRunner) ?? (MODE === "manual_test" ? "manual" : "auto")) as Runner;
const DRY_RUN = hasFlag("--dry-run") || !hasFlag("--write");
const WRITE = hasFlag("--write");
if (IS_CLI && WRITE) {
  assertTrack54WriteGate(args, process.env, "Grok X Scout write mode", { mode: MODE });
}
const positionalGrainWeek = POSITIONAL_ARGS.find((arg) => /^\d+$/.test(arg));
const GRAIN_WEEK = optionValue("--grain-week")
  ? Number(optionValue("--grain-week"))
  : positionalGrainWeek
    ? Number(positionalGrainWeek)
    : null;
const CROP_YEAR = optionValue("--crop-year") ?? CURRENT_CROP_YEAR;
const PROMPT_VERSION = "grok_x_scout_v1";
const SCOUT_TIMEOUT_MS = parseScoutTimeoutMs();
const GROK_CLI_MAX_TURNS = parseGrokCliMaxTurns();
const GROK_CLI_MODEL = resolveGrokCliModel(args, process.env);
const GROK_SCOUT_ALLOWED_TOOLS = ["web_search"] as const;
const GROK_SCOUT_DISALLOWED_TOOLS = [
  "Agent",
  "run_terminal_cmd",
  "read_file",
  "write_file",
  "edit_file",
  "search_replace",
  "list_dir",
  "grep",
] as const;
const GROK_SCOUT_DENY_RULES = [
  "MCPTool(*)",
  "Bash(*)",
  "Edit(*)",
  "Write(*)",
  "Read(*)",
  "Grep(*)",
  "WebFetch(*)",
] as const;
const GROK_SCOUT_DISABLED_MCP_SERVERS = ["gemini-cli", "slack", "vercel", "supabase", "blender", "freecad"] as const;
const GROK_SCOUT_DISABLED_PLUGINS = ["slack", "vercel", "supabase"] as const;
let ACTIVE_RUNNER: ResolvedRunner = RUNNER === "auto" ? "grok_cli" : RUNNER;

if (!(MODES as readonly string[]).includes(MODE)) {
  throw new Error(`Unsupported --mode ${MODE}`);
}

if (!(RUNNERS as readonly string[]).includes(RUNNER)) {
  throw new Error(`Unsupported --runner ${RUNNER}`);
}

function parseScoutTimeoutMs(): number {
  const raw = optionValue("--timeout-ms") ?? process.env.GROK_X_SCOUT_TIMEOUT_MS;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`Unsupported --timeout-ms ${raw}`);
    }
    return Math.floor(parsed);
  }
  if (MODE === "friday_deep") return 420_000;
  if (MODE === "daily_pulse") return 210_000;
  return 60_000;
}

function parsePositiveIntegerOption(raw: string | undefined, label: string): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`Unsupported ${label} ${raw}`);
  }
  return parsed;
}

function parseGrokCliMaxTurns(): number {
  const parsed = parsePositiveIntegerOption(
    optionValue("--max-turns") ?? process.env.GROK_X_SCOUT_MAX_TURNS,
    "--max-turns",
  );
  if (parsed) return parsed;
  if (MODE === "friday_deep") return 18;
  if (MODE === "daily_pulse") return 12;
  return 8;
}

function timeoutLabel(timeoutMs: number): string {
  return timeoutMs >= 1_000 ? `${Math.round(timeoutMs / 1_000)}s` : `${timeoutMs}ms`;
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

function envFileHasNonEmptyValue(key: string, cwd = process.cwd()): boolean {
  try {
    const content = readFileSync(resolve(cwd, ".env.local"), "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const parsedKey = line.slice(0, index).trim();
      if (parsedKey !== key) continue;
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value.trim().length > 0;
    }
  } catch {
    return false;
  }
  return false;
}

export function resolveScoutRunner(
  runner: Runner,
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ResolvedRunner {
  if (runner !== "auto") return runner;
  if ((env.XAI_API_KEY ?? "").trim().length > 0) return "xai_api";
  return envFileHasNonEmptyValue("XAI_API_KEY", cwd) ? "xai_api" : "grok_cli";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function previousDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function renderPrompt(): string {
  const template = readFileSync(resolve(process.cwd(), "docs/reference/grok-x-scout-prompt-v1.md"), "utf-8");
  const trustedGroups = groupAllowedHandles()
    .map((group, index) => `Group ${index + 1}: ${group.map((handle) => `@${handle}`).join(", ")}`)
    .join("\n");

  return template
    .replaceAll("{{RUN_DATE}}", RUN_DATE)
    .replaceAll("{{MODE}}", MODE)
    .replaceAll("{{FROM_DATE}}", previousDate(RUN_DATE, MODE === "friday_deep" ? 7 : 1))
    .concat(`\n\nTrusted handle groups for allowed_x_handles batches:\n${trustedGroups}\n`);
}

function runProcess(
  command: string,
  commandArgs: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let executable = command;
    let args = commandArgs;
    if (process.platform === "win32" && command === "grok") {
      const npmTrampoline = process.env.APPDATA
        ? resolve(process.env.APPDATA, "npm", "node_modules", "@xai-official", "grok", "bin", "grok")
        : null;
      if (npmTrampoline && existsSync(npmTrampoline)) {
        executable = "node";
        args = [npmTrampoline, ...commandArgs];
      } else {
        executable = "grok.cmd";
      }
    }
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    let settled = false;
    let timedOut = false;
    const timeout = SCOUT_TIMEOUT_MS > 0
      ? setTimeout(() => {
          timedOut = true;
          killProcessTree(child);
        }, SCOUT_TIMEOUT_MS)
      : null;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolvePromise(stdout);
    };
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (isGrokCliAuthReauthRequired(stderr)) {
        killProcessTree(child);
        finish(new Error("Grok CLI authentication expired; run `grok login` or set XAI_API_KEY before retrying Track 54."));
      }
    });

    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (timedOut) {
        finish(new Error(`${command} timed out after ${timeoutLabel(SCOUT_TIMEOUT_MS)}: ${stderr || stdout}`));
        return;
      }
      if (code === 0) finish();
      else finish(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

function killProcessTree(child: ChildProcess) {
  if (process.platform === "win32" && child.pid) {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    if (result.status === 0) return;
  }
  child.kill("SIGKILL");
}

function quoteTomlString(value: string): string {
  return JSON.stringify(value);
}

function copyGrokCredentialIfPresent(sourceGrokHome: string, targetGrokHome: string, filename: string) {
  const source = resolve(sourceGrokHome, filename);
  if (existsSync(source)) copyFileSync(source, resolve(targetGrokHome, filename));
}

function renderGrokScoutConfig(): string {
  return [
    "[cli]",
    'installer = "npm"',
    "auto_update = false",
    "",
    "[features]",
    "codebase_indexing = false",
    "lsp_tools = false",
    "",
    "[plugins]",
    "paths = []",
    `disabled = [${GROK_SCOUT_DISABLED_PLUGINS.map(quoteTomlString).join(", ")}]`,
    "",
    ...GROK_SCOUT_DISABLED_MCP_SERVERS.flatMap((server) => [
      `[mcp_servers.${server}]`,
      'command = "node"',
      'args = ["-e", "process.exit(0)"]',
      "enabled = false",
      "",
    ]),
  ].join("\n");
}

export function prepareGrokScoutEnvironment(
  grokWorkingDir: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const grokHome = resolve(grokWorkingDir, ".grok");
  const appData = resolve(grokWorkingDir, "AppData", "Roaming");
  const localAppData = resolve(grokWorkingDir, "AppData", "Local");
  mkdirSync(grokHome, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });

  const sourceHome = baseEnv.GROK_HOME
    ?? (baseEnv.USERPROFILE ? resolve(baseEnv.USERPROFILE, ".grok") : null)
    ?? (baseEnv.HOME ? resolve(baseEnv.HOME, ".grok") : null);
  if (sourceHome) {
    copyGrokCredentialIfPresent(sourceHome, grokHome, "auth.json");
    copyGrokCredentialIfPresent(sourceHome, grokHome, "agent_id");
    copyGrokCredentialIfPresent(sourceHome, grokHome, "models_cache.json");
  }
  writeFileSync(resolve(grokHome, "config.toml"), renderGrokScoutConfig(), "utf-8");

  return {
    ...baseEnv,
    GROK_HOME: grokHome,
    HOME: grokWorkingDir,
    USERPROFILE: grokWorkingDir,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    GROK_SUBAGENTS: "0",
    GROK_MEMORY: "0",
    GROK_DISABLE_UPDATE_CHECK: "1",
    GROK_RESPECT_GITIGNORE: "1",
  };
}

export function buildGrokCliScoutArgs(params: {
  promptPath: string;
  workingDir: string;
  maxTurns?: number;
  model?: string | null;
}): string[] {
  const maxTurns = params.maxTurns ?? GROK_CLI_MAX_TURNS;
  const modelArgs = params.model?.trim() ? ["--model", params.model.trim()] : [];
  return [
    "--no-auto-update",
    ...modelArgs,
    "--prompt-file",
    params.promptPath,
    "--verbatim",
    "--system-prompt-override",
    "Return exactly one raw JSON object to stdout. Do not use markdown, code fences, prose, file links, or commentary. Do not write files. If search evidence is unavailable, return the requested schema with an empty signals array.",
    "--always-approve",
    "--no-plan",
    "--no-subagents",
    "--no-memory",
    "--no-alt-screen",
    "--tools",
    GROK_SCOUT_ALLOWED_TOOLS.join(","),
    "--disallowed-tools",
    GROK_SCOUT_DISALLOWED_TOOLS.join(","),
    ...GROK_SCOUT_DENY_RULES.flatMap((rule) => ["--deny", rule]),
    "--max-turns",
    String(maxTurns),
    "--output-format",
    "json",
    "--cwd",
    params.workingDir,
  ];
}

function grokCliGuardrailSummary() {
  return {
    grok_cli_max_turns: GROK_CLI_MAX_TURNS,
    grok_cli_model: GROK_CLI_MODEL,
    grok_cli_allowed_tools: [...GROK_SCOUT_ALLOWED_TOOLS],
    grok_cli_disallowed_tools: [...GROK_SCOUT_DISALLOWED_TOOLS],
    grok_cli_deny_rules: [...GROK_SCOUT_DENY_RULES],
    grok_cli_disabled_mcp_servers: [...GROK_SCOUT_DISABLED_MCP_SERVERS],
    grok_cli_disabled_plugins: [...GROK_SCOUT_DISABLED_PLUGINS],
  };
}

export function extractGrokCliScoutText(stdout: string): string {
  try {
    const json = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof json.text === "string") return json.text;
  } catch {
    // Raw scout JSON is still accepted below.
  }
  return stdout;
}

export function isGrokCliAuthReauthRequired(stderr: string): boolean {
  return /re-authentication required|Signing in with Grok|Open this URL to sign in|invalid_grant/i.test(stderr);
}

function manualFixture(): string {
  const fixture: XScoutOutput = {
    schema_version: "grok_x_scout_v1",
    run_date: RUN_DATE,
    mode: MODE,
    search_windows: [
      { label: "manual_fixture", from_date: previousDate(RUN_DATE, 1), to_date: RUN_DATE },
    ],
    signals: [
      {
        source_url: "https://x.com/LeftFieldCR/status/123",
        post_id: "123",
        handle: "LeftFieldCR",
        posted_at: `${RUN_DATE}T15:00:00Z`,
        raw_quote: "Planting progress is lagging.",
        summary: "Prairie wheat planting progress is lagging.",
        primary_grain: "Wheat",
        affected_grains: ["Wheat", "Durum"],
        affected_regions: ["Saskatchewan", "Alberta"],
        category: "weather",
        direction: "bullish",
        time_sensitivity: "same_day",
        seasonal_phase: "planting",
        why_it_matters: "Delayed planting can tighten yield expectations.",
        confidence: 0.72,
        needs_official_verification: true,
        claimed_numbers: [],
      },
    ],
    no_signal_notes: [],
  };
  return JSON.stringify(fixture, null, 2);
}

async function runScout(prompt: string, promptPath: string): Promise<string> {
  ACTIVE_RUNNER = resolveScoutRunner(RUNNER);
  if (ACTIVE_RUNNER === "manual") return manualFixture();
  if (ACTIVE_RUNNER === "xai_api") {
    loadEnvFile(resolve(process.cwd(), ".env.local"));
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error("XAI_API_KEY is required for --runner xai_api.");

    const outputs: XScoutOutput[] = [];
    const handleGroups = groupAllowedHandles();
    for (let index = 0; index < handleGroups.length; index += 1) {
      const allowedHandles = handleGroups[index];
      const response = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.XAI_MODEL ?? "grok-4.3",
          input: [{
            role: "user",
            content: `${prompt}\n\nYou are searching trusted handle batch ${index + 1} of ${handleGroups.length}: ${allowedHandles.map((handle) => `@${handle}`).join(", ")}.`,
          }],
          tools: [
            {
              type: "x_search",
              allowed_x_handles: allowedHandles,
              from_date: previousDate(RUN_DATE, MODE === "friday_deep" ? 7 : 1),
              to_date: RUN_DATE,
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`xAI Responses API batch ${index + 1} failed ${response.status}: ${await response.text()}`);
      }
      const json = await response.json() as Record<string, unknown>;
      const text = extractXaiResponseText(json);
      if (!text) {
        throw new Error(`xAI Responses API batch ${index + 1} returned no output_text.`);
      }
      outputs.push(parseGrokXScoutJson(text));
    }
    return JSON.stringify(mergeXScoutOutputs(outputs), null, 2);
  }
  const grokWorkingDir = mkdtempSync(resolve(tmpdir(), "bushel-grok-x-scout-"));
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const grokEnv = prepareGrokScoutEnvironment(grokWorkingDir);
  const stdout = await runProcess(
    "grok",
    buildGrokCliScoutArgs({ promptPath, workingDir: grokWorkingDir, model: GROK_CLI_MODEL }),
    process.cwd(),
    grokEnv,
  );
  return extractGrokCliScoutText(stdout);
}

function extractXaiResponseText(json: Record<string, unknown>): string | null {
  if (typeof json.output_text === "string") return json.output_text;
  const output = Array.isArray(json.output) ? json.output : [];
  for (const item of output) {
    const content = typeof item === "object" && item !== null && Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: Array<Record<string, unknown>> }).content
      : [];
    const textItem = content.find((entry) => entry.type === "output_text" && typeof entry.text === "string");
    if (textItem?.text) return String(textItem.text);
  }
  return null;
}

function createSupabaseClient(): SupabaseClient {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function writeResults(
  supabase: SupabaseClient,
  output: XScoutOutput,
  artifactPath: string,
  artifactHash: string,
  priceSnapshotStatus: PriceSnapshotStatus,
  grainWeek: number,
  accepted: ReturnType<typeof validateXScoutSignal>[],
  rejected: ReturnType<typeof validateXScoutSignal>[],
) {
  const status = rejected.length > 0 && accepted.length > 0 ? "partial" : rejected.length > 0 ? "rejected" : "success";
  const { data: runRow, error: runError } = await supabase
    .from("x_scout_runs")
    .insert({
      run_date: output.run_date,
      run_started_at: new Date().toISOString(),
      run_finished_at: new Date().toISOString(),
      mode: output.mode,
      runner: ACTIVE_RUNNER,
      status,
      prompt_version: PROMPT_VERSION,
      artifact_path: artifactPath,
      artifact_sha256: artifactHash,
      raw_signal_count: output.signals.length,
      accepted_signal_count: accepted.length,
      rejected_signal_count: rejected.length,
      price_snapshot_required: true,
      price_snapshot_status: priceSnapshotStatus,
      metadata: {
        no_signal_notes: output.no_signal_notes,
        rejection_reasons: uniqueSorted(rejected.flatMap((validation) => validation.reasons)),
        rejected_signal_audits: rejected.map((validation) => ({
          signal_hash: validation.signalHash,
          reasons: validation.reasons,
          blocked_claims: validation.metadata.blocked_claims,
          source_tier: validation.metadata.source_tier,
          staleness_class: validation.metadata.staleness_class,
        })),
      },
    })
    .select("id")
    .single();

  if (runError) throw new Error(`x_scout_runs insert failed: ${runError.message}`);

  const scoutRunId = String(runRow.id);
  const acceptedRows = output.signals
    .map((signal) => ({ signal, validation: accepted.find((item) => item.signalHash === sha256([
      signal.source_url ?? "",
      signal.post_id ?? "",
      signal.handle.toLowerCase(),
      signal.posted_at,
      signal.primary_grain,
      signal.summary,
    ].join("|"))) }))
    .filter((item): item is { signal: XScoutOutput["signals"][number]; validation: ReturnType<typeof validateXScoutSignal> } => Boolean(item.validation))
    .map(({ signal, validation }) => {
      const valuation = scoreXSignalImpact(signal, output.run_date);
      return {
        grain: signal.primary_grain,
        crop_year: CROP_YEAR,
        grain_week: grainWeek,
        post_summary: signal.summary,
        post_author: signal.handle,
        post_date: signal.posted_at,
        relevance_score: valuation.relevanceScore,
        sentiment: signal.direction,
        category: signal.category,
        confidence_score: Math.round(signal.confidence * 100),
        search_query: `${output.mode}:${signal.primary_grain}`,
        raw_context: signal,
        post_url: signal.source_url ?? null,
        searched_at: new Date().toISOString(),
        source: "x",
        search_mode: output.mode === "friday_deep" ? "deep" : "pulse",
        scout_run_id: scoutRunId,
        source_cred_tier: validation.metadata.source_tier,
        primary_impact_grain: signal.primary_grain,
        affected_grains: uniqueSorted([signal.primary_grain, ...signal.affected_grains]),
        affected_regions: uniqueSorted(signal.affected_regions),
        affected_decisions: validation.metadata.affected_decisions,
        seasonal_phase: validation.metadata.seasonal_phase,
        signal_metadata: validation.metadata,
        signal_hash: validation.signalHash,
      };
    });

  if (acceptedRows.length > 0) {
    const { error } = await supabase
      .from("x_market_signals")
      .upsert(acceptedRows, { onConflict: "signal_hash" });
    if (error) throw new Error(`x_market_signals upsert failed: ${error.message}`);
  }

  return scoutRunId;
}

async function getLatestCgcGrainWeek(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("cgc_observations")
    .select("grain_week")
    .eq("crop_year", CROP_YEAR)
    .order("grain_week", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to resolve latest CGC grain week: ${error.message}`);
  const grainWeek = Number(data?.[0]?.grain_week);
  if (!Number.isFinite(grainWeek) || grainWeek <= 0) {
    throw new Error(`Could not resolve latest CGC grain week for crop year ${CROP_YEAR}. Pass --grain-week explicitly.`);
  }
  return grainWeek;
}

async function getPriceSnapshotStatus(): Promise<PriceSnapshotStatus> {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("grain_prices")
      .select("price_date")
      .lte("price_date", RUN_DATE)
      .order("price_date", { ascending: false })
      .limit(1);

    if (error) return "not_checked";
    const latestDate = data?.[0]?.price_date;
    if (typeof latestDate !== "string") return "missing";

    const latest = new Date(`${latestDate}T00:00:00Z`);
    const runDate = new Date(`${RUN_DATE}T00:00:00Z`);
    const ageDays = Math.floor((runDate.getTime() - latest.getTime()) / 86_400_000);
    if (ageDays <= 2) return "fresh";
    return "stale";
  } catch {
    return "not_checked";
  }
}

async function main() {
  const artifactDir = resolve(process.cwd(), "data", "X Scout Runs", RUN_DATE);
  mkdirSync(artifactDir, { recursive: true });
  const canonicalRawPath = resolve(artifactDir, `${MODE}-raw.json`);
  const artifactStem = existsSync(canonicalRawPath) ? `${MODE}-${timestampSuffix()}` : MODE;

  const prompt = renderPrompt();
  const promptPath = resolve(artifactDir, `${artifactStem}-prompt.md`);
  writeFileSync(promptPath, prompt, "utf-8");

  const rawPath = resolve(artifactDir, `${artifactStem}-raw.json`);
  let rawOutput: string;
  try {
    rawOutput = await runScout(prompt, promptPath);
  } catch (error) {
    writeFailureSummary({ artifactDir, artifactStem, promptPath, rawPath, error });
    throw error;
  }
  writeFileSync(rawPath, rawOutput, "utf-8");
  let parsed: XScoutOutput;
  let priceSnapshotStatus: PriceSnapshotStatus;
  try {
    parsed = parseGrokXScoutJson(rawOutput);
    priceSnapshotStatus = await getPriceSnapshotStatus();
  } catch (error) {
    writeFailureSummary({ artifactDir, artifactStem, promptPath, rawPath, error });
    throw error;
  }
  const artifactHash = sha256(rawOutput);

  const validations = parsed.signals.map((signal) =>
    validateXScoutSignal(signal, {
      runDate: parsed.run_date,
      mode: parsed.mode,
      priceSnapshotStatus,
    }),
  );
  const accepted = validations.filter((validation) => validation.accepted);
  const rejected = validations.filter((validation) => !validation.accepted);

  let scoutRunId: string | null = null;
  let resolvedGrainWeek = GRAIN_WEEK;
  if (WRITE) {
    const supabase = createSupabaseClient();
    resolvedGrainWeek ??= await getLatestCgcGrainWeek(supabase);
    scoutRunId = await writeResults(
      supabase,
      parsed,
      rawPath,
      artifactHash,
      priceSnapshotStatus,
      resolvedGrainWeek,
      accepted,
      rejected,
    );
  }

  const summary = {
    dry_run: DRY_RUN,
    write: WRITE,
    mode: MODE,
    runner: ACTIVE_RUNNER,
    runner_requested: RUNNER,
    run_date: RUN_DATE,
    prompt_path: promptPath,
    artifact_path: rawPath,
    artifact_sha256: artifactHash,
    grain_week: resolvedGrainWeek,
    price_snapshot_status: priceSnapshotStatus,
    raw_signal_count: parsed.signals.length,
    accepted_signal_count: accepted.length,
    rejected_signal_count: rejected.length,
    rejection_reasons: rejected.map((validation) => validation.reasons),
    rejection_reason_summary: uniqueSorted(rejected.flatMap((validation) => validation.reasons)),
    scout_run_id: scoutRunId,
    ...grokCliGuardrailSummary(),
  };
  console.log(JSON.stringify(writeSummaryFiles({ artifactDir, artifactStem, summary }), null, 2));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeSummaryFiles(params: {
  artifactDir: string;
  artifactStem: string;
  summary: Record<string, unknown>;
}) {
  const { artifactDir, artifactStem, summary } = params;
  const latestSummaryPath = resolve(artifactDir, `${MODE}-summary.json`);
  const runSummaryPath = resolve(artifactDir, `${artifactStem}-summary.json`);
  const latestSummary = { ...summary, summary_path: latestSummaryPath };
  writeFileSync(latestSummaryPath, JSON.stringify(latestSummary, null, 2), "utf-8");
  if (runSummaryPath !== latestSummaryPath) {
    writeFileSync(runSummaryPath, JSON.stringify({ ...summary, summary_path: runSummaryPath }, null, 2), "utf-8");
  }
  return latestSummary;
}

function writeFailureSummary(params: {
  artifactDir: string;
  artifactStem: string;
  promptPath: string;
  rawPath: string;
  error: unknown;
}) {
  const { artifactDir, artifactStem, promptPath, rawPath, error } = params;
  writeSummaryFiles({
    artifactDir,
    artifactStem,
    summary: {
      dry_run: DRY_RUN,
      write: WRITE,
      status: "failed",
      mode: MODE,
      runner: ACTIVE_RUNNER,
      runner_requested: RUNNER,
      run_date: RUN_DATE,
      prompt_path: promptPath,
      artifact_path: rawPath,
      artifact_sha256: null,
      grain_week: GRAIN_WEEK,
      price_snapshot_status: "not_checked",
      raw_signal_count: 0,
      accepted_signal_count: 0,
      rejected_signal_count: 0,
      rejection_reasons: [],
      rejection_reason_summary: ["scout_run_failed"],
      scout_run_id: null,
      parse_status: "failed",
      error_message: errorMessage(error),
      timeout_ms: SCOUT_TIMEOUT_MS,
      ...grokCliGuardrailSummary(),
    },
  });
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
