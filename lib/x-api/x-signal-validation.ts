import { createHash } from "node:crypto";
import { containsXSignalAdviceLanguage } from "@/lib/public-copy-guardrails";
import type { XScoutSignal } from "@/lib/x-api/x-scout-contract";
import {
  classifyStaleness,
  daysBetween,
  scoreXSignalImpact,
  type PriceSnapshotStatus,
} from "@/lib/x-api/x-signal-valuation";

export const V1_ADMITTED_X_SIGNAL_GRAINS = [
  "Barley",
  "Canola",
  "Corn",
  "Durum",
  "Oats",
  "Soybeans",
  "Wheat",
] as const;

const ADMITTED_GRAIN_SET = new Set<string>(V1_ADMITTED_X_SIGNAL_GRAINS);
const PRICE_CATEGORIES = new Set(["price", "basis", "elevator_bid"]);
const CATEGORY_DECISION_MAP: Record<XScoutSignal["category"], string[]> = {
  farmer_report: ["watch_field_conditions"],
  analyst_commentary: ["watch_sentiment_shift"],
  elevator_bid: ["watch_basis"],
  export_news: ["watch_export_demand"],
  weather: ["watch_yield_risk"],
  policy: ["watch_policy_risk"],
  basis: ["watch_basis"],
  logistics: ["watch_movement_timing"],
  price: ["watch_price_context"],
  other: ["watch_market_context"],
};

export interface XSignalValidationContext {
  runDate: string;
  mode: "daily_pulse" | "friday_deep" | "manual_test";
  priceSnapshotStatus?: PriceSnapshotStatus;
}

export interface XSignalValidationResult {
  accepted: boolean;
  reasons: string[];
  signalHash: string;
  metadata: {
    schema_version: "x_signal_metadata_v1";
    grok_claim_type: "observation" | "quote" | "interpretation" | "unsupported";
    staleness_class: string;
    source_tier: string;
    corroboration: {
      same_claim_count: number;
      independent_sources: string[];
      official_source_match: boolean;
    };
    seasonal_phase: string;
    impact_breakdown: Record<string, number>;
    affected_decisions: string[];
    grok_summary: string;
    codex_validation_notes: string[];
    blocked_claims: string[];
    allowed_claims: string[];
    needs_official_verification: boolean;
  };
}

function normalizeGrain(grain: string): string {
  if (grain.toLowerCase() === "amber durum") return "Durum";
  return grain.trim();
}

