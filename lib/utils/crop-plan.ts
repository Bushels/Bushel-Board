export interface CropPlanPaceInput {
  deliveredKt: number;
  remainingToSellKt: number;
  contractedKt?: number;
  uncontractedKt?: number;
}

export interface CropPlanPaceBreakdown {
  totalMarketedKt: number;
  deliveredPct: number;
  contractedPct: number;
  uncontractedPct: number;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function getTotalMarketedVolumeKt({
  deliveredKt,
  remainingToSellKt,
}: Pick<CropPlanPaceInput, "deliveredKt" | "remainingToSellKt">): number {
  return Math.max(0, deliveredKt) + Math.max(0, remainingToSellKt);
}

export function getCropPlanPaceBreakdown({
  deliveredKt,
  remainingToSellKt,
  contractedKt = 0,
  uncontractedKt = 0,
}: CropPlanPaceInput): CropPlanPaceBreakdown {
  const totalMarketedKt = getTotalMarketedVolumeKt({
    deliveredKt,
    remainingToSellKt,
  });

  if (totalMarketedKt <= 0) {
    return {
      totalMarketedKt: 0,
      deliveredPct: 0,
      contractedPct: 0,
      uncontractedPct: 0,
    };
  }

  const deliveredPct = clampPercentage((deliveredKt / totalMarketedKt) * 100);
  const contractedPct = clampPercentage((contractedKt / totalMarketedKt) * 100);
  const uncontractedPct = clampPercentage(
    (uncontractedKt / totalMarketedKt) * 100
  );

  return {
    totalMarketedKt,
    deliveredPct,
    contractedPct,
    uncontractedPct,
  };
}
