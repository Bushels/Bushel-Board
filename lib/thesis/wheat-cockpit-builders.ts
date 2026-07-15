/**
 * Pure builders for Wheat cockpit visual pillars (Phase 1+).
 * Server page will call these; keep free of React and server-only modules.
 */

import {
  beltLabel,
  stressColor,
  type CropStressMapData,
} from "@/lib/queries/gee-crop-stress-utils";
import type {
  CropLean,
  CropProgressSignal,
  GeeMoistureCardModel,
  GeographyCropRead,
  PrairiePackageStatus,
  PrairieProgressCardModel,
  PrairieProvincePill,
  PriceBasketCardModel,
  PriceBasketLegModel,
  UsdaProgressSlice,
  WeatherDomainSlice,
} from "@/lib/thesis/wheat-cockpit-models";

const PROVINCE_ORDER = ["MB", "SK", "AB"] as const;

const PRICE_HISTORY_LEGS = [
  { historyLeg: "Spring Wheat", symbol: "Spring Wheat" as const },
  { historyLeg: "HRW Wheat", symbol: "HRW" as const },
  { historyLeg: "SRW Wheat", symbol: "SRW" as const },
] as const;

/** Sparkline budget so farmer cards stay compact on mobile. */
const PRICE_SPARKLINE_POINTS = 14;

export type WheatPriceHistoryLike = {
  leg: string;
  priceDate: string;
  settlementPrice: number;
  changePct: number | null;
};

export function packageStatusLabel(status: PrairiePackageStatus): string {
  switch (status) {
    case "complete_mb_sk_ab":
      return "Full Prairie package";
    case "partial_prairie_week":
      return "Partial Prairie package";
    case "partial_mb_only":
      return "Manitoba only so far";
    case "empty":
      return "No Prairie package yet";
    default:
      return "Prairie status unknown";
  }
}

/**
 * Normalize collector / board package flags into the farmer card enum.
 * Real importer values include partial_mb_sk and complete_with_missing_province.
 */
export function normalizePrairiePackageStatus(
  raw: string | null | undefined,
): PrairiePackageStatus {
  if (!raw) return "unknown";
  if (raw === "complete_mb_sk_ab") return "complete_mb_sk_ab";
  if (raw === "partial_mb_only") return "partial_mb_only";
  if (raw === "empty") return "empty";
  if (
    raw === "partial_prairie_week" ||
    raw === "partial_mb_sk" ||
    raw === "complete_with_missing_province" ||
    raw.startsWith("partial_")
  ) {
    return "partial_prairie_week";
  }
  if (raw === "unknown") return "unknown";
  return "unknown";
}

function defaultPresentByStatus(
  packageStatus: PrairiePackageStatus,
): Record<(typeof PROVINCE_ORDER)[number], boolean> {
  if (packageStatus === "complete_mb_sk_ab") {
    return { MB: true, SK: true, AB: true };
  }
  if (packageStatus === "partial_mb_only") {
    return { MB: true, SK: false, AB: false };
  }
  if (packageStatus === "partial_prairie_week") {
    return { MB: true, SK: true, AB: false };
  }
  return { MB: false, SK: false, AB: false };
}

function presentFromLoadedProvinces(
  loadedProvinces: string[] | null | undefined,
): Record<(typeof PROVINCE_ORDER)[number], boolean> | null {
  if (!loadedProvinces?.length) return null;
  const loaded = new Set(
    loadedProvinces.map((p) => p.trim().toUpperCase()).filter(Boolean),
  );
  return {
    MB: loaded.has("MB") || loaded.has("MANITOBA"),
    SK: loaded.has("SK") || loaded.has("SASKATCHEWAN"),
    AB: loaded.has("AB") || loaded.has("ALBERTA"),
  };
}

export function leanFromDomainScore(score: number | null | undefined): CropLean {
  if (score == null || !Number.isFinite(score) || score === 0) return "balanced";
  return score > 0 ? "bull" : "bear";
}

export function leanLabel(lean: CropLean): string {
  switch (lean) {
    case "bull":
      return "Bullish supply pressure";
    case "bear":
      return "Bearish supply cushion";
    case "balanced":
      return "Near neutral";
    default:
      return "No scored weather lean";
  }
}

