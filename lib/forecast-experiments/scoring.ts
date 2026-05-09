import type { ForecastDirection, PriceRollPolicy } from "./schema";

export type DirectionResult = "correct" | "wrong";
export type ConfidenceBucket =
  | "0-50"
  | "51-60"
  | "61-70"
  | "71-80"
  | "81-90"
  | "91-100";

export interface ExpectedMovePctRange {
  low: number;
  high: number;
}

export interface PriceContractScoringInput {
  horizonDays: 7 | 28;
  priceContractCode?: string | null;
  priceRollPolicy?: PriceRollPolicy | null;
}

export interface StartPriceTimingInput {
  forecastTimestamp: string;
  marketCloseTimestamp: string;
  startPriceTimestamp: string;
}

export interface ForecastOutcomeInput extends PriceContractScoringInput {
  direction: ForecastDirection;
  confidencePct: number;
  expectedMovePctRange: ExpectedMovePctRange;
  forecastTimestamp: string;
  marketCloseTimestamp: string;
  startPriceTimestamp: string;
  startPrice: number;
  endPrice: number;
  neutralBandPct?: number;
}

export interface ForecastOutcomeScore {
  priceChangePct: number;
  directionResult: DirectionResult;
  magnitudeErrorPct: number;
  brierScore: number;
  confidenceBucket: ConfidenceBucket;
}

const VALID_ROLL_POLICIES = new Set<PriceRollPolicy>([
  "fixed_contract_no_roll",
  "front_month_with_declared_roll",
  "continuous_adjusted_series",
]);

export function calculatePriceChangePct(
  startPrice: number,
  endPrice: number,
): number {
  assertFiniteNumber(startPrice, "start price");
  assertFiniteNumber(endPrice, "end price");

  if (startPrice <= 0) {
    throw new Error("Start price must be greater than zero.");
  }

  return roundToFourDecimals(((endPrice - startPrice) / startPrice) * 100);
}

export function calculateMagnitudeErrorPct(
  expectedRange: ExpectedMovePctRange,
  realizedMovePct: number,
): number {
  assertFiniteNumber(expectedRange.low, "expected range low");
  assertFiniteNumber(expectedRange.high, "expected range high");
  assertFiniteNumber(realizedMovePct, "realized move");

  if (expectedRange.low > expectedRange.high) {
    throw new Error("Expected move range low cannot exceed high.");
  }

  if (realizedMovePct < expectedRange.low) {
    return roundToFourDecimals(expectedRange.low - realizedMovePct);
  }

  if (realizedMovePct > expectedRange.high) {
    return roundToFourDecimals(realizedMovePct - expectedRange.high);
  }

  return 0;
}

export function calculateBrierScore(
  confidencePct: number,
  eventOccurred: boolean,
): number {
  assertFiniteNumber(confidencePct, "confidence");

  if (confidencePct < 0 || confidencePct > 100) {
    throw new Error("Confidence must be between 0 and 100.");
  }

  const probability = confidencePct / 100;
  const outcome = eventOccurred ? 1 : 0;

  return roundToFourDecimals((probability - outcome) ** 2);
}

export function classifyConfidenceBucket(
  confidencePct: number,
): ConfidenceBucket {
  assertFiniteNumber(confidencePct, "confidence");

  if (confidencePct < 0 || confidencePct > 100) {
    throw new Error("Confidence must be between 0 and 100.");
  }

  if (confidencePct <= 50) return "0-50";
  if (confidencePct <= 60) return "51-60";
  if (confidencePct <= 70) return "61-70";
  if (confidencePct <= 80) return "71-80";
  if (confidencePct <= 90) return "81-90";

  return "91-100";
}

export function classifyDirectionalResult(
  forecastDirection: ForecastDirection,
  realizedMovePct: number,
  neutralBandPct = 0.5,
): DirectionResult {
  assertFiniteNumber(realizedMovePct, "realized move");
  assertFiniteNumber(neutralBandPct, "neutral band");

  const realizedDirection = getRealizedDirection(realizedMovePct, neutralBandPct);

  return forecastDirection === realizedDirection ? "correct" : "wrong";
}

export function validatePriceContractForScoring(
  input: PriceContractScoringInput,
): void {
  if (!input.priceContractCode?.trim()) {
    throw new Error("Price contract code is required before scoring.");
  }

  if (!input.priceRollPolicy) {
    throw new Error("Price roll policy is required before scoring.");
  }

  if (!VALID_ROLL_POLICIES.has(input.priceRollPolicy)) {
    throw new Error(`Unsupported price roll policy: ${input.priceRollPolicy}`);
  }
}

export function validateStartPriceTiming(input: StartPriceTimingInput): void {
  const forecastTime = parseTimestamp(input.forecastTimestamp, "forecast");
  const marketCloseTime = parseTimestamp(input.marketCloseTimestamp, "market close");
  const startPriceTime = parseTimestamp(
    input.startPriceTimestamp,
    "start price",
  );

  if (
    isSameDeclaredDate(input.forecastTimestamp, input.marketCloseTimestamp) &&
    forecastTime < marketCloseTime &&
    startPriceTime >= marketCloseTime
  ) {
    throw new Error(
      "Same-day settlement cannot be used when the forecast was made before market close.",
    );
  }

  if (startPriceTime > forecastTime) {
    throw new Error(
      "Start price timestamp must be at or before the forecast timestamp.",
    );
  }
}

export function scoreForecastOutcome(
  input: ForecastOutcomeInput,
): ForecastOutcomeScore {
  validatePriceContractForScoring(input);
  validateStartPriceTiming(input);

  const priceChangePct = calculatePriceChangePct(
    input.startPrice,
    input.endPrice,
  );
  const directionResult = classifyDirectionalResult(
    input.direction,
    priceChangePct,
    input.neutralBandPct,
  );

  return {
    priceChangePct,
    directionResult,
    magnitudeErrorPct: calculateMagnitudeErrorPct(
      input.expectedMovePctRange,
      priceChangePct,
    ),
    brierScore: calculateBrierScore(
      input.confidencePct,
      directionResult === "correct",
    ),
    confidenceBucket: classifyConfidenceBucket(input.confidencePct),
  };
}

function getRealizedDirection(
  realizedMovePct: number,
  neutralBandPct: number,
): ForecastDirection {
  if (Math.abs(realizedMovePct) <= neutralBandPct) {
    return "neutral";
  }

  return realizedMovePct > 0 ? "bullish" : "bearish";
}

function parseTimestamp(value: string, label: string): number {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`${label} timestamp must include a timezone offset.`);
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} timestamp is invalid.`);
  }

  return timestamp;
}

function isSameDeclaredDate(left: string, right: string): boolean {
  return left.slice(0, 10) === right.slice(0, 10);
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function roundToFourDecimals(value: number): number {
  return Number(value.toFixed(4));
}
