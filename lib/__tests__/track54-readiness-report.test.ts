import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildTrack54ReadinessReport,
  checkCodexAutomations,
  checkWriteAutomationsDisabled,
  inspectGrokCredentialState,
  loadBrowserSmokeProof,
  resolveBrowserSmokeProofPath,
  validateWriteModeCodexAutomationProposals,
  writeTrack54ReadinessReport,
  type AcceptanceTestProof,
  type BrowserSmokeProof,
  type CodexAutomationCheck,
  type GrokRunnerProof,
  type HermesTerminalProof,
  type SourceFreshnessProof,
  type WriteAutomationCheck,
} from "@/scripts/build-track54-readiness-report";
import type { ArtifactWeekReview } from "@/scripts/review-grok-x-scout-artifact-week";
import {
  summarizeTrack54ReadinessReport,
  type Track54HeartbeatSummary,
} from "@/scripts/summarize-track54-readiness-report";
import {
  pickForwardedFlags,
  stripWrapperNpmValueLeakage,
} from "@/scripts/run-track54-readiness";

let tempRoots: string[] = [];
const testPngTargetBytes = 65_536;
const pngSignatureBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = Buffer.alloc(0)): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function fakePngBytes(width: number, height: number, size = testPngTargetBytes, blank = false): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowLength;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      if (blank) {
        raw[pixelOffset] = 255;
        raw[pixelOffset + 1] = 255;
        raw[pixelOffset + 2] = 255;
      } else {
        const shade = x % 256;
        raw[pixelOffset] = shade;
        raw[pixelOffset + 1] = (shade * 3) % 256;
        raw[pixelOffset + 2] = (shade * 5) % 256;
      }
      raw[pixelOffset + 3] = 255;
    }
  }

  const png = Buffer.concat([
    pngSignatureBytes,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND"),
  ]);
  if (png.length >= size) return png;
  return Buffer.concat([png, Buffer.alloc(size - png.length)]);
}

function blankPngBytes(width: number, height: number, size = testPngTargetBytes): Buffer {
  return fakePngBytes(width, height, size, true);
}

const tinyPngBytes = fakePngBytes(1024, 768);

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

function review(overrides: Partial<ArtifactWeekReview> = {}): ArtifactWeekReview {
  return {
    schema_version: "grok_x_scout_artifact_week_review_v1",
    mode: "daily_pulse",
    from_date: "2026-06-01",
    to_date: "2026-06-05",
    required_artifact_days: 5,
    minimum_accepted_signals: 1,
    artifact_days_found: 5,
    totals: {
      raw_signal_count: 5,
      accepted_signal_count: 5,
      rejected_signal_count: 0,
      parse_failures: 0,
      stale_or_missing_price_days: 0,
      accepted_unlisted_count: 0,
      official_verification_count: 0,
      write_mode_artifact_days: 0,
      missing_no_write_evidence_days: 0,
      summary_count_mismatch_days: 0,
      artifact_identity_mismatch_days: 0,
      mode_schedule_mismatch_days: 0,
      accepted_decision_grade_count: 5,
    },
    days: [],
    parse_failure_details: [],
    verdict: "candidate_for_enablement",
    quality_warnings: [],
    recommendation: "Clean enough to ask for human approval to register write-mode Grok routines; do not auto-enable them from this script.",
    guardrails: {
      no_supabase_writes: true,
      grok_is_scout_only: true,
      human_review_required_before_write_automation: true,
    },
    ...overrides,
  };
}

function selectedArtifactDay(): ArtifactWeekReview["days"][number] {
  return {
    date: "2026-06-01",
    artifact_path: "C:\\Users\\kyle\\Agriculture\\bushel-board-app\\data\\X Scout Runs\\2026-06-01\\daily_pulse-20260601T191936Z-raw.json",
    artifact_sha256: "e440fc9cf89096f134f3a8d7e0b3a0f23c65e3eeb57a62fd4da05bdbf419e9e9",
    summary_path: "C:\\Users\\kyle\\Agriculture\\bushel-board-app\\data\\X Scout Runs\\2026-06-01\\daily_pulse-20260601T191936Z-summary.json",
    artifact_found: true,
    summary_found: true,
    parse_status: "ok",
    dry_run: true,
    write: false,
    scout_run_id: null,
    no_write_evidence: true,
    summary_raw_signal_count: 3,
    summary_accepted_signal_count: 3,
    summary_rejected_signal_count: 0,
    summary_count_mismatch: false,
    output_run_date: "2026-06-01",
    output_mode: "daily_pulse",
    artifact_identity_mismatch: false,
    mode_schedule_mismatch: false,
    price_snapshot_status: "fresh",
    raw_signal_count: 3,
    accepted_signal_count: 3,
    rejected_signal_count: 0,
    accepted_by_tier: { tier1: 1, tier3: 2 },
    accepted_decision_grade_count: 3,
    rejected_reasons: [],
    accepted_unlisted_count: 0,
    official_verification_count: 1,
  };
}

