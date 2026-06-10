#!/usr/bin/env npx tsx
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import {
  buildGrokXScoutPromotionBrief,
  type GrokXScoutPromotionBrief,
} from "./build-grok-x-scout-promotion-brief";
import {
  reviewGrokXScoutArtifactWeek,
  type ArtifactWeekReview,
} from "./review-grok-x-scout-artifact-week";

type Track54OverallStatus = "blocked_by_artifact_gates" | "hold_manual_review" | "ready_for_human_approval";
type AutomationObservedStatus = "active" | "inactive" | "missing" | "unknown";
type AcceptanceStatus = "proven" | "blocked_by_artifact_gates" | "needs_live_verification" | "hold_manual_review";
type AcceptanceOverallStatus = "incomplete" | "hold_manual_review" | "needs_live_verification" | "ready_for_completion_review";
type ExpectedCodexAutomationKind = "cron" | "heartbeat";

interface ExpectedCodexAutomation {
  id: string;
  role: string;
  expected_kind?: ExpectedCodexAutomationKind;
  expected_schedule: string;
  expected_rrule: string;
  expected_cwd?: string;
  expected_target_thread_id?: string;
  require_target_thread?: boolean;
  boundary: string;
  required_prompt_fragments: string[];
  forbidden_prompt_fragments: string[];
}

export interface DisabledWriteAutomation {
  id: string;
  role: string;
  expected_schedule: string;
  expected_rrule: string;
  expected_cwd: string;
  required_prompt_fragments: string[];
  forbidden_prompt_fragments: string[];
}

export interface CodexAutomationCheck {
  id: string;
  role: string;
  expected_kind?: ExpectedCodexAutomationKind;
  observed_kind?: string | null;
  expected_schedule: string;
  expected_rrule: string;
  observed_rrule: string | null;
  expected_cwd?: string | null;
  observed_cwds: string[] | null;
  expected_target_thread_id?: string | null;
  observed_target_thread_id?: string | null;
  boundary: string;
  manifest_path: string | null;
  observed_status: AutomationObservedStatus;
  kind_boundary_present?: boolean | null;
  schedule_boundary_present: boolean | null;
  cwd_boundary_present: boolean | null;
  target_thread_boundary_present?: boolean | null;
  prompt_boundary_present: boolean | null;
  forbidden_prompt_boundary_present: boolean | null;
  missing_prompt_fragments: string[];
  present_forbidden_prompt_fragments: string[];
}

export interface WriteAutomationCheck {
  id: string;
  role: string;
  boundary: "must remain missing or inactive until human approval";
  manifest_path: string | null;
  observed_status: AutomationObservedStatus;
  expected_schedule?: string | null;
  expected_rrule?: string | null;
  observed_rrule?: string | null;
  expected_cwd?: string | null;
  observed_cwds?: string[] | null;
  schedule_boundary_present?: boolean | null;
  cwd_boundary_present?: boolean | null;
  prompt_boundary_present?: boolean | null;
  missing_prompt_fragments?: string[];
  prompt_contains_write_command: boolean | null;
  safe_until_human_approval: boolean;
}

export interface Track54ModeGate {
  mode: "daily_pulse" | "friday_deep";
  readiness_status: Track54OverallStatus;
  review_verdict: ArtifactWeekReview["verdict"];
  promotion_status: GrokXScoutPromotionBrief["promotion_status"];
  review_window: GrokXScoutPromotionBrief["review_window"];
  artifact_gate_projection: ArtifactGateProjection;
  evidence: ArtifactWeekReview["totals"];
  selected_artifacts: GrokXScoutPromotionBrief["selected_artifacts"];
  parse_failure_details: GrokXScoutPromotionBrief["parse_failure_details"];
  quality_warnings: string[];
  promotion_blockers: string[];
  write_mode_routines: GrokXScoutPromotionBrief["write_mode_routines"];
  write_mode_codex_automation_proposals: GrokXScoutPromotionBrief["write_mode_codex_automation_proposals"];
  post_approval_automation_transition: GrokXScoutPromotionBrief["post_approval_automation_transition"];
}

export interface ArtifactGateProjection {
  clean_artifact_days_found: number;
  missing_clean_artifact_days: number;
  next_eligible_run_dates: string[];
  earliest_candidate_date: string | null;
  schedule_note: string;
}

export interface ArtifactAutomationCoverage {
  mode: Track54ModeGate["mode"];
  automation_id: string;
  observed_status: AutomationObservedStatus;
  automation_ready: boolean;
  projected_dates: string[];
  projected_dates_match_mode_schedule: boolean;
  covered_by_active_dry_run_automation: boolean;
}

export interface WriteAutomationProposalValidation {
  ok: boolean;
  evidence: string[];
  blockers: string[];
}

export interface Track54AcceptanceItem {
  id: string;
  requirement: string;
  status: AcceptanceStatus;
  evidence: string[];
  blockers: string[];
  verification_command: string | null;
}

export interface SourceFreshnessProof {
  command: string;
  checked: boolean;
  ok: boolean;
  output: string[];
}

export interface GrokRunnerProof {
  command: string;
  checked: boolean;
  ok: boolean;
  credential_source?: GrokCredentialState["credential_source"];
  credential_issue?: GrokCredentialState["credential_issue"];
  xai_api_key_present?: boolean;
  cli_auth_file_present?: boolean | null;
  cli_auth_expires_at?: string | null;
  cli_auth_expired?: boolean | null;
  output: string[];
}

export interface HermesTerminalProof {
  command: string;
  checked: boolean;
  ok: boolean;
  hermes_version_ok: boolean;
  xai_oauth_logged_in: boolean;
  model_smoke_ok: boolean;
  x_search_tool_listed: boolean;
  x_search_globally_enabled: boolean | null;
  toolset_override_required: boolean | null;
  provider: "xai-oauth";
  model: "grok-4.3";
  output: string[];
}

export interface GrokCredentialState {
  ok: boolean;
  credential_source: "xai_api_key" | "grok_cli_auth" | "none";
  credential_issue:
    | "missing_credential"
    | "invalid_auth_json"
    | "missing_auth_expiry"
    | "unparseable_auth_expiry"
    | "auth_expires_before_next_scout"
    | "expired_auth"
    | null;
  xai_api_key_present: boolean;
  cli_auth_file_present: boolean | null;
  cli_auth_expires_at: string | null;
  cli_auth_expired: boolean | null;
  output: string[];
}

export interface AcceptanceTestProof {
  command: string;
  checked: boolean;
  ok: boolean;
  output: string[];
}

export interface BrowserSmokeProof {
  schema_version?: "track54_browser_smoke_proof_v1";
  generated_at?: string;
  command: string;
  checked: boolean;
  ok: boolean;
  output: string[];
}

export interface Track54AcceptanceAudit {
  overall_status: AcceptanceOverallStatus;
  grok_runner_proof: GrokRunnerProof;
  hermes_terminal_proof?: HermesTerminalProof;
  focused_test_proof: AcceptanceTestProof;
  browser_smoke_proof: BrowserSmokeProof;
  items: Track54AcceptanceItem[];
  completion_blockers: string[];
}

export interface Track54ReadinessReport {
  schema_version: "track54_readiness_report_v1";
  generated_at: string;
  persisted_report_path?: string;
  overall_status: Track54OverallStatus;
  production_writes_enabled: false;
  human_approval_required_before_writes: true;
  mode_gates: Track54ModeGate[];
  codex_automation_checks: CodexAutomationCheck[];
  write_automation_checks: WriteAutomationCheck[];
  artifact_automation_coverage: ArtifactAutomationCoverage[];
  acceptance_audit: Track54AcceptanceAudit;
  browser_smoke_clean: boolean;
  completion_blockers: string[];
  next_actions: string[];
  hard_boundaries: string[];
  source_reviews: {
    daily_pulse: "scripts/review-grok-x-scout-artifact-week.ts";
    friday_deep: "scripts/review-grok-x-scout-artifact-week.ts";
    promotion_brief: "scripts/build-grok-x-scout-promotion-brief.ts";
  };
}

