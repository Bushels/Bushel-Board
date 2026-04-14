import { mapScoreToRecommendation } from "@/lib/trajectory-mapping";
import type { UsMarketName } from "@/lib/constants/us-markets";

export type UsRecommendation =
  | "WATCH"
  | "PATIENCE"
  | "SCALE_IN"
  | "ACCELERATE"
  | "HOLD_FIRM"
  | "PRICE";

export interface UsKeySignal {
  signal: "bullish" | "bearish" | "watch";
  title: string;
  body: string;
  source: string;
}

export interface NormalizedUsThesis {
  market: UsMarketName;
  crop_year: string;
  market_year: number;
  stance_score: number;
  confidence_score: number;
  recommendation: UsRecommendation;
  initial_thesis: string;
  bull_case: string;
  bear_case: string;
  final_assessment: string;
  key_signals: UsKeySignal[];
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeRecommendation(value: unknown, stanceScore: number): UsRecommendation {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (
      normalized === "WATCH" ||
      normalized === "PATIENCE" ||
      normalized === "SCALE_IN" ||
      normalized === "ACCELERATE" ||
      normalized === "HOLD_FIRM" ||
      normalized === "PRICE"
    ) {
      return normalized;
    }
  }

  return mapScoreToRecommendation(stanceScore);
}

function normalizeSignal(raw: unknown, index: number): UsKeySignal {
  const signal = typeof raw === "object" && raw && "signal" in raw ? String(raw.signal).toLowerCase() : "watch";
  const normalizedSignal = signal === "bullish" || signal === "bearish" || signal === "watch" ? signal : "watch";

  return {
    signal: normalizedSignal,
    title: typeof raw === "object" && raw ? cleanText((raw as Record<string, unknown>).title, `Signal ${index + 1}`) : `Signal ${index + 1}`,
    body: typeof raw === "object" && raw ? cleanText((raw as Record<string, unknown>).body, "No supporting detail was returned.") : "No supporting detail was returned.",
    source: typeof raw === "object" && raw ? cleanText((raw as Record<string, unknown>).source, "Model synthesis") : "Model synthesis",
  };
}

export function normalizeUsCropYear(marketYear: number): string {
  return `${marketYear}-${marketYear + 1}`;
}

export function normalizeUsThesis(
  raw: Record<string, unknown> | Partial<NormalizedUsThesis>,
  params: { market: UsMarketName; marketYear: number },
): NormalizedUsThesis {
  const stanceScore = clampInteger(raw.stance_score, -100, 100, 0);
  const confidenceScore = clampInteger(raw.confidence_score, 0, 100, 50);
  const recommendation = normalizeRecommendation(raw.recommendation, stanceScore);
  const keySignalsInput = Array.isArray(raw.key_signals) ? raw.key_signals : [];
  const keySignals = keySignalsInput.slice(0, 5).map(normalizeSignal);

  const finalSignals: UsKeySignal[] = keySignals.length > 0
    ? keySignals
    : [{
        signal: "watch",
        title: `${params.market} signal balance`,
        body: "The model did not return structured signals, so this thesis should be reviewed before relying on it.",
        source: "Normalization fallback",
      }];

  return {
    market: params.market,
    crop_year: normalizeUsCropYear(params.marketYear),
    market_year: params.marketYear,
    stance_score: stanceScore,
    confidence_score: confidenceScore,
    recommendation,
    initial_thesis: cleanText(raw.initial_thesis, `${params.market} is mixed this week and needs a disciplined read.`),
    bull_case: cleanText(raw.bull_case, `The helping factors for ${params.market} are present but not strongly articulated yet.`),
    bear_case: cleanText(raw.bear_case, `The hurting factors for ${params.market} are present but not strongly articulated yet.`),
    final_assessment: cleanText(raw.final_assessment, `${params.market} stays on WATCH until the next USDA and price update confirms direction.`),
    key_signals: finalSignals,
  };
}