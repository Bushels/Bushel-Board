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

export interface CropPlanMarketingInput {
  startingGrainKt?: number;
  remainingToSellKt: number;
  contractedKt?: number;
  uncontractedKt?: number;
}

export interface CropPlanMarketingBreakdown {
  startingGrainKt: number;
  marketedKt: number;
  pricedKt: number;
  marketedPct: number;
  pricedPct: number;
  remainingPct: number;
  contractedPct: number;
  uncontractedPct: number;
  grainLeftPct: number;
  contractedShareOfRemainingPct: number;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clampTonnes(value: number): number {
  return Math.max(0, value);
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

export function getCropPlanMarketingBreakdown({
  startingGrainKt = 0,
  remainingToSellKt,
  contractedKt = 0,
  uncontractedKt,
}: CropPlanMarketingInput): CropPlanMarketingBreakdown {
  const normalizedStartingGrainKt = clampTonnes(
    Math.max(startingGrainKt, remainingToSellKt)
  );
  const normalizedRemainingKt = Math.min(
    clampTonnes(remainingToSellKt),
    normalizedStartingGrainKt
  );
  const normalizedContractedKt = Math.min(
    clampTonnes(contractedKt),
    normalizedRemainingKt
  );
  const normalizedUncontractedKt =
    typeof uncontractedKt === "number"
      ? Math.min(
        clampTonnes(uncontractedKt),
        Math.max(normalizedRemainingKt - normalizedContractedKt, 0)
      )
      : Math.max(normalizedRemainingKt - normalizedContractedKt, 0);

  if (normalizedStartingGrainKt <= 0) {
    return {
      startingGrainKt: 0,
      marketedKt: 0,
      pricedKt: 0,
      marketedPct: 0,
      pricedPct: 0,
      remainingPct: 0,
      contractedPct: 0,
      uncontractedPct: 0,
      grainLeftPct: 0,
      contractedShareOfRemainingPct: 0,
    };
  }

  const marketedKt = Math.max(
    normalizedStartingGrainKt - normalizedRemainingKt,
    0
  );
  const pricedKt = marketedKt + normalizedContractedKt;
  const marketedPct = clampPercentage(
    (marketedKt / normalizedStartingGrainKt) * 100
  );
  const contractedPct = clampPercentage(
    (normalizedContractedKt / normalizedStartingGrainKt) * 100
  );
  const uncontractedPct = clampPercentage(
    (normalizedUncontractedKt / normalizedStartingGrainKt) * 100
  );
  const remainingPct = clampPercentage(
    (normalizedRemainingKt / normalizedStartingGrainKt) * 100
  );
  const pricedPct = clampPercentage(
    (pricedKt / normalizedStartingGrainKt) * 100
  );
  const contractedShareOfRemainingPct =
    normalizedRemainingKt > 0
      ? clampPercentage((normalizedContractedKt / normalizedRemainingKt) * 100)
      : 0;

  return {
    startingGrainKt: normalizedStartingGrainKt,
    marketedKt,
    pricedKt,
    marketedPct,
    pricedPct,
    remainingPct,
    contractedPct,
    uncontractedPct,
    grainLeftPct: remainingPct,
    contractedShareOfRemainingPct,
  };
}
