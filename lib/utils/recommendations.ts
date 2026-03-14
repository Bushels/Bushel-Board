export type Recommendation = "haul" | "hold" | "price" | "watch"

export interface RecommendationResult {
  action: Recommendation
  reason: string
  confidence: "high" | "medium" | "low"
  marketStance: "bullish" | "bearish" | "neutral"
  deliveryPacePct: number
  contractedPct: number
}

interface DeriveParams {
  marketStance: "bullish" | "bearish" | "neutral"
  deliveryPacePct: number
  contractedPct: number
  uncontractedKt: number
  totalPlannedKt: number
}

export function deriveRecommendation(params: DeriveParams): RecommendationResult {
  const { marketStance, deliveryPacePct, contractedPct, uncontractedKt } = params

  const base = {
    marketStance,
    deliveryPacePct,
    contractedPct,
  }

  // Priority 1: HAUL — bearish market, get grain moving
  if (
    marketStance === "bearish" &&
    (deliveryPacePct >= 50 || contractedPct < 30) &&
    uncontractedKt > 0
  ) {
    return {
      ...base,
      action: "haul",
      reason: "Market bearish \u2014 consider delivering uncontracted grain",
      confidence: contractedPct < 30 ? "high" : "medium",
    }
  }

  // Priority 2: HOLD — bullish market, wait for better prices
  // Must be evaluated BEFORE PRICE so bullish farmers hold rather than lock in
  if (marketStance === "bullish" && deliveryPacePct <= 70) {
    return {
      ...base,
      action: "hold",
      reason: "Market bullish \u2014 holding for better prices",
      confidence: deliveryPacePct <= 40 ? "high" : "medium",
    }
  }

  // Priority 3: PRICE — neutral market or bullish with high delivery pace,
  // lock in prices on uncontracted volume
  if (
    (marketStance === "neutral" || marketStance === "bullish") &&
    contractedPct < 50 &&
    uncontractedKt > 0
  ) {
    return {
      ...base,
      action: "price",
      reason: "Lock in prices on uncontracted volume",
      confidence: contractedPct < 25 ? "high" : "medium",
    }
  }

  // Priority 4: WATCH (default)
  return {
    ...base,
    action: "watch",
    reason: "Monitor market conditions",
    confidence: "low",
  }
}
