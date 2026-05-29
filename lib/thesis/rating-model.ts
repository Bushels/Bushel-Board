export type RatingLane = "canada" | "us" | "cross_border";

export type RatingDomainId =
  | "supply"
  | "demand"
  | "movement"
  | "logistics"
  | "price"
  | "positioning"
  | "weather"
  | "farmer_local";

export type RatingLabel =
  | "strong_bear"
  | "bear"
  | "lean_bear"
  | "balanced"
  | "lean_bull"
  | "bull"
  | "strong_bull";

export type SourceFreshnessStatus =
  | "strong"
  | "watch"
  | "stale"
  | "empty"
  | "partial"
  | "expected_lag";

export type RatingConfidenceLabel = "high" | "medium" | "low";

export interface RatingDomainScore {
  domain: RatingDomainId;
  score: number;
  weight: number;
  weighted_score: number;
  confidence: RatingConfidenceLabel;
  freshness_status: SourceFreshnessStatus;
  sources: string[];
  positive_evidence: string[];
  negative_evidence: string[];
  blocked_claims: string[];
}

export interface ThesisRatingScorecard {
  grain: string;
  lane: RatingLane;
  period_anchor: string;
  source_watermark: string | null;
  overall_score: number;
  overall_label: RatingLabel;
  confidence_score: number;
  confidence_label: RatingConfidenceLabel;
  domains: RatingDomainScore[];
  contradictions: string[];
  quality_adjustments: string[];
  missing_required_sources: string[];
  llm_allowed_claims: string[];
  llm_blocked_claims: string[];
}

export type UnsupportedRatingLaneStatus = "parked" | "unsupported";
export type UnsupportedRatingLaneReason = "grain_class_mapping_unresolved" | "outside_v1_scope";

export interface UnsupportedRatingLaneMetadata {
  supported: false;
  grain: string;
  status: UnsupportedRatingLaneStatus;
  reason: UnsupportedRatingLaneReason;
  detail: string;
}

export const SUPPORTED_RATING_GRAINS = [
  "Corn",
  "Soybeans",
  "Wheat",
  "Durum",
  "Canola",
  "Barley",
  "Oats",
] as const;

export type SupportedRatingGrain = (typeof SUPPORTED_RATING_GRAINS)[number];

const SUPPORTED_RATING_GRAIN_SET = new Set<string>(SUPPORTED_RATING_GRAINS);
const PARKED_WHEAT_CLASS_SET = new Set(["Spring Wheat", "Winter Wheat"]);

export function clampRatingScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(-100, Math.min(100, score));
}

export function clampConfidenceScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

export function scoreToRatingLabel(score: number): RatingLabel {
  const clampedScore = clampRatingScore(score);

  if (clampedScore >= 70) return "strong_bull";
  if (clampedScore >= 30) return "bull";
  if (clampedScore >= 10) return "lean_bull";
  if (clampedScore >= -9) return "balanced";
  if (clampedScore >= -29) return "lean_bear";
  if (clampedScore >= -69) return "bear";
  return "strong_bear";
}

export function isRatingSupportedGrain(grain: string): grain is SupportedRatingGrain {
  return SUPPORTED_RATING_GRAIN_SET.has(grain);
}

export function getUnsupportedRatingLaneMetadata(grain: string): UnsupportedRatingLaneMetadata {
  if (PARKED_WHEAT_CLASS_SET.has(grain)) {
    return {
      supported: false,
      grain,
      status: "parked",
      reason: "grain_class_mapping_unresolved",
      detail: `${grain} is parked until class-safe source mapping exists.`,
    };
  }

  return {
    supported: false,
    grain,
    status: "unsupported",
    reason: "outside_v1_scope",
    detail: `${grain} is outside the V1 source-backed thesis rating lanes.`,
  };
}