function hasSourceUrl(signal: XScoutSignal): boolean {
  return Boolean(signal.source_url && /^https:\/\/(x\.com|twitter\.com)\//i.test(signal.source_url));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function allowedWindowDays(mode: XSignalValidationContext["mode"]): number {
  return mode === "friday_deep" ? 7 : 1;
}

function isFuturePost(postedAt: string, runDate: string): boolean {
  return new Date(postedAt).getTime() > new Date(`${runDate}T23:59:59Z`).getTime();
}

export function buildSignalHash(signal: XScoutSignal): string {
  const stable = [
    signal.source_url ?? "",
    signal.post_id ?? "",
    signal.handle.toLowerCase(),
    signal.posted_at,
    signal.primary_grain,
    signal.summary,
  ].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

export function deriveAffectedDecisionsFromClassifiers(
  category: string,
  direction: string,
  seasonalPhase?: string,
): string[] {
  const categoryDecisions =
    CATEGORY_DECISION_MAP[category as XScoutSignal["category"]] ?? CATEGORY_DECISION_MAP.other;
  const decisions = [...categoryDecisions];

  if (seasonalPhase === "planting") {
    decisions.push("watch_seeding_progress");
  } else if (seasonalPhase === "harvest") {
    decisions.push("watch_harvest_progress");
  } else if (seasonalPhase === "marketing") {
    decisions.push("watch_cash_marketing");
  }

  if (direction === "bullish" || direction === "bearish") {
    decisions.push("watch_directional_risk");
  }

  return uniqueSorted(decisions);
}

export function deriveAffectedDecisions(signal: XScoutSignal, seasonalPhase = signal.seasonal_phase): string[] {
  return deriveAffectedDecisionsFromClassifiers(signal.category, signal.direction, seasonalPhase);
}

export function validateXScoutSignal(
  signal: XScoutSignal,
  context: XSignalValidationContext,
): XSignalValidationResult {
  const reasons: string[] = [];
  const blockedClaims: string[] = [];
  const allowedClaims: string[] = [];
  const combinedText = `${signal.raw_quote ?? ""} ${signal.summary} ${signal.why_it_matters}`;
  const valuation = scoreXSignalImpact(signal, context.runDate, context.priceSnapshotStatus ?? "not_checked");
  const stalenessClass = classifyStaleness(signal.posted_at, context.runDate, signal.category);
  const affectedDecisions = deriveAffectedDecisions(signal, valuation.seasonalPhase);
  const ageDays = daysBetween(signal.posted_at, `${context.runDate}T23:59:59Z`);
  const maxAgeDays = allowedWindowDays(context.mode);

  if (!hasSourceUrl(signal)) {
    reasons.push("missing_or_invalid_source_url");
    blockedClaims.push("No canonical X post URL.");
  } else {
    allowedClaims.push("Source URL present.");
  }

  if (containsXSignalAdviceLanguage(combinedText)) {
    reasons.push("forbidden_advice_language");
    blockedClaims.push("Contains buy/sell/trade/advice wording.");
  }

  const affectedGrains = new Set([
    normalizeGrain(signal.primary_grain),
    ...signal.affected_grains.map(normalizeGrain),
  ]);
  const unsupportedGrains = [...affectedGrains].filter((grain) => !ADMITTED_GRAIN_SET.has(grain));
  if (unsupportedGrains.length > 0) {
    reasons.push(`unsupported_grain:${unsupportedGrains.join(",")}`);
    blockedClaims.push(`Unsupported V1 grain scope: ${unsupportedGrains.join(", ")}.`);
  }

  if (signal.affected_regions.length === 0) {
    reasons.push("missing_affected_region");
    blockedClaims.push("No affected region supplied for farmer-facing impact.");
  }

  if (isFuturePost(signal.posted_at, context.runDate)) {
    reasons.push("future_post_date");
    blockedClaims.push("Post timestamp is after the scout run date.");
  } else if (ageDays > maxAgeDays) {
    reasons.push(`outside_search_window:${context.mode}`);
    blockedClaims.push(`Post is outside the allowed ${maxAgeDays}-day ${context.mode} search window.`);
  }

  if (stalenessClass === "stale" && context.mode !== "friday_deep") {
    reasons.push("stale_for_daily_pulse");
    blockedClaims.push("Post is stale for daily pulse mode.");
  }

  const priceStatus = context.priceSnapshotStatus ?? "not_checked";
  if (PRICE_CATEGORIES.has(signal.category) && priceStatus !== "fresh") {
    reasons.push(`price_context_not_fresh:${priceStatus}`);
    blockedClaims.push("Price-sensitive signal lacks fresh price context.");
  }

  if (signal.claimed_numbers.length > 0) {
    if (signal.needs_official_verification) {
      allowedClaims.push("Numeric claim captured but flagged for official verification.");
    } else {
      reasons.push("numeric_claim_missing_official_verification");
      blockedClaims.push("Numeric claim was not flagged for official verification.");
    }
  } else {
    allowedClaims.push("No unverified numeric claim admitted as fact.");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    signalHash: buildSignalHash(signal),
    metadata: {
      schema_version: "x_signal_metadata_v1",
      grok_claim_type: signal.raw_quote ? "quote" : "interpretation",
      staleness_class: valuation.stalenessClass,
      source_tier: valuation.sourceTier,
      corroboration: {
        same_claim_count: 0,
        independent_sources: [],
        official_source_match: false,
      },
      seasonal_phase: valuation.seasonalPhase,
      impact_breakdown: valuation.impactBreakdown,
      affected_decisions: affectedDecisions,
      grok_summary: signal.summary,
      codex_validation_notes: reasons,
      blocked_claims: blockedClaims,
      allowed_claims: allowedClaims,
      needs_official_verification: signal.needs_official_verification,
    },
  };
}
