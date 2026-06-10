#!/usr/bin/env npx tsx
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkCodexAutomations,
  checkWriteAutomationsDisabled,
  type CodexAutomationCheck,
  type Track54ModeGate,
  type Track54ReadinessReport,
  type WriteAutomationCheck,
} from "./build-track54-readiness-report";
import {
  loadTrack54ReadinessReport,
  track54NextSafeOperatorAction,
} from "./summarize-track54-readiness-report";

type AutomationRunOutcome = "success" | "failed" | "blocked" | "unknown" | "not_run";

interface Track54AutomationMemorySummary {
  memory_path: string;
  memory_found: boolean;
  memory_updated_at: string | null;
  run_dates: string[];
  latest_run_date: string | null;
  latest_run_outcome: AutomationRunOutcome;
  latest_run_excerpt: string[];
}

export interface Track54AutomationRunCheck {
  id: string;
  role: string;
  observed_status: CodexAutomationCheck["observed_status"];
  observed_kind: string | null;
  expected_schedule: string;
  observed_rrule: string | null;
  manifest_path: string | null;
  manifest_updated_at: string | null;
  manifest_ready: boolean;
  prompt_boundary_present: boolean | null;
  forbidden_prompt_boundary_present: boolean | null;
  missing_prompt_fragments: string[];
  present_forbidden_prompt_fragments: string[];
  run_memory: Track54AutomationMemorySummary;
  latest_run_superseded_by_manifest_update: boolean;
}

export interface Track54AutomationRunSummary {
  schema_version: "track54_automation_run_summary_v1";
  checked_at: string;
  automation_root: string;
  readiness_report_path: string;
  readiness_report_generated_at: string;
  readiness_overall_status: Track54ReadinessReport["overall_status"];
  production_writes_enabled: Track54ReadinessReport["production_writes_enabled"];
  mode_gate_snapshot: Array<{
    mode: Track54ModeGate["mode"];
    artifact_days_found: number;
    required_artifact_days: number;
    clean_artifact_days_found: number;
    missing_clean_artifact_days: number;
    earliest_candidate_date: string | null;
    accepted_signal_count: number;
    accepted_decision_grade_count: number;
    next_eligible_run_dates: string[];
  }>;
  automation_run_checks: Track54AutomationRunCheck[];
  write_automation_checks: WriteAutomationCheck[];
  automations_with_run_memory: number;
  automations_with_failed_or_blocked_latest_run: string[];
  write_automations_safe: boolean;
  no_write_manifests_ready: boolean;
  completion_blockers: string[];
  next_safe_operator_action: string;
}

const args = process.argv.slice(2);
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
const DEFAULT_REPORT_PATH = "scratch/track54-readiness/latest-readiness-report.json";

function optionValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function defaultAutomationRoot(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return resolve(home, ".codex", "automations");
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function redactPotentialSecret(line: string): string {
  return line
    .replace(/(XAI_API_KEY\s*=\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
}

function classifyRunOutcome(text: string): AutomationRunOutcome {
  const lower = text.toLowerCase();
  if (lower.includes("retry_blocked_by_grok_preflight")
    || lower.includes("blocked by grok preflight")
    || lower.includes("blocked retry at preflight")
    || lower.includes("retry was blocked at preflight")
    || lower.includes("auth is expired")
    || lower.includes("credentials fail")
    || lower.includes("credential_ok\": false")) {
    return "blocked";
  }
  if (lower.includes("failure:")
    || lower.includes(" failed")
    || lower.includes("exited 1")
    || lower.includes("exit code `1`")
    || lower.includes("exit code 1")
    || lower.includes("nonzero")) {
    return "failed";
  }
  if (lower.includes("succeeded")
    || lower.includes("success")
    || lower.includes("was present and valid")
    || lower.includes("no retry was run")) {
    return "success";
  }
  return "unknown";
}

function memoryEntries(content: string): Array<{ date: string; body: string }> {
  const matches = Array.from(content.matchAll(/^(?:#{1,6}\s*)?(\d{4}-\d{2}-\d{2})(?:\s+run[^\n]*)?:?.*$/gim));
  if (matches.length === 0) return [];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? content.length;
    return {
      date: match[1]!,
      body: content.slice(start, end).trim(),
    };
  });
}

export function summarizeTrack54AutomationMemory(
  automationRoot: string,
  automationId: string,
  maxExcerptLines = 8,
): Track54AutomationMemorySummary {
  const memoryPath = resolve(automationRoot, automationId, "memory.md");
  if (!existsSync(memoryPath)) {
    return {
      memory_path: memoryPath,
      memory_found: false,
      memory_updated_at: null,
      run_dates: [],
      latest_run_date: null,
      latest_run_outcome: "not_run",
      latest_run_excerpt: [],
    };
  }

  const content = readFileSync(memoryPath, "utf-8");
  const entries = memoryEntries(content);
  const latestEntry = entries.at(-1);
  const latestText = latestEntry?.body ?? content;
  const excerpt = latestText
    .split(/\r?\n/)
    .map((line) => redactPotentialSecret(line.trim()))
    .filter(Boolean)
    .slice(0, maxExcerptLines);

  return {
    memory_path: memoryPath,
    memory_found: true,
    memory_updated_at: statSync(memoryPath).mtime.toISOString(),
    run_dates: unique(entries.map((entry) => entry.date)),
    latest_run_date: latestEntry?.date ?? null,
    latest_run_outcome: classifyRunOutcome(latestText),
    latest_run_excerpt: excerpt,
  };
}

function manifestReady(check: CodexAutomationCheck): boolean {
  return check.observed_status === "active"
    && check.schedule_boundary_present !== false
    && check.cwd_boundary_present !== false
    && check.kind_boundary_present !== false
    && check.target_thread_boundary_present !== false
    && check.prompt_boundary_present === true
    && check.forbidden_prompt_boundary_present === true;
}

function automationManifestUpdatedAt(manifestPath: string | null): string | null {
  if (!manifestPath || !existsSync(manifestPath)) return null;
  const content = readFileSync(manifestPath, "utf-8");
  const updatedAtMatch = content.match(/^updated_at\s*=\s*(\d+)\s*$/m);
  if (updatedAtMatch?.[1]) {
    const timestamp = Number(updatedAtMatch[1]);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return statSync(manifestPath).mtime.toISOString();
}

function latestRunSupersededByManifestUpdate(
  runMemory: Track54AutomationMemorySummary,
  manifestUpdatedAt: string | null,
): boolean {
  if (!manifestUpdatedAt || !runMemory.memory_updated_at) return false;
  if (!["failed", "blocked"].includes(runMemory.latest_run_outcome)) return false;
  return new Date(runMemory.memory_updated_at).getTime() < new Date(manifestUpdatedAt).getTime();
}

export function summarizeTrack54AutomationRuns(options: {
  automationRoot?: string;
  reportPath?: string;
  report?: Track54ReadinessReport;
  automationChecks?: CodexAutomationCheck[];
  writeAutomationChecks?: WriteAutomationCheck[];
  now?: Date;
  maxExcerptLines?: number;
} = {}): Track54AutomationRunSummary {
  const automationRoot = resolve(options.automationRoot ?? defaultAutomationRoot());
  const reportPath = resolve(options.reportPath ?? DEFAULT_REPORT_PATH);
  const report = options.report ?? loadTrack54ReadinessReport(reportPath);
  const automationChecks = options.automationChecks ?? checkCodexAutomations(automationRoot);
  const writeAutomationChecks = options.writeAutomationChecks ?? checkWriteAutomationsDisabled(automationRoot);
  const maxExcerptLines = options.maxExcerptLines ?? 8;
  const automationRunChecks = automationChecks.map((check) => {
    const runMemory = summarizeTrack54AutomationMemory(automationRoot, check.id, maxExcerptLines);
    const manifestUpdatedAt = automationManifestUpdatedAt(check.manifest_path);
    const latestRunSuperseded = latestRunSupersededByManifestUpdate(runMemory, manifestUpdatedAt);
    return {
      id: check.id,
      role: check.role,
      observed_status: check.observed_status,
      observed_kind: check.observed_kind ?? null,
      expected_schedule: check.expected_schedule,
      observed_rrule: check.observed_rrule,
      manifest_path: check.manifest_path,
      manifest_updated_at: manifestUpdatedAt,
      manifest_ready: manifestReady(check),
      prompt_boundary_present: check.prompt_boundary_present,
      forbidden_prompt_boundary_present: check.forbidden_prompt_boundary_present,
      missing_prompt_fragments: check.missing_prompt_fragments,
      present_forbidden_prompt_fragments: check.present_forbidden_prompt_fragments,
      run_memory: runMemory,
      latest_run_superseded_by_manifest_update: latestRunSuperseded,
    };
  });
  const failedOrBlocked = automationRunChecks
    .filter((check) =>
      ["failed", "blocked"].includes(check.run_memory.latest_run_outcome)
      && !check.latest_run_superseded_by_manifest_update
    )
    .map((check) => check.id);
  const writeAutomationsSafe = writeAutomationChecks.every((check) => check.safe_until_human_approval);
  const noWriteManifestsReady = automationRunChecks.every((check) => check.manifest_ready);

  return {
    schema_version: "track54_automation_run_summary_v1",
    checked_at: (options.now ?? new Date()).toISOString(),
    automation_root: automationRoot,
    readiness_report_path: reportPath,
    readiness_report_generated_at: report.generated_at,
    readiness_overall_status: report.overall_status,
    production_writes_enabled: report.production_writes_enabled,
    mode_gate_snapshot: report.mode_gates.map((gate) => ({
      mode: gate.mode,
      artifact_days_found: gate.review_window.artifact_days_found,
      required_artifact_days: gate.review_window.required_artifact_days,
      clean_artifact_days_found: gate.artifact_gate_projection.clean_artifact_days_found,
      missing_clean_artifact_days: gate.artifact_gate_projection.missing_clean_artifact_days,
      earliest_candidate_date: gate.artifact_gate_projection.earliest_candidate_date,
      accepted_signal_count: gate.evidence.accepted_signal_count,
      accepted_decision_grade_count: gate.evidence.accepted_decision_grade_count,
      next_eligible_run_dates: gate.artifact_gate_projection.next_eligible_run_dates,
    })),
    automation_run_checks: automationRunChecks,
    write_automation_checks: writeAutomationChecks,
    automations_with_run_memory: automationRunChecks.filter((check) => check.run_memory.memory_found).length,
    automations_with_failed_or_blocked_latest_run: failedOrBlocked,
    write_automations_safe: writeAutomationsSafe,
    no_write_manifests_ready: noWriteManifestsReady,
    completion_blockers: report.completion_blockers,
    next_safe_operator_action: track54NextSafeOperatorAction(report),
  };
}

if (IS_CLI && (hasFlag("--help") || hasFlag("-h"))) {
  console.error(`
Track 54 Automation Run Summary

Usage:
  npm --silent run track54:automation-runs
  npm --silent run track54:automation-runs -- --report scratch/track54-readiness/latest-readiness-report.json

Options:
  --automation-root <path>  Defaults to %USERPROFILE%/.codex/automations.
  --report <path>           Persisted readiness report JSON path.
  --max-excerpt-lines <n>   Memory excerpt line count per automation. Default: 8.
`);
  process.exit(0);
}

if (IS_CLI) {
  try {
    const summary = summarizeTrack54AutomationRuns({
      automationRoot: optionValue("--automation-root"),
      reportPath: optionValue("--report") ?? DEFAULT_REPORT_PATH,
      maxExcerptLines: parsePositiveInteger(optionValue("--max-excerpt-lines"), 8),
    });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
