#!/usr/bin/env npx tsx
/**
 * Bridges a Hermes/Grok 4.3 shadow X scout response into the existing Track 54
 * no-write artifact contract. This never writes Supabase rows.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { groupAllowedHandles } from "@/lib/x-api/trusted-accounts";
import { track54AutomationDateKey } from "@/lib/x-api/track54-date";
import { parseGrokXScoutJson, type XScoutMode, type XScoutOutput } from "@/lib/x-api/x-scout-contract";
import { validateXScoutSignal } from "@/lib/x-api/x-signal-validation";
import type { PriceSnapshotStatus } from "@/lib/x-api/x-signal-valuation";

const args = process.argv.slice(2);
const POSITIONAL_ARGS = args.filter((arg) => !arg.startsWith("--"));
const MODES = ["daily_pulse", "friday_deep", "manual_test"] as const;
const PRICE_STATUSES = ["not_checked", "fresh", "stale", "missing", "partial"] as const;
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

export interface HermesXScoutBridgeOptions {
  cwd?: string;
  mode?: XScoutMode;
  runDate?: string;
  rawInput?: string;
  rawFile?: string;
  artifactRoot?: string;
  artifactStem?: string;
  priceSnapshotStatus?: PriceSnapshotStatus;
  promptOnly?: boolean;
}

export interface HermesXScoutBridgeResult {
  schema_version: "hermes_x_scout_bridge_v1";
  dry_run: true;
  write: false;
  mode: XScoutMode;
  runner: "hermes_grok_4_3";
  runner_requested: "hermes_grok_4_3";
  run_date: string;
  artifact_stem: string;
  prompt_path: string;
  raw_target_path: string;
  summary_target_path: string;
  artifact_path: string | null;
  artifact_sha256: string | null;
  price_snapshot_status: PriceSnapshotStatus;
  raw_signal_count: number | null;
  accepted_signal_count: number | null;
  rejected_signal_count: number | null;
  rejection_reasons?: string[][];
  rejection_reason_summary?: string[];
  scout_run_id: null;
  summary_path: string | null;
  raw_input_path?: string | null;
  normalized_from_markdown: boolean;
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
Hermes X Scout Artifact Bridge

Usage:
  npx tsx scripts/build-hermes-x-scout-artifact.ts --prompt-only --mode daily_pulse --date 2026-06-08
  npx tsx scripts/build-hermes-x-scout-artifact.ts --mode daily_pulse --date 2026-06-08 --raw-file scratch/hermes-output.json --price-snapshot-status fresh

Options:
  --mode daily_pulse|friday_deep|manual_test   Defaults to daily_pulse.
  --date YYYY-MM-DD                            Defaults to the current Track 54 local automation date.
  --raw-file <path>                            Raw Hermes/Grok JSON response to import.
  --artifact-root <path>                       Defaults to data/X Scout Runs.
  --artifact-stem <stem>                       Reuse the prompt stem for raw/summary artifacts.
  --price-snapshot-status <status>             not_checked|fresh|stale|missing|partial. Defaults to not_checked.
  --prompt-only                                Only write the Hermes prompt file.
`);
  process.exit(0);
}

function previousDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function parsePriceSnapshotStatus(value: string | undefined): PriceSnapshotStatus {
  if (!value) return "not_checked";
  if ((PRICE_STATUSES as readonly string[]).includes(value)) return value as PriceSnapshotStatus;
  throw new Error(`Unsupported --price-snapshot-status ${value}`);
}

function modeFromInput(value: string | undefined): XScoutMode {
  if (!value) return "daily_pulse";
  if ((MODES as readonly string[]).includes(value)) return value as XScoutMode;
  throw new Error(`Unsupported --mode ${value}`);
}

export function buildHermesXScoutPrompt(params: {
  cwd: string;
  mode: XScoutMode;
  runDate: string;
  artifactStem: string;
  artifactRoot: string;
}): string {
  const { cwd, mode, runDate, artifactStem, artifactRoot } = params;
  const windowDays = mode === "friday_deep" ? 7 : 1;
  const fromDate = previousDate(runDate, windowDays);
  const trustedGroups = groupAllowedHandles()
    .map((group, index) => `Batch ${index + 1}: ${group.map((handle) => `@${handle}`).join(", ")}`)
    .join("\n");
  const artifactDir = resolve(cwd, artifactRoot, runDate);
  const rawPath = resolve(artifactDir, `${artifactStem}-raw.json`);
  const summaryPath = resolve(artifactDir, `${artifactStem}-summary.json`);

  return `You are the Bushel Board X insight scout running inside Hermes with Grok 4.3 selected.

Your job is to search X for source-linked market context that may matter to prairie farmers before the daily or Friday thesis review.

You are not the thesis writer.
You are not allowed to publish, rank, or update the final Bushel Board thesis.
You must not write Supabase rows.
You must not call /api/pipeline/run.
You must not write market_analysis, us_market_analysis, score_trajectory, us_score_trajectory, x_market_signals, x_scout_runs, or thesis_packet_cache.
You create local no-write evidence only. Codex will save and validate your response later.

Run context:
- Workspace: ${cwd}
- Run date: ${runDate} in America/Edmonton local date
- Mode: ${mode}
- Search window: ${fromDate} to ${runDate}
- Intended local raw artifact path: ${rawPath}
- Intended local summary path: ${summaryPath}

Search rules:
- Use x_search, not general web search, for X evidence.
- Prefer trusted handles.
- Use allowed_x_handles in batches of 10 or fewer.
- If x_search returns degraded=true, do not use that answer as evidence.
- If a result has no citation or canonical x.com/twitter.com URL, do not include it as a signal.
- Short quotes only. Never paste long post text.
- Do not include buy, sell, trade, price target, hedging advice, pricing advice, or financial advice wording.
- Numeric claims must set needs_official_verification=true unless they are already tied to an official source post.
- Unsupported grains can go into no_signal_notes only, never signals.
- Daily pulse must stay in the strict one-day window. If broader context appears relevant, put it in no_signal_notes only.
- A quiet day is acceptable. Return signals: [] and explain the quiet read in no_signal_notes.

Trusted handle batches:
${trustedGroups}

Search themes:
- Prairie wheat, durum, canola, barley, oats movement
- Basis, elevator bids, cash movement, farmer selling
- CGC flow, terminal movement, rail, vessels, producer cars
- Crop progress, seeding, harvest, weather stress, frost, drought, excess rain
- Export demand, China, Mexico, Japan, EU, Black Sea, Australia
- USDA crop condition, export sales, CFTC positioning, WASDE reaction
- Policy, tariffs, biofuel, rail disruption, port disruption

Return exactly one raw JSON object. No markdown. No commentary. No code fence.

Schema:
{
  "schema_version": "grok_x_scout_v1",
  "run_date": "${runDate}",
  "mode": "${mode}",
  "search_windows": [
    {
      "label": "${mode === "friday_deep" ? "prior_7_days" : "previous_24h"}",
      "from_date": "${fromDate}",
      "to_date": "${runDate}"
    }
  ],
  "signals": [],
  "no_signal_notes": []
}

Each signal:
{
  "source_url": "https://x.com/handle/status/123",
  "post_id": "123",
  "handle": "handle",
  "posted_at": "${runDate}T15:00:00Z",
  "raw_quote": "short excerpt only",
  "summary": "one sentence summary",
  "primary_grain": "Canola",
  "affected_grains": ["Canola"],
  "affected_regions": ["Saskatchewan"],
  "category": "weather",
  "direction": "bullish",
  "time_sensitivity": "same_day",
  "seasonal_phase": "planting",
  "why_it_matters": "one sentence explaining inspection value",
  "confidence": 0.71,
  "needs_official_verification": true,
  "claimed_numbers": []
}
`;
}

function extractJsonCandidate(raw: string): { jsonText: string; normalizedFromMarkdown: boolean } {
  const trimmed = raw.trim();
  try {
    parseGrokXScoutJson(trimmed);
    return { jsonText: trimmed, normalizedFromMarkdown: false };
  } catch {
    // Continue with conservative extraction below.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1).trim();
  if (!candidate || !candidate.startsWith("{") || !candidate.endsWith("}")) {
    throw new Error("Hermes X scout response did not contain one JSON object.");
  }
  parseGrokXScoutJson(candidate);
  return { jsonText: candidate, normalizedFromMarkdown: true };
}

export function normalizeHermesXScoutRawJson(raw: string): {
  output: XScoutOutput;
  normalizedJson: string;
  normalizedFromMarkdown: boolean;
} {
  const candidate = extractJsonCandidate(raw);
  const output = parseGrokXScoutJson(candidate.jsonText);
  return {
    output,
    normalizedJson: JSON.stringify(output, null, 2),
    normalizedFromMarkdown: candidate.normalizedFromMarkdown,
  };
}

function readRawInput(options: HermesXScoutBridgeOptions): { raw: string | null; rawInputPath: string | null } {
  if (options.rawInput !== undefined) return { raw: options.rawInput, rawInputPath: options.rawFile ?? null };
  if (options.rawFile) return { raw: readFileSync(resolve(options.cwd ?? process.cwd(), options.rawFile), "utf-8"), rawInputPath: resolve(options.cwd ?? process.cwd(), options.rawFile) };
  if (!process.stdin.isTTY) return { raw: readFileSync(0, "utf-8"), rawInputPath: null };
  return { raw: null, rawInputPath: null };
}

function assertOutputIdentity(output: XScoutOutput, expected: { mode: XScoutMode; runDate: string }) {
  if (output.mode !== expected.mode) {
    throw new Error(`Hermes output mode ${output.mode} does not match expected ${expected.mode}`);
  }
  if (output.run_date !== expected.runDate) {
    throw new Error(`Hermes output run_date ${output.run_date} does not match expected ${expected.runDate}`);
  }
}

export function buildHermesXScoutArtifact(options: HermesXScoutBridgeOptions = {}): HermesXScoutBridgeResult {
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode ?? "daily_pulse";
  const runDate = options.runDate ?? track54AutomationDateKey();
  const artifactRoot = options.artifactRoot ?? resolve("data", "X Scout Runs");
  const priceSnapshotStatus = options.priceSnapshotStatus ?? "not_checked";
  const artifactDir = resolve(cwd, artifactRoot, runDate);
  const artifactStem = options.artifactStem ?? `${mode}-hermes-${timestampSuffix()}`;
  mkdirSync(artifactDir, { recursive: true });

  const promptPath = resolve(artifactDir, `${artifactStem}-prompt.md`);
  const rawPath = resolve(artifactDir, `${artifactStem}-raw.json`);
  const summaryPath = resolve(artifactDir, `${artifactStem}-summary.json`);
  const prompt = buildHermesXScoutPrompt({ cwd, mode, runDate, artifactRoot, artifactStem });
  writeFileSync(promptPath, prompt, "utf-8");

  const promptOnly = options.promptOnly ?? false;
  const rawInput = promptOnly ? { raw: null, rawInputPath: null } : readRawInput(options);
  if (!rawInput.raw) {
    return {
      schema_version: "hermes_x_scout_bridge_v1",
      dry_run: true,
      write: false,
      mode,
      runner: "hermes_grok_4_3",
      runner_requested: "hermes_grok_4_3",
      run_date: runDate,
      artifact_stem: artifactStem,
      prompt_path: promptPath,
      raw_target_path: rawPath,
      summary_target_path: summaryPath,
      artifact_path: null,
      artifact_sha256: null,
      price_snapshot_status: priceSnapshotStatus,
      raw_signal_count: null,
      accepted_signal_count: null,
      rejected_signal_count: null,
      scout_run_id: null,
      summary_path: null,
      raw_input_path: rawInput.rawInputPath,
      normalized_from_markdown: false,
      next_actions: [
        "Paste the prompt into Hermes with Grok 4.3 selected.",
        "Save the raw JSON response to a scratch file.",
        "Run this script again with --raw-file <path> and a real --price-snapshot-status if price proof is fresh.",
      ],
    };
  }

  const normalized = normalizeHermesXScoutRawJson(rawInput.raw);
  assertOutputIdentity(normalized.output, { mode, runDate });
  writeFileSync(rawPath, normalized.normalizedJson, "utf-8");
  const artifactHash = sha256(normalized.normalizedJson);
  const validations = normalized.output.signals.map((signal) =>
    validateXScoutSignal(signal, {
      runDate: normalized.output.run_date,
      mode: normalized.output.mode,
      priceSnapshotStatus,
    }),
  );
  const accepted = validations.filter((validation) => validation.accepted);
  const rejected = validations.filter((validation) => !validation.accepted);
  const summary = {
    dry_run: true as const,
    write: false as const,
    mode,
    runner: "hermes_grok_4_3" as const,
    runner_requested: "hermes_grok_4_3" as const,
    run_date: runDate,
    artifact_stem: artifactStem,
    prompt_path: promptPath,
    raw_target_path: rawPath,
    summary_target_path: summaryPath,
    artifact_path: rawPath,
    artifact_sha256: artifactHash,
    grain_week: null,
    price_snapshot_status: priceSnapshotStatus,
    raw_signal_count: normalized.output.signals.length,
    accepted_signal_count: accepted.length,
    rejected_signal_count: rejected.length,
    rejection_reasons: rejected.map((validation) => validation.reasons),
    rejection_reason_summary: uniqueSorted(rejected.flatMap((validation) => validation.reasons)),
    scout_run_id: null,
    raw_input_path: rawInput.rawInputPath,
    normalized_from_markdown: normalized.normalizedFromMarkdown,
    summary_path: summaryPath,
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");

  return {
    schema_version: "hermes_x_scout_bridge_v1",
    ...summary,
    artifact_sha256: artifactHash,
    scout_run_id: null,
    next_actions: [
      "Run the existing Track 54 artifact reviewer before treating the Hermes output as gate evidence.",
      "Do not enable write-mode automation from this shadow artifact.",
    ],
  };
}

if (IS_CLI) {
  const positionalMode = POSITIONAL_ARGS.find((arg): arg is XScoutMode =>
    (MODES as readonly string[]).includes(arg),
  );
  const positionalDate = POSITIONAL_ARGS.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  const result = buildHermesXScoutArtifact({
    mode: modeFromInput(optionValue("--mode") ?? positionalMode),
    runDate: optionValue("--date") ?? positionalDate ?? track54AutomationDateKey(),
    rawFile: optionValue("--raw-file"),
    artifactRoot: optionValue("--artifact-root"),
    artifactStem: optionValue("--artifact-stem"),
    priceSnapshotStatus: parsePriceSnapshotStatus(optionValue("--price-snapshot-status")),
    promptOnly: hasFlag("--prompt-only"),
  });
  console.log(JSON.stringify(result, null, 2));
}
