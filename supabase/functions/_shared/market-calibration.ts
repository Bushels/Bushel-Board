export interface CalibrationAnalysisSnapshot {
  grainWeek: number;
  stanceScore: number | null;
  finalAssessment?: string | null;
}

export interface CalibrationPriceSnapshot {
  priceDate: string;
  settlementPrice: number;
  changeAmount: number | null;
  changePct: number | null;
}

export interface CalibrationContext {
  grain: string;
  latestGrainWeek: number;
  priorAnalysis?: CalibrationAnalysisSnapshot | null;
  currentAnalysis?: CalibrationAnalysisSnapshot | null;
  latestPrice?: CalibrationPriceSnapshot | null;
}

export interface CalibrationOutcome {
  status: "confirmed" | "missed" | "watch" | "unavailable";
  direction: "bullish" | "bearish" | "neutral" | "unknown";
  accuracyLabel: "good" | "poor" | "mixed" | "unknown";
  summary: string;
  reviewFlag: string | null;
}

export interface PriceVerificationContext {
  grain: string;
  latestGrainWeek: number;
  analysisDate?: string | null;
  currentAnalysis?: CalibrationAnalysisSnapshot | null;
  latestPrice?: CalibrationPriceSnapshot | null;
}

export interface PriceVerificationOutcome {
  status: "confirmed" | "contradicted" | "stale" | "missing" | "neutral";
  direction: "bullish" | "bearish" | "neutral" | "unknown";
  priceAgeDays: number | null;
  shouldBlockBullish: boolean;
  summary: string;
  reviewFlag: string | null;
}

function classifyDirection(score: number | null | undefined): CalibrationOutcome["direction"] {
  if (typeof score !== "number") return "unknown";
  if (score >= 20) return "bullish";
  if (score <= -20) return "bearish";
  return "neutral";
}

function getPriceAgeDays(priceDate: string | null | undefined, analysisDate: string | null | undefined): number | null {
  if (!priceDate || !analysisDate) return null;
  const priceTs = Date.parse(priceDate);
  const analysisTs = Date.parse(analysisDate);
  if (Number.isNaN(priceTs) || Number.isNaN(analysisTs)) return null;
  return Math.max(0, Math.floor((analysisTs - priceTs) / 86_400_000));
}

export function summarizeCalibrationOutcome(context: CalibrationContext): CalibrationOutcome {
  const prior = context.priorAnalysis;
  const latestPrice = context.latestPrice;

  if (!prior || typeof prior.stanceScore !== "number") {
    return {
      status: "unavailable",
      direction: "unknown",
      accuracyLabel: "unknown",
      summary: `No prior Bushel Board call is available for ${context.grain}, so there is nothing to calibrate yet.`,
      reviewFlag: null,
    };
  }

  if (!latestPrice || typeof latestPrice.changePct !== "number") {
    return {
      status: "unavailable",
      direction: classifyDirection(prior.stanceScore),
      accuracyLabel: "unknown",
      summary: `Week ${prior.grainWeek} had a published Bushel Board call for ${context.grain}, but fresh price follow-through is missing, so calibration is incomplete.`,
      reviewFlag: null,
    };
  }

  const direction = classifyDirection(prior.stanceScore);
  const changePct = latestPrice.changePct;
  const priceMove = changePct > 0 ? "higher" : changePct < 0 ? "lower" : "flat";

  let status: CalibrationOutcome["status"] = "watch";
  let accuracyLabel: CalibrationOutcome["accuracyLabel"] = "mixed";
  let summary = `Last week's watch call for ${context.grain} stayed in the middle, with price finishing ${priceMove} at ${latestPrice.settlementPrice.toFixed(2)}.`;

  if (direction === "bullish") {
    if (changePct > 0) {
      status = "confirmed";
      accuracyLabel = "good";
      summary = `For ${context.grain}, last week's bullish lean was confirmed as price moved higher to ${latestPrice.settlementPrice.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%).`;
    } else {
      status = "missed";
      accuracyLabel = "poor";
      summary = `For ${context.grain}, last week's bullish lean did not hold up: price moved ${priceMove} to ${latestPrice.settlementPrice.toFixed(2)} (${changePct.toFixed(2)}%).`;
    }
  } else if (direction === "bearish") {
    if (changePct < 0) {
      status = "confirmed";
      accuracyLabel = "good";
      summary = `For ${context.grain}, last week's bearish lean was confirmed as price moved lower to ${latestPrice.settlementPrice.toFixed(2)} (${changePct.toFixed(2)}%).`;
    } else {
      status = "missed";
      accuracyLabel = "poor";
      summary = `For ${context.grain}, last week's bearish lean did not hold up: price rallied to ${latestPrice.settlementPrice.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%).`;
    }
  }

  let reviewFlag: string | null = null;
  const currentScore = context.currentAnalysis?.stanceScore;
  if (typeof currentScore === "number" && Math.abs(currentScore - prior.stanceScore) > 40) {
    reviewFlag = `Score swing exceeds 40 points from Week ${prior.grainWeek} to Week ${context.latestGrainWeek}. Check for a real catalyst before trusting the change.`;
  }

  return { status, direction, accuracyLabel, summary, reviewFlag };
}

