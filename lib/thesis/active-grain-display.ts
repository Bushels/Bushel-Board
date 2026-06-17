export const ACTIVE_FARMER_THESIS_GRAIN_LANES = ["Wheat"] as const;

export type ActiveFarmerThesisGrainLane = (typeof ACTIVE_FARMER_THESIS_GRAIN_LANES)[number];

const ACTIVE_FARMER_THESIS_GRAIN_SET = new Set<string>(ACTIVE_FARMER_THESIS_GRAIN_LANES);

export function isActiveFarmerThesisGrain(grain: string): grain is ActiveFarmerThesisGrainLane {
  return ACTIVE_FARMER_THESIS_GRAIN_SET.has(grain);
}