const cleanAutomationChecks: CodexAutomationCheck[] = [
  {
    id: "canola-price-and-fx-freshness-import",
    role: "official price and thesis-cache refresh before X review",
    expected_schedule: "Mon-Fri 3:45 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=15;BYMINUTE=45;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=15;BYMINUTE=45;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "may refresh prices/cache; must not run Grok or retired pipeline paths",
    manifest_path: "C:/fake/canola-price-and-fx-freshness-import/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "track-54-grok-auth-preflight",
    role: "Grok CLI/API credential preflight before X scout dry run",
    expected_schedule: "Mon-Fri 3:55 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=15;BYMINUTE=55;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=15;BYMINUTE=55;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "credential preflight only; must not run Grok search, scout, daily thesis review, or writes",
    manifest_path: "C:/fake/track-54-grok-auth-preflight/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "grok-x-scout-artifact-week-review",
    role: "daily_pulse Grok/X dry-run artifact evidence collector",
    expected_schedule: "Mon-Fri 4:10 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=10;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=10;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "dry-run only; must not run --write or write Supabase rows",
    manifest_path: "C:/fake/grok-x-scout-artifact-week-review/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "track-54-daily-artifact-health-check",
    role: "daily_pulse artifact health monitor and no-write retry guard",
    expected_schedule: "Mon-Thu 4:45 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;BYHOUR=16;BYMINUTE=45;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;BYHOUR=16;BYMINUTE=45;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "dry-run monitor only; may retry missing/invalid daily artifacts without Supabase writes",
    manifest_path: "C:/fake/track-54-daily-artifact-health-check/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "grok-x-scout-friday-deep-artifact-review",
    role: "friday_deep Grok/X dry-run artifact evidence collector",
    expected_schedule: "Friday 4:50 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=50;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=50;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "dry-run only; must not run --write or write Supabase rows",
    manifest_path: "C:/fake/grok-x-scout-friday-deep-artifact-review/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "track-54-friday-artifact-health-check",
    role: "Friday daily_pulse and friday_deep artifact health monitor and no-write retry guard",
    expected_schedule: "Friday 5:15 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=15;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=15;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "Friday dry-run monitor only; may retry missing/invalid daily_pulse or friday_deep artifacts without Supabase writes",
    manifest_path: "C:/fake/track-54-friday-artifact-health-check/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "track-54-late-grok-auth-recovery",
    role: "late-day no-write Grok auth recovery and artifact retry guard",
    expected_schedule: "Mon-Fri 5:05 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=17;BYMINUTE=5;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=17;BYMINUTE=5;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "late no-write recovery only; may retry missing/invalid artifacts through artifact health after Grok preflight",
    manifest_path: "C:/fake/track-54-late-grok-auth-recovery/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "track-54-hermes-x-scout-prompt-bridge",
    role: "Hermes/Grok 4.3 terminal X scout shadow recovery",
    expected_schedule: "Mon-Fri 4:20 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=20;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=20;BYSECOND=0",
    expected_cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
    observed_cwds: ["C:/Users/kyle/Agriculture/bushel-board-app"],
    boundary: "Hermes shadow recovery only; may create local no-write artifacts when same-day daily_pulse proof is missing or invalid",
    manifest_path: "C:/fake/track-54-hermes-x-scout-prompt-bridge/automation.toml",
    observed_status: "active",
    schedule_boundary_present: true,
    cwd_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
  {
    id: "track-54-promotion-review",
    role: "morning Grok auth warning plus weekday evidence and Friday promotion review heartbeat",
    expected_kind: "heartbeat",
    observed_kind: "heartbeat",
    expected_schedule: "Mon-Fri 9:30 AM and 5:30 PM MT",
    expected_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9,17;BYMINUTE=30;BYSECOND=0",
    observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9,17;BYMINUTE=30;BYSECOND=0",
    expected_cwd: null,
    observed_cwds: null,
    expected_target_thread_id: null,
    observed_target_thread_id: "019e849b-7d65-7362-8d8c-b4086a14ea30",
    boundary: "thread heartbeat only; must warn early on Grok auth and review daily evidence/Friday promotion readiness without enabling production Grok writes",
    manifest_path: "C:/fake/track-54-promotion-review/automation.toml",
    observed_status: "active",
    kind_boundary_present: true,
    schedule_boundary_present: true,
    cwd_boundary_present: null,
    target_thread_boundary_present: true,
    prompt_boundary_present: true,
    forbidden_prompt_boundary_present: true,
    missing_prompt_fragments: [],
    present_forbidden_prompt_fragments: [],
  },
];

const cleanWriteAutomationChecks: WriteAutomationCheck[] = [
  {
    id: "grok-x-scout-daily",
    role: "daily_pulse write-mode Grok/X scout",
    boundary: "must remain missing or inactive until human approval",
    manifest_path: "C:/fake/grok-x-scout-daily/automation.toml",
    observed_status: "missing",
    prompt_contains_write_command: null,
    safe_until_human_approval: true,
  },
  {
    id: "daily-thesis-review",
    role: "weekday bounded trajectory writer",
    boundary: "must remain missing or inactive until human approval",
    manifest_path: "C:/fake/daily-thesis-review/automation.toml",
    observed_status: "missing",
    prompt_contains_write_command: null,
    safe_until_human_approval: true,
  },
  {
    id: "grok-x-scout-friday-deep",
    role: "friday_deep write-mode Grok/X scout",
    boundary: "must remain missing or inactive until human approval",
    manifest_path: "C:/fake/grok-x-scout-friday-deep/automation.toml",
    observed_status: "missing",
    prompt_contains_write_command: null,
    safe_until_human_approval: true,
  },
];

const cleanSourceFreshnessProof: SourceFreshnessProof = {
  command: "npx tsx scripts/check-bushel-source-freshness.ts --summary",
  checked: true,
  ok: true,
  output: [
    "Bushel Board source freshness watchdog OK",
    "cache_items=12",
    "prairie_week_status=complete_mb_sk_ab",
  ],
};

const cleanGrokRunnerProof: GrokRunnerProof = {
  command: "grok --version + Track54 credential preflight",
  checked: true,
  ok: true,
  output: [
    "grok 0.2.14 (e0d895dcd) [stable]",
    "XAI_API_KEY present: no.",
    "Grok CLI auth file present: yes.",
    "Grok CLI auth expires_at: 2026-06-07T00:00:00.000Z.",
  ],
};

const cleanHermesTerminalProof: HermesTerminalProof = {
  command: "hermes --version + hermes status + hermes -z model smoke + hermes tools list",
  checked: true,
  ok: true,
  hermes_version_ok: true,
  xai_oauth_logged_in: true,
  model_smoke_ok: true,
  x_search_tool_listed: true,
  x_search_globally_enabled: false,
  toolset_override_required: true,
  provider: "xai-oauth",
  model: "grok-4.3",
  output: [
    "Hermes Agent v0.16.0",
    "xAI OAuth logged in: yes.",
    "Hermes model smoke: yes.",
    "x_search tool listed: yes.",
    "x_search globally enabled: no.",
  ],
};

const cleanAcceptanceTestProof: AcceptanceTestProof = {
  command: "npx vitest run <Track 54 acceptance slice>",
  checked: true,
  ok: true,
  output: [
    "Test Files 10 passed (10)",
    "Tests 69 passed (69)",
  ],
};

const browserSmokeViewports = ["desktop", "mobile"] as const;
const browserSmokeRoutes = ["/thesis", "/thesis?audit=1", "/overview"] as const;

function browserScreenshotFileName(viewport: string, route: string): string {
  const routeStem = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  return `${viewport}-${routeStem}.png`;
}

function browserSmokeOutput(
  screenshotRoot = "C:\\Users\\kyle\\Agriculture\\bushel-board-app\\scratch\\track54-browser-smoke\\proof",
  screenshotBytes = 4_096,
): string[] {
  return browserSmokeViewports.flatMap((viewport) =>
    browserSmokeRoutes.flatMap((route) => [
      `${viewport} ${route}: loaded http://127.0.0.1:3110${route}`,
      `${viewport} ${route}: title=Bushel Board - Prairie Grain Intelligence`,
      `${viewport} ${route}: markers=Source health:yes, Weekly Data Intake:yes`,
      `${viewport} ${route}: visible_markers=Source health:visible, Weekly Data Intake:visible`,
      `${viewport} ${route}: forbidden_hits=none`,
      `${viewport} ${route}: console_errors=0`,
      `${viewport} ${route}: interaction=theme_toggle:ok before=light after=dark restored=light`,
      `${viewport} ${route}: screenshot=${join(screenshotRoot, browserScreenshotFileName(viewport, route))}`,
      `${viewport} ${route}: screenshot_bytes=${screenshotBytes}`,
      `${viewport} ${route}: screenshot_dimensions=${viewport === "desktop" ? "1024x768" : "390x844"}`,
      `${viewport} ${route}: screenshot_visual=sample_pixels=6912 distinct_colors=42 non_white_ratio=0.38 luma_range=196.4`,
    ]),
  );
}

const cleanBrowserSmokeProof: BrowserSmokeProof = {
  schema_version: "track54_browser_smoke_proof_v1",
  generated_at: "2026-06-06T00:00:00.000Z",
  command: "npm run track54:browser-smoke -- --base-url http://127.0.0.1:3110",
  checked: true,
  ok: true,
  output: browserSmokeOutput(),
};

function cleanBrowserSmokeProofWithScreenshots(root: string): BrowserSmokeProof {
  const screenshotRoot = join(root, "screenshots");
  const screenshotBytes = tinyPngBytes.length;
  mkdirSync(screenshotRoot, { recursive: true });
  for (const viewport of browserSmokeViewports) {
    for (const route of browserSmokeRoutes) {
      writeFileSync(
        join(screenshotRoot, browserScreenshotFileName(viewport, route)),
        viewport === "desktop" ? fakePngBytes(1024, 768, screenshotBytes) : fakePngBytes(390, 844, screenshotBytes),
      );
    }
  }

  return {
    ...cleanBrowserSmokeProof,
    output: browserSmokeOutput(screenshotRoot, screenshotBytes),
  };
}

const dailyAutomationRequiredPromptFragments = [
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
];
const dailyAutomationForbiddenPromptFragments = [
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
  "npm run daily-thesis-review -- --write",
];
const dailyAutomationExpectedRrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=10;BYSECOND=0";
const dailyAutomationExpectedCwd = "C:/Users/kyle/Agriculture/bushel-board-app";
const dailyAutomationManifestCwd = "C:\\\\Users\\\\kyle\\\\Agriculture\\\\bushel-board-app";
const latestReadinessReportPath = "scratch/track54-readiness/latest-readiness-report.json";
const dailyAutomationPromptWithBrowserProof = `Run npm run track54:grok-preflight and report credential_ok. If the Grok preflight reports \`ok: false\`, do not launch Grok manually; run npx tsx scripts/run-track54-artifact-health-check.ts --mode daily_pulse --retry-missing --refresh-readiness=after-retry --grok-cli-model grok-composer-2.5-fast --fallback hermes_terminal, inspect hermes_preflight_model_smoke_ok, retry_used_fallback, and retry_blocked_by_hermes_preflight, and rely only on npm run track54:hermes-preflight followed by npm run track54:hermes-x-scout:terminal -- --mode daily_pulse --date <local-run-date> inside that deterministic fallback path. If preflight is ok, run daily_pulse with --runner auto --grok-cli-model grok-composer-2.5-fast --dry-run. Do not run any \`--write\` command. Then run npm run track54:readiness -- --out ${latestReadinessReportPath} --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json and report acceptance_audit.overall_status, acceptance_audit.browser_smoke_proof, browser_smoke_clean, persisted_report_path, and completion_blockers.`;
const dailyArtifactHealthRequiredPromptFragments = [
  "daily_pulse",
  "npm run track54:grok-preflight",
  "credential_ok",
  "If the Grok preflight reports `ok: false`",
  "scripts/run-track54-artifact-health-check.ts --mode daily_pulse",
  "--retry-missing",
  "--refresh-readiness=after-retry",
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
];
const dailyArtifactHealthForbiddenPromptFragments = [
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
  "npm run daily-thesis-review -- --write",
];
const dailyArtifactHealthExpectedRrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH;BYHOUR=16;BYMINUTE=45;BYSECOND=0";
const dailyArtifactHealthPrompt = `Check daily_pulse artifacts. Run npm run track54:grok-preflight and report credential_ok. If the Grok preflight reports \`ok: false\`, do not launch Grok manually. Run npx tsx scripts/run-track54-artifact-health-check.ts --mode daily_pulse --retry-missing --refresh-readiness=after-retry --grok-cli-model grok-composer-2.5-fast --fallback hermes_terminal. The script reviews with npx tsx scripts/review-grok-x-scout-artifact-week.ts --mode daily_pulse --required-days 5. If today's artifact is missing or invalid, it may run only npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --grok-cli-model grok-composer-2.5-fast --dry-run after Grok preflight passes, or npm run track54:hermes-preflight followed by npm run track54:hermes-x-scout:terminal -- --mode daily_pulse --date <local-run-date> when Grok preflight fails and Hermes preflight passes. Inspect hermes_preflight_ok, hermes_preflight_model_smoke_ok, retry_used_fallback, and retry_blocked_by_hermes_preflight. If a retry runs, then it runs npm run track54:readiness -- --out ${latestReadinessReportPath} --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json. Report persisted_report_path. Do not run any \`--write\` command, do not write Supabase rows, and do not call \`/api/pipeline/run\`.`;
const fridayArtifactHealthRequiredPromptFragments = [
  "daily_pulse",
  "friday_deep",
  "npm run track54:grok-preflight",
  "credential_ok",
  "If the Grok preflight reports `ok: false`",
  "scripts/run-track54-artifact-health-check.ts --mode both",
  "--retry-missing",
  "--refresh-readiness=always",
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
];
const fridayArtifactHealthForbiddenPromptFragments = [
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --write",
  "npm run daily-thesis-review -- --write",
];
const fridayArtifactHealthExpectedRrule = "FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=15;BYSECOND=0";
const fridayArtifactHealthPrompt = `Check daily_pulse and friday_deep artifacts. Run npm run track54:grok-preflight and report credential_ok. If the Grok preflight reports \`ok: false\`, do not launch Grok manually. Run npx tsx scripts/run-track54-artifact-health-check.ts --mode both --retry-missing --refresh-readiness=always --grok-cli-model grok-composer-2.5-fast --fallback hermes_terminal. The script reviews with npx tsx scripts/review-grok-x-scout-artifact-week.ts --mode daily_pulse --required-days 5 and npx tsx scripts/review-grok-x-scout-artifact-week.ts --mode friday_deep --required-days 1. If today's daily_pulse artifact is missing or invalid, it may run only npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --grok-cli-model grok-composer-2.5-fast --dry-run after Grok preflight passes, or npm run track54:hermes-preflight followed by npm run track54:hermes-x-scout:terminal -- --mode daily_pulse --date <local-run-date> when Grok preflight fails and Hermes preflight passes. If today's friday_deep artifact is missing or invalid, it may run only npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --grok-cli-model grok-composer-2.5-fast --dry-run after Grok preflight passes, or npm run track54:hermes-preflight followed by npm run track54:hermes-x-scout:terminal -- --mode friday_deep --date <local-run-date> when Grok preflight fails and Hermes preflight passes. Inspect hermes_preflight_ok, hermes_preflight_model_smoke_ok, retry_used_fallback, and retry_blocked_by_hermes_preflight. Then it runs npm run track54:readiness -- --out ${latestReadinessReportPath} --browser-smoke-proof-out scratch/track54-browser-smoke/browser-smoke-proof.json. Report persisted_report_path. Do not run any \`--write\` command, do not write Supabase rows, and do not call \`/api/pipeline/run\`.`;
const promotionHeartbeatRequiredPromptFragments = [
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
  "production_writes_enabled is false",
  "post-approval transition",
  "write-mode proposal IDs",
  "next_eligible_run_statuses",
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
];
const promotionHeartbeatForbiddenPromptFragments = [
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --runner auto --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write",
  "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --runner auto --write",
  "npm run daily-thesis-review -- --write",
];
const promotionHeartbeatExpectedRrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9,17;BYMINUTE=30;BYSECOND=0";
const promotionHeartbeatPrompt = `Run the no-write Track 54 evidence review for Bushel Board in this thread. First inspect the local time. If it is before noon MT, run the morning Grok auth check: run npm run track54:grok-preflight and inspect checked_at, grok_version_ok, credential_ok, credential_source, credential_issue, cli_auth_expired, ok, output, and next_actions. If ok is false or credential_ok is false, choose NOTIFY and report the exact non-secret blocker plus the safe operator action: run grok login locally or add XAI_API_KEY before the 4:10 PM MT X scout window, then run npm run track54:recover-after-grok-login to execute the no-write artifact recovery/readiness refresh path. If ok is true, choose DONT_NOTIFY with a short quiet-status message that Grok credentials are ready. Do not run Grok search, do not run the X scout, do not run daily thesis review, do not run any write command, do not write Supabase rows, do not enable production Grok routines, and do not call /api/pipeline/run or retired Grok Edge Functions. If it is noon MT or later, first run npm --silent run track54:heartbeat-summary and inspect its JSON, including local_review_date, local_review_weekday, local_review_kind, review_modes_to_inspect, selected_artifacts, selected artifact hash/path, post-approval transition, write-mode proposal IDs, artifact_days_found, required_artifact_days, clean_artifact_days_found, missing_clean_artifact_days, next_eligible_run_statuses, report_freshness_status, browser_smoke_proof_age_hours, browser_smoke_proof_freshness_status, browser_smoke_proof_fresh_enough, grok_runner, grok_runner.credential_issue, hermes_terminal, and hermes_terminal.model_smoke_ok for each reviewed mode. Then run npm --silent run track54:automation-runs and inspect automation_run_checks, latest_run_date, latest_run_outcome, automations_with_failed_or_blocked_latest_run, no_write_manifests_ready, write_automations_safe, mode_gate_snapshot.clean_artifact_days_found, and next_safe_operator_action. Use local_review_kind and review_modes_to_inspect to decide whether this is a weekday daily_pulse review or the Friday promotion review. For every afternoon run, inspect the Track 54 readiness report at ${latestReadinessReportPath}, verify persisted_report_path, latest browser-smoke proof, daily_pulse artifact gate, and write-mode automation safety. Verify write-mode automations are still missing or inactive, inspect write-mode automation proposals when present, production_writes_enabled is false, and Grok remains a quarantined X sentiment scout rather than a thesis writer. Report local_review_date, local_review_weekday, local_review_kind, review_modes_to_inspect, daily_pulse artifact days found versus required, clean_artifact_days_found, accepted and decision-grade signal counts, selected artifact hash/path when present, post-approval transition, write-mode proposal IDs, next_eligible_run_statuses, report_freshness_status, browser_smoke_proof_age_hours, browser_smoke_proof_freshness_status, browser_smoke_proof_fresh_enough, grok_runner.credential_issue, hermes_terminal.model_smoke_ok, automation_run_checks latest run dates/outcomes, automations_with_failed_or_blocked_latest_run, no_write_manifests_ready, write_automations_safe, missing next eligible run dates, any completion blockers, whether the persisted readiness report is fresh enough for the review, and next_safe_operator_action. On Friday afternoon, also inspect friday_deep readiness, the Friday-deep artifact gate, and the mode-scoped promotion brief before any human approval decision. Do not enable production Grok writes, do not register write-mode automations, and do not claim the daily Bull/Bear thesis write loop is complete unless the matching artifact gate is candidate-ready and Kyle has explicitly approved promotion.`;

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots = [];
});

