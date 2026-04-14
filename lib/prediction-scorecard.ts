export type PredictionDirectionResult = "correct" | "wrong" | "neutral" | "unresolved";
export type PredictionActionResult = "helpful" | "too_early" | "too_late" | "wrong" | "unresolved";
export type PredictionTimingResult = "good" | "late" | "early" | "unclear";

export type PredictionRecommendation =
  | "PATIENCE"
  | "WATCH"
  | "SCALE_IN"
  | "ACCELERATE"
  | "HOLD_FIRM"
  | "PRICE";

export interface PredictionCall {
  grain: string;
  cropYear: string;
  grainWeek: number;
  recordedAt: string;
  scanType: string;
  stanceScore: number;
  recommendation: PredictionRecommendation;
  modelSource: string | null;
}

export interface PriceWindow {
  evalWindowDays: number;
  startPriceDate: string | null;
  startSettlementPrice: number | null;
  endPriceDate: string | null;
  endSettlementPrice: number | null;
  priceChangePct: number | null;
  pathChangePcts: number[];
}

export interface PredictionScorecardRow {
  grain: string;
  cropYear: string;
  grainWeek: number;
  sourceRecordedAt: string;
  scanType: string;
  stanceScore: number;
  recommendation: PredictionRecommendation;
  modelSource: string | null;
  evalWindowDays: number;
  startPriceDate: string | null;
  startSettlementPrice: number | null;
  endPriceDate: string | null;
  endSettlementPrice: number | null;
  priceChangePct: number | null;
  directionResult: PredictionDirectionResult;
  actionResult: PredictionActionResult;
  timingResult: PredictionTimingResult;
  scoreBias: number | null;
  notes: string;
}

function expectedDirection(score: number): "bullish" | "bearish" | "neutral" {
  if (score >= 20) return "bullish";
  if (score <= -20) return "bearish";
  return "neutral";
}

function realizedDirection(changePct: number): "up" | "down" | "flat" {
  if (changePct >= 1) return "up";
  if (changePct <= -1) return "down";
  return "flat";
}

export function classifyDirectionResult(
  stanceScore: number,
  priceChangePct: number | null,
): PredictionDirectionResult {
  if (typeof priceChangePct !== "number") return "unresolved";

  const expected = expectedDirection(stanceScore);
  const realized = realizedDirection(priceChangePct);

  if (expected === "neutral") {
    return realized === "flat" ? "neutral" : "wrong";
  }

  if (expected === "bullish") {
    return realized === "up" ? "correct" : "wrong";
  }

  return realized === "down" ? "correct" : "wrong";
}

export function classifyActionResult(
  recommendation: PredictionRecommendation,
  priceChangePct: number | null,
): PredictionActionResult {
  if (typeof priceChangePct !== "number") return "unresolved";

  const realized = realizedDirection(priceChangePct);

  switch (recommendation) {
    case "ACCELERATE":
    case "SCALE_IN":
      return realized === "down" ? "helpful" : realized === "flat" ? "too_early" : "wrong";
    case "HOLD_FIRM":
    case "PATIENCE":
      return realized === "up" ? "helpful" : realized === "flat" ? "too_late" : "wrong";
    case "WATCH":
      return realized === "flat" ? "helpful" : "too_early";
    case "PRICE":
      return realized === "flat" ? "helpful" : "too_early";
    default:
      return "unresolved";
  }
}

export function classifyTimingResult(
  stanceScore: number,
  pathChangePcts: number[],
): PredictionTimingResult {
  if (pathChangePcts.length === 0) return "unclear";

  const expected = expectedDirection(stanceScore);
  if (expected === "neutral") return "unclear";

  const thresholdMetIndex = pathChangePcts.findIndex((value) => {
    if (expected === "bullish") return value >= 1;
    return value <= -1;
  });

  if (thresholdMetIndex === -1) return "unclear";

  const firstMove = pathChangePcts[0];
  if (expected === "bullish" && firstMove <= -1) return "early";
  if (expected === "bearish" && firstMove >= 1) return "early";

  if (thresholdMetIndex === 0) return "good";
  if (thresholdMetIndex === pathChangePcts.length - 1) return "late";
  return "good";
}

export function buildPredictionScorecardRow(
  call: PredictionCall,
  window: PriceWindow,
): PredictionScorecardRow {
  const directionResult = classifyDirectionResult(call.stanceScore, window.priceChangePct);
  const actionResult = classifyActionResult(call.recommendation, window.priceChangePct);
  const timingResult = classifyTimingResult(call.stanceScore, window.pathChangePcts);
  const expected = expectedDirection(call.stanceScore);
  const realized = typeof window.priceChangePct === "number" ? realizedDirection(window.priceChangePct) : "flat";

  const scoreBias = typeof window.priceChangePct === "number"
    ? Number((window.priceChangePct - call.stanceScore / 20).toFixed(3))
    : null;

  const notes = typeof window.priceChangePct === "number"
    ? `Expected ${expected}, realized ${realized} over ${window.evalWindowDays} days.`
    : `No completed price window yet for ${window.evalWindowDays}-day evaluation.`;

  return {
    grain: call.grain,
    cropYear: call.cropYear,
    grainWeek: call.grainWeek,
    sourceRecordedAt: call.recordedAt,
    scanType: call.scanType,
    stanceScore: call.stanceScore,
    recommendation: call.recommendation,
    modelSource: call.modelSource,
    evalWindowDays: window.evalWindowDays,
    startPriceDate: window.startPriceDate,
    startSettlementPrice: window.startSettlementPrice,
    endPriceDate: window.endPriceDate,
    endSettlementPrice: window.endSettlementPrice,
    priceChangePct: window.priceChangePct,
    directionResult,
    actionResult,
    timingResult,
    scoreBias,
    notes,
  };
}
