#!/usr/bin/env npx tsx
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDailyThesisReviewPacket,
  hasDailyThesisAcceptedXSignalSeal,
  type DailyThesisReviewPacket,
} from "./build-daily-thesis-review-packet";
import { deriveAffectedDecisionsFromClassifiers } from "@/lib/x-api/x-signal-validation";
import { sanitizePublicAdviceCopy } from "@/lib/public-copy-guardrails";
import { assertTrack54WriteGate } from "./track54-write-gate";

type Side = "cad" | "us";
type JsonRecord = Record<string, unknown>;

export interface DailyReviewCorroboration {
  same_claim_count: number;
  independent_sources: string[];
  official_source_match: boolean;
}

export interface DailyReviewDecision {
  side: Side;
  market: string;
  stance_delta: number;
  confidence_delta: number;
  severity: "critical" | "elevated" | "normal" | "unknown";
  signal_note: string;
  reasoning: string;
  bull_case_impact: "strengthened" | "weakened" | "unchanged";
  bear_case_impact: "strengthened" | "weakened" | "unchanged";
  new_bullet_suggested: string;
  source_signal_hash: string | null;
  source_post_id: string | null;
  source_post_url: string | null;
  source_scout_run_id: string | null;
  affected_decisions: string[];
  allowed_claims: string[];
  blocked_claims: string[];
  needs_official_verification: boolean;
  corroboration: DailyReviewCorroboration;
  idempotency_key: string;
}

const args = process.argv.slice(2);
const IS_CLI = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

function hasFlag(flag: string): boolean {
  return args.includes(flag) || process.env[`npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`] === "true";
}

if (
  IS_CLI &&
  (hasFlag("--help") || hasFlag("-h"))
) {
  console.error(`
Daily Thesis Review

Usage:
  npm run daily-thesis-review -- --dry-run
  npm run daily-thesis-review -- --write --approval-phrase "<approval phrase>" --approval-review-from YYYY-MM-DD --approval-review-to YYYY-MM-DD

Options:
  --dry-run                          Build packet and decisions without trajectory writes.
  --write                            Write bounded daily trajectory deltas after Track 54 approval.
  --approval-phrase <phrase>         Required with --write after candidate promotion brief and human approval.
  --approval-review-from YYYY-MM-DD  Reviewed artifact window start from the promotion brief.
  --approval-review-to YYYY-MM-DD    Reviewed artifact window end from the promotion brief.
`);
  process.exit(0);
}