describe("Track 54 readiness report", () => {
  it("stays blocked when either mode still lacks enough reviewed dry-run artifacts", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      dailyReview: review({
        artifact_days_found: 1,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.",
      }),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
        totals: {
          ...review().totals,
          raw_signal_count: 0,
          accepted_signal_count: 0,
          accepted_decision_grade_count: 0,
        },
      }),
    });

    expect(report.schema_version).toBe("track54_readiness_report_v1");
    expect(report.overall_status).toBe("blocked_by_artifact_gates");
    expect(report.production_writes_enabled).toBe(false);
    expect(report.mode_gates.map((gate) => gate.mode)).toEqual(["daily_pulse", "friday_deep"]);
    expect(report.acceptance_audit.overall_status).toBe("incomplete");
    expect(report.browser_smoke_clean).toBe(report.acceptance_audit.browser_smoke_proof.ok);
    expect(report.completion_blockers).toEqual(report.acceptance_audit.completion_blockers);
    expect(report.completion_blockers).toEqual(expect.arrayContaining([
      "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.",
      "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
    ]));
    expect(report.acceptance_audit.items.find((item) => item.id === "daily_grok_artifacts")?.status).toBe("blocked_by_artifact_gates");
    expect(report.acceptance_audit.items.find((item) => item.id === "official_collectors_still_work")?.status).toBe("needs_live_verification");
    expect(report.next_actions).toContain("Keep production Grok write routines disabled.");
  });

  it("projects the next eligible dry-run dates without loosening artifact gates", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-01T10:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      dailyReview: review({
        from_date: "2026-05-26",
        to_date: "2026-06-01",
        artifact_days_found: 1,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.",
      }),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-05-26",
        to_date: "2026-06-01",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
        totals: {
          ...review().totals,
          raw_signal_count: 0,
          accepted_signal_count: 0,
          accepted_decision_grade_count: 0,
        },
      }),
    });

    expect(report.mode_gates[0]!.artifact_gate_projection).toEqual({
      clean_artifact_days_found: 1,
      missing_clean_artifact_days: 4,
      next_eligible_run_dates: ["2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"],
      earliest_candidate_date: "2026-06-05",
      schedule_note: "daily_pulse artifacts count on weekday run dates.",
    });
    expect(report.mode_gates[1]!.artifact_gate_projection).toEqual({
      clean_artifact_days_found: 0,
      missing_clean_artifact_days: 1,
      next_eligible_run_dates: ["2026-06-05"],
      earliest_candidate_date: "2026-06-05",
      schedule_note: "friday_deep artifacts count only on Friday run dates.",
    });
    expect(report.artifact_automation_coverage).toEqual([
      {
        mode: "daily_pulse",
        automation_id: "grok-x-scout-artifact-week-review",
        observed_status: "active",
        automation_ready: true,
        projected_dates: ["2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"],
        projected_dates_match_mode_schedule: true,
        covered_by_active_dry_run_automation: true,
      },
      {
        mode: "friday_deep",
        automation_id: "grok-x-scout-friday-deep-artifact-review",
        observed_status: "active",
        automation_ready: true,
        projected_dates: ["2026-06-05"],
        projected_dates_match_mode_schedule: true,
        covered_by_active_dry_run_automation: true,
      },
    ]);
    expect(report.acceptance_audit.items.find((item) => item.id === "artifact_collection_cadence_covers_projection")?.status)
      .toBe("proven");
    expect(report.acceptance_audit.items.find((item) => item.id === "post_approval_handoff_prevents_dry_run_write_overlap")?.status)
      .toBe("proven");
    expect(report.acceptance_audit.items.find((item) => item.id === "write_mode_automation_proposals_registration_ready")?.status)
      .toBe("proven");
    expect(report.next_actions).toContain(
      "daily_pulse next eligible dry-run date(s): 2026-06-02, 2026-06-03, 2026-06-04, 2026-06-05.",
    );
    expect(report.next_actions).toContain(
      "friday_deep next eligible dry-run date(s): 2026-06-05.",
    );
    expect(report.overall_status).toBe("blocked_by_artifact_gates");
  });

  it("projects clean artifact days from promotion-ready day evidence, not parsed artifacts alone", () => {
    const freshDay = {
      ...selectedArtifactDay(),
      date: "2026-06-02",
    };
    const stalePriceDay = {
      ...selectedArtifactDay(),
      date: "2026-06-07",
      price_snapshot_status: "not_checked" as const,
    };
    const secondFreshDay = {
      ...selectedArtifactDay(),
      date: "2026-06-08",
    };
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-09T04:18:59.843Z",
      automationChecks: cleanAutomationChecks,
      dailyReview: review({
        from_date: "2026-06-02",
        to_date: "2026-06-08",
        artifact_days_found: 3,
        days: [freshDay, stalePriceDay, secondFreshDay],
        totals: {
          ...review().totals,
          stale_or_missing_price_days: 1,
        },
        verdict: "hold_manual_review",
        quality_warnings: ["1 artifact day(s) lacked fresh price status"],
        recommendation: "Keep Grok in manual/dry-run mode: 1 artifact day(s) lacked fresh price status.",
      }),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
      }),
    });

    expect(report.mode_gates[0]!.review_window.artifact_days_found).toBe(3);
    expect(report.mode_gates[0]!.artifact_gate_projection).toEqual({
      clean_artifact_days_found: 2,
      missing_clean_artifact_days: 3,
      next_eligible_run_dates: ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"],
      earliest_candidate_date: "2026-06-12",
      schedule_note: "daily_pulse artifacts count on weekday run dates.",
    });
    expect(report.next_actions).toContain(
      "Let daily_pulse dry-run evidence collect until 5 clean artifact day(s) are present; current clean count is 2.",
    );
    expect(report.next_actions).toContain(
      "daily_pulse next eligible dry-run date(s): 2026-06-09, 2026-06-10, 2026-06-11, 2026-06-12.",
    );
    expect(report.next_actions).toContain(
      "Inspect daily_pulse artifact warnings/blockers before any promotion: Keep Grok in manual/dry-run mode: 1 artifact day(s) lacked fresh price status.",
    );
  });

  it("is ready for human approval only when daily and Friday-deep gates are both candidates", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.overall_status).toBe("ready_for_human_approval");
    expect(report.acceptance_audit.overall_status).toBe("needs_live_verification");
    expect(report.acceptance_audit.items.find((item) => item.id === "daily_grok_artifacts")?.status).toBe("proven");
    expect(report.acceptance_audit.items.find((item) => item.id === "friday_swarms_consume_x_bundle")?.status).toBe("needs_live_verification");
    expect(report.mode_gates[0]!.write_mode_routines.map((routine) => routine.name)).toEqual([
      "grok-x-scout-daily",
      "daily-thesis-review",
    ]);
    expect(report.mode_gates[0]!.write_mode_codex_automation_proposals.map((proposal) => proposal.id)).toEqual([
      "grok-x-scout-daily",
      "daily-thesis-review",
    ]);
    expect(report.mode_gates[0]!.write_mode_codex_automation_proposals[0]).toEqual(expect.objectContaining({
      kind: "cron",
      name: "Track 54 Grok X scout daily write",
      schedule: "Mon-Fri 4:05 PM MT",
      status_after_human_approval: "ACTIVE",
      command: report.mode_gates[0]!.write_mode_routines[0]!.command,
      approval_review_window: {
        mode: "daily_pulse",
        from_date: "2026-06-01",
        to_date: "2026-06-05",
        artifact_days_found: 5,
        required_artifact_days: 5,
        accepted_signal_count: 5,
        accepted_decision_grade_count: 5,
      },
    }));
    expect(report.mode_gates[0]!.write_mode_codex_automation_proposals[0]!.prompt).toContain(
      "Approved artifact review window: daily_pulse 2026-06-01 through 2026-06-05.",
    );
    expect(report.mode_gates[0]!.write_mode_codex_automation_proposals[0]!.create_only_after).toContain(
      "grok-x-scout-artifact-week-review is disabled or inactive",
    );
    expect(report.mode_gates[0]!.write_mode_routines[0]!.command).toContain("--runner auto");
    expect(report.mode_gates[0]!.write_mode_routines[0]!.command).toContain("--grok-cli-model grok-composer-2.5-fast");
    expect(report.mode_gates[0]!.write_mode_routines[1]!.command).not.toContain("--runner auto");
    expect(report.mode_gates[1]!.write_mode_routines.map((routine) => routine.name)).toEqual([
      "grok-x-scout-friday-deep",
    ]);
    expect(report.mode_gates[1]!.write_mode_codex_automation_proposals.map((proposal) => proposal.id)).toEqual([
      "grok-x-scout-friday-deep",
    ]);
    expect(report.mode_gates[1]!.write_mode_codex_automation_proposals[0]).toEqual(expect.objectContaining({
      kind: "cron",
      name: "Track 54 Grok X scout Friday-deep write",
      schedule: "Friday 4:50 PM MT",
      status_after_human_approval: "ACTIVE",
      command: report.mode_gates[1]!.write_mode_routines[0]!.command,
      approval_review_window: {
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        artifact_days_found: 1,
        required_artifact_days: 1,
        accepted_signal_count: 5,
        accepted_decision_grade_count: 5,
      },
    }));
    expect(report.mode_gates[1]!.write_mode_codex_automation_proposals[0]!.prompt).toContain(
      "Approved artifact review window: friday_deep 2026-06-05 through 2026-06-05.",
    );
    expect(report.mode_gates[1]!.write_mode_routines[0]!.command).toContain("--runner auto");
    expect(report.mode_gates[1]!.write_mode_routines[0]!.command).toContain("--grok-cli-model grok-composer-2.5-fast");
    expect(report.mode_gates[0]!.post_approval_automation_transition.disable_before_registering_write_mode)
      .toEqual(["grok-x-scout-artifact-week-review"]);
    expect(report.mode_gates[1]!.post_approval_automation_transition.disable_before_registering_write_mode)
      .toEqual(["grok-x-scout-friday-deep-artifact-review"]);
    expect(report.next_actions).toContain(
      "Review both mode-scoped promotion briefs and register only the exact emitted write commands after explicit human approval.",
    );
  });

  it("validates proposed write-mode Codex automation specs before registration", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    const validation = validateWriteModeCodexAutomationProposals(report.mode_gates);

    expect(validation).toEqual({
      ok: true,
      evidence: [
        "daily_pulse: expected proposed write-mode automations [grok-x-scout-daily, daily-thesis-review], observed [grok-x-scout-daily, daily-thesis-review].",
        "friday_deep: expected proposed write-mode automations [grok-x-scout-friday-deep], observed [grok-x-scout-friday-deep].",
      ],
      blockers: [],
    });
  });

  it("surfaces selected artifact identity in mode gates and acceptance evidence", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      dailyReview: review({
        days: [selectedArtifactDay()],
      }),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.mode_gates[0]!.selected_artifacts).toEqual([
      expect.objectContaining({
        date: "2026-06-01",
        artifact_sha256: "e440fc9cf89096f134f3a8d7e0b3a0f23c65e3eeb57a62fd4da05bdbf419e9e9",
        accepted_signal_count: 3,
        accepted_decision_grade_count: 3,
      }),
    ]);
    expect(report.acceptance_audit.items.find((item) => item.id === "daily_grok_artifacts")?.evidence).toContain(
      "selected 2026-06-01: e440fc9cf89096f134f3a8d7e0b3a0f23c65e3eeb57a62fd4da05bdbf419e9e9 (3 accepted, 3 decision-grade) at C:\\Users\\kyle\\Agriculture\\bushel-board-app\\data\\X Scout Runs\\2026-06-01\\daily_pulse-20260601T191936Z-raw.json.",
    );
  });

  it("holds proposed write-mode Codex automation specs that omit the dry-run-disable prerequisite", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });
    const brokenModeGates = report.mode_gates.map((gate) =>
      gate.mode === "daily_pulse"
        ? {
          ...gate,
          write_mode_codex_automation_proposals: gate.write_mode_codex_automation_proposals.map((proposal) =>
            proposal.id === "daily-thesis-review"
              ? {
                ...proposal,
                create_only_after: proposal.create_only_after.filter((precondition) =>
                  precondition !== "grok-x-scout-artifact-week-review is disabled or inactive"
                ),
              }
              : proposal
          ),
        }
        : gate
    );

    const validation = validateWriteModeCodexAutomationProposals(brokenModeGates);

    expect(validation.ok).toBe(false);
    expect(validation.blockers).toContain(
      "daily-thesis-review proposal create_only_after is missing: grok-x-scout-artifact-week-review is disabled or inactive",
    );
  });

  it("holds proposed write-mode Codex automation specs when structured approval windows drift", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });
    const brokenModeGates = report.mode_gates.map((gate) =>
      gate.mode === "daily_pulse"
        ? {
          ...gate,
          write_mode_codex_automation_proposals: gate.write_mode_codex_automation_proposals.map((proposal) =>
            proposal.id === "daily-thesis-review"
              ? {
                ...proposal,
                approval_review_window: {
                  ...proposal.approval_review_window,
                  from_date: "2026-06-02",
                },
              }
              : proposal
          ),
        }
        : gate
    );

    const validation = validateWriteModeCodexAutomationProposals(brokenModeGates);

    expect(validation.ok).toBe(false);
    expect(validation.blockers).toContain(
      "daily-thesis-review proposal approval_review_window from_date must match 2026-06-01.",
    );
  });

  it("holds completion when a write-mode Codex automation is active before human approval", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks.map((check) =>
        check.id === "daily-thesis-review"
          ? {
            ...check,
            observed_status: "active",
            prompt_contains_write_command: true,
            safe_until_human_approval: false,
          }
          : check
      ),
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.overall_status).toBe("hold_manual_review");
    expect(report.write_automation_checks.find((check) => check.id === "daily-thesis-review"))
      .toEqual(expect.objectContaining({
        observed_status: "active",
        prompt_contains_write_command: true,
        safe_until_human_approval: false,
      }));
    expect(report.acceptance_audit.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.items.find((item) => item.id === "write_mode_automations_disabled")?.status)
      .toBe("hold_manual_review");
    expect(report.acceptance_audit.completion_blockers).toContain(
      "daily-thesis-review is active; keep it missing or inactive until matching-mode human approval.",
    );
    expect(report.next_actions).toContain(
      "Disable write-mode Codex automations until the matching artifact gate passes and human approval registers the exact emitted commands.",
    );
  });

  it("accepts an inactive pre-staged write-mode automation only when its guardrails match the proposal", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-write-automations-"));
    tempRoots.push(root);
    const id = "daily-thesis-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    const prompt = "Confirm the matching dry-run artifact collector is disabled or inactive before running. Confirm this routine was explicitly approved by Kyle from the mode-scoped Track 54 promotion brief. Approved artifact review window: daily_pulse 2026-06-01 through 2026-06-05. Do not call `/api/pipeline/run` or retired Grok Edge Functions. The dry-run collector(s) that must already be disabled: grok-x-scout-artifact-week-review. In the workspace, run `npm run daily-thesis-review -- --write --approval-phrase TRACK54_APPROVED --approval-review-from 2026-06-01 --approval-review-to 2026-06-05`. Report packet.x_signal_input_audit, accepted_x_signals count, decisions count, write_decisions count, writes attempted, writes applied, writes skipped, affected side/grain/market rows, stance/confidence deltas, price freshness status, and any review blockers. This routine may write only bounded daily trajectory updates; it must not write market_analysis, us_market_analysis, or thesis_packet_cache.";
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "daily-thesis-review"',
        'status = "PAUSED"',
        'rrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=25;BYSECOND=0"',
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${prompt}"`,
      ].join("\n"),
    );

    const checks = checkWriteAutomationsDisabled(root);

    expect(checks.find((check) => check.id === id)).toEqual(expect.objectContaining({
      observed_status: "inactive",
      schedule_boundary_present: true,
      cwd_boundary_present: true,
      prompt_boundary_present: true,
      missing_prompt_fragments: [],
      prompt_contains_write_command: true,
      safe_until_human_approval: true,
    }));
  });

  it("holds an inactive pre-staged write-mode automation when its guardrails drift", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-write-automations-"));
    tempRoots.push(root);
    const id = "daily-thesis-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "daily-thesis-review"',
        'status = "PAUSED"',
        'rrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=25;BYSECOND=0"',
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        'prompt = "Run npm run daily-thesis-review -- --write after approval."',
      ].join("\n"),
    );

    const writeAutomationChecks = checkWriteAutomationsDisabled(root);
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(writeAutomationChecks.find((check) => check.id === id)).toEqual(expect.objectContaining({
      observed_status: "inactive",
      prompt_boundary_present: false,
      safe_until_human_approval: false,
    }));
    expect(report.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.items.find((item) => item.id === "write_mode_automations_disabled")?.status)
      .toBe("hold_manual_review");
    expect(report.acceptance_audit.completion_blockers).toContain(
      "daily-thesis-review inactive manifest is not promotion-ready; keep it paused and fix its schedule, workspace, and prompt guardrails before approval.",
    );
    expect(report.acceptance_audit.completion_blockers.some((blocker) =>
      blocker.includes("daily-thesis-review inactive manifest is missing prompt fragment(s):")
    )).toBe(true);
  });

  it("marks the plan acceptance audit ready only when Grok preflight, source proof, focused tests, and browser smoke pass", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.acceptance_audit.overall_status).toBe("ready_for_completion_review");
    expect(report.acceptance_audit.grok_runner_proof.ok).toBe(true);
    expect(report.acceptance_audit.focused_test_proof.ok).toBe(true);
    expect(report.acceptance_audit.browser_smoke_proof.ok).toBe(true);
    expect(report.acceptance_audit.items.every((item) => item.status === "proven")).toBe(true);
  });

  it("requires fresh browser smoke before the completion audit can go ready", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.acceptance_audit.overall_status).toBe("needs_live_verification");
    expect(report.acceptance_audit.items.find((item) => item.id === "browser_smoke_clean")?.status).toBe("needs_live_verification");
    expect(report.acceptance_audit.completion_blockers).toContain(
      "Run fresh browser smoke for `/thesis`, `/thesis?audit=1`, and `/overview` before declaring Track 54 complete.",
    );
  });

  it("loads browser smoke proof from JSON for CLI readiness runs", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify(browserProof));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      browserSmokeProof: proof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(proof).toEqual(browserProof);
    expect(report.acceptance_audit.browser_smoke_proof.checked).toBe(true);
    expect(report.acceptance_audit.overall_status).toBe("ready_for_completion_review");
  });

  it("rejects browser smoke proof when a referenced screenshot file is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const missingScreenshotPath = join(root, "screenshots", browserScreenshotFileName("mobile", "/overview"));
    rmSync(missingScreenshotPath);
    writeFileSync(proofPath, JSON.stringify(browserProof));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      `Browser smoke proof screenshot file not found for mobile /overview: ${missingScreenshotPath}`,
    );
  });

  it("rejects browser smoke proof when a loaded URL is the wrong route", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === "mobile /overview: loaded http://127.0.0.1:3110/overview"
          ? "mobile /overview: loaded http://127.0.0.1:3110/thesis"
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof loaded wrong route for mobile /overview: /thesis");
  });

  it("rejects browser smoke proof when a loaded URL is not the local app", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === "desktop /thesis: loaded http://127.0.0.1:3110/thesis"
          ? "desktop /thesis: loaded https://example.com/thesis"
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof loaded URL is not a local app URL for desktop /thesis: https://example.com/thesis");
  });

  it("rejects browser smoke proof when the command is missing its base URL", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      command: "Browser smoke /thesis /thesis?audit=1 /overview",
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof command is missing --base-url.");
  });

  it("rejects browser smoke proof when a loaded URL uses a different local origin than the command", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === "desktop /overview: loaded http://127.0.0.1:3110/overview"
          ? "desktop /overview: loaded http://127.0.0.1:3111/overview"
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      "Browser smoke proof loaded URL origin does not match command base URL for desktop /overview: loaded=http://127.0.0.1:3111 expected=http://127.0.0.1:3110",
    );
  });

  it("rejects browser smoke proof when a screenshot path points outside the proof directory", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    const outsideRoot = mkdtempSync(join(tmpdir(), "track54-browser-outside-"));
    tempRoots.push(root, outsideRoot);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const outsideScreenshotPath = join(outsideRoot, browserScreenshotFileName("mobile", "/overview"));
    writeFileSync(outsideScreenshotPath, fakePngBytes(390, 844));
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line.startsWith("mobile /overview: screenshot=")
          ? `mobile /overview: screenshot=${outsideScreenshotPath}`
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      `Browser smoke proof screenshot path is outside proof directory for mobile /overview: ${outsideScreenshotPath}`,
    );
  });

  it("rejects browser smoke proof when two checks reuse one screenshot path", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const reusedScreenshotPath = join(root, "screenshots", browserScreenshotFileName("desktop", "/thesis"));
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line.startsWith("desktop /overview: screenshot=")
          ? `desktop /overview: screenshot=${reusedScreenshotPath}`
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      `Browser smoke proof reuses screenshot path for desktop /overview; already used by desktop /thesis: ${reusedScreenshotPath}`,
    );
  });

  it("rejects browser smoke proof when a screenshot filename does not match its route", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const wrongScreenshotPath = join(root, "screenshots", "desktop-thesis.png.copy.png");
    writeFileSync(wrongScreenshotPath, fakePngBytes(1024, 768));
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line.startsWith("desktop /overview: screenshot=")
          ? `desktop /overview: screenshot=${wrongScreenshotPath}`
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      "Browser smoke proof screenshot filename does not match desktop /overview: proof=desktop-thesis.png.copy.png expected=desktop-overview.png",
    );
  });

  it("rejects browser smoke proof when screenshot byte evidence does not match the file", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const badByteCount = tinyPngBytes.length - 1;
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === `mobile /overview: screenshot_bytes=${tinyPngBytes.length}`
          ? `mobile /overview: screenshot_bytes=${badByteCount}`
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      `Browser smoke proof screenshot byte count mismatch for mobile /overview: proof=${badByteCount} actual=${tinyPngBytes.length}`,
    );
  });

  it("rejects browser smoke proof when a referenced screenshot is not a PNG", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const corruptScreenshotPath = join(root, "screenshots", browserScreenshotFileName("mobile", "/overview"));
    writeFileSync(corruptScreenshotPath, Buffer.alloc(tinyPngBytes.length, 1));
    writeFileSync(proofPath, JSON.stringify(browserProof));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      `Browser smoke proof screenshot is not a PNG file for mobile /overview: ${corruptScreenshotPath}`,
    );
  });

  it("rejects browser smoke proof when screenshot dimensions do not match the viewport", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === "mobile /overview: screenshot_dimensions=390x844"
          ? "mobile /overview: screenshot_dimensions=390x800"
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      "Browser smoke proof screenshot dimensions do not match mobile viewport for /overview: proof=390x800 expected=390x844",
    );
  });

  it("rejects browser smoke proof when screenshot file dimensions do not match proof", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const wrongSizeScreenshotPath = join(root, "screenshots", browserScreenshotFileName("mobile", "/overview"));
    writeFileSync(wrongSizeScreenshotPath, fakePngBytes(390, 800));
    writeFileSync(proofPath, JSON.stringify(browserProof));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain(
      "Browser smoke proof screenshot dimension mismatch for mobile /overview: proof=390x844 actual=390x800",
    );
  });

  it("rejects browser smoke proof when screenshot visual proof is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.filter((line) => !line.startsWith("mobile /overview: screenshot_visual=")),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof missing mobile /overview: screenshot_visual=");
  });

  it("rejects browser smoke proof when screenshot visual stats look blank", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === "mobile /overview: screenshot_visual=sample_pixels=6912 distinct_colors=42 non_white_ratio=0.38 luma_range=196.4"
          ? "mobile /overview: screenshot_visual=sample_pixels=6912 distinct_colors=1 non_white_ratio=0 luma_range=0"
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof screenshot has too few sampled colors for mobile /overview: 1");
    expect(proof?.output).toContain("Browser smoke proof screenshot non-white ratio is too low for mobile /overview: 0");
    expect(proof?.output).toContain("Browser smoke proof screenshot luma range is too low for mobile /overview: 0");
  });

  it("rejects browser smoke proof when actual screenshot visual content looks blank", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    const blankScreenshotPath = join(root, "screenshots", browserScreenshotFileName("mobile", "/overview"));
    writeFileSync(blankScreenshotPath, blankPngBytes(390, 844, tinyPngBytes.length));
    writeFileSync(proofPath, JSON.stringify(browserProof));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof actual screenshot has too few sampled colors for mobile /overview: 1");
    expect(proof?.output).toContain("Browser smoke proof actual screenshot non-white ratio is too low for mobile /overview: 0");
    expect(proof?.output).toContain("Browser smoke proof actual screenshot luma range is too low for mobile /overview: 0");
  });

  it("rejects legacy browser smoke proof that lacks mobile and interaction evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    writeFileSync(proofPath, JSON.stringify({
      ...cleanBrowserSmokeProof,
      output: [
        "/thesis clean console",
        "/thesis?audit=1 clean console",
        "/overview clean console",
      ],
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:30:00.000Z",
      automationChecks: cleanAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      browserSmokeProof: proof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof missing desktop /thesis: loaded ");
    expect(proof?.output).toContain("Browser smoke proof missing mobile /overview: interaction=theme_toggle:ok");
    expect(report.acceptance_audit.items.find((item) => item.id === "browser_smoke_clean")?.status).toBe("hold_manual_review");
  });

  it("rejects browser smoke proof when a marker is present but not visibly reachable", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === "mobile /overview: visible_markers=Source health:visible, Weekly Data Intake:visible"
          ? "mobile /overview: visible_markers=Source health:visible, Weekly Data Intake:hidden"
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof has hidden, covered, or missing visible markers for mobile /overview.");
  });

  it("rejects browser smoke proof when a marker is visible but covered by another element", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const browserProof = cleanBrowserSmokeProofWithScreenshots(root);
    writeFileSync(proofPath, JSON.stringify({
      ...browserProof,
      output: browserProof.output.map((line) =>
        line === "desktop /thesis: visible_markers=Source health:visible, Weekly Data Intake:visible"
          ? "desktop /thesis: visible_markers=Source health:visible, Weekly Data Intake:covered"
          : line,
      ),
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof has hidden, covered, or missing visible markers for desktop /thesis.");
  });

  it("reports Grok credential state from env key and CLI auth expiry without printing secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-grok-auth-"));
    tempRoots.push(root);

    expect(inspectGrokCredentialState({
      cwd: root,
      env: testEnv({ XAI_API_KEY: "xai-secret-value" }),
      now: new Date("2026-06-04T00:00:00.000Z"),
    })).toEqual({
      ok: true,
      credential_source: "xai_api_key",
      credential_issue: null,
      xai_api_key_present: true,
      cli_auth_file_present: null,
      cli_auth_expires_at: null,
      cli_auth_expired: null,
      output: [
        "XAI_API_KEY present: yes.",
        "Noninteractive xAI credential source is present for the scout runner.",
      ],
    });

    const profile = join(root, "profile");
    const grokHome = join(profile, ".grok");
    mkdirSync(grokHome, { recursive: true });
    writeFileSync(
      join(grokHome, "auth.json"),
      JSON.stringify({
        "https://auth.x.ai::client": {
          refresh_token: "redacted-test-refresh-token",
          expires_at: "2026-06-03T04:10:20.000Z",
        },
      }),
    );

    expect(inspectGrokCredentialState({
      cwd: root,
      env: testEnv({ USERPROFILE: profile }),
      now: new Date("2026-06-04T00:00:00.000Z"),
    })).toEqual({
      ok: false,
      credential_source: "none",
      credential_issue: "expired_auth",
      xai_api_key_present: false,
      cli_auth_file_present: true,
      cli_auth_expires_at: "2026-06-03T04:10:20.000Z",
      cli_auth_expired: true,
      output: [
        "XAI_API_KEY present: no.",
        "Grok CLI auth file present: yes.",
        "Grok CLI auth expires_at: 2026-06-03T04:10:20.000Z.",
        "Grok CLI auth is expired; run `grok login` or add XAI_API_KEY before retrying Track 54.",
      ],
    });
  });

  it("rejects CLI auth that expires before the next daily scout cutoff", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-grok-auth-window-"));
    tempRoots.push(root);
    const profile = join(root, "profile");
    const grokHome = join(profile, ".grok");
    mkdirSync(grokHome, { recursive: true });
    writeFileSync(
      join(grokHome, "auth.json"),
      JSON.stringify({
        "https://auth.x.ai::client": {
          refresh_token: "redacted-test-refresh-token",
          expires_at: "2026-06-04T22:09:54.000Z",
        },
      }),
    );

    const state = inspectGrokCredentialState({
      cwd: root,
      env: testEnv({ USERPROFILE: profile }),
      now: new Date("2026-06-04T16:33:00.000Z"),
    });

    expect(state.ok).toBe(false);
    expect(state.credential_source).toBe("none");
    expect(state.credential_issue).toBe("auth_expires_before_next_scout");
    expect(state.cli_auth_expired).toBe(false);
    expect(state.output).toContain("Grok CLI auth expires before the next Track 54 scout window; refresh auth before relying on scheduled scout jobs.");
  });

  it("holds completion when the Grok CLI/auth preflight fails", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: {
        ...cleanGrokRunnerProof,
        ok: false,
        output: ["grok command not found", "XAI_API_KEY present: no."],
      },
      acceptanceTestProof: cleanAcceptanceTestProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.acceptance_audit.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.items.find((item) => item.id === "grok_runner_preflight")?.status)
      .toBe("hold_manual_review");
    expect(report.acceptance_audit.completion_blockers).toContain(
      "Grok CLI/auth preflight failed; scheduled dry-run X scout jobs will not collect artifacts until Grok CLI auth is refreshed or XAI_API_KEY is present for the auto runner.",
    );
  });

  it("rejects stale browser smoke proof instead of treating old screenshots as fresh", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    writeFileSync(proofPath, JSON.stringify({
      ...cleanBrowserSmokeProof,
      generated_at: "2026-06-05T00:00:00.000Z",
    }));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:30:00.000Z",
      automationChecks: cleanAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      browserSmokeProof: proof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        from_date: "2026-06-05",
        to_date: "2026-06-05",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof is older than 6 hours; rerun npm run track54:browser-smoke.");
    expect(report.acceptance_audit.items.find((item) => item.id === "browser_smoke_clean")?.status).toBe("hold_manual_review");
    expect(report.acceptance_audit.completion_blockers).toContain("Browser smoke failed for `/thesis`, `/thesis?audit=1`, or `/overview`.");
  });

  it("rejects browser smoke proof missing generated_at", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-browser-proof-"));
    tempRoots.push(root);
    const proofPath = join(root, "browser-smoke-proof.json");
    const proofWithoutTimestamp: Partial<BrowserSmokeProof> = { ...cleanBrowserSmokeProof };
    delete proofWithoutTimestamp.generated_at;
    writeFileSync(proofPath, JSON.stringify(proofWithoutTimestamp));

    const proof = loadBrowserSmokeProof(proofPath, new Date("2026-06-06T00:30:00.000Z"));

    expect(proof?.ok).toBe(false);
    expect(proof?.output).toContain("Browser smoke proof is missing generated_at.");
  });

  it("recovers the browser smoke proof path from npm argument forwarding", () => {
    expect(resolveBrowserSmokeProofPath(
      ["scratch/track54-browser-smoke/browser-smoke-proof.json"],
      testEnv({ npm_config_browser_smoke_proof: "true" }),
    )).toBe("scratch/track54-browser-smoke/browser-smoke-proof.json");

    expect(resolveBrowserSmokeProofPath(
      ["--browser-smoke-proof=scratch/direct-proof.json"],
      testEnv(),
    )).toBe("scratch/direct-proof.json");
  });

  it("passes npm-forwarded browser-smoke flags without leaking their values to the readiness builder", () => {
    const valueFlags = new Set(["--base-url", "--browser-smoke-proof-out", "--out"]);
    const booleanFlags = new Set(["--no-start-server", "--skip-browser-smoke"]);
    const args = [
      "scratch/track54-readiness/latest-readiness-report.json",
      "scratch/track54-browser-smoke/browser-smoke-proof.json",
      "http://127.0.0.1:3111",
      "--from",
      "2026-06-01",
    ];
    const env = testEnv({
      npm_config_out: "true",
      npm_config_browser_smoke_proof_out: "true",
      npm_config_base_url: "true",
      npm_config_start_server: "",
    });

    expect(pickForwardedFlags(args, env, new Set(["--base-url"]), new Set(["--no-start-server"]))).toEqual([
      "--base-url",
      "http://127.0.0.1:3111",
      "--no-start-server",
    ]);
    expect(stripWrapperNpmValueLeakage(args, env, valueFlags, booleanFlags)).toEqual([
      "--from",
      "2026-06-01",
    ]);
  });

  it("writes the readiness report to a persisted JSON path for heartbeat review", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-readiness-out-"));
    tempRoots.push(root);
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });
    const outputPath = join(root, "nested", "latest-readiness-report.json");

    const writtenPath = writeTrack54ReadinessReport(report, outputPath);
    const persisted = JSON.parse(readFileSync(writtenPath, "utf-8")) as typeof report;

    expect(persisted.schema_version).toBe("track54_readiness_report_v1");
    expect(persisted.generated_at).toBe("2026-06-06T00:00:00.000Z");
    expect(persisted.persisted_report_path).toBe(resolve(outputPath));
    expect(persisted.acceptance_audit.grok_runner_proof.ok).toBe(true);
    expect(persisted.browser_smoke_clean).toBe(persisted.acceptance_audit.browser_smoke_proof.ok);
    expect(persisted.completion_blockers).toEqual(persisted.acceptance_audit.completion_blockers);
  });

  it("summarizes persisted readiness state for the thread heartbeat", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review({
        artifact_days_found: 1,
        days: [selectedArtifactDay()],
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.",
      }),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-06T01:00:00.000Z"),
    });

    expect(summary).toEqual(expect.objectContaining<Partial<Track54HeartbeatSummary>>({
      schema_version: "track54_heartbeat_summary_v1",
      local_review_date: "2026-06-05",
      local_review_weekday: "Friday",
      local_review_kind: "friday_promotion_review",
      review_modes_to_inspect: ["daily_pulse", "friday_deep"],
      persisted_path_matches_report_path: true,
      report_fresh_enough: true,
      report_freshness_status: "fresh",
      report_age_hours: 1,
      browser_smoke_proof_generated_at: "2026-06-06T00:00:00.000Z",
      browser_smoke_proof_age_hours: 1,
      max_browser_smoke_proof_age_hours: 6,
      browser_smoke_proof_ok: true,
      browser_smoke_proof_freshness_status: "fresh",
      browser_smoke_proof_fresh_enough: true,
      overall_status: "blocked_by_artifact_gates",
      acceptance_audit_status: "incomplete",
      grok_runner: {
        checked: true,
        ok: true,
        credential_source: null,
        credential_issue: null,
        xai_api_key_present: null,
        cli_auth_file_present: null,
        cli_auth_expires_at: null,
        cli_auth_expired: null,
      },
      production_writes_enabled: false,
      human_approval_required_before_writes: true,
      codex_automation_prompts_clean: true,
      codex_automation_missing_prompt_fragment_count: 0,
      write_automations_safe: true,
      status: "ready_for_review",
      next_safe_operator_action: "Keep collecting no-write artifacts until the matching mode gate is ready for human approval (daily_pulse 1/5 clean, earliest candidate 2026-06-12; friday_deep 0/1 clean, earliest candidate 2026-06-12).",
      safe_to_promote_without_human_approval: false,
    }));
    expect(summary.mode_gates.map((gate) => `${gate.mode}:${gate.artifact_days_found}/${gate.required_artifact_days}`)).toEqual([
      "daily_pulse:1/5",
      "friday_deep:0/1",
    ]);
    expect(summary.mode_gates.map((gate) => ({
      mode: gate.mode,
      clean_artifact_days_found: gate.clean_artifact_days_found,
      missing_clean_artifact_days: gate.missing_clean_artifact_days,
      earliest_candidate_date: gate.earliest_candidate_date,
    }))).toEqual([
      {
        mode: "daily_pulse",
        clean_artifact_days_found: 1,
        missing_clean_artifact_days: 4,
        earliest_candidate_date: "2026-06-12",
      },
      {
        mode: "friday_deep",
        clean_artifact_days_found: 0,
        missing_clean_artifact_days: 1,
        earliest_candidate_date: "2026-06-12",
      },
    ]);
    expect(summary.mode_gates[0]!.selected_artifacts).toEqual([
      expect.objectContaining({
        artifact_sha256: "e440fc9cf89096f134f3a8d7e0b3a0f23c65e3eeb57a62fd4da05bdbf419e9e9",
        accepted_signal_count: 3,
        accepted_decision_grade_count: 3,
      }),
    ]);
    expect(summary.mode_gates[0]!.write_mode_proposal_ids).toEqual([
      "grok-x-scout-daily",
      "daily-thesis-review",
    ]);
    expect(summary.mode_gates[0]!.write_mode_proposals).toEqual([
      {
        id: "grok-x-scout-daily",
        approval_review_window: {
          mode: "daily_pulse",
          from_date: "2026-06-01",
          to_date: "2026-06-05",
          artifact_days_found: 1,
          required_artifact_days: 5,
          accepted_signal_count: 5,
          accepted_decision_grade_count: 5,
        },
      },
      {
        id: "daily-thesis-review",
        approval_review_window: {
          mode: "daily_pulse",
          from_date: "2026-06-01",
          to_date: "2026-06-05",
          artifact_days_found: 1,
          required_artifact_days: 5,
          accepted_signal_count: 5,
          accepted_decision_grade_count: 5,
        },
      },
    ]);
    expect(summary.mode_gates[0]!.post_approval_transition).toEqual({
      disable_before_registering_write_mode: ["grok-x-scout-artifact-week-review"],
      register_after_disable: [
        "grok-x-scout-daily",
        "daily-thesis-review",
      ],
      keep_active: ["canola-price-and-fx-freshness-import"],
    });
    expect(summary.mode_gates[1]!.selected_artifacts).toEqual([]);
    expect(summary.mode_gates[1]!.write_mode_proposal_ids).toEqual([
      "grok-x-scout-friday-deep",
    ]);
    expect(summary.mode_gates[1]!.write_mode_proposals).toEqual([
      {
        id: "grok-x-scout-friday-deep",
        approval_review_window: {
          mode: "friday_deep",
          from_date: "2026-06-01",
          to_date: "2026-06-05",
          artifact_days_found: 0,
          required_artifact_days: 1,
          accepted_signal_count: 5,
          accepted_decision_grade_count: 5,
        },
      },
    ]);
    expect(summary.mode_gates[1]!.post_approval_transition).toEqual({
      disable_before_registering_write_mode: ["grok-x-scout-friday-deep-artifact-review"],
      register_after_disable: ["grok-x-scout-friday-deep"],
      keep_active: ["canola-price-and-fx-freshness-import"],
    });
  });

  it("classifies weekday heartbeat review using the Edmonton automation calendar", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-02T05:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: {
        ...cleanBrowserSmokeProof,
        generated_at: "2026-06-02T05:00:00.000Z",
      },
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review({
        artifact_days_found: 1,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 1.",
      }),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-02T05:39:00.000Z"),
    });

    expect(summary.local_review_date).toBe("2026-06-01");
    expect(summary.local_review_weekday).toBe("Monday");
    expect(summary.local_review_kind).toBe("weekday_daily_pulse_review");
    expect(summary.review_modes_to_inspect).toEqual(["daily_pulse"]);
  });

  it("reports the exact safe operator action when Grok credentials are missing", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-07T22:51:41.619Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: {
        ...cleanGrokRunnerProof,
        ok: false,
        credential_source: "none",
        credential_issue: "missing_credential",
        xai_api_key_present: false,
        cli_auth_file_present: false,
        cli_auth_expires_at: null,
        cli_auth_expired: null,
        output: [
          "Run `grok login` or add XAI_API_KEY before relying on scheduled Track 54 scout jobs.",
        ],
      },
      browserSmokeProof: {
        ...cleanBrowserSmokeProof,
        generated_at: "2026-06-07T22:51:29.398Z",
      },
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review({
        artifact_days_found: 2,
        verdict: "hold_manual_review",
        recommendation: "Keep Grok in manual/dry-run mode: 2 artifact parse failure(s).",
      }),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-07T22:52:00.000Z"),
    });

    expect(summary.grok_runner.credential_source).toBe("none");
    expect(summary.grok_runner.credential_issue).toBe("missing_credential");
    expect(summary.next_safe_operator_action).toBe(
      "Refresh Grok credentials with `grok login` or add `XAI_API_KEY` to `.env.local`, then run `npm run track54:recover-after-grok-login`. Do not run the scout or any write command directly.",
    );
  });

  it("reports Hermes terminal recovery separately from missing original Grok credentials", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-08T22:51:41.619Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: {
        ...cleanGrokRunnerProof,
        ok: false,
        credential_source: "none",
        credential_issue: "missing_credential",
        xai_api_key_present: false,
        cli_auth_file_present: false,
        cli_auth_expires_at: null,
        cli_auth_expired: null,
        output: [
          "Run `grok login` or add XAI_API_KEY before relying on scheduled Track 54 scout jobs.",
        ],
      },
      hermesTerminalProof: cleanHermesTerminalProof,
      browserSmokeProof: {
        ...cleanBrowserSmokeProof,
        generated_at: "2026-06-08T22:51:29.398Z",
      },
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review({
        artifact_days_found: 3,
        verdict: "hold_manual_review",
        recommendation: "Keep Grok in manual/dry-run mode: 2 artifact parse failure(s).",
      }),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-08T22:52:00.000Z"),
    });

    expect(summary.grok_runner.credential_issue).toBe("missing_credential");
    expect(report.acceptance_audit.completion_blockers).toContain(
      "Grok CLI/auth preflight failed; Hermes terminal fallback can collect no-write artifacts, but refresh Grok CLI auth or add XAI_API_KEY before any write-mode approval.",
    );
    expect(report.acceptance_audit.completion_blockers).not.toContain(
      "Grok CLI/auth preflight failed; scheduled dry-run X scout jobs will not collect artifacts until Grok CLI auth is refreshed or XAI_API_KEY is present for the auto runner.",
    );
    expect(summary.hermes_terminal).toEqual({
      checked: true,
      ok: true,
      hermes_version_ok: true,
      xai_oauth_logged_in: true,
      model_smoke_ok: true,
      x_search_tool_listed: true,
      x_search_globally_enabled: false,
      toolset_override_required: true,
      provider: "xai-oauth",
      model: "grok-4.3",
    });
    expect(summary.next_safe_operator_action).toBe(
      "Let scheduled no-write windows collect clean artifacts (daily_pulse 3/5 clean, earliest candidate 2026-06-09; friday_deep 0/1 clean, earliest candidate 2026-06-12); Hermes may recover missing/invalid same-day artifacts through the deterministic health path. Refresh normal Grok credentials before any write-mode approval. Do not run any write command directly.",
    );
  });

  it("labels same-day projected artifact dates as not-yet-due before the local scout cutoff", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-04T14:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: {
        ...cleanBrowserSmokeProof,
        generated_at: "2026-06-04T14:00:00.000Z",
      },
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review({
        to_date: "2026-06-03",
        required_artifact_days: 5,
        artifact_days_found: 4,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 5 clean artifact days; found 4.",
      }),
      fridayReview: review({
        mode: "friday_deep",
        to_date: "2026-05-29",
        required_artifact_days: 1,
        artifact_days_found: 0,
        verdict: "insufficient_artifacts",
        recommendation: "Keep Grok in manual/dry-run mode: need 1 clean artifact days; found 0.",
      }),
    });

    const beforeCutoff = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-04T20:00:00.000Z"),
    });
    const afterCutoff = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-04T22:10:00.000Z"),
    });

    expect(beforeCutoff.mode_gates[0]!.next_eligible_run_dates).toEqual(["2026-06-04"]);
    expect(beforeCutoff.mode_gates[0]!.next_eligible_run_statuses).toEqual([{
      date: "2026-06-04",
      status: "not_yet_due",
      artifact_due: false,
      cutoff_local_time: "16:10 MT",
    }]);
    expect(afterCutoff.mode_gates[0]!.next_eligible_run_statuses).toEqual([{
      date: "2026-06-04",
      status: "due_now",
      artifact_due: true,
      cutoff_local_time: "16:10 MT",
    }]);
    expect(beforeCutoff.mode_gates[1]!.next_eligible_run_statuses).toEqual([{
      date: "2026-06-05",
      status: "future_scheduled",
      artifact_due: false,
      cutoff_local_time: "16:50 MT",
    }]);
  });

  it("holds the heartbeat summary when browser smoke proof has aged out after readiness was generated", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-06T07:01:00.000Z"),
    });

    expect(summary.report_fresh_enough).toBe(true);
    expect(summary.browser_smoke_proof_age_hours).toBe(7.02);
    expect(summary.browser_smoke_proof_freshness_status).toBe("stale");
    expect(summary.browser_smoke_proof_fresh_enough).toBe(false);
    expect(summary.status).toBe("hold_manual_review");
    expect(summary.heartbeat_blockers).toContain(
      "Browser-smoke proof is older than 6 hours.",
    );
  });

  it("holds the heartbeat summary when browser smoke proof is missing", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-06T01:00:00.000Z"),
    });

    expect(summary.browser_smoke_proof_generated_at).toBeNull();
    expect(summary.browser_smoke_proof_age_hours).toBeNull();
    expect(summary.browser_smoke_proof_ok).toBeNull();
    expect(summary.browser_smoke_proof_freshness_status).toBe("missing");
    expect(summary.browser_smoke_proof_fresh_enough).toBe(false);
    expect(summary.heartbeat_blockers).toContain("Browser-smoke proof is missing.");
  });

  it("holds the heartbeat summary when browser smoke proof timestamp is missing", () => {
    const outputPath = "scratch/track54-readiness/latest-readiness-report.json";
    const proofWithoutTimestamp: BrowserSmokeProof = {
      ...cleanBrowserSmokeProof,
      checked: true,
      ok: true,
    };
    delete proofWithoutTimestamp.generated_at;
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: proofWithoutTimestamp,
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve(outputPath),
    }, {
      reportPath: outputPath,
      now: new Date("2026-06-06T01:00:00.000Z"),
    });

    expect(summary.browser_smoke_proof_generated_at).toBeNull();
    expect(summary.browser_smoke_proof_age_hours).toBeNull();
    expect(summary.browser_smoke_proof_ok).toBe(true);
    expect(summary.browser_smoke_proof_freshness_status).toBe("timestamp_missing");
    expect(summary.browser_smoke_proof_fresh_enough).toBe(false);
    expect(summary.heartbeat_blockers).toContain("Browser-smoke proof is missing generated_at.");
  });

  it("holds the heartbeat summary when persisted_report_path does not match the report path", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      writeAutomationChecks: cleanWriteAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      acceptanceTestProof: cleanAcceptanceTestProof,
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    const summary = summarizeTrack54ReadinessReport({
      ...report,
      persisted_report_path: resolve("scratch/track54-readiness/other-report.json"),
    }, {
      reportPath: "scratch/track54-readiness/latest-readiness-report.json",
      now: new Date("2026-06-06T01:00:00.000Z"),
    });

    expect(summary.status).toBe("hold_manual_review");
    expect(summary.persisted_path_matches_report_path).toBe(false);
    expect(summary.heartbeat_blockers).toContain("Persisted readiness report path does not match the reviewed report path.");
  });

  it("holds code-backed acceptance items when the focused acceptance tests fail", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      sourceFreshnessProof: cleanSourceFreshnessProof,
      grokRunnerProof: cleanGrokRunnerProof,
      browserSmokeProof: cleanBrowserSmokeProof,
      acceptanceTestProof: {
        ...cleanAcceptanceTestProof,
        ok: false,
        output: ["1 failed"],
      },
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.acceptance_audit.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.items.find((item) => item.id === "accepted_x_signal_contract")?.status).toBe("hold_manual_review");
    expect(report.acceptance_audit.completion_blockers).toContain("Focused Track 54 acceptance tests failed.");
  });

  it("holds the whole lane when one mode has manual-review quality blockers", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: cleanAutomationChecks,
      dailyReview: review({
        verdict: "hold_manual_review",
        recommendation: "Keep Grok in manual/dry-run mode: 1 artifact parse failure(s).",
        totals: {
          ...review().totals,
          parse_failures: 1,
        },
      }),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.items.find((item) => item.id === "daily_grok_artifacts")?.status).toBe("hold_manual_review");
    expect(report.next_actions.some((action) => action.includes("daily_pulse artifact warnings/blockers"))).toBe(true);
    expect(report.next_actions).not.toContain("Keep Grok in manual/dry-run mode: 1 artifact parse failure(s).");
  });

  it("checks local Codex automation manifests for active dry-run and readiness-report boundaries", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "grok-x-scout-artifact-week-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "grok-x-scout-artifact-week-review"',
        'status = "ACTIVE"',
        `rrule = "${dailyAutomationExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${dailyAutomationPromptWithBrowserProof}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily check",
        expected_schedule: "Mon-Fri 4:10 PM MT",
        expected_rrule: dailyAutomationExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run only",
        required_prompt_fragments: dailyAutomationRequiredPromptFragments,
        forbidden_prompt_fragments: dailyAutomationForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        observed_rrule: dailyAutomationExpectedRrule,
        observed_cwds: ["C:\\Users\\kyle\\Agriculture\\bushel-board-app"],
        schedule_boundary_present: true,
        cwd_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("checks the weekday artifact health-check manifest for no-write retry boundaries", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "track-54-daily-artifact-health-check";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "track-54-daily-artifact-health-check"',
        'status = "ACTIVE"',
        `rrule = "${dailyArtifactHealthExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${dailyArtifactHealthPrompt}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily artifact health check",
        expected_schedule: "Mon-Thu 4:45 PM MT",
        expected_rrule: dailyArtifactHealthExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run monitor only",
        required_prompt_fragments: dailyArtifactHealthRequiredPromptFragments,
        forbidden_prompt_fragments: dailyArtifactHealthForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        observed_rrule: dailyArtifactHealthExpectedRrule,
        observed_cwds: ["C:\\Users\\kyle\\Agriculture\\bushel-board-app"],
        schedule_boundary_present: true,
        cwd_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("checks the Hermes terminal shadow recovery manifest for no-write artifact boundaries", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "track-54-hermes-x-scout-prompt-bridge";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    const prompt = [
      "Run the Bushel Board Track 54 Hermes/Grok 4.3 terminal X scout shadow recovery in no-write mode.",
      "Then run npm --silent run track54:hermes-preflight and inspect checked_at, ok, hermes_version_ok, xai_oauth_logged_in, model_smoke_ok, x_search_tool_listed, x_search_globally_enabled, toolset_override_required, provider, model, output, and next_actions.",
      "Then inspect today's daily_pulse artifact state by running the existing no-write artifact reviewer: npm --silent run grok:x-scout:review-week -- --mode daily_pulse --required-days 5 --min-accepted-signals 1.",
      "If today's daily_pulse artifact is already present, parse_status is ok, dry_run is true, write is false, scout_run_id is null, run_date and mode match, and price_snapshot_status is fresh, do not run Hermes.",
      "If today's artifact is missing, parse-failed, invalid, lacks no-write evidence, has identity/mode mismatch, or lacks fresh price proof, run npm --silent run track54:hermes-x-scout:terminal -- --mode daily_pulse --date <local-run-date>.",
      "Do not run Hermes for low signal count alone when today's artifact is otherwise structurally valid and fresh.",
      "Do not run daily thesis review, do not run any `--write` command, do not write Supabase rows, do not enable production Grok routines, do not register write-mode automations, and do not call `/api/pipeline/run` or retired Grok Edge Functions.",
      "Hermes remains a shadow X evidence scout only; any generated artifact must still pass the existing Track 54 artifact reviewer before it can count toward promotion.",
    ].join(" ");
    writeFileSync(
      join(dir, "automation.toml"),
      [
        `id = "${id}"`,
        'status = "ACTIVE"',
        'rrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=20;BYSECOND=0"',
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${prompt}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root);
    const hermesCheck = checks.find((check) => check.id === id);

    expect(hermesCheck).toEqual(expect.objectContaining({
      id,
      observed_status: "active",
      observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=16;BYMINUTE=20;BYSECOND=0",
      observed_cwds: ["C:\\Users\\kyle\\Agriculture\\bushel-board-app"],
      schedule_boundary_present: true,
      cwd_boundary_present: true,
      prompt_boundary_present: true,
      forbidden_prompt_boundary_present: true,
      missing_prompt_fragments: [],
      present_forbidden_prompt_fragments: [],
    }));
  });

  it("rejects the artifact health-check manifest when its retry path includes a write command", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "track-54-daily-artifact-health-check";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "track-54-daily-artifact-health-check"',
        'status = "ACTIVE"',
        `rrule = "${dailyArtifactHealthExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${dailyArtifactHealthPrompt} Then run npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write."`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily artifact health check",
        expected_schedule: "Mon-Thu 4:45 PM MT",
        expected_rrule: dailyArtifactHealthExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run monitor only",
        required_prompt_fragments: dailyArtifactHealthRequiredPromptFragments,
        forbidden_prompt_fragments: dailyArtifactHealthForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        schedule_boundary_present: true,
        cwd_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: false,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [
          "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
        ],
      }),
    ]);
  });

  it("checks the Friday artifact health-check manifest for both-mode no-write retry boundaries", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "track-54-friday-artifact-health-check";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "track-54-friday-artifact-health-check"',
        'status = "ACTIVE"',
        `rrule = "${fridayArtifactHealthExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${fridayArtifactHealthPrompt}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "Friday artifact health check",
        expected_schedule: "Friday 5:15 PM MT",
        expected_rrule: fridayArtifactHealthExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "Friday dry-run monitor only",
        required_prompt_fragments: fridayArtifactHealthRequiredPromptFragments,
        forbidden_prompt_fragments: fridayArtifactHealthForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        observed_rrule: fridayArtifactHealthExpectedRrule,
        observed_cwds: ["C:\\Users\\kyle\\Agriculture\\bushel-board-app"],
        schedule_boundary_present: true,
        cwd_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("rejects the Friday artifact health-check manifest when either retry path includes a write command", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "track-54-friday-artifact-health-check";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "track-54-friday-artifact-health-check"',
        'status = "ACTIVE"',
        `rrule = "${fridayArtifactHealthExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${fridayArtifactHealthPrompt} Then run npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write."`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "Friday artifact health check",
        expected_schedule: "Friday 5:15 PM MT",
        expected_rrule: fridayArtifactHealthExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "Friday dry-run monitor only",
        required_prompt_fragments: fridayArtifactHealthRequiredPromptFragments,
        forbidden_prompt_fragments: fridayArtifactHealthForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        schedule_boundary_present: true,
        cwd_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: false,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [
          "npx tsx scripts/run-grok-x-scout.ts --mode friday_deep --write",
        ],
      }),
    ]);
  });

  it("checks the promotion heartbeat manifest for thread-targeted no-write review boundaries", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "track-54-promotion-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "track-54-promotion-review"',
        'kind = "heartbeat"',
        'status = "ACTIVE"',
        `rrule = "${promotionHeartbeatExpectedRrule}"`,
        'target_thread_id = "019e849b-7d65-7362-8d8c-b4086a14ea30"',
        `prompt = "${promotionHeartbeatPrompt}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "promotion heartbeat",
        expected_kind: "heartbeat",
        expected_schedule: "Mon-Fri 9:30 AM and 5:30 PM MT",
        expected_rrule: promotionHeartbeatExpectedRrule,
        require_target_thread: true,
        boundary: "thread heartbeat only",
        required_prompt_fragments: promotionHeartbeatRequiredPromptFragments,
        forbidden_prompt_fragments: promotionHeartbeatForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        observed_kind: "heartbeat",
        observed_rrule: promotionHeartbeatExpectedRrule,
        observed_target_thread_id: "019e849b-7d65-7362-8d8c-b4086a14ea30",
        kind_boundary_present: true,
        schedule_boundary_present: true,
        cwd_boundary_present: null,
        target_thread_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("rejects the promotion heartbeat manifest when it is not attached to a thread", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "track-54-promotion-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "track-54-promotion-review"',
        'kind = "heartbeat"',
        'status = "ACTIVE"',
        `rrule = "${promotionHeartbeatExpectedRrule}"`,
        `prompt = "${promotionHeartbeatPrompt}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "promotion heartbeat",
        expected_kind: "heartbeat",
        expected_schedule: "Mon-Fri 9:30 AM and 5:30 PM MT",
        expected_rrule: promotionHeartbeatExpectedRrule,
        require_target_thread: true,
        boundary: "thread heartbeat only",
        required_prompt_fragments: promotionHeartbeatRequiredPromptFragments,
        forbidden_prompt_fragments: promotionHeartbeatForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        kind_boundary_present: true,
        schedule_boundary_present: true,
        cwd_boundary_present: null,
        target_thread_boundary_present: false,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("rejects dry-run automation prompts that omit the readiness audit and browser proof output", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "grok-x-scout-artifact-week-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "grok-x-scout-artifact-week-review"',
        'status = "ACTIVE"',
        `rrule = "${dailyAutomationExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        'prompt = "Run daily_pulse with --dry-run. Do not run any `--write` command."',
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily check",
        expected_schedule: "Mon-Fri 4:10 PM MT",
        expected_rrule: dailyAutomationExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run only",
        required_prompt_fragments: dailyAutomationRequiredPromptFragments,
        forbidden_prompt_fragments: dailyAutomationForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        schedule_boundary_present: true,
        cwd_boundary_present: true,
        prompt_boundary_present: false,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [
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
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("rejects dry-run automation prompts that run readiness without browser proof", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "grok-x-scout-artifact-week-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "grok-x-scout-artifact-week-review"',
        'status = "ACTIVE"',
        `rrule = "${dailyAutomationExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        'prompt = "Run daily_pulse with --dry-run. Do not run any `--write` command. Then run npm run track54:readiness and report acceptance_audit.overall_status plus completion_blockers."',
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily check",
        expected_schedule: "Mon-Fri 4:10 PM MT",
        expected_rrule: dailyAutomationExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run only",
        required_prompt_fragments: dailyAutomationRequiredPromptFragments,
        forbidden_prompt_fragments: dailyAutomationForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        prompt_boundary_present: false,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [
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
          "--browser-smoke-proof-out",
          "scratch/track54-browser-smoke/browser-smoke-proof.json",
          "--out",
          "scratch/track54-readiness/latest-readiness-report.json",
          "acceptance_audit.browser_smoke_proof",
          "browser_smoke_clean",
          "persisted_report_path",
        ],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("rejects dry-run automation prompts that also include a write-mode command", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "grok-x-scout-artifact-week-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "grok-x-scout-artifact-week-review"',
        'status = "ACTIVE"',
        `rrule = "${dailyAutomationExpectedRrule}"`,
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${dailyAutomationPromptWithBrowserProof} Then run npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write."`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily check",
        expected_schedule: "Mon-Fri 4:10 PM MT",
        expected_rrule: dailyAutomationExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run only",
        required_prompt_fragments: dailyAutomationRequiredPromptFragments,
        forbidden_prompt_fragments: dailyAutomationForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        schedule_boundary_present: true,
        cwd_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: false,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [
          "npx tsx scripts/run-grok-x-scout.ts --mode daily_pulse --write",
        ],
      }),
    ]);
  });

  it("rejects automation manifests with the wrong schedule", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "grok-x-scout-artifact-week-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "grok-x-scout-artifact-week-review"',
        'status = "ACTIVE"',
        'rrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=17;BYMINUTE=10;BYSECOND=0"',
        `cwds = ["${dailyAutomationManifestCwd}"]`,
        `prompt = "${dailyAutomationPromptWithBrowserProof}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily check",
        expected_schedule: "Mon-Fri 4:10 PM MT",
        expected_rrule: dailyAutomationExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run only",
        required_prompt_fragments: dailyAutomationRequiredPromptFragments,
        forbidden_prompt_fragments: dailyAutomationForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        observed_rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=17;BYMINUTE=10;BYSECOND=0",
        schedule_boundary_present: false,
        cwd_boundary_present: true,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("rejects automation manifests with the wrong working directory", () => {
    const root = mkdtempSync(join(tmpdir(), "track54-automations-"));
    tempRoots.push(root);
    const id = "grok-x-scout-artifact-week-review";
    const dir = join(root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.toml"),
      [
        'id = "grok-x-scout-artifact-week-review"',
        'status = "ACTIVE"',
        `rrule = "${dailyAutomationExpectedRrule}"`,
        'cwds = ["C:\\\\Users\\\\kyle\\\\Agriculture\\\\wrong-app"]',
        `prompt = "${dailyAutomationPromptWithBrowserProof}"`,
      ].join("\n"),
    );

    const checks = checkCodexAutomations(root, [
      {
        id,
        role: "daily check",
        expected_schedule: "Mon-Fri 4:10 PM MT",
        expected_rrule: dailyAutomationExpectedRrule,
        expected_cwd: dailyAutomationExpectedCwd,
        boundary: "dry-run only",
        required_prompt_fragments: dailyAutomationRequiredPromptFragments,
        forbidden_prompt_fragments: dailyAutomationForbiddenPromptFragments,
      },
    ]);

    expect(checks).toEqual([
      expect.objectContaining({
        id,
        observed_status: "active",
        observed_cwds: ["C:\\Users\\kyle\\Agriculture\\wrong-app"],
        schedule_boundary_present: true,
        cwd_boundary_present: false,
        prompt_boundary_present: true,
        forbidden_prompt_boundary_present: true,
        missing_prompt_fragments: [],
        present_forbidden_prompt_fragments: [],
      }),
    ]);
  });

  it("treats missing or unsafe automation manifests as a manual hold", () => {
    const report = buildTrack54ReadinessReport({
      generatedAt: "2026-06-06T00:00:00.000Z",
      automationChecks: [
        {
          ...cleanAutomationChecks[1]!,
          observed_status: "missing",
          prompt_boundary_present: null,
          forbidden_prompt_boundary_present: null,
          missing_prompt_fragments: ["--dry-run"],
          present_forbidden_prompt_fragments: [],
        },
      ],
      dailyReview: review(),
      fridayReview: review({
        mode: "friday_deep",
        required_artifact_days: 1,
        artifact_days_found: 1,
      }),
    });

    expect(report.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.overall_status).toBe("hold_manual_review");
    expect(report.acceptance_audit.items.find((item) => item.id === "price_before_daily_analysis")?.status).toBe("hold_manual_review");
    expect(report.acceptance_audit.items.find((item) => item.id === "artifact_collection_cadence_covers_projection")?.status)
      .toBe("hold_manual_review");
    expect(report.acceptance_audit.completion_blockers).toContain(
      "daily_pulse projected artifact dates are not covered by an active dry-run Codex automation with the expected schedule and prompt boundaries.",
    );
    expect(report.next_actions).toContain("Fix or re-register Codex automation manifests before treating Track 54 as operational.");
  });
});
