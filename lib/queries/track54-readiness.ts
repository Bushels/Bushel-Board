import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_READINESS_REPORT_PATH = "scratch/track54-readiness/latest-readiness-report.json";
const DEFAULT_MAX_READINESS_REPORT_AGE_HOURS = 8;
const DEFAULT_MAX_BROWSER_SMOKE_AGE_HOURS = 6;

export type Track54ReadinessMode = "daily_pulse" | "friday_deep";

export interface Track54ReadinessModeGateSnapshot {
  mode: Track54ReadinessMode;
  readinessStatus: string;
  reviewVerdict: string;
  promotionStatus: string;
  artifactDaysFound: number;
  requiredArtifactDays: number;
  acceptedSignalCount: number;
  acceptedDecisionGradeCount: number;
  nextEligibleRunDates: string[];
  promotionBlockers: string[];
}

export interface Track54GrokRunnerSnapshot {
  ok: boolean | null;
  credentialSource: string | null;
  credentialIssue: string | null;
  xaiApiKeyPresent: boolean | null;
  cliAuthFilePresent: boolean | null;
  cliAuthExpiresAt: string | null;
  cliAuthExpired: boolean | null;
}

export interface Track54BrowserSmokeProofSnapshot {
  checked: boolean | null;
  ok: boolean | null;
  generatedAt: string | null;
  ageHours: number | null;
  freshEnough: boolean;
}

export interface Track54ReadinessSnapshot {
  generatedAt: string;
  reportAgeHours: number | null;
  reportFreshEnough: boolean;
  overallStatus: string;
  productionWritesEnabled: boolean;
  humanApprovalRequiredBeforeWrites: boolean;
  browserSmokeClean: boolean;
  browserSmokeProof: Track54BrowserSmokeProofSnapshot | null;
  grokRunner: Track54GrokRunnerSnapshot | null;
  modeGates: Track54ReadinessModeGateSnapshot[];
  completionBlockers: string[];
  nextActions: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function hoursBetween(later: Date, earlierIso: string | null): number | null {
  if (!earlierIso) return null;
  const earlier = new Date(earlierIso);
  const diffMs = later.getTime() - earlier.getTime();
  if (!Number.isFinite(diffMs)) return null;
  return Math.round((diffMs / (60 * 60 * 1000)) * 100) / 100;
}

function normalizeGrokRunner(value: unknown): Track54GrokRunnerSnapshot | null {
  const proof = asRecord(value);
  const hasCredentialFields = [
    "ok",
    "credential_source",
    "credential_issue",
    "xai_api_key_present",
    "cli_auth_file_present",
    "cli_auth_expires_at",
    "cli_auth_expired",
  ].some((key) => key in proof);

  if (!hasCredentialFields) return null;

  return {
    ok: asNullableBoolean(proof.ok),
    credentialSource: asNullableString(proof.credential_source),
    credentialIssue: asNullableString(proof.credential_issue),
    xaiApiKeyPresent: asNullableBoolean(proof.xai_api_key_present),
    cliAuthFilePresent: asNullableBoolean(proof.cli_auth_file_present),
    cliAuthExpiresAt: asNullableString(proof.cli_auth_expires_at),
    cliAuthExpired: asNullableBoolean(proof.cli_auth_expired),
  };
}

function normalizeBrowserSmokeProof(value: unknown, now: Date): Track54BrowserSmokeProofSnapshot | null {
  const proof = asRecord(value);
  const hasProofFields = ["checked", "ok", "generated_at"].some((key) => key in proof);
  if (!hasProofFields) return null;

  const generatedAt = asNullableString(proof.generated_at);
  const ageHours = hoursBetween(now, generatedAt);

  return {
    checked: asNullableBoolean(proof.checked),
    ok: asNullableBoolean(proof.ok),
    generatedAt,
    ageHours,
    freshEnough: ageHours !== null && ageHours >= 0 && ageHours <= DEFAULT_MAX_BROWSER_SMOKE_AGE_HOURS,
  };
}

function normalizeModeGate(value: unknown): Track54ReadinessModeGateSnapshot | null {
  const gate = asRecord(value);
  const mode = gate.mode === "daily_pulse" || gate.mode === "friday_deep" ? gate.mode : null;
  if (!mode) return null;

  const reviewWindow = asRecord(gate.review_window);
  const evidence = asRecord(gate.evidence);
  const projection = asRecord(gate.artifact_gate_projection);

  return {
    mode,
    readinessStatus: String(gate.readiness_status ?? "unknown"),
    reviewVerdict: String(gate.review_verdict ?? "unknown"),
    promotionStatus: String(gate.promotion_status ?? "unknown"),
    artifactDaysFound: asNumber(reviewWindow.artifact_days_found),
    requiredArtifactDays: asNumber(reviewWindow.required_artifact_days),
    acceptedSignalCount: asNumber(evidence.accepted_signal_count),
    acceptedDecisionGradeCount: asNumber(evidence.accepted_decision_grade_count),
    nextEligibleRunDates: asStringArray(projection.next_eligible_run_dates),
    promotionBlockers: asStringArray(gate.promotion_blockers),
  };
}

export function normalizeTrack54ReadinessReport(value: unknown, now = new Date()): Track54ReadinessSnapshot | null {
  const report = asRecord(value);
  if (report.schema_version !== "track54_readiness_report_v1") return null;
  const acceptanceAudit = asRecord(report.acceptance_audit);
  const generatedAt = String(report.generated_at ?? "");
  const reportAgeHours = hoursBetween(now, generatedAt);
  const browserSmokeProof = normalizeBrowserSmokeProof(acceptanceAudit.browser_smoke_proof, now);

  return {
    generatedAt,
    reportAgeHours,
    reportFreshEnough: reportAgeHours !== null
      && reportAgeHours >= 0
      && reportAgeHours <= DEFAULT_MAX_READINESS_REPORT_AGE_HOURS,
    overallStatus: String(report.overall_status ?? "unknown"),
    productionWritesEnabled: report.production_writes_enabled === true,
    humanApprovalRequiredBeforeWrites: report.human_approval_required_before_writes !== false,
    browserSmokeClean: report.browser_smoke_clean === true,
    browserSmokeProof,
    grokRunner: normalizeGrokRunner(acceptanceAudit.grok_runner_proof),
    modeGates: Array.isArray(report.mode_gates)
      ? report.mode_gates.map(normalizeModeGate).filter((gate): gate is Track54ReadinessModeGateSnapshot => Boolean(gate))
      : [],
    completionBlockers: asStringArray(report.completion_blockers),
    nextActions: asStringArray(report.next_actions),
  };
}

export async function getLocalTrack54ReadinessSnapshot(
  reportPath = process.env.TRACK54_READINESS_REPORT_PATH ?? DEFAULT_READINESS_REPORT_PATH,
): Promise<Track54ReadinessSnapshot | null> {
  try {
    const raw = await readFile(resolve(reportPath), "utf-8");
    return normalizeTrack54ReadinessReport(JSON.parse(raw));
  } catch {
    return null;
  }
}
