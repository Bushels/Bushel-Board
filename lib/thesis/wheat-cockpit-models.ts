/**
 * Client-safe types for the farmer visual pillars on /thesis (UX Phase 1).
 * Keep free of server-only imports.
 */

export type PrairieProvinceCode = "MB" | "SK" | "AB";

export type PrairiePackageStatus =
  | "complete_mb_sk_ab"
  | "partial_prairie_week"
  | "partial_mb_only"
  | "unknown"
  | "empty";

export interface PrairieProvincePill {
  code: PrairieProvinceCode;
  label: string;
  /** 0–100 when known (seeded / developed / condition proxy). */
  progressPct: number | null;
  /** Short farmer line, e.g. "63% behind normal development". */
  detail: string | null;
  /** Whether this province has a current-period row. */
  present: boolean;
}

export interface PrairieProgressCardModel {
  weekEnding: string | null;
  packageStatus: PrairiePackageStatus;
  packageLabel: string;
  takeaway: string;
  provinces: PrairieProvincePill[];
}

export interface GeeBeltChip {
  cropBelt: string;
  label: string;
  stressIndex: number | null;
  reading: string | null;
  color: string;
}

export interface GeeMoistureCardModel {
  latestWeek: string | null;
  takeaway: string;
  belts: GeeBeltChip[];
  /** Always true for farmer copy — stress is watch-only. */
  watchOnly: true;
  dataHref: "/data";
}

export interface PriceBasketLegModel {
  symbol: "Spring Wheat" | "HRW" | "SRW";
  lastPrice: number | null;
  changePct: number | null;
  /** Optional sparkline series (oldest → newest). */
  series: number[];
}

export interface PriceBasketCardModel {
  legs: PriceBasketLegModel[];
  agreementLabel: string;
  takeaway: string;
}

export interface WheatCockpitHeroModel {
  score: number;
  confidence: number;
  stanceLabel: string;
  headline: string;
  caChip: string | null;
  usChip: string | null;
  scoreSourceLabel: string;
}