const EXPECTED_CODEX_AUTOMATIONS: ExpectedCodexAutomation[] = [
  {
    id: "canola-price-and-fx-freshness-import",
    role: "official price and thesis-cache refresh before X review",
    expected_schedule: "Mon-Fri 3:45 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=15;BYMINUTE=45;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "may refresh prices/cache; must not run Grok or retired pipeline paths",
    required_prompt_fragments: [
      "npm run collect:prices",
      "Do not run Grok",
      "do not call `/api/pipeline/run`",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout",
      "npx tsx scripts/run-grok-x-scout.ts",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "track-54-grok-auth-preflight",
    role: "Grok CLI/API credential preflight before X scout dry run",
    expected_schedule: "Mon-Fri 3:55 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=15;BYMINUTE=55;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "credential preflight only; must not run Grok search, scout, daily thesis review, or writes",
    required_prompt_fragments: [
      "npm run track54:grok-preflight",
      "grok_version_ok",
      "credential_ok",
      "credential_source",
      "credential_issue",
      "cli_auth_expired",
      "next_actions",
      "grok login",
      "XAI_API_KEY",
      "Do not run Grok search",
      "do not run the X scout",
      "do not run daily thesis review",
      "do not run any `--write` command",
      "do not write Supabase rows",
      "do not enable production Grok routines",
      "do not call `/api/pipeline/run`",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout",
      "npx tsx scripts/run-grok-x-scout.ts",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "grok-x-scout-artifact-week-review",
    role: "daily_pulse Grok/X dry-run artifact evidence collector",
    expected_schedule: "Mon-Fri 4:10 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=10;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "dry-run only; must not run --write or write Supabase rows",
    required_prompt_fragments: [
      "daily_pulse",
      "npm run track54:grok-preflight",
      "credential_ok",
      "If the Grok preflight reports `ok: false`",
      "scripts/run-track54-artifact-health-check.ts --mode daily_pulse",
      "--retry-missing",
      "--refresh-readiness=after-retry",
      "--fallback",
      "hermes_terminal",
      "npm run track54:hermes-preflight",
      "npm run track54:hermes-x-scout:terminal -- --mode daily_pulse --date",
      "hermes_preflight_model_smoke_ok",
      "retry_used_fallback",
      "retry_blocked_by_hermes_preflight",
      "--runner auto",
      "--grok-cli-model",
      "grok-composer-2.5-fast",
      "--dry-run",
      "Do not run any `--write` command",
      "npm run track54:readiness",
      "--browser-smoke-proof-out",
      "scratch/track54-browser-smoke/browser-smoke-proof.json",
      "--out",
      "scratch/track54-readiness/latest-readiness-report.json",
      "acceptance_audit.overall_status",
      "acceptance_audit.browser_smoke_proof",
      "browser_smoke_clean",
      "persisted_report_path",
      "completion_blockers",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout -- daily_pulse --write",
      "npm run grok:x-scout -- daily_pulse --runner auto --grok-cli-model grok-composer-2.5-fast --write",
      "npm run grok:x-scout -- --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --runner auto --write",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "track-54-daily-artifact-health-check",
    role: "daily_pulse artifact health monitor and no-write retry guard",
    expected_schedule: "Mon-Thu 4:45 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;BYHOUR=16;BYMINUTE=45;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "dry-run monitor only; may retry missing/invalid daily artifacts without Supabase writes",
    required_prompt_fragments: [
      "daily_pulse",
      "npm run track54:grok-preflight",
      "credential_ok",
      "If the Grok preflight reports `ok: false`",
      "scripts/run-track54-artifact-health-check.ts --mode daily_pulse",
      "--retry-missing",
      "--refresh-readiness=after-retry",
      "--grok-cli-model",
      "grok-composer-2.5-fast",
      "--fallback",
      "hermes_terminal",
      "scripts/review-grok-x-scout-artifact-week.ts --mode daily_pulse",
      "If today's artifact is missing or invalid",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --grok-cli-model grok-composer-2.5-fast --dry-run",
      "npm run track54:hermes-preflight",
      "npm run track54:hermes-x-scout:terminal -- --mode daily_pulse --date",
      "hermes_preflight_ok",
      "hermes_preflight_model_smoke_ok",
      "retry_used_fallback",
      "retry_blocked_by_hermes_preflight",
      "npm run track54:readiness",
      "--browser-smoke-proof-out",
      "scratch/track54-browser-smoke/browser-smoke-proof.json",
      "--out",
      "scratch/track54-readiness/latest-readiness-report.json",
      "persisted_report_path",
      "Do not run any `--write` command",
      "do not write Supabase rows",
      "do not call `/api/pipeline/run`",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout -- daily_pulse --write",
      "npm run grok:x-scout -- daily_pulse --runner auto --write",
      "npm run grok:x-scout -- --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --runner auto --write",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "grok-x-scout-friday-deep-artifact-review",
    role: "friday_deep Grok/X dry-run artifact evidence collector",
    expected_schedule: "Friday 4:50 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=50;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "dry-run only; must not run --write or write Supabase rows",
    required_prompt_fragments: [
      "friday_deep",
      "npm run track54:grok-preflight",
      "credential_ok",
      "If the Grok preflight reports `ok: false`",
      "scripts/run-track54-artifact-health-check.ts --mode friday_deep",
      "--retry-missing",
      "--refresh-readiness=always",
      "--fallback",
      "hermes_terminal",
      "npm run track54:hermes-preflight",
      "npm run track54:hermes-x-scout:terminal -- --mode friday_deep --date",
      "hermes_preflight_model_smoke_ok",
      "retry_used_fallback",
      "retry_blocked_by_hermes_preflight",
      "--runner auto",
      "--grok-cli-model",
      "grok-composer-2.5-fast",
      "--dry-run",
      "Do not run any `--write` command",
      "npm run track54:readiness",
      "--browser-smoke-proof-out",
      "scratch/track54-browser-smoke/browser-smoke-proof.json",
      "--out",
      "scratch/track54-readiness/latest-readiness-report.json",
      "acceptance_audit.overall_status",
      "acceptance_audit.browser_smoke_proof",
      "browser_smoke_clean",
      "persisted_report_path",
      "completion_blockers",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout -- friday_deep --write",
      "npm run grok:x-scout -- friday_deep --runner auto --grok-cli-model grok-composer-2.5-fast --write",
      "npm run grok:x-scout -- --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --runner auto --write",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "track-54-friday-artifact-health-check",
    role: "Friday daily_pulse and friday_deep artifact health monitor and no-write retry guard",
    expected_schedule: "Friday 5:15 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=15;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "Friday dry-run monitor only; may retry missing/invalid daily_pulse or friday_deep artifacts without Supabase writes",
    required_prompt_fragments: [
      "daily_pulse",
      "friday_deep",
      "npm run track54:grok-preflight",
      "credential_ok",
      "If the Grok preflight reports `ok: false`",
      "scripts/run-track54-artifact-health-check.ts --mode both",
      "--retry-missing",
      "--refresh-readiness=always",
      "--grok-cli-model",
      "grok-composer-2.5-fast",
      "--fallback",
      "hermes_terminal",
      "scripts/review-grok-x-scout-artifact-week.ts --mode daily_pulse",
      "scripts/review-grok-x-scout-artifact-week.ts --mode friday_deep",
      "If today's daily_pulse artifact is missing or invalid",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --grok-cli-model grok-composer-2.5-fast --dry-run",
      "If today's friday_deep artifact is missing or invalid",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --grok-cli-model grok-composer-2.5-fast --dry-run",
      "npm run track54:hermes-preflight",
      "npm run track54:hermes-x-scout:terminal -- --mode daily_pulse --date",
      "npm run track54:hermes-x-scout:terminal -- --mode friday_deep --date",
      "hermes_preflight_ok",
      "hermes_preflight_model_smoke_ok",
      "retry_used_fallback",
      "retry_blocked_by_hermes_preflight",
      "npm run track54:readiness",
      "--browser-smoke-proof-out",
      "scratch/track54-browser-smoke/browser-smoke-proof.json",
      "--out",
      "scratch/track54-readiness/latest-readiness-report.json",
      "persisted_report_path",
      "Do not run any `--write` command",
      "do not write Supabase rows",
      "do not call `/api/pipeline/run`",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout -- daily_pulse --write",
      "npm run grok:x-scout -- daily_pulse --runner auto --write",
      "npm run grok:x-scout -- --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --runner auto --write",
      "npm run grok:x-scout -- friday_deep --write",
      "npm run grok:x-scout -- friday_deep --runner auto --write",
      "npm run grok:x-scout -- --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --runner auto --write",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "track-54-late-grok-auth-recovery",
    role: "late-day no-write Grok auth recovery and artifact retry guard",
    expected_schedule: "Mon-Fri 5:05 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=17;BYMINUTE=5;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "late no-write recovery only; may retry missing/invalid artifacts through artifact health after Grok preflight",
    required_prompt_fragments: [
      "npm run track54:grok-preflight",
      "credential_ok",
      "credential_source",
      "credential_issue",
      "cli_auth_expired",
      "scripts/run-track54-artifact-health-check.ts --mode both",
      "--retry-missing",
      "--refresh-readiness=always",
      "--grok-cli-model",
      "grok-composer-2.5-fast",
      "--fallback",
      "hermes_terminal",
      "grok_preflight_ok",
      "retry_blocked_by_grok_preflight",
      "hermes_preflight_ok",
      "hermes_preflight_model_smoke_ok",
      "retry_used_fallback",
      "retry_blocked_by_hermes_preflight",
      "npm run track54:hermes-preflight",
      "npm run track54:hermes-x-scout:terminal -- --mode",
      "--runner auto",
      "retried_modes",
      "readiness_refreshed",
      "persisted_report_path",
      "completion_blockers",
      "Do not run any `--write` command",
      "do not write Supabase rows",
      "do not enable production Grok routines",
      "do not call `/api/pipeline/run`",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout -- daily_pulse --write",
      "npm run grok:x-scout -- daily_pulse --runner auto --write",
      "npm run grok:x-scout -- --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --runner auto --write",
      "npm run grok:x-scout -- friday_deep --write",
      "npm run grok:x-scout -- friday_deep --runner auto --write",
      "npm run grok:x-scout -- --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --runner auto --write",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "track-54-hermes-x-scout-prompt-bridge",
    role: "Hermes/Grok 4.3 terminal X scout shadow recovery",
    expected_schedule: "Mon-Fri 4:20 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=20;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    boundary: "Hermes shadow recovery only; may create local no-write artifacts when same-day daily_pulse proof is missing or invalid",
    required_prompt_fragments: [
      "Hermes/Grok 4.3 terminal X scout shadow recovery",
      "npm --silent run grok:x-scout:review-week",
      "--mode daily_pulse",
      "--required-days 5",
      "--min-accepted-signals 1",
      "dry_run is true",
      "write is false",
      "scout_run_id is null",
      "price_snapshot_status is fresh",
      "npm --silent run track54:hermes-preflight",
      "model_smoke_ok",
      "npm --silent run track54:hermes-x-scout:terminal",
      "Do not run Hermes for low signal count alone",
      "Do not run daily thesis review",
      "do not run any `--write` command",
      "do not write Supabase rows",
      "do not enable production Grok routines",
      "do not register write-mode automations",
      "do not call `/api/pipeline/run`",
      "Hermes remains a shadow X evidence scout only",
      "existing Track 54 artifact reviewer",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout -- daily_pulse --write",
      "npm run grok:x-scout -- daily_pulse --runner auto --write",
      "npm run grok:x-scout -- --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --runner auto --write",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
  {
    id: "track-54-promotion-review",
    role: "morning Grok auth warning plus weekday evidence and Friday promotion review heartbeat",
    expected_kind: "heartbeat",
    expected_schedule: "Mon-Fri 9:30 AM and 5:30 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9,17;BYMINUTE=30;BYSECOND=0",
    require_target_thread: true,
    boundary: "thread heartbeat only; must warn early on Grok auth and review daily evidence/Friday promotion readiness without enabling production Grok writes",
    required_prompt_fragments: [
      "Run the no-write Track 54 evidence review",
      "morning Grok auth check",
      "before noon",
      "npm run track54:grok-preflight",
      "grok_version_ok",
      "credential_ok",
      "credential_source",
      "credential_issue",
      "cli_auth_expired",
      "NOTIFY",
      "DONT_NOTIFY",
      "grok login",
      "XAI_API_KEY",
      "npm run track54:recover-after-grok-login",
      "npm --silent run track54:heartbeat-summary",
      "npm --silent run track54:automation-runs",
      "local_review_date",
      "local_review_weekday",
      "local_review_kind",
      "review_modes_to_inspect",
      "weekday daily_pulse review",
      "Friday promotion review",
      "Track 54 readiness report",
      "scratch/track54-readiness/latest-readiness-report.json",
      "persisted_report_path",
      "latest browser-smoke proof",
      "report_freshness_status",
      "browser_smoke_proof_age_hours",
      "browser_smoke_proof_freshness_status",
      "browser_smoke_proof_fresh_enough",
      "grok_runner",
      "credential_issue",
      "hermes_terminal",
      "hermes_terminal.model_smoke_ok",
      "write-mode automations are still missing or inactive",
      "write-mode automation proposals",
      "automation_run_checks",
      "latest_run_date",
      "latest_run_outcome",
      "automations_with_failed_or_blocked_latest_run",
      "no_write_manifests_ready",
      "write_automations_safe",
      "clean_artifact_days_found",
      "mode_gate_snapshot.clean_artifact_days_found",
      "selected_artifacts",
      "selected artifact hash/path",
      "post-approval transition",
      "write-mode proposal IDs",
      "write_mode_proposals",
      "approval_review_window",
      "next_eligible_run_statuses",
      "production_writes_enabled is false",
      "Grok remains a quarantined X sentiment scout",
      "daily_pulse artifact days found versus required",
      "Friday-deep artifact gate",
      "next_safe_operator_action",
      "Do not run Grok search",
      "do not run the X scout",
      "do not run daily thesis review",
      "Do not enable production Grok writes",
      "matching artifact gate is candidate-ready",
      "Kyle has explicitly approved promotion",
    ],
    forbidden_prompt_fragments: [
      "npm run grok:x-scout -- daily_pulse --write",
      "npm run grok:x-scout -- daily_pulse --runner auto --write",
      "npm run grok:x-scout -- --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --write",
      "npx tsx scripts/run-grok-x-scout.ts daily_pulse --runner auto --write",
      "npm run grok:x-scout -- friday_deep --write",
      "npm run grok:x-scout -- friday_deep --runner auto --write",
      "npm run grok:x-scout -- --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --write",
      "npx tsx scripts/run-grok-x-scout.ts friday_deep --runner auto --write",
      "npm run daily-thesis-review -- --write",
      "npx tsx scripts/run-daily-thesis-review.ts --write",
    ],
  },
];

const DISABLED_WRITE_AUTOMATIONS: DisabledWriteAutomation[] = [
  {
    id: "grok-x-scout-daily",
    role: "daily_pulse write-mode Grok/X scout",
    expected_schedule: "Mon-Fri 4:05 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=5;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    required_prompt_fragments: [
      "Confirm the matching dry-run artifact collector is disabled or inactive before running.",
      "Confirm this routine was explicitly approved by Kyle",
      "Approved artifact review window:",
      "Do not call `/api/pipeline/run` or retired Grok Edge Functions.",
      "grok-x-scout-artifact-week-review",
      "npm run grok:x-scout -- daily_pulse --runner auto --write",
      "--approval-phrase",
      "--approval-review-from",
      "--approval-review-to",
      "price snapshot status",
      "decision-grade accepted count",
      "Do not write market_analysis, us_market_analysis, score_trajectory, us_score_trajectory, or thesis_packet_cache",
    ],
    forbidden_prompt_fragments: ["grok:x-scout", "--write"],
  },
  {
    id: "daily-thesis-review",
    role: "weekday bounded trajectory writer",
    expected_schedule: "Mon-Fri 4:25 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=25;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    required_prompt_fragments: [
      "Confirm the matching dry-run artifact collector is disabled or inactive before running.",
      "Confirm this routine was explicitly approved by Kyle",
      "Approved artifact review window:",
      "Do not call `/api/pipeline/run` or retired Grok Edge Functions.",
      "grok-x-scout-artifact-week-review",
      "npm run daily-thesis-review -- --write",
      "--approval-phrase",
      "--approval-review-from",
      "--approval-review-to",
      "packet.x_signal_input_audit",
      "accepted_x_signals count",
      "decisions count",
      "write_decisions count",
      "writes attempted",
      "price freshness status",
      "This routine may write only bounded daily trajectory updates",
      "must not write market_analysis, us_market_analysis, or thesis_packet_cache",
    ],
    forbidden_prompt_fragments: ["daily-thesis-review", "--write"],
  },
  {
    id: "grok-x-scout-friday-deep",
    role: "friday_deep write-mode Grok/X scout",
    expected_schedule: "Friday 4:50 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=50;BYSECOND=0",
    expected_cwd: resolve(process.cwd()),
    required_prompt_fragments: [
      "Confirm the matching dry-run artifact collector is disabled or inactive before running.",
      "Confirm this routine was explicitly approved by Kyle",
      "Approved artifact review window:",
      "Do not call `/api/pipeline/run` or retired Grok Edge Functions.",
      "grok-x-scout-friday-deep-artifact-review",
      "npm run grok:x-scout -- friday_deep --runner auto --write",
      "--approval-phrase",
      "--approval-review-from",
      "--approval-review-to",
      "price snapshot status",
      "decision-grade accepted count",
      "Do not write market_analysis, us_market_analysis, score_trajectory, us_score_trajectory, or thesis_packet_cache",
      "Friday desk swarms remain the thesis-of-record writers.",
    ],
    forbidden_prompt_fragments: ["grok:x-scout", "--write"],
  },
];

const args = process.argv.slice(2);
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

function optionValueFrom(flag: string, inputArgs: string[], inputEnv: NodeJS.ProcessEnv): string | undefined {
  const index = inputArgs.indexOf(flag);
  if (index !== -1) return inputArgs[index + 1];
  const inline = inputArgs.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const envValue = inputEnv[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`];
  return envValue && envValue !== "true" ? envValue : undefined;
}

function optionValue(flag: string): string | undefined {
  return optionValueFrom(flag, args, process.env);
}

function hasFlag(flag: string): boolean {
  return args.includes(flag) || process.env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`] === "true";
}

export function resolveBrowserSmokeProofPath(
  inputArgs: string[] = args,
  inputEnv: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = optionValueFrom("--browser-smoke-proof", inputArgs, inputEnv);
  if (explicit) return explicit;

  if (inputEnv.npm_config_browser_smoke_proof === "true") {
    return inputArgs.find((arg) => arg.toLowerCase().endsWith(".json"));
  }
  return undefined;
}

if (IS_CLI && (hasFlag("--help") || hasFlag("-h"))) {
  console.error(`
Track 54 Readiness Report

Usage:
  npm run track54:readiness:build
  npx tsx scripts/build-track54-readiness-report.ts --browser-smoke-proof scratch/track54-browser-smoke/browser-smoke-proof.json
  npx tsx scripts/build-track54-readiness-report.ts --from 2026-06-01 --to 2026-06-05 --browser-smoke-proof scratch/track54-browser-smoke/browser-smoke-proof.json

Options:
  --from YYYY-MM-DD                 Review window for both daily_pulse and friday_deep.
  --to YYYY-MM-DD                   Review window for both daily_pulse and friday_deep.
  --daily-from YYYY-MM-DD           Review window start for daily_pulse.
  --daily-to YYYY-MM-DD             Review window end for daily_pulse.
  --friday-from YYYY-MM-DD          Review window start for friday_deep.
  --friday-to YYYY-MM-DD            Review window end for friday_deep.
  --artifact-root <path>            Defaults to data/X Scout Runs.
  --automation-root <path>          Defaults to %USERPROFILE%/.codex/automations.
  --skip-automation-check           Do not inspect local Codex automation manifests.
  --skip-grok-runner-check          Do not run the read-only Grok CLI/version/auth preflight.
  --skip-source-freshness-check     Do not run the read-only source-freshness watchdog.
  --skip-acceptance-test-check      Do not run the focused read-only acceptance Vitest slice.
  --browser-smoke-proof <path>      JSON proof from a fresh browser smoke of /thesis, /thesis?audit=1, and /overview.
  --out <path>                      Also write the readiness JSON to this path for later heartbeat review.
`);
  process.exit(0);
}

function defaultAutomationRoot(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return resolve(home, ".codex", "automations");
}

function parseTomlString(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? null;
}

function parseTomlStringArray(content: string, key: string): string[] | null {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*\\[(.*)\\]`, "m"));
  if (!match) return null;
  return Array.from(match[1]!.matchAll(/"((?:\\.|[^"\\])*)"/g)).map((valueMatch) =>
    valueMatch[1]!
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, "\""),
  );
}

function normalizePathForComparison(path: string): string {
  return resolve(path).replace(/[\\/]+/g, "\\").toLowerCase();
}

export function checkCodexAutomations(
  automationRoot = defaultAutomationRoot(),
  expectedAutomations: ExpectedCodexAutomation[] = EXPECTED_CODEX_AUTOMATIONS,
): CodexAutomationCheck[] {
  return expectedAutomations.map((automation) => {
    const manifestPath = resolve(automationRoot, automation.id, "automation.toml");
    if (!existsSync(manifestPath)) {
      return {
        id: automation.id,
        role: automation.role,
        expected_kind: automation.expected_kind,
        observed_kind: null,
        expected_schedule: automation.expected_schedule,
        expected_rrule: automation.expected_rrule,
        observed_rrule: null,
        expected_cwd: automation.expected_cwd ?? null,
        observed_cwds: null,
        expected_target_thread_id: automation.expected_target_thread_id ?? null,
        observed_target_thread_id: null,
        boundary: automation.boundary,
        manifest_path: manifestPath,
        observed_status: "missing",
        kind_boundary_present: null,
        schedule_boundary_present: null,
        cwd_boundary_present: null,
        target_thread_boundary_present: null,
        prompt_boundary_present: null,
        forbidden_prompt_boundary_present: null,
        missing_prompt_fragments: automation.required_prompt_fragments,
        present_forbidden_prompt_fragments: [],
      };
    }

    try {
      const content = readFileSync(manifestPath, "utf-8");
      const kind = parseTomlString(content, "kind");
      const status = parseTomlString(content, "status");
      const rrule = parseTomlString(content, "rrule");
      const cwds = parseTomlStringArray(content, "cwds");
      const targetThreadId = parseTomlString(content, "target_thread_id");
      const prompt = parseTomlString(content, "prompt") ?? "";
      const missingPromptFragments = automation.required_prompt_fragments.filter((fragment) => !prompt.includes(fragment));
      const presentForbiddenPromptFragments = automation.forbidden_prompt_fragments.filter((fragment) => prompt.includes(fragment));
      const cwdBoundaryPresent = automation.expected_cwd
        ? (cwds ?? []).some((cwd) => normalizePathForComparison(cwd) === normalizePathForComparison(automation.expected_cwd!))
        : null;
      const kindBoundaryPresent = automation.expected_kind ? kind === automation.expected_kind : null;
      const targetThreadBoundaryPresent = automation.expected_target_thread_id
        ? targetThreadId === automation.expected_target_thread_id
        : automation.require_target_thread
          ? Boolean(targetThreadId)
          : null;

      return {
        id: automation.id,
        role: automation.role,
        expected_kind: automation.expected_kind,
        observed_kind: kind,
        expected_schedule: automation.expected_schedule,
        expected_rrule: automation.expected_rrule,
        observed_rrule: rrule,
        expected_cwd: automation.expected_cwd ?? null,
        observed_cwds: cwds,
        expected_target_thread_id: automation.expected_target_thread_id ?? null,
        observed_target_thread_id: targetThreadId,
        boundary: automation.boundary,
        manifest_path: manifestPath,
        observed_status: status === "ACTIVE" ? "active" : status ? "inactive" : "unknown",
        kind_boundary_present: kindBoundaryPresent,
        schedule_boundary_present: rrule === automation.expected_rrule,
        cwd_boundary_present: cwdBoundaryPresent,
        target_thread_boundary_present: targetThreadBoundaryPresent,
        prompt_boundary_present: missingPromptFragments.length === 0,
        forbidden_prompt_boundary_present: presentForbiddenPromptFragments.length === 0,
        missing_prompt_fragments: missingPromptFragments,
        present_forbidden_prompt_fragments: presentForbiddenPromptFragments,
      };
    } catch {
      return {
        id: automation.id,
        role: automation.role,
        expected_kind: automation.expected_kind,
        observed_kind: null,
        expected_schedule: automation.expected_schedule,
        expected_rrule: automation.expected_rrule,
        observed_rrule: null,
        expected_cwd: automation.expected_cwd ?? null,
        observed_cwds: null,
        expected_target_thread_id: automation.expected_target_thread_id ?? null,
        observed_target_thread_id: null,
        boundary: automation.boundary,
        manifest_path: manifestPath,
        observed_status: "unknown",
        kind_boundary_present: false,
        schedule_boundary_present: false,
        cwd_boundary_present: false,
        target_thread_boundary_present: false,
        prompt_boundary_present: false,
        forbidden_prompt_boundary_present: false,
        missing_prompt_fragments: automation.required_prompt_fragments,
        present_forbidden_prompt_fragments: [],
      };
    }
  });
}

function missingWriteAutomationCheck(
  automationRoot: string | null,
  automation: DisabledWriteAutomation,
): WriteAutomationCheck {
  return {
    id: automation.id,
    role: automation.role,
    boundary: "must remain missing or inactive until human approval",
    manifest_path: automationRoot ? resolve(automationRoot, automation.id, "automation.toml") : null,
    observed_status: "missing",
    expected_schedule: automation.expected_schedule,
    expected_rrule: automation.expected_rrule,
    observed_rrule: null,
    expected_cwd: automation.expected_cwd,
    observed_cwds: null,
    schedule_boundary_present: null,
    cwd_boundary_present: null,
    prompt_boundary_present: null,
    missing_prompt_fragments: [],
    prompt_contains_write_command: null,
    safe_until_human_approval: true,
  };
}

function defaultSafeWriteAutomationChecks(): WriteAutomationCheck[] {
  return DISABLED_WRITE_AUTOMATIONS.map((automation) =>
    missingWriteAutomationCheck(null, automation)
  );
}

export function checkWriteAutomationsDisabled(
  automationRoot = defaultAutomationRoot(),
  disabledAutomations: DisabledWriteAutomation[] = DISABLED_WRITE_AUTOMATIONS,
): WriteAutomationCheck[] {
  return disabledAutomations.map((automation) => {
    const manifestPath = resolve(automationRoot, automation.id, "automation.toml");
    if (!existsSync(manifestPath)) {
      return missingWriteAutomationCheck(automationRoot, automation);
    }

    try {
      const content = readFileSync(manifestPath, "utf-8");
      const status = parseTomlString(content, "status");
      const prompt = parseTomlString(content, "prompt") ?? "";
      const observedRrule = parseTomlString(content, "rrule");
      const observedCwds = parseTomlStringArray(content, "cwds");
      const observedStatus: AutomationObservedStatus = status === "ACTIVE" ? "active" : status ? "inactive" : "unknown";
      const missingPromptFragments = automation.required_prompt_fragments.filter((fragment) => !prompt.includes(fragment));
      const scheduleBoundaryPresent = observedRrule === automation.expected_rrule;
      const cwdBoundaryPresent = observedCwds !== null
        && observedCwds.some((cwd) => normalizePathForComparison(cwd) === normalizePathForComparison(automation.expected_cwd));
      const promptBoundaryPresent = missingPromptFragments.length === 0;
      return {
        id: automation.id,
        role: automation.role,
        boundary: "must remain missing or inactive until human approval",
        manifest_path: manifestPath,
        observed_status: observedStatus,
        expected_schedule: automation.expected_schedule,
        expected_rrule: automation.expected_rrule,
        observed_rrule: observedRrule,
        expected_cwd: automation.expected_cwd,
        observed_cwds: observedCwds,
        schedule_boundary_present: scheduleBoundaryPresent,
        cwd_boundary_present: cwdBoundaryPresent,
        prompt_boundary_present: promptBoundaryPresent,
        missing_prompt_fragments: missingPromptFragments,
        prompt_contains_write_command: automation.forbidden_prompt_fragments.every((fragment) => prompt.includes(fragment)),
        safe_until_human_approval: observedStatus === "inactive"
          && scheduleBoundaryPresent
          && cwdBoundaryPresent
          && promptBoundaryPresent,
      };
    } catch {
      return {
        id: automation.id,
        role: automation.role,
        boundary: "must remain missing or inactive until human approval",
        manifest_path: manifestPath,
        observed_status: "unknown",
        expected_schedule: automation.expected_schedule,
        expected_rrule: automation.expected_rrule,
        observed_rrule: null,
        expected_cwd: automation.expected_cwd,
        observed_cwds: null,
        schedule_boundary_present: null,
        cwd_boundary_present: null,
        prompt_boundary_present: null,
        missing_prompt_fragments: automation.required_prompt_fragments,
        prompt_contains_write_command: null,
        safe_until_human_approval: false,
      };
    }
  });
}

function readinessStatusForGate(
  review: ArtifactWeekReview,
  brief: GrokXScoutPromotionBrief,
): Track54OverallStatus {
  if (review.verdict === "hold_manual_review") return "hold_manual_review";
  if (review.verdict === "candidate_for_enablement" && brief.promotion_status === "ready_for_human_approval") {
    return "ready_for_human_approval";
  }
  return "blocked_by_artifact_gates";
}

function dateKeyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDateKeyDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromDate(date);
}

function isWeekdayDateKey(dateKey: string): boolean {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function isFridayDateKey(dateKey: string): boolean {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 5;
}

function artifactDayIsCleanForProjection(day: ArtifactWeekReview["days"][number]): boolean {
  return (
    day.artifact_found &&
    day.parse_status === "ok" &&
    day.no_write_evidence &&
    day.write !== true &&
    !day.scout_run_id &&
    day.price_snapshot_status === "fresh" &&
    !day.artifact_identity_mismatch &&
    !day.mode_schedule_mismatch &&
    !day.summary_count_mismatch
  );
}

function countCleanArtifactDaysForProjection(review: ArtifactWeekReview): number {
  if (review.days.length === 0) return review.artifact_days_found;
  return review.days
    .filter((day) => day.date >= review.from_date && day.date <= review.to_date)
    .filter(artifactDayIsCleanForProjection).length;
}

function dateRangeLength(fromDate: string, toDate: string): number {
  if (fromDate > toDate) return 0;
  let count = 0;
  for (let cursor = fromDate; cursor <= toDate; cursor = addDateKeyDays(cursor, 1)) {
    count += 1;
  }
  return count;
}

function artifactDateMatchesModeSchedule(mode: ArtifactWeekReview["mode"], dateKey: string): boolean {
  return mode === "friday_deep" ? isFridayDateKey(dateKey) : isWeekdayDateKey(dateKey);
}

function countCleanDatesInRollingWindow(
  cleanDates: Set<string>,
  toDate: string,
  windowLengthDays: number,
): number {
  const fromDate = addDateKeyDays(toDate, -(Math.max(1, windowLengthDays) - 1));
  let count = 0;
  for (const cleanDate of cleanDates) {
    if (cleanDate >= fromDate && cleanDate <= toDate) count += 1;
  }
  return count;
}

function buildArtifactGateProjection(review: ArtifactWeekReview): ArtifactGateProjection {
  const cleanArtifactDaysFound = countCleanArtifactDaysForProjection(review);
  const missing = Math.max(0, review.required_artifact_days - cleanArtifactDaysFound);
  const scheduleNote = review.mode === "friday_deep"
    ? "friday_deep artifacts count only on Friday run dates."
    : "daily_pulse artifacts count on weekday run dates.";
  const nextEligibleRunDates: string[] = [];

  if (missing > 0) {
    const hasDatedEvidence = review.days.length > 0 && dateRangeLength(review.from_date, review.to_date) > 0;
    const assumedCleanDates = new Set(
      hasDatedEvidence
        ? review.days
          .filter((day) => day.date >= review.from_date && day.date <= review.to_date)
          .filter(artifactDayIsCleanForProjection)
          .map((day) => day.date)
        : [],
    );
    const windowLengthDays = dateRangeLength(review.from_date, review.to_date);

    for (
      let cursor = addDateKeyDays(review.to_date, 1);
      nextEligibleRunDates.length < Math.max(missing, review.required_artifact_days + windowLengthDays);
      cursor = addDateKeyDays(cursor, 1)
    ) {
      if (!artifactDateMatchesModeSchedule(review.mode, cursor)) continue;

      nextEligibleRunDates.push(cursor);

      if (!hasDatedEvidence) {
        if (nextEligibleRunDates.length >= missing) break;
        continue;
      }

      assumedCleanDates.add(cursor);
      if (countCleanDatesInRollingWindow(assumedCleanDates, cursor, windowLengthDays) >= review.required_artifact_days) {
        break;
      }
    }
  }

  return {
    clean_artifact_days_found: cleanArtifactDaysFound,
    missing_clean_artifact_days: missing,
    next_eligible_run_dates: nextEligibleRunDates,
    earliest_candidate_date: nextEligibleRunDates.at(-1) ?? null,
    schedule_note: scheduleNote,
  };
}

function buildModeGate(
  review: ArtifactWeekReview,
  generatedAt: string,
): Track54ModeGate {
  if (review.mode !== "daily_pulse" && review.mode !== "friday_deep") {
    throw new Error(`Track 54 readiness only supports daily_pulse and friday_deep reviews; received ${review.mode}`);
  }
  const brief = buildGrokXScoutPromotionBrief(review, generatedAt);

  return {
    mode: review.mode,
    readiness_status: readinessStatusForGate(review, brief),
    review_verdict: review.verdict,
    promotion_status: brief.promotion_status,
    review_window: brief.review_window,
    artifact_gate_projection: buildArtifactGateProjection(review),
    evidence: brief.evidence,
    selected_artifacts: brief.selected_artifacts,
    parse_failure_details: brief.parse_failure_details,
    quality_warnings: brief.quality_warnings,
    promotion_blockers: brief.promotion_blockers,
    write_mode_routines: brief.write_mode_routines,
    write_mode_codex_automation_proposals: brief.write_mode_codex_automation_proposals,
    post_approval_automation_transition: brief.post_approval_automation_transition,
  };
}

function expectedProposalIdsForMode(mode: Track54ModeGate["mode"]): string[] {
  if (mode === "daily_pulse") return ["grok-x-scout-daily", "daily-thesis-review"];
  return ["grok-x-scout-friday-deep"];
}

function expectedDisabledDryRunForMode(mode: Track54ModeGate["mode"]): string {
  if (mode === "daily_pulse") return "grok-x-scout-artifact-week-review";
  return "grok-x-scout-friday-deep-artifact-review";
}

function expectedReadyPrerequisiteForMode(mode: Track54ModeGate["mode"]): string {
  if (mode === "daily_pulse") return "daily_pulse promotion_status is ready_for_human_approval";
  return "friday_deep promotion_status is ready_for_human_approval";
}

function proposalValidationBlockersForGate(gate: Track54ModeGate): string[] {
  const blockers: string[] = [];
  const expectedIds = expectedProposalIdsForMode(gate.mode);
  const observedIds = gate.write_mode_codex_automation_proposals.map((proposal) => proposal.id);
  const expectedDisabledDryRun = expectedDisabledDryRunForMode(gate.mode);
  const expectedReadyPrerequisite = expectedReadyPrerequisiteForMode(gate.mode);

  for (const expectedId of expectedIds) {
    if (!observedIds.includes(expectedId)) {
      blockers.push(`${gate.mode} promotion brief is missing proposed write-mode Codex automation ${expectedId}.`);
    }
  }
  for (const observedId of observedIds) {
    if (!expectedIds.includes(observedId)) {
      blockers.push(`${gate.mode} promotion brief includes unexpected proposed write-mode Codex automation ${observedId}.`);
    }
  }

  for (const proposal of gate.write_mode_codex_automation_proposals) {
    const routine = gate.write_mode_routines.find((candidate) => candidate.name === proposal.id);
    if (!routine) {
      blockers.push(`${gate.mode} proposal ${proposal.id} does not match an emitted write-mode routine.`);
      continue;
    }
    if (proposal.kind !== "cron") blockers.push(`${proposal.id} proposal must be a Codex cron automation.`);
    if (proposal.execution_environment !== "local") blockers.push(`${proposal.id} proposal must run in the local workspace environment.`);
    if (proposal.status_after_human_approval !== "ACTIVE") blockers.push(`${proposal.id} proposal must become ACTIVE only after human approval.`);
    if (!proposal.cwds.some((cwd) => normalizePathForComparison(cwd) === normalizePathForComparison(process.cwd()))) {
      blockers.push(`${proposal.id} proposal must target the Bushel Board workspace in cwds.`);
    }
    if (proposal.command !== routine.command) {
      blockers.push(`${proposal.id} proposal command must exactly match the mode-scoped promotion routine command.`);
    }
    const approvalReviewWindow = proposal.approval_review_window as Partial<typeof proposal.approval_review_window> | undefined;
    if (!approvalReviewWindow) {
      blockers.push(`${proposal.id} proposal is missing structured approval_review_window evidence.`);
    } else {
      if (approvalReviewWindow.mode !== gate.mode) {
        blockers.push(`${proposal.id} proposal approval_review_window mode must match ${gate.mode}.`);
      }
      if (approvalReviewWindow.from_date !== gate.review_window.from_date) {
        blockers.push(`${proposal.id} proposal approval_review_window from_date must match ${gate.review_window.from_date}.`);
      }
      if (approvalReviewWindow.to_date !== gate.review_window.to_date) {
        blockers.push(`${proposal.id} proposal approval_review_window to_date must match ${gate.review_window.to_date}.`);
      }
      if (approvalReviewWindow.artifact_days_found !== gate.review_window.artifact_days_found) {
        blockers.push(`${proposal.id} proposal approval_review_window artifact_days_found must match ${gate.review_window.artifact_days_found}.`);
      }
      if (approvalReviewWindow.required_artifact_days !== gate.review_window.required_artifact_days) {
        blockers.push(`${proposal.id} proposal approval_review_window required_artifact_days must match ${gate.review_window.required_artifact_days}.`);
      }
      if (approvalReviewWindow.accepted_signal_count !== gate.evidence.accepted_signal_count) {
        blockers.push(`${proposal.id} proposal approval_review_window accepted_signal_count must match ${gate.evidence.accepted_signal_count}.`);
      }
      if (approvalReviewWindow.accepted_decision_grade_count !== gate.evidence.accepted_decision_grade_count) {
        blockers.push(`${proposal.id} proposal approval_review_window accepted_decision_grade_count must match ${gate.evidence.accepted_decision_grade_count}.`);
      }
    }
    for (const requiredFragment of [
      "--write",
      "--approval-phrase",
      "--approval-review-from",
      gate.review_window.from_date,
      "--approval-review-to",
      gate.review_window.to_date,
    ]) {
      if (!proposal.command.includes(requiredFragment)) {
        blockers.push(`${proposal.id} proposal command is missing ${requiredFragment}.`);
      }
    }
    for (const requiredPromptFragment of [
      "Confirm the matching dry-run artifact collector is disabled or inactive before running.",
      "Confirm this routine was explicitly approved by Kyle",
      `Approved artifact review window: ${gate.mode} ${gate.review_window.from_date} through ${gate.review_window.to_date}.`,
      "Do not call `/api/pipeline/run`",
      routine.command,
    ]) {
      if (!proposal.prompt.includes(requiredPromptFragment)) {
        blockers.push(`${proposal.id} proposal prompt is missing required boundary: ${requiredPromptFragment}`);
      }
    }
    for (const requiredPrecondition of [
      expectedReadyPrerequisite,
      "Kyle explicitly approves the mode-scoped promotion brief",
      `${expectedDisabledDryRun} is disabled or inactive`,
    ]) {
      if (!proposal.create_only_after.includes(requiredPrecondition)) {
        blockers.push(`${proposal.id} proposal create_only_after is missing: ${requiredPrecondition}`);
      }
    }
  }

  return blockers;
}

export function validateWriteModeCodexAutomationProposals(
  modeGates: Track54ModeGate[],
): WriteAutomationProposalValidation {
  const evidence = modeGates.map((gate) => {
    const expectedIds = expectedProposalIdsForMode(gate.mode).join(", ");
    const observedIds = gate.write_mode_codex_automation_proposals.map((proposal) => proposal.id).join(", ") || "none";
    return `${gate.mode}: expected proposed write-mode automations [${expectedIds}], observed [${observedIds}].`;
  });
  const blockers = modeGates.flatMap(proposalValidationBlockersForGate);

  return {
    ok: blockers.length === 0,
    evidence,
    blockers: Array.from(new Set(blockers)),
  };
}

function writeAutomationBoundaryIsSafe(check: WriteAutomationCheck): boolean {
  return check.safe_until_human_approval;
}

function overallStatus(
  modeGates: Track54ModeGate[],
  automationChecks: CodexAutomationCheck[],
  writeAutomationChecks: WriteAutomationCheck[],
): Track54OverallStatus {
  const automationHold = automationChecks.some((check) =>
    !automationCheckIsReady(check)
  );
  const writeAutomationHold = writeAutomationChecks.some((check) =>
    !writeAutomationBoundaryIsSafe(check)
  );
  if (
    automationHold ||
    writeAutomationHold ||
    modeGates.some((gate) => gate.readiness_status === "hold_manual_review")
  ) {
    return "hold_manual_review";
  }
  if (modeGates.every((gate) => gate.readiness_status === "ready_for_human_approval")) {
    return "ready_for_human_approval";
  }
  return "blocked_by_artifact_gates";
}

function nextActionsForStatus(
  status: Track54OverallStatus,
  modeGates: Track54ModeGate[],
  automationChecks: CodexAutomationCheck[],
  writeAutomationChecks: WriteAutomationCheck[],
  acceptanceAudit: Track54AcceptanceAudit,
): string[] {
  const actions: string[] = [];
  const missingOrUnsafeAutomation = automationChecks.filter((check) =>
    !automationCheckIsReady(check)
  );

  if (missingOrUnsafeAutomation.length > 0) {
    actions.push("Fix or re-register Codex automation manifests before treating Track 54 as operational.");
  }
  const unsafeWriteAutomations = writeAutomationChecks.filter((check) =>
    !writeAutomationBoundaryIsSafe(check)
  );
  if (unsafeWriteAutomations.length > 0) {
    actions.push("Disable write-mode Codex automations until the matching artifact gate passes and human approval registers the exact emitted commands.");
  }

  for (const gate of modeGates) {
    if (gate.artifact_gate_projection.missing_clean_artifact_days > 0) {
      actions.push(
        `Let ${gate.mode} dry-run evidence collect until ${gate.review_window.required_artifact_days} clean artifact day(s) are present; current clean count is ${gate.artifact_gate_projection.clean_artifact_days_found}.`,
      );
      if (gate.artifact_gate_projection.next_eligible_run_dates.length > 0) {
        actions.push(
          `${gate.mode} next eligible dry-run date(s): ${gate.artifact_gate_projection.next_eligible_run_dates.join(", ")}.`,
        );
      }
    }
    if (gate.readiness_status === "hold_manual_review") {
      actions.push(`Inspect ${gate.mode} artifact warnings/blockers before any promotion: ${gate.promotion_blockers.join("; ")}`);
    }
  }

  if (status === "ready_for_human_approval") {
    actions.push("Review both mode-scoped promotion briefs and register only the exact emitted write commands after explicit human approval.");
  } else {
    actions.push("Keep production Grok write routines disabled.");
  }
  if (acceptanceAudit.overall_status !== "ready_for_completion_review") {
    for (const blocker of acceptanceAudit.completion_blockers) {
      if (!actions.some((action) => action.includes(blocker))) {
        actions.push(blocker);
      }
    }
  }

  return Array.from(new Set(actions));
}

function automationStatus(id: string, automationChecks: CodexAutomationCheck[]): CodexAutomationCheck | undefined {
  return automationChecks.find((check) => check.id === id);
}

function automationCheckIsReady(check: CodexAutomationCheck | undefined): boolean {
  return check?.observed_status === "active"
    && check.prompt_boundary_present === true
    && check.forbidden_prompt_boundary_present === true
    && check.schedule_boundary_present === true
    && check.kind_boundary_present !== false
    && check.cwd_boundary_present !== false
    && check.target_thread_boundary_present !== false;
}

function activeAutomationBoundary(id: string, automationChecks: CodexAutomationCheck[]): boolean {
  const check = automationStatus(id, automationChecks);
  return automationCheckIsReady(check);
}

function artifactAutomationIdForMode(mode: Track54ModeGate["mode"]): string {
  return mode === "friday_deep"
    ? "grok-x-scout-friday-deep-artifact-review"
    : "grok-x-scout-artifact-week-review";
}

function projectedDatesMatchModeSchedule(gate: Track54ModeGate): boolean {
  return gate.artifact_gate_projection.next_eligible_run_dates.every((dateKey) =>
    gate.mode === "friday_deep" ? isFridayDateKey(dateKey) : isWeekdayDateKey(dateKey)
  );
}

function buildArtifactAutomationCoverage(
  modeGates: Track54ModeGate[],
  automationChecks: CodexAutomationCheck[],
): ArtifactAutomationCoverage[] {
  return modeGates.map((gate) => {
    const automationId = artifactAutomationIdForMode(gate.mode);
    const check = automationStatus(automationId, automationChecks);
    const automationReady = automationCheckIsReady(check);
    const projectedDatesMatchSchedule = projectedDatesMatchModeSchedule(gate);
    return {
      mode: gate.mode,
      automation_id: automationId,
      observed_status: check?.observed_status ?? "missing",
      automation_ready: automationReady,
      projected_dates: gate.artifact_gate_projection.next_eligible_run_dates,
      projected_dates_match_mode_schedule: projectedDatesMatchSchedule,
      covered_by_active_dry_run_automation: automationReady && projectedDatesMatchSchedule,
    };
  });
}

function proofItem(options: {
  id: string;
  requirement: string;
  status: AcceptanceStatus;
  evidence: string[];
  blockers?: string[];
  verificationCommand?: string | null;
}): Track54AcceptanceItem {
  return {
    id: options.id,
    requirement: options.requirement,
    status: options.status,
    evidence: options.evidence,
    blockers: options.blockers ?? [],
    verification_command: options.verificationCommand ?? null,
  };
}

function childEnvWithoutForwardedProofFlags(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.npm_config_browser_smoke_proof;
  return env;
}

function runSourceFreshnessProof(): SourceFreshnessProof {
  const command = "npx tsx scripts/check-bushel-source-freshness.ts --summary";
  const result = spawnSync("npx", ["tsx", "scripts/check-bushel-source-freshness.ts", "--summary"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: childEnvWithoutForwardedProofFlags(),
    shell: true,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    command,
    checked: true,
    ok: result.status === 0,
    output,
  };
}

function envFileHasNonEmptyValue(name: string, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): boolean {
  const directValue = env[name];
  if (directValue && directValue.trim()) return true;
  const envPath = resolve(cwd, ".env.local");
  if (!existsSync(envPath)) return false;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = readFileSync(envPath, "utf-8").match(new RegExp(`^\\s*${escapedName}\\s*=\\s*(.+?)\\s*$`, "m"));
  if (!match) return false;
  const value = match[1]?.trim().replace(/^['"]|['"]$/g, "");
  return Boolean(value);
}

const TRACK54_AUTOMATION_TIME_ZONE = "America/Edmonton";
const TRACK54_DAILY_SCOUT_CUTOFF_MINUTES = 16 * 60 + 10;
const TRACK54_FRIDAY_SCOUT_CUTOFF_MINUTES = 16 * 60 + 50;
const TRACK54_SCOUT_EXPIRY_BUFFER_MINUTES = 5;
const TRACK54_IMMEDIATE_EXPIRY_BUFFER_MINUTES = 15;

function track54LocalParts(date: Date, timeZone = TRACK54_AUTOMATION_TIME_ZONE): {
  dateKey: string;
  weekday: number;
  minutesSinceMidnight: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const minute = value("minute");
  if (!year || !month || !day || !hour || !minute) {
    throw new Error(`Unable to format Track 54 local time in ${timeZone}.`);
  }
  const dateKey = `${year}-${month}-${day}`;
  return {
    dateKey,
    weekday: new Date(`${dateKey}T00:00:00Z`).getUTCDay(),
    minutesSinceMidnight: Number(hour) * 60 + Number(minute),
  };
}

function zonedDateTimeToUtc(dateKey: string, hour: number, minute: number, timeZone = TRACK54_AUTOMATION_TIME_ZONE): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcGuess);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const zonedAsUtc = Date.UTC(
    Number(value("year")),
    Number(value("month")) - 1,
    Number(value("day")),
    Number(value("hour")),
    Number(value("minute")),
  );
  return new Date(utcGuess.getTime() - (zonedAsUtc - utcGuess.getTime()));
}

export function track54GrokCredentialRequiredUntil(now = new Date()): Date {
  const local = track54LocalParts(now);
  const isWeekday = local.weekday >= 1 && local.weekday <= 5;
  const isFriday = local.weekday === 5;
  if (isWeekday && local.minutesSinceMidnight < TRACK54_DAILY_SCOUT_CUTOFF_MINUTES) {
    return zonedDateTimeToUtc(local.dateKey, 16, 10 + TRACK54_SCOUT_EXPIRY_BUFFER_MINUTES);
  }
  if (isFriday && local.minutesSinceMidnight < TRACK54_FRIDAY_SCOUT_CUTOFF_MINUTES) {
    return zonedDateTimeToUtc(local.dateKey, 16, 50 + TRACK54_SCOUT_EXPIRY_BUFFER_MINUTES);
  }
  return new Date(now.getTime() + TRACK54_IMMEDIATE_EXPIRY_BUFFER_MINUTES * 60 * 1000);
}

export function inspectGrokCredentialState(options: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  now?: Date;
} = {}): GrokCredentialState {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date();
  const output: string[] = [];
  const xaiApiKeyPresent = envFileHasNonEmptyValue("XAI_API_KEY", cwd, env);
  output.push(`XAI_API_KEY present: ${xaiApiKeyPresent ? "yes" : "no"}.`);
  if (xaiApiKeyPresent) {
    output.push("Noninteractive xAI credential source is present for the scout runner.");
    return {
      ok: true,
      credential_source: "xai_api_key",
      credential_issue: null,
      xai_api_key_present: true,
      cli_auth_file_present: null,
      cli_auth_expires_at: null,
      cli_auth_expired: null,
      output,
    };
  }

  const grokHome = env.GROK_HOME
    ?? (env.USERPROFILE ? resolve(env.USERPROFILE, ".grok") : null)
    ?? (env.HOME ? resolve(env.HOME, ".grok") : null);
  const authPath = grokHome ? resolve(grokHome, "auth.json") : null;
  const cliAuthFilePresent = Boolean(authPath && existsSync(authPath));
  output.push(`Grok CLI auth file present: ${cliAuthFilePresent ? "yes" : "no"}.`);
  if (!authPath || !cliAuthFilePresent) {
    output.push("Run `grok login` or add XAI_API_KEY before relying on scheduled Track 54 scout jobs.");
    return {
      ok: false,
      credential_source: "none",
      credential_issue: "missing_credential",
      xai_api_key_present: false,
      cli_auth_file_present: cliAuthFilePresent,
      cli_auth_expires_at: null,
      cli_auth_expired: null,
      output,
    };
  }

  let auth: unknown;
  try {
    auth = JSON.parse(readFileSync(authPath, "utf-8"));
  } catch {
    output.push("Grok CLI auth file could not be parsed.");
    return {
      ok: false,
      credential_source: "none",
      credential_issue: "invalid_auth_json",
      xai_api_key_present: false,
      cli_auth_file_present: true,
      cli_auth_expires_at: null,
      cli_auth_expired: null,
      output,
    };
  }
  if (!auth || typeof auth !== "object") {
    output.push("Grok CLI auth file did not contain an auth object.");
    return {
      ok: false,
      credential_source: "none",
      credential_issue: "invalid_auth_json",
      xai_api_key_present: false,
      cli_auth_file_present: true,
      cli_auth_expires_at: null,
      cli_auth_expired: null,
      output,
    };
  }

  const entries = Object.values(auth as Record<string, unknown>)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
  const expiresAtValues = entries
    .map((entry) => entry.expires_at)
    .filter((value): value is string => typeof value === "string");
  if (expiresAtValues.length === 0) {
    output.push("Grok CLI auth expiry was not found in auth.json.");
    return {
      ok: false,
      credential_source: "none",
      credential_issue: "missing_auth_expiry",
      xai_api_key_present: false,
      cli_auth_file_present: true,
      cli_auth_expires_at: null,
      cli_auth_expired: null,
      output,
    };
  }

  const latestExpiry = expiresAtValues
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time)[0];
  if (!latestExpiry) {
    output.push("Grok CLI auth expiry could not be parsed.");
    return {
      ok: false,
      credential_source: "none",
      credential_issue: "unparseable_auth_expiry",
      xai_api_key_present: false,
      cli_auth_file_present: true,
      cli_auth_expires_at: null,
      cli_auth_expired: null,
      output,
    };
  }
  output.push(`Grok CLI auth expires_at: ${latestExpiry.value}.`);
  const ok = latestExpiry.time > now.getTime();
  if (!ok) output.push("Grok CLI auth is expired; run `grok login` or add XAI_API_KEY before retrying Track 54.");
  const requiredUntil = track54GrokCredentialRequiredUntil(now);
  if (ok && latestExpiry.time <= requiredUntil.getTime()) {
    output.push("Grok CLI auth expires before the next Track 54 scout window; refresh auth before relying on scheduled scout jobs.");
    return {
      ok: false,
      credential_source: "none",
      credential_issue: "auth_expires_before_next_scout",
      xai_api_key_present: false,
      cli_auth_file_present: true,
      cli_auth_expires_at: latestExpiry.value,
      cli_auth_expired: false,
      output,
    };
  }
  return {
    ok,
    credential_source: ok ? "grok_cli_auth" : "none",
    credential_issue: ok ? null : "expired_auth",
    xai_api_key_present: false,
    cli_auth_file_present: true,
    cli_auth_expires_at: latestExpiry.value,
    cli_auth_expired: !ok,
    output,
  };
}

function runGrokRunnerProof(): GrokRunnerProof {
  const command = "grok --version + Track54 credential preflight";
  const result = spawnSync("grok", ["--version"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: childEnvWithoutForwardedProofFlags(),
    shell: true,
  });
  const versionOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  const credentialState = inspectGrokCredentialState({
    env: childEnvWithoutForwardedProofFlags(),
  });
  const output = [
    ...versionOutput,
    ...credentialState.output,
  ].slice(0, 12);

  return {
    command,
    checked: true,
    ok: result.status === 0 && credentialState.ok,
    credential_source: credentialState.credential_source,
    credential_issue: credentialState.credential_issue,
    xai_api_key_present: credentialState.xai_api_key_present,
    cli_auth_file_present: credentialState.cli_auth_file_present,
    cli_auth_expires_at: credentialState.cli_auth_expires_at,
    cli_auth_expired: credentialState.cli_auth_expired,
    output,
  };
}

export function runHermesTerminalProof(): HermesTerminalProof {
  const env = childEnvWithoutForwardedProofFlags();
  const versionResult = spawnSync("hermes", ["--version"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env,
    shell: true,
  });
  const statusResult = spawnSync("hermes", ["status"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env,
    shell: true,
  });
  const toolsResult = spawnSync("hermes", ["tools", "list"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env,
    shell: true,
  });
  const modelSmokeResult = spawnSync(
    "hermes",
    [
      "-z",
      "Reply exactly: HERMES_MODEL_OK",
      "--provider",
      "xai-oauth",
      "-m",
      "grok-4.3",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      env,
      shell: false,
      timeout: 90_000,
      windowsHide: true,
    },
  );

  const versionText = `${versionResult.stdout ?? ""}\n${versionResult.stderr ?? ""}\n${versionResult.error?.message ?? ""}`;
  const statusText = `${statusResult.stdout ?? ""}\n${statusResult.stderr ?? ""}\n${statusResult.error?.message ?? ""}`;
  const toolsText = `${toolsResult.stdout ?? ""}\n${toolsResult.stderr ?? ""}\n${toolsResult.error?.message ?? ""}`;
  const modelSmokeText = `${modelSmokeResult.stdout ?? ""}\n${modelSmokeResult.stderr ?? ""}\n${modelSmokeResult.error?.message ?? ""}`;
  const hermesVersionOk = versionResult.status === 0 && /Hermes Agent/i.test(versionText);
  const xaiOauthLoggedIn = statusResult.status === 0 && /xAI OAuth\s+.*logged in/i.test(statusText);
  const modelSmokeOk = modelSmokeResult.status === 0 && /^HERMES_MODEL_OK\s*$/m.test(modelSmokeText.trim());
  const xSearchToolListed = toolsResult.status === 0 && /\bx_search\b/i.test(toolsText);
  const xSearchGloballyEnabled = xSearchToolListed
    ? /enabled\s+x_search/i.test(toolsText)
    : null;
  const toolsetOverrideRequired = xSearchToolListed
    ? !xSearchGloballyEnabled
    : null;
  const output = [
    ...versionText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4),
    `xAI OAuth logged in: ${xaiOauthLoggedIn ? "yes" : "no"}.`,
    `Hermes model smoke: ${modelSmokeOk ? "yes" : "no"}.`,
    `x_search tool listed: ${xSearchToolListed ? "yes" : "no"}.`,
    `x_search globally enabled: ${xSearchGloballyEnabled === null ? "unknown" : xSearchGloballyEnabled ? "yes" : "no"}.`,
    `Hermes terminal runner uses provider xai-oauth, model grok-4.3, and explicit toolset override x_search.`,
  ];

  return {
    command: "hermes --version + hermes status + hermes -z model smoke + hermes tools list",
    checked: true,
    ok: hermesVersionOk && xaiOauthLoggedIn && modelSmokeOk && xSearchToolListed,
    hermes_version_ok: hermesVersionOk,
    xai_oauth_logged_in: xaiOauthLoggedIn,
    model_smoke_ok: modelSmokeOk,
    x_search_tool_listed: xSearchToolListed,
    x_search_globally_enabled: xSearchGloballyEnabled,
    toolset_override_required: toolsetOverrideRequired,
    provider: "xai-oauth",
    model: "grok-4.3",
    output: output.slice(0, 12),
  };
}

function runAcceptanceTestProof(): AcceptanceTestProof {
  const files = [
    "app/api/pipeline/run/route.test.ts",
    "app/(dashboard)/thesis/page.test.tsx",
    "lib/__tests__/daily-thesis-review-packet.test.ts",
    "lib/__tests__/friday-desk-prompt-contract.test.ts",
    "lib/__tests__/friday-x-signal-bundle.test.ts",
    "lib/__tests__/grok-x-scout-artifact-week.test.ts",
    "lib/__tests__/grok-x-scout-contract.test.ts",
    "lib/__tests__/grok-x-scout-promotion-brief.test.ts",
    "lib/__tests__/retired-grok-v1-gate.test.ts",
    "lib/__tests__/track54-migration-contract.test.ts",
    "lib/__tests__/track54-readiness-report.test.ts",
    "lib/__tests__/track54-write-approval.test.ts",
    "lib/__tests__/track54-write-gate.test.ts",
    "lib/__tests__/x-scout-output-merge.test.ts",
    "lib/__tests__/x-scout-runs.test.ts",
    "lib/__tests__/x-signal-validation.test.ts",
    "lib/__tests__/x-signal-valuation.test.ts",
    "lib/__tests__/x-signals.test.ts",
  ];
  const args = [
    "vitest",
    "run",
    ...files,
    "--pool=threads",
    "--maxWorkers=1",
    "--no-file-parallelism",
    "--environment=node",
  ];
  const command = `npx ${args.join(" ")}`;
  const vitestEntrypoint = resolve(process.cwd(), "node_modules", "vitest", "vitest.mjs");
  const result = spawnSync(process.execPath, [vitestEntrypoint, ...args.slice(1)], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: childEnvWithoutForwardedProofFlags(),
    shell: false,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-18);

  return {
    command,
    checked: true,
    ok: result.status === 0,
    output,
  };
}

const MAX_BROWSER_SMOKE_PROOF_AGE_MS = 6 * 60 * 60 * 1000;
const REQUIRED_BROWSER_SMOKE_ROUTES = ["/thesis", "/thesis?audit=1"] as const;
const REQUIRED_BROWSER_SMOKE_VIEWPORTS = ["desktop", "mobile"] as const;
const MIN_BROWSER_SMOKE_SCREENSHOT_BYTES = 2_048;
const MIN_BROWSER_SMOKE_SCREENSHOT_SAMPLE_PIXELS = 1_000;
const MIN_BROWSER_SMOKE_SCREENSHOT_DISTINCT_COLORS = 8;
const MIN_BROWSER_SMOKE_SCREENSHOT_NON_WHITE_RATIO = 0.005;
const MIN_BROWSER_SMOKE_SCREENSHOT_LUMA_RANGE = 16;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const EXPECTED_BROWSER_SMOKE_VIEWPORT_DIMENSIONS: Record<typeof REQUIRED_BROWSER_SMOKE_VIEWPORTS[number], { width: number; height: number }> = {
  desktop: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};

interface ScreenshotVisualStats {
  samplePixels: number;
  distinctColors: number;
  nonWhiteRatio: number;
  lumaRange: number;
}

function hasPngSignature(buffer: Buffer): boolean {
  return PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

function pngDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (!hasPngSignature(buffer) || buffer.length < 24) return undefined;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function decodePngPixels(buffer: Buffer): { width: number; height: number; colorType: number; bytesPerPixel: number; pixels: Buffer } | undefined {
  if (!hasPngSignature(buffer)) return undefined;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compressionMethod = 0;
  let filterMethod = 0;
  let interlaceMethod = 0;
  const idatChunks: Buffer[] = [];

  for (let offset: number = PNG_SIGNATURE.length; offset + 8 <= buffer.length;) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    const nextOffset = chunkEnd + 4;
    if (chunkEnd > buffer.length || nextOffset > buffer.length) return undefined;

    const chunkData = buffer.subarray(chunkStart, chunkEnd);
    if (chunkType === "IHDR") {
      if (chunkLength !== 13) return undefined;
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8] ?? 0;
      colorType = chunkData[9] ?? 0;
      compressionMethod = chunkData[10] ?? 0;
      filterMethod = chunkData[11] ?? 0;
      interlaceMethod = chunkData[12] ?? 0;
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }

    offset = nextOffset;
  }

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (
    width <= 0
    || height <= 0
    || bitDepth !== 8
    || bytesPerPixel === 0
    || compressionMethod !== 0
    || filterMethod !== 0
    || interlaceMethod !== 0
    || idatChunks.length === 0
  ) {
    return undefined;
  }

  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return undefined;
  }

  const rowByteLength = width * bytesPerPixel;
  const expectedByteLength = height * (rowByteLength + 1);
  if (inflated.length < expectedByteLength) return undefined;

  const pixels = Buffer.alloc(height * rowByteLength);
  for (let row = 0; row < height; row += 1) {
    const inflatedRowStart = row * (rowByteLength + 1);
    const filterType = inflated[inflatedRowStart];
    const outputRowStart = row * rowByteLength;
    const previousRowStart = row > 0 ? outputRowStart - rowByteLength : undefined;

    if (filterType === undefined || filterType > 4) return undefined;

    for (let column = 0; column < rowByteLength; column += 1) {
      const raw = inflated[inflatedRowStart + 1 + column] ?? 0;
      const left = column >= bytesPerPixel ? pixels[outputRowStart + column - bytesPerPixel] ?? 0 : 0;
      const up = previousRowStart !== undefined ? pixels[previousRowStart + column] ?? 0 : 0;
      const upLeft = previousRowStart !== undefined && column >= bytesPerPixel
        ? pixels[previousRowStart + column - bytesPerPixel] ?? 0
        : 0;
      const prediction =
        filterType === 0 ? 0
          : filterType === 1 ? left
            : filterType === 2 ? up
              : filterType === 3 ? Math.floor((left + up) / 2)
                : paethPredictor(left, up, upLeft);
      pixels[outputRowStart + column] = (raw + prediction) & 0xff;
    }
  }

  return { width, height, colorType, bytesPerPixel, pixels };
}

function analyzePngScreenshotVisual(buffer: Buffer): ScreenshotVisualStats | undefined {
  const decoded = decodePngPixels(buffer);
  if (!decoded) return undefined;

  const scale = 96 / Math.max(decoded.width, decoded.height);
  const sampleWidth = Math.max(1, Math.round(decoded.width * scale));
  const sampleHeight = Math.max(1, Math.round(decoded.height * scale));
  const colors = new Set<string>();
  let nonWhite = 0;
  let minLuma = 255;
  let maxLuma = 0;

  for (let y = 0; y < sampleHeight; y += 1) {
    const sourceY = Math.min(decoded.height - 1, Math.floor((y + 0.5) * decoded.height / sampleHeight));
    for (let x = 0; x < sampleWidth; x += 1) {
      const sourceX = Math.min(decoded.width - 1, Math.floor((x + 0.5) * decoded.width / sampleWidth));
      const pixelOffset = (sourceY * decoded.width + sourceX) * decoded.bytesPerPixel;
      const red = decoded.colorType === 0 ? decoded.pixels[pixelOffset] ?? 0 : decoded.pixels[pixelOffset] ?? 0;
      const green = decoded.colorType === 0 ? red : decoded.pixels[pixelOffset + 1] ?? 0;
      const blue = decoded.colorType === 0 ? red : decoded.pixels[pixelOffset + 2] ?? 0;
      const alpha = decoded.colorType === 6 ? decoded.pixels[pixelOffset + 3] ?? 255 : 255;
      const compositedRed = Math.round((red * alpha + 255 * (255 - alpha)) / 255);
      const compositedGreen = Math.round((green * alpha + 255 * (255 - alpha)) / 255);
      const compositedBlue = Math.round((blue * alpha + 255 * (255 - alpha)) / 255);
      colors.add(`${compositedRed >> 4}:${compositedGreen >> 4}:${compositedBlue >> 4}`);
      if (compositedRed < 245 || compositedGreen < 245 || compositedBlue < 245) nonWhite += 1;
      const luma = 0.2126 * compositedRed + 0.7152 * compositedGreen + 0.0722 * compositedBlue;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
  }

  const samplePixels = sampleWidth * sampleHeight;
  return {
    samplePixels,
    distinctColors: colors.size,
    nonWhiteRatio: Number((nonWhite / samplePixels).toFixed(4)),
    lumaRange: Number((maxLuma - minLuma).toFixed(1)),
  };
}

function isPathInsideDirectory(path: string, directory: string): boolean {
  const relativePath = relative(resolve(directory), resolve(path));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function browserSmokeRouteFileStem(route: string): string {
  return route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}

function expectedBrowserSmokeScreenshotFileName(viewport: string, route: string): string {
  return `${viewport}-${browserSmokeRouteFileStem(route)}.png`;
}

function expectedBrowserSmokeOriginFromCommand(command: string): { origin?: string; failure?: string } {
  const match = command.match(/(?:^|\s)--base-url(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const baseUrlText = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!baseUrlText) {
    return { failure: "Browser smoke proof command is missing --base-url." };
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlText);
  } catch {
    return { failure: `Browser smoke proof command base URL is invalid: ${baseUrlText}` };
  }

  if (baseUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(baseUrl.hostname)) {
    return { failure: `Browser smoke proof command base URL is not a local app URL: ${baseUrlText}` };
  }

  return { origin: baseUrl.origin };
}

function validateLoadedBrowserSmokeUrl(
  loadedLine: string,
  loadedFragment: string,
  route: string,
  viewport: string,
  expectedOrigin?: string,
): string | undefined {
  const loadedUrlText = loadedLine.slice(loadedLine.indexOf(loadedFragment) + loadedFragment.length).trim();
  if (loadedUrlText.length === 0) {
    return `Browser smoke proof loaded URL is empty for ${viewport} ${route}.`;
  }

  let loadedUrl: URL;
  try {
    loadedUrl = new URL(loadedUrlText);
  } catch {
    return `Browser smoke proof loaded URL is invalid for ${viewport} ${route}: ${loadedUrlText}`;
  }

  if (loadedUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(loadedUrl.hostname)) {
    return `Browser smoke proof loaded URL is not a local app URL for ${viewport} ${route}: ${loadedUrlText}`;
  }

  if (expectedOrigin && loadedUrl.origin !== expectedOrigin) {
    return `Browser smoke proof loaded URL origin does not match command base URL for ${viewport} ${route}: loaded=${loadedUrl.origin} expected=${expectedOrigin}`;
  }

  const loadedRoute = `${loadedUrl.pathname}${loadedUrl.search}`;
  if (loadedRoute !== route) {
    return `Browser smoke proof loaded wrong route for ${viewport} ${route}: ${loadedRoute}`;
  }

  return undefined;
}

function validateBrowserSmokeProofFreshness(
  proof: Partial<BrowserSmokeProof>,
  now = new Date(),
): string[] {
  const failures: string[] = [];
  if (proof.schema_version !== "track54_browser_smoke_proof_v1") {
    failures.push("Browser smoke proof schema_version must be track54_browser_smoke_proof_v1.");
  }
  if (typeof proof.generated_at !== "string" || proof.generated_at.trim().length === 0) {
    failures.push("Browser smoke proof is missing generated_at.");
    return failures;
  }
  const generatedAt = new Date(proof.generated_at);
  if (Number.isNaN(generatedAt.getTime())) {
    failures.push(`Browser smoke proof generated_at is invalid: ${proof.generated_at}.`);
    return failures;
  }
  if (generatedAt.getTime() > now.getTime() + 60_000) {
    failures.push(`Browser smoke proof generated_at is in the future: ${proof.generated_at}.`);
  }
  const ageMs = now.getTime() - generatedAt.getTime();
  if (ageMs > MAX_BROWSER_SMOKE_PROOF_AGE_MS) {
    failures.push("Browser smoke proof is older than 6 hours; rerun npm run track54:browser-smoke.");
  }
  return failures;
}

function validateBrowserSmokeProofCoverage(proof: Partial<BrowserSmokeProof>, proofDirectory: string, command: string): string[] {
  const failures: string[] = [];
  const output = Array.isArray(proof.output) ? proof.output : [];
  const expectedOriginResult = expectedBrowserSmokeOriginFromCommand(command);
  if (expectedOriginResult.failure) failures.push(expectedOriginResult.failure);
  const screenshotClaims = new Map<string, string>();

  for (const viewport of REQUIRED_BROWSER_SMOKE_VIEWPORTS) {
    for (const route of REQUIRED_BROWSER_SMOKE_ROUTES) {
      const prefix = `${viewport} ${route}:`;
      const loadedFragment = `${prefix} loaded `;
      const screenshotFragment = `${prefix} screenshot=`;
      const screenshotBytesFragment = `${prefix} screenshot_bytes=`;
      const screenshotDimensionsFragment = `${prefix} screenshot_dimensions=`;
      const screenshotVisualFragment = `${prefix} screenshot_visual=`;
      const visibleMarkersFragment = `${prefix} visible_markers=`;
      const requiredFragments = [
        loadedFragment,
        `${prefix} markers=`,
        visibleMarkersFragment,
        `${prefix} forbidden_hits=none`,
        `${prefix} console_errors=0`,
        `${prefix} interaction=theme_toggle:ok`,
        screenshotFragment,
        screenshotBytesFragment,
        screenshotDimensionsFragment,
        screenshotVisualFragment,
      ];

      for (const fragment of requiredFragments) {
        if (!output.some((line) => line.includes(fragment))) {
          failures.push(`Browser smoke proof missing ${fragment}`);
        }
      }

      const loadedLine = output.find((line) => line.includes(loadedFragment));
      if (loadedLine) {
        const loadedUrlFailure = validateLoadedBrowserSmokeUrl(
          loadedLine,
          loadedFragment,
          route,
          viewport,
          expectedOriginResult.origin,
        );
        if (loadedUrlFailure) failures.push(loadedUrlFailure);
      }

      const screenshotLine = output.find((line) => line.includes(screenshotFragment));
      if (!screenshotLine) continue;
      const screenshotBytesLine = output.find((line) => line.includes(screenshotBytesFragment));
      const screenshotDimensionsLine = output.find((line) => line.includes(screenshotDimensionsFragment));
      const screenshotVisualLine = output.find((line) => line.includes(screenshotVisualFragment));
      const visibleMarkersLine = output.find((line) => line.includes(visibleMarkersFragment));

      if (visibleMarkersLine) {
        const visibleMarkerText = visibleMarkersLine
          .slice(visibleMarkersLine.indexOf(visibleMarkersFragment) + visibleMarkersFragment.length)
          .trim();
        const visibleMarkerStatuses = visibleMarkerText
          .split(",")
          .map((part) => part.trim().split(":").pop()?.trim())
          .filter((status): status is string => Boolean(status));
        if (visibleMarkerStatuses.length === 0) {
          failures.push(`Browser smoke proof has no visible marker statuses for ${viewport} ${route}.`);
        } else if (visibleMarkerStatuses.some((status) => status !== "visible")) {
          failures.push(`Browser smoke proof has hidden, covered, or missing visible markers for ${viewport} ${route}.`);
        }
      }

      const screenshotPath = screenshotLine
        .slice(screenshotLine.indexOf(screenshotFragment) + screenshotFragment.length)
        .trim();
      if (screenshotPath.length === 0) {
        failures.push(`Browser smoke proof screenshot path is empty for ${viewport} ${route}.`);
        continue;
      }
      const expectedScreenshotFileName = expectedBrowserSmokeScreenshotFileName(viewport, route);

      let expectedScreenshotBytes: number | undefined;
      if (screenshotBytesLine) {
        const screenshotBytesText = screenshotBytesLine
          .slice(screenshotBytesLine.indexOf(screenshotBytesFragment) + screenshotBytesFragment.length)
          .trim();
        if (/^\d+$/.test(screenshotBytesText)) {
          expectedScreenshotBytes = Number.parseInt(screenshotBytesText, 10);
          if (expectedScreenshotBytes < MIN_BROWSER_SMOKE_SCREENSHOT_BYTES) {
            failures.push(`Browser smoke proof screenshot byte count is too small for ${viewport} ${route}: ${expectedScreenshotBytes}`);
          }
        } else {
          failures.push(`Browser smoke proof screenshot byte count is invalid for ${viewport} ${route}: ${screenshotBytesText || "(empty)"}`);
        }
      }

      let expectedScreenshotDimensions: { width: number; height: number } | undefined;
      if (screenshotDimensionsLine) {
        const screenshotDimensionsText = screenshotDimensionsLine
          .slice(screenshotDimensionsLine.indexOf(screenshotDimensionsFragment) + screenshotDimensionsFragment.length)
          .trim();
        const dimensionsMatch = /^(\d+)x(\d+)$/.exec(screenshotDimensionsText);
        if (dimensionsMatch) {
          expectedScreenshotDimensions = {
            width: Number.parseInt(dimensionsMatch[1]!, 10),
            height: Number.parseInt(dimensionsMatch[2]!, 10),
          };
          const expectedViewportDimensions = EXPECTED_BROWSER_SMOKE_VIEWPORT_DIMENSIONS[viewport];
          if (
            expectedScreenshotDimensions.width !== expectedViewportDimensions.width
            || expectedScreenshotDimensions.height !== expectedViewportDimensions.height
          ) {
            failures.push(`Browser smoke proof screenshot dimensions do not match ${viewport} viewport for ${route}: proof=${expectedScreenshotDimensions.width}x${expectedScreenshotDimensions.height} expected=${expectedViewportDimensions.width}x${expectedViewportDimensions.height}`);
          }
        } else {
          failures.push(`Browser smoke proof screenshot dimensions are invalid for ${viewport} ${route}: ${screenshotDimensionsText || "(empty)"}`);
        }
      }

      if (screenshotVisualLine) {
        const screenshotVisualText = screenshotVisualLine
          .slice(screenshotVisualLine.indexOf(screenshotVisualFragment) + screenshotVisualFragment.length)
          .trim();
        const visualStats = Object.fromEntries(
          screenshotVisualText.split(/\s+/)
            .map((part) => part.split("="))
            .filter((parts): parts is [string, string] => parts.length === 2 && parts[0] !== "" && parts[1] !== ""),
        );
        const samplePixels = Number(visualStats.sample_pixels);
        const distinctColors = Number(visualStats.distinct_colors);
        const nonWhiteRatio = Number(visualStats.non_white_ratio);
        const lumaRange = Number(visualStats.luma_range);

        if (![samplePixels, distinctColors, nonWhiteRatio, lumaRange].every(Number.isFinite)) {
          failures.push(`Browser smoke proof screenshot visual stats are invalid for ${viewport} ${route}: ${screenshotVisualText || "(empty)"}`);
        } else {
          if (samplePixels < MIN_BROWSER_SMOKE_SCREENSHOT_SAMPLE_PIXELS) {
            failures.push(`Browser smoke proof screenshot visual sample is too small for ${viewport} ${route}: ${samplePixels}`);
          }
          if (distinctColors < MIN_BROWSER_SMOKE_SCREENSHOT_DISTINCT_COLORS) {
            failures.push(`Browser smoke proof screenshot has too few sampled colors for ${viewport} ${route}: ${distinctColors}`);
          }
          if (nonWhiteRatio < MIN_BROWSER_SMOKE_SCREENSHOT_NON_WHITE_RATIO) {
            failures.push(`Browser smoke proof screenshot non-white ratio is too low for ${viewport} ${route}: ${nonWhiteRatio}`);
          }
          if (lumaRange < MIN_BROWSER_SMOKE_SCREENSHOT_LUMA_RANGE) {
            failures.push(`Browser smoke proof screenshot luma range is too low for ${viewport} ${route}: ${lumaRange}`);
          }
        }
      }

      const resolvedProofDirectory = resolve(proofDirectory);
      const resolvedScreenshotPath = resolve(resolvedProofDirectory, screenshotPath);
      if (!isPathInsideDirectory(resolvedScreenshotPath, resolvedProofDirectory)) {
        failures.push(`Browser smoke proof screenshot path is outside proof directory for ${viewport} ${route}: ${screenshotPath}`);
        continue;
      }
      const screenshotFileName = basename(resolvedScreenshotPath);
      if (screenshotFileName !== expectedScreenshotFileName) {
        failures.push(`Browser smoke proof screenshot filename does not match ${viewport} ${route}: proof=${screenshotFileName} expected=${expectedScreenshotFileName}`);
      }

      const screenshotClaimKey = process.platform === "win32" ? resolvedScreenshotPath.toLowerCase() : resolvedScreenshotPath;
      const screenshotClaim = `${viewport} ${route}`;
      const previousScreenshotClaim = screenshotClaims.get(screenshotClaimKey);
      if (previousScreenshotClaim) {
        failures.push(`Browser smoke proof reuses screenshot path for ${screenshotClaim}; already used by ${previousScreenshotClaim}: ${screenshotPath}`);
      } else {
        screenshotClaims.set(screenshotClaimKey, screenshotClaim);
      }

      try {
        const screenshotBuffer = readFileSync(resolvedScreenshotPath);
        const screenshotStats = statSync(resolvedScreenshotPath);
        if (!screenshotStats.isFile() || screenshotStats.size <= 0) {
          failures.push(`Browser smoke proof screenshot is missing or empty for ${viewport} ${route}: ${screenshotPath}`);
        } else if (expectedScreenshotBytes !== undefined && screenshotStats.size !== expectedScreenshotBytes) {
          failures.push(`Browser smoke proof screenshot byte count mismatch for ${viewport} ${route}: proof=${expectedScreenshotBytes} actual=${screenshotStats.size}`);
        } else if (!hasPngSignature(screenshotBuffer)) {
          failures.push(`Browser smoke proof screenshot is not a PNG file for ${viewport} ${route}: ${screenshotPath}`);
        } else {
          const actualScreenshotDimensions = pngDimensions(screenshotBuffer);
          if (!actualScreenshotDimensions) {
            failures.push(`Browser smoke proof screenshot dimensions could not be read for ${viewport} ${route}: ${screenshotPath}`);
          } else if (
            expectedScreenshotDimensions !== undefined
            && (
              actualScreenshotDimensions.width !== expectedScreenshotDimensions.width
              || actualScreenshotDimensions.height !== expectedScreenshotDimensions.height
            )
          ) {
            failures.push(`Browser smoke proof screenshot dimension mismatch for ${viewport} ${route}: proof=${expectedScreenshotDimensions.width}x${expectedScreenshotDimensions.height} actual=${actualScreenshotDimensions.width}x${actualScreenshotDimensions.height}`);
          }

          const actualVisualStats = analyzePngScreenshotVisual(screenshotBuffer);
          if (!actualVisualStats) {
            failures.push(`Browser smoke proof screenshot visual stats could not be read from PNG for ${viewport} ${route}: ${screenshotPath}`);
          } else {
            if (actualVisualStats.samplePixels < MIN_BROWSER_SMOKE_SCREENSHOT_SAMPLE_PIXELS) {
              failures.push(`Browser smoke proof actual screenshot visual sample is too small for ${viewport} ${route}: ${actualVisualStats.samplePixels}`);
            }
            if (actualVisualStats.distinctColors < MIN_BROWSER_SMOKE_SCREENSHOT_DISTINCT_COLORS) {
              failures.push(`Browser smoke proof actual screenshot has too few sampled colors for ${viewport} ${route}: ${actualVisualStats.distinctColors}`);
            }
            if (actualVisualStats.nonWhiteRatio < MIN_BROWSER_SMOKE_SCREENSHOT_NON_WHITE_RATIO) {
              failures.push(`Browser smoke proof actual screenshot non-white ratio is too low for ${viewport} ${route}: ${actualVisualStats.nonWhiteRatio}`);
            }
            if (actualVisualStats.lumaRange < MIN_BROWSER_SMOKE_SCREENSHOT_LUMA_RANGE) {
              failures.push(`Browser smoke proof actual screenshot luma range is too low for ${viewport} ${route}: ${actualVisualStats.lumaRange}`);
            }
          }
        }
      } catch {
        failures.push(`Browser smoke proof screenshot file not found for ${viewport} ${route}: ${screenshotPath}`);
      }
    }
  }

  return failures;
}

export function loadBrowserSmokeProof(proofPath?: string, now = new Date()): BrowserSmokeProof | undefined {
  if (!proofPath) return undefined;

  const resolvedPath = resolve(proofPath);
  const fallbackCommand = `Browser smoke proof file: ${resolvedPath}`;
  try {
    const rawProof: unknown = JSON.parse(readFileSync(resolvedPath, "utf-8"));
    if (!rawProof || typeof rawProof !== "object" || Array.isArray(rawProof)) {
      throw new Error("proof JSON must be an object");
    }

    const proof = rawProof as Partial<BrowserSmokeProof>;
    if (!Array.isArray(proof.output) || proof.output.some((line) => typeof line !== "string")) {
      throw new Error("proof output must be an array of strings");
    }

    const command = typeof proof.command === "string" && proof.command.trim().length > 0
      ? proof.command
      : "Browser smoke /thesis /thesis?audit=1 /overview";
    const checked = proof.checked === true;
    const freshnessFailures = validateBrowserSmokeProofFreshness(proof, now);
    const coverageFailures = validateBrowserSmokeProofCoverage(proof, dirname(resolvedPath), command);
    const ok = checked && proof.ok === true && freshnessFailures.length === 0 && coverageFailures.length === 0;
    return {
      schema_version: proof.schema_version,
      generated_at: proof.generated_at,
      command,
      checked,
      ok,
      output: [
        ...proof.output,
        ...(checked ? [] : ["Browser smoke proof file did not set checked=true."]),
        ...freshnessFailures,
        ...coverageFailures,
      ],
    };
  } catch (error) {
    return {
      command: fallbackCommand,
      checked: true,
      ok: false,
      output: [
        `Unable to load browser smoke proof: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function statusFromModeGate(gate: Track54ModeGate): AcceptanceStatus {
  if (gate.readiness_status === "hold_manual_review") return "hold_manual_review";
  if (gate.readiness_status === "blocked_by_artifact_gates") return "blocked_by_artifact_gates";
  return "proven";
}

function buildTrack54AcceptanceAudit(
  modeGates: Track54ModeGate[],
  automationChecks: CodexAutomationCheck[],
  artifactAutomationCoverage: ArtifactAutomationCoverage[],
  writeAutomationChecks: WriteAutomationCheck[],
  grokRunnerProof?: GrokRunnerProof,
  hermesTerminalProof?: HermesTerminalProof,
  sourceFreshnessProof?: SourceFreshnessProof,
  acceptanceTestProof?: AcceptanceTestProof,
  browserSmokeProof?: BrowserSmokeProof,
): Track54AcceptanceAudit {
  const dailyGate = modeGates.find((gate) => gate.mode === "daily_pulse");
  const fridayGate = modeGates.find((gate) => gate.mode === "friday_deep");
  if (!dailyGate || !fridayGate) {
    throw new Error("Track 54 acceptance audit requires both daily_pulse and friday_deep mode gates");
  }

  const priceAutomationOk = activeAutomationBoundary("canola-price-and-fx-freshness-import", automationChecks);
  const grokPreflightAutomationOk = activeAutomationBoundary("track-54-grok-auth-preflight", automationChecks);
  const dailyAutomationOk = activeAutomationBoundary("grok-x-scout-artifact-week-review", automationChecks);
  const dailyArtifactHealthAutomationOk = activeAutomationBoundary("track-54-daily-artifact-health-check", automationChecks);
  const fridayAutomationOk = activeAutomationBoundary("grok-x-scout-friday-deep-artifact-review", automationChecks);
  const fridayArtifactHealthAutomationOk = activeAutomationBoundary("track-54-friday-artifact-health-check", automationChecks);
  const lateGrokRecoveryAutomationOk = activeAutomationBoundary("track-54-late-grok-auth-recovery", automationChecks);
  const hermesShadowAutomationOk = activeAutomationBoundary("track-54-hermes-x-scout-prompt-bridge", automationChecks);
  const promotionHeartbeatOk = activeAutomationBoundary("track-54-promotion-review", automationChecks);
  const artifactAutomationCoverageOk = artifactAutomationCoverage.every((coverage) =>
    coverage.covered_by_active_dry_run_automation
  );
  const artifactAutomationCoverageEvidence = artifactAutomationCoverage.map((coverage) => {
    const projectedDates = coverage.projected_dates.length > 0
      ? coverage.projected_dates.join(", ")
      : "no remaining projected dates";
    return `${coverage.mode}: ${coverage.automation_id} is ${coverage.observed_status}; projected dates: ${projectedDates}; mode-schedule match: ${coverage.projected_dates_match_mode_schedule}.`;
  });
  const artifactAutomationCoverageBlockers = artifactAutomationCoverage
    .filter((coverage) => !coverage.covered_by_active_dry_run_automation)
    .map((coverage) =>
      `${coverage.mode} projected artifact dates are not covered by an active dry-run Codex automation with the expected schedule and prompt boundaries.`
    );
  const writeAutomationsSafe = writeAutomationChecks.every(writeAutomationBoundaryIsSafe);
  const writeAutomationEvidence = writeAutomationChecks.map((check) => {
    if (check.observed_status === "missing") return `${check.id}: missing.`;
    return `${check.id}: ${check.observed_status}; schedule=${check.schedule_boundary_present}; cwd=${check.cwd_boundary_present}; prompt=${check.prompt_boundary_present}; write_command=${check.prompt_contains_write_command}.`;
  });
  const unsafeWriteAutomationBlockers = writeAutomationChecks
    .filter((check) => !writeAutomationBoundaryIsSafe(check))
    .flatMap((check) => {
      if (check.observed_status === "active") {
        return [`${check.id} is active; keep it missing or inactive until matching-mode human approval.`];
      }
      const blockers = [`${check.id} inactive manifest is not promotion-ready; keep it paused and fix its schedule, workspace, and prompt guardrails before approval.`];
      if (check.schedule_boundary_present === false) blockers.push(`${check.id} inactive manifest has the wrong schedule.`);
      if (check.cwd_boundary_present === false) blockers.push(`${check.id} inactive manifest points at the wrong workspace.`);
      if (check.prompt_boundary_present === false && check.missing_prompt_fragments && check.missing_prompt_fragments.length > 0) {
        blockers.push(`${check.id} inactive manifest is missing prompt fragment(s): ${check.missing_prompt_fragments.join("; ")}.`);
      }
      return blockers;
    });
  const handoffTransitions = modeGates.map((gate) => gate.post_approval_automation_transition);
  const handoffTransitionEvidence = modeGates.map((gate) =>
    `${gate.mode}: disable [${gate.post_approval_automation_transition.disable_before_registering_write_mode.join(", ") || "none"}], then register [${gate.post_approval_automation_transition.register_after_disable.join(", ") || "none"}], keep active [${gate.post_approval_automation_transition.keep_active.join(", ") || "none"}].`
  );
  const handoffTransitionOk = handoffTransitions.every((transition) =>
    transition.keep_active.includes("canola-price-and-fx-freshness-import")
  ) && dailyGate.post_approval_automation_transition.disable_before_registering_write_mode.includes("grok-x-scout-artifact-week-review")
    && dailyGate.post_approval_automation_transition.register_after_disable.includes("grok-x-scout-daily")
    && dailyGate.post_approval_automation_transition.register_after_disable.includes("daily-thesis-review")
    && fridayGate.post_approval_automation_transition.disable_before_registering_write_mode.includes("grok-x-scout-friday-deep-artifact-review")
    && fridayGate.post_approval_automation_transition.register_after_disable.includes("grok-x-scout-friday-deep");
  const handoffTransitionBlockers = handoffTransitionOk
    ? []
    : ["Promotion briefs must disable matching dry-run artifact collectors before registering write-mode Grok automations."];
  const proposalValidation = validateWriteModeCodexAutomationProposals(modeGates);
  const selectedDailyArtifactEvidence = dailyGate.selected_artifacts.length > 0
    ? dailyGate.selected_artifacts.map((artifact) =>
      `selected ${artifact.date}: ${artifact.artifact_sha256 ?? "sha-missing"} (${artifact.accepted_signal_count} accepted, ${artifact.accepted_decision_grade_count} decision-grade) at ${artifact.artifact_path}.`
    )
    : ["No daily_pulse artifacts selected by the reviewer."];
  const fridayDeskFilesPresent = [
    "scripts/build-friday-x-signal-bundle.ts",
    "docs/reference/grain-desk-swarm-prompt.md",
    "docs/reference/us-desk-swarm-prompt.md",
  ].every((path) => existsSync(resolve(process.cwd(), path)));
  const thesisUiFilesPresent = [
    "app/(dashboard)/thesis/page.tsx",
    "app/(dashboard)/thesis/page.test.tsx",
  ].every((path) => existsSync(resolve(process.cwd(), path)));
  const auditFilesPresent = [
    "lib/__tests__/x-signal-validation.test.ts",
    "lib/__tests__/x-signals.test.ts",
  ].every((path) => existsSync(resolve(process.cwd(), path)));
  const retiredPipelineProofPresent = [
    "app/api/pipeline/run/route.test.ts",
    "lib/__tests__/retired-grok-v1-gate.test.ts",
  ].every((path) => existsSync(resolve(process.cwd(), path)));
  const migrationContractProofPresent = [
    "lib/__tests__/track54-migration-contract.test.ts",
    "supabase/migrations/20260601041000_create_x_scout_runs.sql",
    "supabase/migrations/20260601041100_extend_x_market_signal_metadata.sql",
    "supabase/migrations/20260601041200_allow_daily_pulse_soft_review.sql",
    "supabase/migrations/20260601052000_make_x_signal_hash_upsertable.sql",
  ].every((path) => existsSync(resolve(process.cwd(), path)));
  const sourceFreshnessStatus: AcceptanceStatus = sourceFreshnessProof
    ? sourceFreshnessProof.ok ? "proven" : "hold_manual_review"
    : "needs_live_verification";
  const sourceFreshnessEvidence = sourceFreshnessProof
    ? [
      `Ran ${sourceFreshnessProof.command}.`,
      ...sourceFreshnessProof.output,
    ]
    : [
      "This readiness report did not run live official-source collectors.",
      "Use the source-freshness watchdog as the live collector proof.",
    ];
  const sourceFreshnessBlockers = sourceFreshnessProof
    ? sourceFreshnessProof.ok ? [] : ["Source-freshness watchdog failed during the readiness check."]
    : ["Needs fresh live source-freshness proof before declaring the full feature complete."];
  const grokProof = grokRunnerProof ?? {
    command: "grok --version + Track54 credential preflight",
    checked: false,
    ok: false,
    output: [],
  };
  const hermesNoWriteFallbackReady = Boolean(
    hermesTerminalProof?.checked
    && hermesTerminalProof.ok
    && hermesShadowAutomationOk
    && (dailyArtifactHealthAutomationOk || fridayArtifactHealthAutomationOk || lateGrokRecoveryAutomationOk),
  );
  const grokRunnerStatus: AcceptanceStatus = grokProof.checked
    ? grokProof.ok ? "proven" : "hold_manual_review"
    : "needs_live_verification";
  const grokRunnerEvidence = grokProof.checked
    ? [
      `Ran ${grokProof.command}.`,
      ...grokProof.output,
      ...(hermesNoWriteFallbackReady
        ? ["Hermes terminal fallback is ready for no-write artifact recovery, but normal Grok credentials are still required before any write-mode approval."]
        : []),
    ]
    : [
      "This readiness report did not check the local Grok CLI runner or credential source.",
    ];
  const grokRunnerBlockers = grokProof.checked
    ? grokProof.ok
      ? []
      : hermesNoWriteFallbackReady
        ? ["Grok CLI/auth preflight failed; Hermes terminal fallback can collect no-write artifacts, but refresh Grok CLI auth or add XAI_API_KEY before any write-mode approval."]
        : ["Grok CLI/auth preflight failed; scheduled dry-run X scout jobs will not collect artifacts until Grok CLI auth is refreshed or XAI_API_KEY is present for the auto runner."]
    : ["Run the Grok CLI/auth preflight before declaring the daily X scout runner ready."];
  const focusedTestProof = acceptanceTestProof ?? {
    command: "npx vitest run <Track 54 acceptance slice>",
    checked: false,
    ok: false,
    output: [],
  };
  const focusedTestsStatus: AcceptanceStatus = focusedTestProof.checked
    ? focusedTestProof.ok ? "proven" : "hold_manual_review"
    : "needs_live_verification";
  const focusedTestsEvidence = focusedTestProof.checked
    ? [
      `Focused acceptance tests ${focusedTestProof.ok ? "passed" : "failed"}: ${focusedTestProof.command}.`,
    ]
    : [
      "Focused acceptance tests were not run in this readiness call.",
    ];
  const focusedTestsBlockers = focusedTestProof.checked
    ? focusedTestProof.ok ? [] : ["Focused Track 54 acceptance tests failed."]
    : ["Run the focused Track 54 acceptance test slice before declaring the full feature complete."];
  const browserProof = browserSmokeProof ?? {
    command: "Browser smoke /thesis /thesis?audit=1 /overview",
    checked: false,
    ok: false,
    output: [],
  };
  const browserSmokeStatus: AcceptanceStatus = browserProof.checked
    ? browserProof.ok ? "proven" : "hold_manual_review"
    : "needs_live_verification";
  const browserSmokeEvidence = browserProof.checked
    ? [
      `Browser smoke ${browserProof.ok ? "passed" : "failed"}: ${browserProof.command}.`,
      ...browserProof.output,
    ]
    : [
      "This readiness report did not run browser smoke for `/thesis`, `/thesis?audit=1`, and `/overview`.",
    ];
  const browserSmokeBlockers = browserProof.checked
    ? browserProof.ok ? [] : ["Browser smoke failed for `/thesis` or `/thesis?audit=1`."]
    : ["Run fresh browser smoke for `/thesis` and `/thesis?audit=1` before declaring Track 54 complete."];

  function codeProofStatus(filesPresent: boolean): AcceptanceStatus {
    if (!filesPresent) return "hold_manual_review";
    return focusedTestsStatus;
  }

  function codeProofEvidence(base: string[]): string[] {
    return [
      ...base,
      ...focusedTestsEvidence,
    ];
  }

  function codeProofBlockers(filesPresent: boolean, missingFilesMessage: string): string[] {
    if (!filesPresent) return [missingFilesMessage];
    return focusedTestsBlockers;
  }

  function gatedCodeProofStatus(gate: Track54ModeGate, filesPresent = true): AcceptanceStatus {
    if (!filesPresent) return "hold_manual_review";
    const gateStatus = statusFromModeGate(gate);
    if (gateStatus !== "proven") return gateStatus;
    return focusedTestsStatus;
  }

  function gatedCodeProofBlockers(gate: Track54ModeGate, filesPresent: boolean, missingFilesMessage: string): string[] {
    if (!filesPresent) return [missingFilesMessage];
    const gateStatus = statusFromModeGate(gate);
    if (gateStatus !== "proven") return gate.promotion_blockers;
    return focusedTestsBlockers;
  }

  const items: Track54AcceptanceItem[] = [
    proofItem({
      id: "official_collectors_still_work",
      requirement: "Daily official source collectors still work.",
      status: sourceFreshnessStatus,
      evidence: sourceFreshnessEvidence,
      blockers: sourceFreshnessBlockers,
      verificationCommand: "npx tsx scripts/check-bushel-source-freshness.ts --summary",
    }),
    proofItem({
      id: "price_before_daily_analysis",
      requirement: "Daily price collector and Grok credential preflight run before daily analysis.",
      status: priceAutomationOk && grokPreflightAutomationOk && dailyAutomationOk ? "proven" : "hold_manual_review",
      evidence: [
        "`canola-price-and-fx-freshness-import` expected schedule: Mon-Fri 3:45 PM MT.",
        "`track-54-grok-auth-preflight` expected schedule: Mon-Fri 3:55 PM MT.",
        "`grok-x-scout-artifact-week-review` expected schedule: Mon-Fri 4:10 PM MT.",
      ],
      blockers: priceAutomationOk && grokPreflightAutomationOk && dailyAutomationOk ? [] : ["Price, Grok preflight, or daily dry-run automation manifest is missing, inactive, on the wrong schedule, in the wrong working directory, lacks required prompt boundaries, or contains a forbidden write/scout command."],
      verificationCommand: null,
    }),
    proofItem({
      id: "morning_grok_auth_warning",
      requirement: "Morning no-write heartbeat warns this thread when Grok auth is expired early enough to fix before the X scout window.",
      status: promotionHeartbeatOk ? "proven" : "hold_manual_review",
      evidence: [
        "`track-54-promotion-review` expected morning schedule: Mon-Fri 9:30 AM MT.",
        "Heartbeat must run only the Grok credential preflight, notify on failed credentials, stay quiet when credentials are ready, and keep all scout/write/pipeline paths disabled.",
      ],
      blockers: promotionHeartbeatOk
        ? []
        : ["Promotion-review heartbeat is missing, inactive, on the wrong schedule, not attached to a thread, lacks required morning preflight/notify/no-write boundaries, or contains a forbidden scout/write command."],
      verificationCommand: null,
    }),
    proofItem({
      id: "artifact_collection_cadence_covers_projection",
      requirement: "Active dry-run Codex automations cover the next eligible artifact dates without enabling writes.",
      status: artifactAutomationCoverageOk ? "proven" : "hold_manual_review",
      evidence: [
        "Readiness projected missing artifact dates and checked the matching dry-run Codex automation for each mode.",
        ...artifactAutomationCoverageEvidence,
      ],
      blockers: artifactAutomationCoverageBlockers,
      verificationCommand: null,
    }),
    proofItem({
      id: "grok_runner_preflight",
      requirement: "Grok CLI runner is available before scheduled X scout dry-runs depend on it.",
      status: grokRunnerStatus,
      evidence: grokRunnerEvidence,
      blockers: grokRunnerBlockers,
      verificationCommand: "grok --version + credential preflight",
    }),
    proofItem({
      id: "daily_artifact_health_check",
      requirement: "Weekday artifact health check catches missing or invalid same-day daily-pulse artifacts without enabling writes.",
      status: dailyArtifactHealthAutomationOk ? "proven" : "hold_manual_review",
      evidence: [
        "`track-54-daily-artifact-health-check` expected schedule: Mon-Thu 4:45 PM MT.",
        "Prompt must run the deterministic artifact-health command, review daily_pulse artifacts, preflight Grok credentials before any retry, and may retry only the no-write dry run when today's artifact is missing or invalid.",
      ],
      blockers: dailyArtifactHealthAutomationOk
        ? []
        : ["Daily artifact health-check automation manifest is missing, inactive, on the wrong schedule, in the wrong working directory, lacks required no-write/retry prompt boundaries, or contains a forbidden write-mode command."],
      verificationCommand: null,
    }),
    proofItem({
      id: "friday_artifact_health_check",
      requirement: "Friday artifact health check catches missing or invalid final daily-pulse and friday-deep artifacts before promotion review without enabling writes.",
      status: fridayArtifactHealthAutomationOk ? "proven" : "hold_manual_review",
      evidence: [
        "`track-54-friday-artifact-health-check` expected schedule: Friday 5:15 PM MT.",
        "Prompt must run the deterministic artifact-health command, review both daily_pulse and friday_deep artifacts, preflight Grok credentials before any retry, may retry only no-write dry runs, and must run browser smoke plus readiness with fresh proof.",
      ],
      blockers: fridayArtifactHealthAutomationOk
        ? []
        : ["Friday artifact health-check automation manifest is missing, inactive, on the wrong schedule, in the wrong working directory, lacks required no-write/retry/readiness prompt boundaries, or contains a forbidden write-mode command."],
      verificationCommand: null,
    }),
    proofItem({
      id: "late_grok_auth_recovery",
      requirement: "Late-day recovery pass can catch a fixed Grok login after the normal health window without enabling writes.",
      status: lateGrokRecoveryAutomationOk ? "proven" : "hold_manual_review",
      evidence: [
        "`track-54-late-grok-auth-recovery` expected schedule: Mon-Fri 5:05 PM MT.",
        "Prompt must run Grok credential preflight, then the deterministic both-mode artifact-health command with no-write retry boundaries and persisted-readiness reporting.",
      ],
      blockers: lateGrokRecoveryAutomationOk
        ? []
        : ["Late Grok auth recovery automation manifest is missing, inactive, on the wrong schedule, in the wrong working directory, lacks required preflight/retry/readiness prompt boundaries, or contains a forbidden write-mode command."],
      verificationCommand: null,
    }),
    proofItem({
      id: "promotion_review_heartbeat",
      requirement: "Weekday evidence-review and Friday promotion-review heartbeat wakes this thread for no-write readiness review before any human approval decision.",
      status: promotionHeartbeatOk ? "proven" : "hold_manual_review",
      evidence: [
        "`track-54-promotion-review` expected schedule: Mon-Fri 9:30 AM and 5:30 PM MT.",
        "Heartbeat must target a Codex thread, run the morning Grok auth check before noon, use local_review_date/local_review_weekday/local_review_kind/review_modes_to_inspect from the heartbeat summary during afternoon reviews, review weekday daily_pulse evidence, report browser-smoke proof freshness, report selected artifact hash/path plus post-approval transition when present, run the Friday promotion review, verify write-mode automations are missing/inactive, and require explicit Kyle approval before promotion.",
      ],
      blockers: promotionHeartbeatOk
        ? []
        : ["Promotion-review heartbeat is missing, inactive, on the wrong schedule, not attached to a thread, lacks required morning auth / weekday evidence-review / Friday promotion-review prompt boundaries, or contains a forbidden write-mode command."],
      verificationCommand: null,
    }),
    proofItem({
      id: "daily_grok_artifacts",
      requirement: "Grok daily scout produces raw artifacts and accepted/rejected counts.",
      status: statusFromModeGate(dailyGate),
      evidence: [
        `daily_pulse artifact days: ${dailyGate.review_window.artifact_days_found}/${dailyGate.review_window.required_artifact_days}.`,
        `daily_pulse counts: raw=${dailyGate.evidence.raw_signal_count}, accepted=${dailyGate.evidence.accepted_signal_count}, rejected=${dailyGate.evidence.rejected_signal_count}.`,
        ...selectedDailyArtifactEvidence,
      ],
      blockers: dailyGate.promotion_blockers,
      verificationCommand: "npm run grok:x-scout:review-week",
    }),
    proofItem({
      id: "grok_cannot_publish_thesis",
      requirement: "Grok cannot directly publish thesis rows.",
      status: codeProofStatus(true),
      evidence: codeProofEvidence([
        "Readiness report hard-codes `production_writes_enabled: false`.",
        "Write-mode routines require a mode-scoped artifact gate and explicit approval phrase.",
        "Hard boundaries forbid Grok writes to market analysis tables and thesis cache.",
      ]),
      blockers: codeProofBlockers(true, "Track 54 write-gate tests are missing."),
      verificationCommand: "npx vitest run lib/__tests__/track54-write-gate.test.ts lib/__tests__/track54-write-approval.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "write_mode_automations_disabled",
      requirement: "Production Grok write-mode Codex automations remain missing or inactive until matching-mode human approval.",
      status: writeAutomationsSafe ? "proven" : "hold_manual_review",
      evidence: [
        "Readiness inspected known write-mode Codex automation manifests.",
        ...writeAutomationEvidence,
      ],
      blockers: unsafeWriteAutomationBlockers,
      verificationCommand: null,
    }),
    proofItem({
      id: "post_approval_handoff_prevents_dry_run_write_overlap",
      requirement: "Promotion briefs tell the operator to disable matching dry-run artifact collectors before registering write-mode automations.",
      status: handoffTransitionOk ? "proven" : "hold_manual_review",
      evidence: [
        "Readiness inspected mode-scoped promotion brief handoff transitions.",
        ...handoffTransitionEvidence,
      ],
      blockers: handoffTransitionBlockers,
      verificationCommand: "npx vitest run lib/__tests__/grok-x-scout-promotion-brief.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "write_mode_automation_proposals_registration_ready",
      requirement: "Promotion briefs emit exact proposed Codex write-mode automation specs, but only as create-after-approval registration inputs.",
      status: proposalValidation.ok ? "proven" : "hold_manual_review",
      evidence: [
        "Readiness inspected mode-scoped proposed Codex write-mode automation specs.",
        ...proposalValidation.evidence,
      ],
      blockers: proposalValidation.blockers,
      verificationCommand: "npx vitest run lib/__tests__/grok-x-scout-promotion-brief.test.ts lib/__tests__/track54-readiness-report.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "accepted_x_signal_contract",
      requirement: "Accepted X signals have timestamps, post URLs, source tiers, staleness classes, affected grains, affected regions, affected decisions, and blocked/allowed claims.",
      status: codeProofStatus(auditFilesPresent),
      evidence: codeProofEvidence([
        "Signal validation and query tests are present for accepted/rejected X evidence fields.",
        `Current daily accepted signals: ${dailyGate.evidence.accepted_signal_count}.`,
      ]),
      blockers: codeProofBlockers(auditFilesPresent, "Expected X signal validation/query tests are missing."),
      verificationCommand: "npx vitest run lib/__tests__/x-signal-validation.test.ts lib/__tests__/x-signals.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "track54_database_security_contract",
      requirement: "Track 54 migration/RLS contract keeps X scout runs public-read/service-role-write, accepted X signals provenance-rich, signal hashes upsertable, and daily-pulse trajectory writes bounded.",
      status: codeProofStatus(migrationContractProofPresent),
      evidence: codeProofEvidence([
        "Migration contract test and Track 54 SQL migration files are present.",
        "Contract covers x_scout_runs RLS/grants, x_market_signals provenance/evidence fields, full signal_hash unique index, and opus_review_daily_pulse scan type.",
      ]),
      blockers: codeProofBlockers(migrationContractProofPresent, "Track 54 migration contract test or required migration files are missing."),
      verificationCommand: "npx vitest run lib/__tests__/track54-migration-contract.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "bounded_daily_review",
      requirement: "Codex/Claude daily review can incorporate accepted X signals and prices into bounded soft updates.",
      status: gatedCodeProofStatus(dailyGate),
      evidence: codeProofEvidence([
        "Daily promotion brief lists only `grok-x-scout-daily` and `daily-thesis-review` for daily_pulse mode.",
        `daily_pulse decision-grade accepted count: ${dailyGate.evidence.accepted_decision_grade_count}.`,
      ]),
      blockers: gatedCodeProofBlockers(dailyGate, true, "Daily thesis review tests are missing."),
      verificationCommand: "npx vitest run lib/__tests__/daily-thesis-review-packet.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "friday_swarms_consume_x_bundle",
      requirement: "Friday swarms consume the accepted X bundle, price context, source packets, and Viking knowledge.",
      status: fridayAutomationOk ? gatedCodeProofStatus(fridayGate, fridayDeskFilesPresent) : "hold_manual_review",
      evidence: codeProofEvidence([
        `friday_deep artifact days: ${fridayGate.review_window.artifact_days_found}/${fridayGate.review_window.required_artifact_days}.`,
        "Friday bundle script and CAD/US desk prompt files are present.",
      ]),
      blockers: fridayAutomationOk
        ? gatedCodeProofBlockers(fridayGate, fridayDeskFilesPresent, "Friday desk bundle/prompt files are missing.")
        : ["Friday automation manifest is missing, inactive, on the wrong schedule, in the wrong working directory, lacks required prompt boundaries, or contains a forbidden write-mode command."],
      verificationCommand: "npx vitest run lib/__tests__/friday-x-signal-bundle.test.ts lib/__tests__/friday-desk-prompt-contract.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "thesis_separates_weekly_and_x_pulse",
      requirement: "`/thesis` clearly separates weekly thesis from daily X Pulse Watch.",
      status: codeProofStatus(thesisUiFilesPresent),
      evidence: codeProofEvidence([
        "Thesis page and focused thesis page tests are present.",
      ]),
      blockers: codeProofBlockers(thesisUiFilesPresent, "Thesis page or focused page test is missing."),
      verificationCommand: "npx vitest run \"app/(dashboard)/thesis/page.test.tsx\" --pool=threads --maxWorkers=1 --no-file-parallelism",
    }),
    proofItem({
      id: "audit_mode_signal_reasons",
      requirement: "Audit mode proves why a signal was accepted or rejected.",
      status: codeProofStatus(auditFilesPresent),
      evidence: codeProofEvidence([
        "X signal validation/query tests are present.",
        "Readiness evidence includes rejected counts and validation warning paths.",
      ]),
      blockers: codeProofBlockers(auditFilesPresent, "Expected X signal audit tests are missing."),
      verificationCommand: "npx vitest run lib/__tests__/x-signal-validation.test.ts lib/__tests__/x-signals.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
    proofItem({
      id: "browser_smoke_clean",
      requirement: "Browser smoke for `/thesis`, `/thesis?audit=1`, and `/overview` is clean.",
      status: browserSmokeStatus,
      evidence: browserSmokeEvidence,
      blockers: browserSmokeBlockers,
      verificationCommand: "Browser smoke /thesis /thesis?audit=1 /overview",
    }),
    proofItem({
      id: "retired_grok_pipeline_tombstoned",
      requirement: "The old Grok pipeline remains tombstoned.",
      status: codeProofStatus(retiredPipelineProofPresent),
      evidence: codeProofEvidence([
        "Tombstone tests are present for `/api/pipeline/run` and the retired v1 gate.",
      ]),
      blockers: codeProofBlockers(retiredPipelineProofPresent, "Retired Grok tombstone regression tests are missing."),
      verificationCommand: "npx vitest run app/api/pipeline/run/route.test.ts lib/__tests__/retired-grok-v1-gate.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --environment=node",
    }),
  ];

  let overallStatus: AcceptanceOverallStatus = "ready_for_completion_review";
  if (items.some((item) => item.status === "hold_manual_review")) {
    overallStatus = "hold_manual_review";
  } else if (items.some((item) => item.status === "blocked_by_artifact_gates")) {
    overallStatus = "incomplete";
  } else if (items.some((item) => item.status === "needs_live_verification")) {
    overallStatus = "needs_live_verification";
  }

  const completionBlockers = items.flatMap((item) => {
    if (item.status === "proven") return [];
    return item.blockers.length > 0
      ? item.blockers
      : [`${item.requirement} is not yet proven.`];
  });

  return {
    overall_status: overallStatus,
    grok_runner_proof: grokProof,
    ...(hermesTerminalProof ? { hermes_terminal_proof: hermesTerminalProof } : {}),
    focused_test_proof: focusedTestProof,
    browser_smoke_proof: browserProof,
    items,
    completion_blockers: Array.from(new Set(completionBlockers)),
  };
}

export function buildTrack54ReadinessReport(options: {
  dailyReview?: ArtifactWeekReview;
  fridayReview?: ArtifactWeekReview;
  generatedAt?: string;
  automationChecks?: CodexAutomationCheck[];
  writeAutomationChecks?: WriteAutomationCheck[];
  automationRoot?: string;
  skipAutomationCheck?: boolean;
  grokRunnerProof?: GrokRunnerProof;
  includeGrokRunnerCheck?: boolean;
  hermesTerminalProof?: HermesTerminalProof;
  includeHermesTerminalCheck?: boolean;
  sourceFreshnessProof?: SourceFreshnessProof;
  includeSourceFreshnessCheck?: boolean;
  acceptanceTestProof?: AcceptanceTestProof;
  browserSmokeProof?: BrowserSmokeProof;
  includeAcceptanceTestCheck?: boolean;
  artifactRoot?: string;
  dailyFromDate?: string;
  dailyToDate?: string;
  fridayFromDate?: string;
  fridayToDate?: string;
} = {}): Track54ReadinessReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const dailyReview = options.dailyReview ?? reviewGrokXScoutArtifactWeek({
    artifactRoot: options.artifactRoot,
    mode: "daily_pulse",
    fromDate: options.dailyFromDate,
    toDate: options.dailyToDate,
  });
  const fridayReview = options.fridayReview ?? reviewGrokXScoutArtifactWeek({
    artifactRoot: options.artifactRoot,
    mode: "friday_deep",
    fromDate: options.fridayFromDate,
    toDate: options.fridayToDate,
  });
  const automationChecks = options.automationChecks ?? (
    options.skipAutomationCheck ? [] : checkCodexAutomations(options.automationRoot)
  );
  const writeAutomationChecks = options.writeAutomationChecks ?? (
    options.skipAutomationCheck
      ? []
      : options.automationChecks
        ? defaultSafeWriteAutomationChecks()
        : checkWriteAutomationsDisabled(options.automationRoot)
  );
  const sourceFreshnessProof = options.sourceFreshnessProof ?? (
    options.includeSourceFreshnessCheck ? runSourceFreshnessProof() : undefined
  );
  const grokRunnerProof = options.grokRunnerProof ?? (
    options.includeGrokRunnerCheck ? runGrokRunnerProof() : undefined
  );
  const hermesTerminalProof = options.hermesTerminalProof ?? (
    options.includeHermesTerminalCheck ? runHermesTerminalProof() : undefined
  );
  const acceptanceTestProof = options.acceptanceTestProof ?? (
    options.includeAcceptanceTestCheck ? runAcceptanceTestProof() : undefined
  );
  const modeGates = [
    buildModeGate(dailyReview, generatedAt),
    buildModeGate(fridayReview, generatedAt),
  ];
  const artifactAutomationCoverage = buildArtifactAutomationCoverage(modeGates, automationChecks);
  const status = overallStatus(modeGates, automationChecks, writeAutomationChecks);
  const acceptanceAudit = buildTrack54AcceptanceAudit(
    modeGates,
    automationChecks,
    artifactAutomationCoverage,
    writeAutomationChecks,
    grokRunnerProof,
    hermesTerminalProof,
    sourceFreshnessProof,
    acceptanceTestProof,
    options.browserSmokeProof,
  );

  return {
    schema_version: "track54_readiness_report_v1",
    generated_at: generatedAt,
    overall_status: status,
    production_writes_enabled: false,
    human_approval_required_before_writes: true,
    mode_gates: modeGates,
    codex_automation_checks: automationChecks,
    write_automation_checks: writeAutomationChecks,
    artifact_automation_coverage: artifactAutomationCoverage,
    acceptance_audit: acceptanceAudit,
    browser_smoke_clean: acceptanceAudit.browser_smoke_proof.ok,
    completion_blockers: acceptanceAudit.completion_blockers,
    next_actions: nextActionsForStatus(status, modeGates, automationChecks, writeAutomationChecks, acceptanceAudit),
    hard_boundaries: [
      "Grok is a real-life sentiment scout, not the thesis author.",
      "Accepted X signals are review leads until official source packets and desk review confirm them.",
      "Daily-pulse evidence cannot approve Friday-deep write routines.",
      "Friday-deep evidence cannot approve weekday daily thesis-review writes.",
      "The retired Grok/xAI thesis-writing chain remains tombstoned.",
      "This readiness report never enables production writes.",
    ],
    source_reviews: {
      daily_pulse: "scripts/review-grok-x-scout-artifact-week.ts",
      friday_deep: "scripts/review-grok-x-scout-artifact-week.ts",
      promotion_brief: "scripts/build-grok-x-scout-promotion-brief.ts",
    },
  };
}

export function writeTrack54ReadinessReport(report: Track54ReadinessReport, outputPath: string): string {
  const resolvedPath = resolve(outputPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const persistedReport: Track54ReadinessReport = {
    ...report,
    persisted_report_path: report.persisted_report_path ?? resolvedPath,
  };
  writeFileSync(resolvedPath, `${JSON.stringify(persistedReport, null, 2)}\n`, "utf-8");
  return resolvedPath;
}

if (IS_CLI) {
  const sharedFrom = optionValue("--from");
  const sharedTo = optionValue("--to");
  let report = buildTrack54ReadinessReport({
    artifactRoot: optionValue("--artifact-root"),
    automationRoot: optionValue("--automation-root"),
    skipAutomationCheck: hasFlag("--skip-automation-check"),
    includeGrokRunnerCheck: !hasFlag("--skip-grok-runner-check"),
    includeHermesTerminalCheck: !hasFlag("--skip-hermes-terminal-check"),
    includeSourceFreshnessCheck: !hasFlag("--skip-source-freshness-check"),
    includeAcceptanceTestCheck: !hasFlag("--skip-acceptance-test-check"),
    browserSmokeProof: loadBrowserSmokeProof(resolveBrowserSmokeProofPath()),
    dailyFromDate: optionValue("--daily-from") ?? sharedFrom,
    dailyToDate: optionValue("--daily-to") ?? sharedTo,
    fridayFromDate: optionValue("--friday-from") ?? sharedFrom,
    fridayToDate: optionValue("--friday-to") ?? sharedTo,
  });
  const outputPath = optionValue("--out") ?? optionValue("--output");
  if (outputPath) {
    const persistedPath = writeTrack54ReadinessReport(report, outputPath);
    report = {
      ...report,
      persisted_report_path: persistedPath,
    };
  }
  console.log(JSON.stringify(report, null, 2));
}
