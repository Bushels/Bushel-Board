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

export interface QualityAdjustmentInput {
  freshnessStatus: SourceFreshnessStatus;
  isRequired?: boolean;
  isProxy?: boolean;
  missingFreshnessProof?: boolean;
}

export interface QualityAdjustmentResult {
  confidenceAdjustment: number;
  scoreMultiplier: number;
  reasons: string[];
}

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

export type DomainWeights = Readonly<Record<RatingDomainId, number>>;
export type NormalizedDomainWeights = Readonly<Partial<Record<RatingDomainId, number>>>;

export interface DomainWeightOptions {
  structurallyAbsentDomains?: readonly RatingDomainId[];
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

const RATING_DOMAIN_IDS: readonly RatingDomainId[] = [
  "supply",
  "demand",
  "movement",
  "logistics",
  "price",
  "positioning",
  "weather",
  "farmer_local",
] as const;

export const CANADA_RATING_DOMAIN_WEIGHTS: DomainWeights = Object.freeze({
  supply: 0.2,
  demand: 0.25,
  movement: 0.2,
  logistics: 0.1,
  price: 0.15,
  positioning: 0.05,
  weather: 0.05,
  farmer_local: 0,
});

export const US_RATING_DOMAIN_WEIGHTS: DomainWeights = Object.freeze({
  supply: 0.25,
  demand: 0.25,
  movement: 0.1,
  logistics: 0.05,
  price: 0.15,
  positioning: 0.1,
  weather: 0.1,
  farmer_local: 0,
});

function roundDomainWeight(weight: number): number {
  return Math.round(weight * 1_000_000) / 1_000_000;
}

export function normalizeDomainWeights(
  weights: DomainWeights,
  structurallyAbsentDomains: readonly RatingDomainId[] = [],
): NormalizedDomainWeights {
  const structurallyAbsentDomainSet = new Set(structurallyAbsentDomains);
  const includedDomains = RATING_DOMAIN_IDS.filter((domain) => !structurallyAbsentDomainSet.has(domain));
  const includedPositiveDomains = includedDomains.filter((domain) => weights[domain] > 0);
  const includedPositiveWeightTotal = includedPositiveDomains.reduce((total, domain) => total + weights[domain], 0);
  const normalizedWeights: Partial<Record<RatingDomainId, number>> = {};

  if (includedPositiveWeightTotal <= 0) {
    for (const domain of includedDomains) {
      normalizedWeights[domain] = 0;
    }

    return Object.freeze(normalizedWeights);
  }

  let roundedPositiveWeightTotal = 0;
  const lastPositiveDomain = includedPositiveDomains[includedPositiveDomains.length - 1];

  for (const domain of includedDomains) {
    if (weights[domain] <= 0) {
      normalizedWeights[domain] = 0;
      continue;
    }

    if (domain === lastPositiveDomain) {
      normalizedWeights[domain] = roundDomainWeight(1 - roundedPositiveWeightTotal);
      continue;
    }

    const normalizedWeight = roundDomainWeight(weights[domain] / includedPositiveWeightTotal);
    normalizedWeights[domain] = normalizedWeight;
    roundedPositiveWeightTotal += normalizedWeight;
  }

  return Object.freeze(normalizedWeights);
}

export function getDomainWeights(lane: RatingLane, options: DomainWeightOptions = {}): NormalizedDomainWeights {
  if (lane === "canada") {
    return normalizeDomainWeights(CANADA_RATING_DOMAIN_WEIGHTS, options.structurallyAbsentDomains);
  }

  if (lane === "us") {
    return normalizeDomainWeights(US_RATING_DOMAIN_WEIGHTS, options.structurallyAbsentDomains);
  }

  const crossBorderWeights = Object.fromEntries(
    RATING_DOMAIN_IDS.map((domain) => [
      domain,
      roundDomainWeight((CANADA_RATING_DOMAIN_WEIGHTS[domain] + US_RATING_DOMAIN_WEIGHTS[domain]) / 2),
    ]),
  ) as Record<RatingDomainId, number>;

  return normalizeDomainWeights(Object.freeze(crossBorderWeights), options.structurallyAbsentDomains);
}

export function clampRatingScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(-100, Math.min(100, score));
}

export function clampConfidenceScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function roundSourceQualityMultiplier(multiplier: number): number {
  return Math.round(multiplier * 100) / 100;
}

export function qualityAdjustmentForSource(input: QualityAdjustmentInput): QualityAdjustmentResult {
  let confidenceAdjustment = 0;
  let scoreMultiplier = 1;
  const reasons: string[] = [];

  switch (input.freshnessStatus) {
    case "strong":
      reasons.push("source_freshness_strong");
      break;
    case "watch":
      reasons.push("source_freshness_watch");
      break;
    case "expected_lag":
      confidenceAdjustment -= 5;
      reasons.push("source_expected_lag");
      break;
    case "stale":
      confidenceAdjustment -= 15;
      scoreMultiplier *= 0.75;
      reasons.push("source_stale");
      break;
    case "empty":
      confidenceAdjustment -= input.isRequired ? 25 : 15;
      scoreMultiplier = 0;
      reasons.push(input.isRequired ? "required_source_empty" : "source_empty");
      break;
    case "partial":
      confidenceAdjustment -= 10;
      scoreMultiplier *= 0.7;
      reasons.push("source_partial");
      break;
  }

  if (input.isProxy) {
    confidenceAdjustment -= 10;
    scoreMultiplier *= 0.8;
    reasons.push("proxy_source_mapping");
  }

  if (input.missingFreshnessProof) {
    confidenceAdjustment -= 15;
    scoreMultiplier *= 0.8;
    reasons.push("missing_freshness_proof");
  }

  if (input.freshnessStatus === "empty" && input.isRequired) {
    scoreMultiplier = 0;
  }

  return {
    confidenceAdjustment,
    scoreMultiplier: roundSourceQualityMultiplier(scoreMultiplier),
    reasons,
  };
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