const WRITE = hasFlag("--write");
const DRY_RUN = hasFlag("--dry-run") || !WRITE;
if (IS_CLI && WRITE) {
  assertTrack54WriteGate(args, process.env, "Daily thesis review write mode", { mode: "daily_pulse" });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sideForMarket(grain: string): Side {
  return ["Corn", "Soybeans", "Wheat", "Oats", "Barley"].includes(grain) ? "us" : "cad";
}

function sideForSignal(signal: Record<string, unknown>, grain: string): Side {
  const regions = Array.isArray(signal.affected_regions)
    ? signal.affected_regions.map((region) => String(region).toLowerCase())
    : [];
  const canadaRegion = regions.some((region) =>
    /\b(alberta|saskatchewan|manitoba|prairie|canada|canadian)\b/.test(region),
  );
  if (canadaRegion) return "cad";
  return sideForMarket(grain);
}

function directionToDelta(direction: unknown): number {
  if (direction === "bullish") return 1;
  if (direction === "bearish") return -1;
  return 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sanitizeDailyReviewXCopy(value: string, fallback = "Accepted X Pulse signal"): string {
  const sanitized = sanitizePublicAdviceCopy(value).replace(/\s+/g, " ").trim();
  return sanitized || fallback;
}

function sanitizeDailyReviewXClaims(values: string[]): string[] {
  const sanitized = values.map((value) => sanitizeDailyReviewXCopy(value, "watch evidence")).filter(Boolean);
  return sanitized.filter((value, index) => sanitized.indexOf(value) === index);
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function asCorroboration(value: unknown): DailyReviewCorroboration {
  const record = asRecord(value);
  return {
    same_claim_count: asNumber(record.same_claim_count),
    independent_sources: asStringArray(record.independent_sources),
    official_source_match: record.official_source_match === true,
  };
}

function buildDecisionIdempotencyKey(signal: Record<string, unknown>, grain: string, summary: string): string {
  const basis = {
    grain,
    signal_hash: stringOrNull(signal.signal_hash),
    post_id: stringOrNull(signal.post_id),
    post_url: stringOrNull(signal.post_url),
    scout_run_id: stringOrNull(signal.scout_run_id),
    summary,
  };
  const digest = createHash("sha256").update(JSON.stringify(basis)).digest("hex").slice(0, 24);
  return `daily_pulse:${digest}`;
}

function isDailyPulseSignal(signal: Record<string, unknown>): boolean {
  return signal.search_mode === "pulse" && typeof signal.scout_run_id === "string" && signal.scout_run_id.trim().length > 0;
}

export function buildDailyReviewDecisions(packet: DailyThesisReviewPacket): DailyReviewDecision[] {
  return packet.accepted_x_signals
    .filter(hasDailyThesisAcceptedXSignalSeal)
    .filter(isDailyPulseSignal)
    .filter((signal) => Number(signal.relevance_score ?? 0) >= 85)
    .slice(0, 6)
    .map((signal) => {
      const metadata = asRecord(signal.signal_metadata);
      const grain = String(signal.primary_impact_grain ?? signal.grain);
      const stanceDelta = clamp(directionToDelta(signal.sentiment), -3, 3);
      const confidenceDelta = stanceDelta === 0 ? 0 : 2;
      const sourceTier = String(signal.source_cred_tier ?? "unlisted");
      const rawSummary = String(signal.post_summary ?? "Accepted X Pulse signal");
      const summary = sanitizeDailyReviewXCopy(rawSummary);
      const idempotencyKey = buildDecisionIdempotencyKey(signal, grain, rawSummary);
      const storedAffectedDecisions = asStringArray(signal.affected_decisions);
      const metadataAffectedDecisions = asStringArray(metadata.affected_decisions);
      const seasonalPhase =
        typeof signal.seasonal_phase === "string"
          ? signal.seasonal_phase
          : typeof metadata.seasonal_phase === "string"
            ? metadata.seasonal_phase
            : undefined;
      return {
        side: sideForSignal(signal, grain),
        market: grain,
        stance_delta: stanceDelta,
        confidence_delta: confidenceDelta,
        severity: Number(signal.relevance_score ?? 0) >= 95 ? "elevated" : "normal",
        signal_note: `X Pulse Watch (${sourceTier}): ${summary}`,
        reasoning:
          "Accepted X Pulse evidence is source-linked and bounded to a small daily trajectory tick. It remains watch evidence only; Friday desk review owns the thesis-of-record.",
        bull_case_impact: stanceDelta > 0 ? "strengthened" : "unchanged",
        bear_case_impact: stanceDelta < 0 ? "strengthened" : "unchanged",
        new_bullet_suggested:
          Number(signal.relevance_score ?? 0) >= 95
            ? `Friday regime review candidate: ${summary}`
            : "",
        source_signal_hash: stringOrNull(signal.signal_hash),
        source_post_id: stringOrNull(signal.post_id),
        source_post_url: stringOrNull(signal.post_url),
        source_scout_run_id: stringOrNull(signal.scout_run_id),
        affected_decisions: storedAffectedDecisions.length
          ? storedAffectedDecisions
          : metadataAffectedDecisions.length
            ? metadataAffectedDecisions
            : deriveAffectedDecisionsFromClassifiers(
                String(signal.category ?? "other"),
                String(signal.sentiment ?? "neutral"),
                seasonalPhase,
              ),
        allowed_claims: sanitizeDailyReviewXClaims(asStringArray(metadata.allowed_claims)),
        blocked_claims: sanitizeDailyReviewXClaims(asStringArray(metadata.blocked_claims)),
        needs_official_verification: metadata.needs_official_verification === true,
        corroboration: asCorroboration(metadata.corroboration),
        idempotency_key: idempotencyKey,
      };
    });
}

function parseEvidence(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function matchingTrajectoryRows(packet: DailyThesisReviewPacket, decision: DailyReviewDecision): JsonRecord[] {
  const rows = decision.side === "cad" ? packet.trajectory.canada : packet.trajectory.us;
  return rows.filter((row) => {
    const market = decision.side === "cad" ? row.grain : row.market_name;
    return row.scan_type === "opus_review_daily_pulse" && market === decision.market;
  });
}

export function filterNewDailyReviewDecisions(
  packet: DailyThesisReviewPacket,
  decisions: DailyReviewDecision[],
): DailyReviewDecision[] {
  return decisions.filter((decision) => {
    return !matchingTrajectoryRows(packet, decision).some((row) => {
      const evidence = parseEvidence(row.evidence);
      const existingSignalNote = typeof evidence.signal_note === "string"
        ? sanitizeDailyReviewXCopy(evidence.signal_note)
        : null;
      return (
        evidence.daily_review_idempotency_key === decision.idempotency_key ||
        existingSignalNote === decision.signal_note
      );
    });
  });
}

function runWriter(decision: DailyReviewDecision): Promise<number> {
  const commandArgs = [
    "scripts/write-collector-soft-update.py",
    "--side",
    decision.side,
    "--market",
    decision.market,
    "--scan-type",
    "opus_review_daily_pulse",
    "--trigger",
    "Daily Thesis Review - official data, prices, and X Pulse",
    "--stance-delta",
    String(decision.stance_delta),
    "--confidence-delta",
    String(decision.confidence_delta),
    "--severity",
    decision.severity,
    "--signal-note",
    decision.signal_note,
    "--reasoning",
    decision.reasoning,
    "--bull-case-impact",
    decision.bull_case_impact,
    "--bear-case-impact",
    decision.bear_case_impact,
    "--evidence-extra-json",
    JSON.stringify({
      daily_review_idempotency_key: decision.idempotency_key,
      x_signal_hash: decision.source_signal_hash,
      x_post_id: decision.source_post_id,
      x_post_url: decision.source_post_url,
      x_scout_run_id: decision.source_scout_run_id,
      x_affected_decisions: decision.affected_decisions,
      x_allowed_claims: decision.allowed_claims,
      x_blocked_claims: decision.blocked_claims,
      x_needs_official_verification: decision.needs_official_verification,
      x_corroboration: decision.corroboration,
    }),
  ];

  if (decision.new_bullet_suggested) {
    commandArgs.push("--new-bullet-suggested", decision.new_bullet_suggested);
  }

  return new Promise((resolve) => {
    const child = spawn("python", commandArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", () => resolve(127));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const packet = await buildDailyThesisReviewPacket();
  const decisions = buildDailyReviewDecisions(packet);
  const writeDecisions = filterNewDailyReviewDecisions(packet, decisions);

  const result = {
    dry_run: DRY_RUN,
    write: WRITE,
    packet,
    decisions,
    write_decisions: writeDecisions,
    writes_attempted: 0,
    writes_succeeded: 0,
    writes_skipped_existing: decisions.length - writeDecisions.length,
  };

  if (WRITE) {
    for (const decision of writeDecisions) {
      result.writes_attempted += 1;
      const code = await runWriter(decision);
      if (code !== 0) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(code);
      }
      result.writes_succeeded += 1;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

if (IS_CLI) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