export function summarizePriceVerificationOutcome(context: PriceVerificationContext): PriceVerificationOutcome {
  const direction = classifyDirection(context.currentAnalysis?.stanceScore);
  const latestPrice = context.latestPrice;
  const priceAgeDays = getPriceAgeDays(latestPrice?.priceDate, context.analysisDate);
  const isStale = priceAgeDays != null ? priceAgeDays > 3 : false;

  if (!latestPrice || typeof latestPrice.changePct !== "number") {
    return {
      status: "missing",
      direction,
      priceAgeDays,
      shouldBlockBullish: direction === "bullish",
      summary: `Bushel Board does not have a fresh futures price check for ${context.grain}, so the price-verification step is incomplete.`,
      reviewFlag: direction === "bullish"
        ? "Bullish publish gate: do not publish a bullish haul-or-hold call without a fresh futures check, and ideally cash and basis confirmation too."
        : null,
    };
  }

  if (isStale) {
    return {
      status: "stale",
      direction,
      priceAgeDays,
      shouldBlockBullish: direction === "bullish",
      summary: `For ${context.grain}, the latest futures price signal is stale (${priceAgeDays} days old), so price verification cannot confirm the weekly call yet.`,
      reviewFlag: direction === "bullish"
        ? `Bullish publish gate: the latest futures close is ${priceAgeDays} days old. Refresh prices before publishing a bullish call.`
        : `Refresh prices before trusting the latest ${context.grain} call.`,
    };
  }

  const changePct = latestPrice.changePct;
  const signedChange = `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;

  if (direction === "bullish") {
    if (changePct > 0) {
      return {
        status: "confirmed",
        direction,
        priceAgeDays,
        shouldBlockBullish: false,
        summary: `For ${context.grain}, the fresh futures price is confirming the bullish lean: latest price is ${latestPrice.settlementPrice.toFixed(2)} (${signedChange}).`,
        reviewFlag: null,
      };
    }

    return {
      status: "contradicted",
      direction,
      priceAgeDays,
      shouldBlockBullish: true,
      summary: `For ${context.grain}, the latest futures move is pushing against the bullish lean: price is ${latestPrice.settlementPrice.toFixed(2)} (${signedChange}).`,
      reviewFlag: "Bullish publish gate: do not publish a bullish call when the latest futures move is working the other way unless cash truth and basis clearly override it.",
    };
  }

  if (direction === "bearish") {
    if (changePct < 0) {
      return {
        status: "confirmed",
        direction,
        priceAgeDays,
        shouldBlockBullish: false,
        summary: `For ${context.grain}, the fresh futures price is confirming the bearish lean: latest price is ${latestPrice.settlementPrice.toFixed(2)} (${signedChange}).`,
        reviewFlag: null,
      };
    }

    return {
      status: "contradicted",
      direction,
      priceAgeDays,
      shouldBlockBullish: false,
      summary: `For ${context.grain}, the latest futures move is pushing against the bearish lean: price is ${latestPrice.settlementPrice.toFixed(2)} (${signedChange}).`,
      reviewFlag: "Bearish call is not confirmed by fresh futures. Check cash and basis before sounding confident.",
    };
  }

  return {
    status: "neutral",
    direction,
    priceAgeDays,
    shouldBlockBullish: false,
    summary: `For ${context.grain}, the current stance is still in watch territory, so price verification is informational rather than a hard gate. Latest futures price is ${latestPrice.settlementPrice.toFixed(2)} (${signedChange}).`,
    reviewFlag: null,
  };
}

export function buildCalibrationPromptSection(context: CalibrationContext): string {
  const outcome = summarizeCalibrationOutcome(context);
  const prior = context.priorAnalysis;
  const priorWeek = prior?.grainWeek ?? context.latestGrainWeek - 1;
  const priorScore = typeof prior?.stanceScore === "number" ? prior.stanceScore : "n/a";
  const priorAssessment = prior?.finalAssessment?.trim() || "No prior recommendation text saved.";
  const reviewLine = outcome.reviewFlag ? `- Review flag: ${outcome.reviewFlag}` : "- Review flag: none";

  return `## Retrospective Calibration
- Prior Bushel Board call: Week ${priorWeek}, score ${priorScore}
- Prior recommendation: ${priorAssessment}
- Calibration result: ${outcome.accuracyLabel} (${outcome.status})
- Calibration note: ${outcome.summary}
${reviewLine}

Use this to calibrate conviction for the new weekly call. If the prior call missed, lower confidence unless this week's evidence clearly improved. If the prior call worked, do not blindly repeat it — confirm that the same evidence still holds.`;
}

export function buildPriceVerificationPromptSection(context: PriceVerificationContext): string {
  const outcome = summarizePriceVerificationOutcome(context);
  const latestPrice = context.latestPrice;
  const priceLine = latestPrice
    ? `- Latest futures close: ${latestPrice.settlementPrice.toFixed(2)} on ${latestPrice.priceDate}${typeof latestPrice.changePct === "number" ? ` (${latestPrice.changePct >= 0 ? "+" : ""}${latestPrice.changePct.toFixed(2)}%)` : ""}`
    : "- Latest futures close: unavailable";
  const reviewLine = outcome.reviewFlag ? `- Review flag: ${outcome.reviewFlag}` : "- Review flag: none";

  return `## Price Verification
${priceLine}
- Verification result: ${outcome.status}
- Verification note: ${outcome.summary}
${reviewLine}
- Bullish publish gate: ${outcome.shouldBlockBullish ? "ACTIVE — do not publish a bullish call unless cash truth and basis clearly confirm it." : "clear on futures confirmation, but still check cash truth and basis if available."}

Use this section to keep the thesis tied to cash truth. Futures are only one layer; cash bids and basis still outrank a pretty narrative.`;
}
