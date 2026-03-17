export type Recommendation = "haul" | "hold" | "price" | "watch"

export interface RecommendationResult {
  action: Recommendation
  reason: string
  confidence: "high" | "medium" | "low"
  confidenceScore: number
  marketStance: "bullish" | "bearish" | "neutral"
  deliveryPacePct: number
  contractedPct: number
}

interface DeriveParams {
  marketStance: "bullish" | "bearish" | "neutral"
  stanceScore?: number | null
  deliveryPacePct: number
  contractedPct: number
  uncontractedKt: number
  totalPlannedKt: number
}

function computeConfidenceScore(
  action: Recommendation,
  stanceScore: number | null | undefined,
  deliveryPacePct: number,
  contractedPct: number
): number {
  const stanceMagnitude = stanceScore != null ? Math.abs(stanceScore) / 100 : 0.5

  let paceAlignment = 0.5
  switch (action) {
    case "hold":
      paceAlignment = deliveryPacePct <= 40 ? 1.0 : deliveryPacePct <= 60 ? 0.7 : 0.4
      break
    case "haul":
      paceAlignment = contractedPct < 20 ? 1.0 : contractedPct < 40 ? 0.7 : 0.4
      break
    case "price":
      paceAlignment = contractedPct < 25 ? 1.0 : contractedPct < 40 ? 0.6 : 0.3
      break
    case "watch":
      paceAlignment = 0.2
      break
  }

  return Math.round(stanceMagnitude * 60 + paceAlignment * 40)
}

export function deriveRecommendation(params: DeriveParams): RecommendationResult {
  const { marketStance, deliveryPacePct, contractedPct, uncontractedKt } = params

  const base = {
    marketStance,
    deliveryPacePct,
    contractedPct,
  }

  // Priority 1: bearish market, move grain.
  if (
    marketStance === "bearish" &&
    (deliveryPacePct >= 50 || contractedPct < 30) &&
    uncontractedKt > 0
  ) {
    const cs = computeConfidenceScore("haul", params.stanceScore, deliveryPacePct, contractedPct)
    return {
      ...base,
      action: "haul",
      reason: "Bearish market -> hauling uncontracted grain is safer this week",
      confidence: cs >= 70 ? "high" : cs >= 40 ? "medium" : "low",
      confidenceScore: cs,
    }
  }

  // Priority 2: bullish market, wait for better prices.
  if (marketStance === "bullish" && deliveryPacePct <= 70) {
    const cs = computeConfidenceScore("hold", params.stanceScore, deliveryPacePct, contractedPct)
    return {
      ...base,
      action: "hold",
      reason: "Bullish market -> holding grain may capture stronger pricing",
      confidence: cs >= 70 ? "high" : cs >= 40 ? "medium" : "low",
      confidenceScore: cs,
    }
  }

  // Priority 3: mixed-to-firm market, get pricing orders working.
  if (
    (marketStance === "neutral" || marketStance === "bullish") &&
    contractedPct < 50 &&
    uncontractedKt > 0
  ) {
    const cs = computeConfidenceScore("price", params.stanceScore, deliveryPacePct, contractedPct)
    return {
      ...base,
      action: "price",
      reason: "Mixed setup -> get offers working on uncontracted grain",
      confidence: cs >= 70 ? "high" : cs >= 40 ? "medium" : "low",
      confidenceScore: cs,
    }
  }

  // Priority 4: not enough edge yet, keep watching.
  const cs = computeConfidenceScore("watch", params.stanceScore, deliveryPacePct, contractedPct)
  return {
    ...base,
    action: "watch",
    reason: "Signals are mixed -> wait for a cleaner setup",
    confidence: cs >= 70 ? "high" : cs >= 40 ? "medium" : "low",
    confidenceScore: cs,
  }
}
