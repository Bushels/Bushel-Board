/**
 * Client-safe types for the farmer visual pillars on /thesis (UX Phase 1+).
 * Keep free of server-only imports.
 */

export type PrairieProvinceCode = "MB" | "SK" | "AB";

export type PrairiePackageStatus =
  | "complete_mb_sk_ab"
  | "partial_prairie_week"
  | "partial_mb_only"
  | "unknown"
  | "empty";

/** Market lean implied by crop condition (stressed crop → bullish supply). */
export type CropLean = "bull" | "bear" | "balanced" | "none";

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

/** One scored or display metric inside a geography crop read. */
export interface CropProgressSignal {
  label: string;
  value: string;
  detail: string | null;
  lean: CropLean;
  /** True when this metric is admitted into the mechanical weather domain. */
  scores: boolean;
}

export interface GeographyCropRead {
  code: "CA" | "US";
  label: string;
  weekEnding: string | null;
  lean: CropLean;
  leanLabel: string;
  /** Short scorecard hint, e.g. "Weather domain −4.8 on US scorecard". */
  scoreHint: string | null;
  signals: CropProgressSignal[];
}

export interface PrairieProgressCardModel {
  weekEnding: string | null;
  packageStatus: PrairiePackageStatus;
  packageLabel: string;
  takeaway: string;
  provinces: PrairieProvincePill[];
  /** Canada weather-domain read (scored when admitted). */
  canada: GeographyCropRead;
  /** US crop-progress / weather-domain read (scored when admitted). */
  us: GeographyCropRead;
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

/** Minimal weather-domain slice from a board scorecard (client-safe). */
export interface WeatherDomainSlice {
  score: number;
  weightedScore: number;
  confidence?: string | null;
  metrics?: Array<{
    label: string;
    value: string;
    numericValue?: number | null;
  }>;
  positiveEvidence?: string[];
  negativeEvidence?: string[];
}

/** Minimal USDA progress update for the US side of the crop pillar. */
export interface UsdaProgressSlice {
  weekEnding: string | null;
  read: string | null;
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
    tone: "bull" | "bear" | "balanced";
  }>;
}