function formatSignedScore(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function signalsFromWeatherDomain(domain: WeatherDomainSlice | null | undefined): CropProgressSignal[] {
  if (!domain) return [];
  const metrics = domain.metrics ?? [];
  if (metrics.length) {
    const domainLean = leanFromDomainScore(domain.score);
    return metrics.slice(0, 4).map((metric) => ({
      label: metric.label,
      value: metric.value,
      detail: null,
      lean: domainLean,
      scores: true,
    }));
  }

  const evidence = [
    ...(domain.positiveEvidence ?? []).map((text) => ({ text, lean: "bull" as const })),
    ...(domain.negativeEvidence ?? []).map((text) => ({ text, lean: "bear" as const })),
  ];
  return evidence.slice(0, 3).map((item) => ({
    label: "Weather evidence",
    value: item.text,
    detail: null,
    lean: item.lean,
    scores: true,
  }));
}

function signalsFromUsdaProgress(update: UsdaProgressSlice | null | undefined): CropProgressSignal[] {
  if (!update?.metrics?.length) return [];
  return update.metrics.slice(0, 4).map((metric) => ({
    label: metric.label,
    value: metric.value,
    detail: metric.detail || null,
    lean: metric.tone,
    // USDA class-safe progress is already admitted into the US weather domain when present.
    scores: true,
  }));
}

function buildCanadaGeography(input: {
  weekEnding?: string | null;
  weatherDomain?: WeatherDomainSlice | null;
}): GeographyCropRead {
  const domain = input.weatherDomain ?? null;
  const signals = signalsFromWeatherDomain(domain);
  const lean = domain ? leanFromDomainScore(domain.score) : signals.length ? "balanced" : "none";
  return {
    code: "CA",
    label: "Canada Prairie",
    weekEnding: input.weekEnding ?? null,
    lean,
    leanLabel: leanLabel(lean),
    scoreHint: domain
      ? `Weather domain ${formatSignedScore(Math.round(domain.score))} · weighted ${formatSignedScore(
          Number(domain.weightedScore.toFixed(1)),
        )} on CA scorecard`
      : signals.length
        ? "Prairie package visible; weather domain not scoring yet"
        : "No scored Canada crop-progress weather domain yet",
    signals,
  };
}

function buildUsGeography(input: {
  weatherDomain?: WeatherDomainSlice | null;
  usdaProgress?: UsdaProgressSlice | null;
}): GeographyCropRead {
  const domain = input.weatherDomain ?? null;
  const usdaSignals = signalsFromUsdaProgress(input.usdaProgress);
  const domainSignals = signalsFromWeatherDomain(domain);
  // Prefer concrete USDA progress metrics for the farmer card; fall back to domain metrics.
  const signals = usdaSignals.length ? usdaSignals : domainSignals;
  const lean = domain
    ? leanFromDomainScore(domain.score)
    : usdaSignals.some((s) => s.lean === "bull") && !usdaSignals.some((s) => s.lean === "bear")
      ? "bull"
      : usdaSignals.some((s) => s.lean === "bear") && !usdaSignals.some((s) => s.lean === "bull")
        ? "bear"
        : usdaSignals.length
          ? "balanced"
          : "none";

  return {
    code: "US",
    label: "United States",
    weekEnding: input.usdaProgress?.weekEnding ?? null,
    lean,
    leanLabel: leanLabel(lean),
    scoreHint: domain
      ? `Weather domain ${formatSignedScore(Math.round(domain.score))} · weighted ${formatSignedScore(
          Number(domain.weightedScore.toFixed(1)),
        )} on US scorecard`
      : signals.length
        ? "USDA progress visible; weather domain not attached"
        : "No scored US crop-progress weather domain yet",
    signals,
  };
}

function buildCombinedTakeaway(
  packageStatus: PrairiePackageStatus,
  canada: GeographyCropRead,
  us: GeographyCropRead,
): string {
  const caPart =
    canada.lean === "bull"
      ? "Canada weather lean is bullish (crop stress / delay)"
      : canada.lean === "bear"
        ? "Canada weather lean is bearish (comfortable crop)"
        : packageStatus === "partial_prairie_week" || packageStatus === "partial_mb_only"
          ? "Canada Prairie package is still filling in"
          : "Canada weather lean is near neutral";
  const usPart =
    us.lean === "bull"
      ? "US weather lean is bullish (crop stress)"
      : us.lean === "bear"
        ? "US weather lean is bearish (supply cushion)"
        : "US weather lean is near neutral";

  if (canada.lean !== "none" && us.lean !== "none" && canada.lean !== us.lean) {
    return `${caPart}; ${usPart}. Keep separate CA and US scores — do not average away a class split.`;
  }
  if (canada.lean === "none" && us.lean === "none") {
    if (packageStatus === "complete_mb_sk_ab") {
      return "Full Prairie package is in, but scored condition rows are thin — package completeness is not the same as a weather score.";
    }
    return "Crop-progress package status is shown; scored condition lands when official condition / development rows admit into the weather domain.";
  }
  return `${caPart}; ${usPart}.`;
}

/**
 * Farmer crop-progress pillar: Prairie package + scored CA weather + scored US condition.
 * Does not invent a new combined crop score — surfaces existing CA/US weather domains.
 */
export function buildPrairieProgressCardModel(input: {
  weekEnding?: string | null;
  packageStatus?: string | null;
  loadedProvinces?: string[] | null;
  missingProvinces?: string[] | null;
  provinceHints?: Partial<
    Record<"MB" | "SK" | "AB", { progressPct?: number | null; detail?: string | null; present?: boolean }>
  >;
  /** Canada scorecard weather domain (from published board item). */
  canadaWeatherDomain?: WeatherDomainSlice | null;
  /** US scorecard weather domain (from published board item). */
  usWeatherDomain?: WeatherDomainSlice | null;
  /** Live USDA progress card metrics (class-safe winter/spring). */
  usdaProgress?: UsdaProgressSlice | null;
}): PrairieProgressCardModel {
  const packageStatus = normalizePrairiePackageStatus(input.packageStatus);
  const presentByDefault =
    presentFromLoadedProvinces(input.loadedProvinces) ?? defaultPresentByStatus(packageStatus);

  const missing = new Set(
    (input.missingProvinces ?? []).map((p) => p.trim().toUpperCase()).filter(Boolean),
  );

  // Prefer a condition/development metric for bar fill when the CA domain has one.
  const conditionMetric = (input.canadaWeatherDomain?.metrics ?? []).find((m) =>
    /good\/excellent|behind-normal|seeded|moisture/i.test(m.label),
  );
  const barPct =
    conditionMetric?.numericValue != null && Number.isFinite(conditionMetric.numericValue)
      ? Math.max(0, Math.min(100, conditionMetric.numericValue))
      : null;
  const barDetail = conditionMetric
    ? `${conditionMetric.label}: ${conditionMetric.value} (scored when admitted)`
    : null;

  const provinces: PrairieProvincePill[] = PROVINCE_ORDER.map((code) => {
    const hint = input.provinceHints?.[code];
    let present = hint?.present ?? presentByDefault[code];
    if (missing.has(code) && hint?.present == null) {
      present = false;
    }
    return {
      code,
      label: code === "MB" ? "Manitoba" : code === "SK" ? "Saskatchewan" : "Alberta",
      progressPct: present ? (hint?.progressPct ?? barPct) : null,
      detail: present
        ? (hint?.detail ?? barDetail ?? (hint?.progressPct == null ? "Report in for this package" : null))
        : "Waiting on this province's report",
      present,
    };
  });

  const canada = buildCanadaGeography({
    weekEnding: input.weekEnding,
    weatherDomain: input.canadaWeatherDomain,
  });
  const us = buildUsGeography({
    weatherDomain: input.usWeatherDomain,
    usdaProgress: input.usdaProgress,
  });

  return {
    weekEnding: input.weekEnding ?? us.weekEnding ?? null,
    packageStatus,
    packageLabel: packageStatusLabel(packageStatus),
    takeaway: buildCombinedTakeaway(packageStatus, canada, us),
    provinces,
    canada,
    us,
  };
}

export function buildGeeMoistureCardModel(data: CropStressMapData | null): GeeMoistureCardModel {
  if (!data || !data.beltSummaries.length) {
    return {
      latestWeek: null,
      takeaway: "Satellite crop-stress isn't loaded yet — check Wheat Data after Friday's GEE run.",
      belts: [],
      watchOnly: true,
      dataHref: "/data",
    };
  }

  const belts = data.beltSummaries.map((b) => ({
    cropBelt: b.cropBelt,
    label: beltLabel(b.cropBelt).replace(/^the /i, "").replace(/^Russia's /i, "Russia "),
    stressIndex: b.stressIndex,
    reading: b.reading,
    color: stressColor(b.stressIndex),
  }));

  return {
    latestWeek: data.latestWeek,
    takeaway: data.takeaway,
    belts,
    watchOnly: true,
    dataHref: "/data",
  };
}

/** Map bounded get_wheat_price_history rows into the three farmer price-basket legs. */
export function buildPriceBasketLegsFromHistory(
  rows: WheatPriceHistoryLike[],
): PriceBasketLegModel[] {
  return PRICE_HISTORY_LEGS.map(({ historyLeg, symbol }) => {
    const legRows = rows
      .filter((row) => row.leg === historyLeg)
      .slice()
      .sort((a, b) => a.priceDate.localeCompare(b.priceDate));
    const spark = legRows.slice(-PRICE_SPARKLINE_POINTS);
    const last = legRows.at(-1) ?? null;
    return {
      symbol,
      lastPrice: last?.settlementPrice ?? null,
      changePct: last?.changePct ?? null,
      series: spark.map((row) => row.settlementPrice),
    };
  });
}

export function buildPriceBasketCardModel(legs: PriceBasketLegModel[]): PriceBasketCardModel {
  const withChange = legs.filter((l) => l.changePct != null);
  let agreementLabel = "Price context";
  let agreement: PriceBasketCardModel["agreement"] = "neutral";
  let takeaway =
    "Futures confirm the official read — they do not override supply or desk truth alone.";

  if (withChange.length >= 2) {
    const signs = withChange.map((l) => Math.sign(l.changePct as number));
    const allUp = signs.every((s) => s > 0);
    const allDown = signs.every((s) => s < 0);
    if (allUp) {
      agreementLabel = "Contracts agree ↑";
      agreement = "up";
      takeaway =
        "Spring, HRW, and SRW are moving together higher — price confirmation leans constructive.";
    } else if (allDown) {
      agreementLabel = "Contracts agree ↓";
      agreement = "down";
      takeaway =
        "The three Wheat classes are softer together — price confirmation leans cautious.";
    } else {
      agreementLabel = "Contracts split";
      agreement = "split";
      takeaway =
        "Wheat classes disagree on direction — treat price as lower-confidence confirmation only.";
    }
  }

  return { legs, agreementLabel, agreement, takeaway };
}
