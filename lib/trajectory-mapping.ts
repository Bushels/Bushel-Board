export type TrajectoryRecommendation =
  | "PATIENCE"
  | "WATCH"
  | "SCALE_IN"
  | "ACCELERATE"
  | "HOLD_FIRM"
  | "PRICE";

export type TrajectoryTerm = "bullish" | "neutral" | "bearish";

export interface WeeklyTrajectoryInput {
  grain: string;
  cropYear: string;
  grainWeek: number;
  stanceScore: number;
  confidenceScore: number | null;
  modelSource: string;
  trigger: string;
  evidence: string;
  dataFreshness: Record<string, unknown>;
}

export interface WeeklyTrajectoryRow {
  grain: string;
  crop_year: string;
  grain_week: number;
  scan_type: "weekly_debate";
  stance_score: number;
  conviction_pct: number | null;
  near_term: TrajectoryTerm;
  medium_term: TrajectoryTerm;
  recommendation: TrajectoryRecommendation;
  reversal_triggers: null;
  risk_triggers: null;
  score_delta: null;
  trigger: string;
  evidence: string;
  data_freshness: Record<string, unknown>;
  model_source: string;
}

export function mapScoreToRecommendation(score: number): TrajectoryRecommendation {
  if (score >= 70) return "HOLD_FIRM";
  if (score >= 10) return "PATIENCE";
  if (score >= -9) return "WATCH";
  if (score >= -29) return "PATIENCE";
  if (score >= -69) return "SCALE_IN";
  return "ACCELERATE";
}

export function mapScoreToTerm(score: number): TrajectoryTerm {
  if (score >= 20) return "bullish";
  if (score <= -20) return "bearish";
  return "neutral";
}

export function buildWeeklyTrajectoryRow(input: WeeklyTrajectoryInput): WeeklyTrajectoryRow {
  return {
    grain: input.grain,
    crop_year: input.cropYear,
    grain_week: input.grainWeek,
    scan_type: "weekly_debate",
    stance_score: input.stanceScore,
    conviction_pct: typeof input.confidenceScore === "number" ? input.confidenceScore : null,
    near_term: mapScoreToTerm(input.stanceScore),
    medium_term: mapScoreToTerm(input.stanceScore),
    recommendation: mapScoreToRecommendation(input.stanceScore),
    reversal_triggers: null,
    risk_triggers: null,
    score_delta: null,
    trigger: input.trigger,
    evidence: input.evidence,
    data_freshness: input.dataFreshness,
    model_source: input.modelSource,
  };
}
