import { getGrainDef } from "@/lib/constants/grains";

export type GrainAmountUnit = "metric_tonnes" | "bushels" | "pounds";

const POUNDS_PER_METRIC_TONNE = 2204.6226218488;

export function getDefaultBushelWeightLbs(grain: string): number {
  return getGrainDef(grain)?.defaultBushelWeightLbs ?? 60;
}

export function formatGrainUnitLabel(unit: GrainAmountUnit): string {
  switch (unit) {
    case "metric_tonnes":
      return "Metric tonnes";
    case "bushels":
      return "Bushels";
    case "pounds":
      return "Pounds";
  }
}

export function convertToMetricTonnes(value: number, unit: GrainAmountUnit, bushelWeightLbs: number): number {
  const normalizedValue = Math.max(0, value);
  const normalizedBushelWeight = Math.max(bushelWeightLbs, 0.0001);

  switch (unit) {
    case "metric_tonnes":
      return normalizedValue;
    case "pounds":
      return normalizedValue / POUNDS_PER_METRIC_TONNE;
    case "bushels":
      return (normalizedValue * normalizedBushelWeight) / POUNDS_PER_METRIC_TONNE;
  }
}

export function convertMetricTonnesToUnit(valueMt: number, unit: GrainAmountUnit, bushelWeightLbs: number): number {
  const normalizedValue = Math.max(0, valueMt);
  const normalizedBushelWeight = Math.max(bushelWeightLbs, 0.0001);

  switch (unit) {
    case "metric_tonnes":
      return normalizedValue;
    case "pounds":
      return normalizedValue * POUNDS_PER_METRIC_TONNE;
    case "bushels":
      return (normalizedValue * POUNDS_PER_METRIC_TONNE) / normalizedBushelWeight;
  }
}

export function convertTonnesToKt(valueMt: number): number {
  return Math.max(0, valueMt) / 1000;
}

export function convertKtToTonnes(valueKt: number): number {
  return Math.max(0, valueKt) * 1000;
}

export function getYieldMetrics({
  acres,
  startingGrainKt,
  bushelWeightLbs,
}: {
  acres: number;
  startingGrainKt: number;
  bushelWeightLbs: number;
}): {
  tonnesPerAcre: number;
  bushelsPerAcre: number;
} {
  const normalizedAcres = Math.max(0, acres);
  const startingTonnes = convertKtToTonnes(startingGrainKt);

  if (normalizedAcres <= 0 || startingTonnes <= 0) {
    return {
      tonnesPerAcre: 0,
      bushelsPerAcre: 0,
    };
  }

  return {
    tonnesPerAcre: startingTonnes / normalizedAcres,
    bushelsPerAcre: convertMetricTonnesToUnit(
      startingTonnes,
      "bushels",
      bushelWeightLbs
    ) / normalizedAcres,
  };
}
