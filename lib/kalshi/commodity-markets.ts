import type {
  ThesisConfidence,
  ThesisBoardItem,
  ThesisComparisonRow,
  ThesisDriver,
} from "@/lib/queries/thesis-board";

export type KalshiCommodityGrain = "Corn" | "Soybeans" | "Wheat";
export type KalshiCommodityHorizon = "weekly" | "monthly";
export type KalshiMarketLean = "yes" | "no" | "balanced" | "unpriced";
export type KalshiCalibrationAlignment =
  | "aligned"
  | "divergent"
  | "neutral"
  | "no_market"
  | "no_thesis";
export type KalshiLiquidityStatus = "usable" | "wide_spread" | "thin" | "unpriced";
export type BushelBoardImpliedLineStatus =
  | "available"
  | "no_market"
  | "no_thesis"
  | "unparsed_contract"
  | "insufficient_evidence";

export interface BushelBoardImpliedLineReason {
  tone: "bull" | "bear";
  title: string;
  body: string;
  sourceName: string;
  confidence: ThesisConfidence;
  metricLabel: string;
}

export interface BushelBoardImpliedLine {
  status: BushelBoardImpliedLineStatus;
  statusLabel: string;
  probabilityPct: number | null;
  deltaPct: number | null;
  confidence: ThesisConfidence | "missing";
  confidenceScore: number | null;
  country: "US" | "CA" | null;
  sourceTimestamp: string | null;
  topBullReasons: BushelBoardImpliedLineReason[];
  topBearReasons: BushelBoardImpliedLineReason[];
  components: {
    baseProbabilityPct: number;
    directionAdjustmentPct: number;
    confidenceMultiplier: number;
    evidenceAdjustmentPct: number;
  } | null;
  warnings: string[];
}

export interface KalshiCommoditySeriesConfig {
  seriesTicker: string;
  grain: KalshiCommodityGrain;
  horizon: KalshiCommodityHorizon;
  label: string;
  contractTermsUrl: string;
}

export interface KalshiRawMarket {
  ticker?: unknown;
  event_ticker?: unknown;
  status?: unknown;
  title?: unknown;
  subtitle?: unknown;
  yes_bid_dollars?: unknown;
  yes_ask_dollars?: unknown;
  no_bid_dollars?: unknown;
  no_ask_dollars?: unknown;
  last_price_dollars?: unknown;
  volume_fp?: unknown;
  volume_24h_fp?: unknown;
  open_interest_fp?: unknown;
  close_time?: unknown;
  expiration_time?: unknown;
  expected_expiration_time?: unknown;
  rules_primary?: unknown;
  rules_secondary?: unknown;
  strike_type?: unknown;
  floor_strike?: unknown;
  cap_strike?: unknown;
  result?: unknown;
}

export interface KalshiCommodityMarket {
  sourceId: "kalshi";
  capturedAt: string;
  grain: KalshiCommodityGrain;
  country: "US";
  horizon: KalshiCommodityHorizon;
  seriesTicker: string;
  marketTicker: string;
  eventTicker: string;
  status: string;
  title: string;
  subtitle: string | null;
  closeTime: string | null;
  yesBidPct: number | null;
  yesAskPct: number | null;
  noBidPct: number | null;
  noAskPct: number | null;
  lastPricePct: number | null;
  impliedYesPct: number | null;
  spreadPct: number | null;
  volume: number | null;
  volume24h: number | null;
  openInterest: number | null;
  strikeLabel: string | null;
  rulesPrimary: string | null;
  rulesSecondary: string | null;
  contractTermsUrl: string;
  apiUrl: string;
  marketLean: KalshiMarketLean;
  liquidityStatus: KalshiLiquidityStatus;
  warnings: string[];
}

export interface KalshiCommoditySnapshot {
  capturedAt: string;
  markets: KalshiCommodityMarket[];
  warnings: string[];
}

export interface KalshiCalibrationRow {
  grain: KalshiCommodityGrain;
  thesisItem: ThesisBoardItem | null;
  thesisCountry: "US" | "CA" | null;
  thesisDirection: "bullish" | "bearish" | "balanced" | "missing";
  featuredMarket: KalshiCommodityMarket | null;
  bushelBoardLine: BushelBoardImpliedLine;
  marketLean: KalshiMarketLean;
  alignment: KalshiCalibrationAlignment;
  alignmentLabel: string;
  explanation: string;
  warnings: string[];
}

export const KALSHI_API_BASE_URL = "https://external-api.kalshi.com/trade-api/v2";
export const KALSHI_COMMODITY_CONTRACT_TERMS_URL =
  "https://kalshi-public-docs.s3.amazonaws.com/contract_terms/COMMODITIES.pdf";

export const KALSHI_COMMODITY_SERIES: readonly KalshiCommoditySeriesConfig[] = [
  {
    seriesTicker: "KXCORNW",
    grain: "Corn",
    horizon: "weekly",
    label: "Corn Weekly",
    contractTermsUrl: KALSHI_COMMODITY_CONTRACT_TERMS_URL,
  },
  {
    seriesTicker: "KXCORNMON",
    grain: "Corn",
    horizon: "monthly",
    label: "Corn Monthly",
    contractTermsUrl: KALSHI_COMMODITY_CONTRACT_TERMS_URL,
  },
  {
    seriesTicker: "KXSOYBEANW",
    grain: "Soybeans",
    horizon: "weekly",
    label: "Soybean Weekly",
    contractTermsUrl: KALSHI_COMMODITY_CONTRACT_TERMS_URL,
  },
  {
    seriesTicker: "KXSOYBEANMON",
    grain: "Soybeans",
    horizon: "monthly",
    label: "Soybean Monthly",
    contractTermsUrl: KALSHI_COMMODITY_CONTRACT_TERMS_URL,
  },
  {
    seriesTicker: "KXWHEATW",
    grain: "Wheat",
    horizon: "weekly",
    label: "Wheat Weekly",
    contractTermsUrl: KALSHI_COMMODITY_CONTRACT_TERMS_URL,
  },
  {
    seriesTicker: "KXWHEATMON",
    grain: "Wheat",
    horizon: "monthly",
    label: "Wheat Monthly",
    contractTermsUrl: KALSHI_COMMODITY_CONTRACT_TERMS_URL,
  },
] as const;

export const KALSHI_CALIBRATION_GRAINS: readonly KalshiCommodityGrain[] = [
  "Corn",
  "Soybeans",
  "Wheat",
] as const;

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dollarsToPct(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return Number((parsed * 100).toFixed(2));
}

function decimalPct(value: number): number {
  return Number(value.toFixed(2));
}

function impliedYesPct(
  yesBidPct: number | null,
  yesAskPct: number | null,
  lastPricePct: number | null,
): number | null {
  if (yesBidPct !== null && yesAskPct !== null && yesAskPct >= yesBidPct) {
    return decimalPct((yesBidPct + yesAskPct) / 2);
  }
  return lastPricePct ?? yesBidPct ?? yesAskPct;
}

function marketLeanFromProbability(probabilityPct: number | null): KalshiMarketLean {
  if (probabilityPct === null) return "unpriced";
  if (probabilityPct >= 55) return "yes";
  if (probabilityPct <= 45) return "no";
  return "balanced";
}

function liquidityStatus(
  impliedPct: number | null,
  spreadPct: number | null,
  volume: number | null,
  openInterest: number | null,
): KalshiLiquidityStatus {
  if (impliedPct === null) return "unpriced";
  if (spreadPct !== null && spreadPct > 20) return "wide_spread";
  if ((volume ?? 0) < 25 && (openInterest ?? 0) < 25) return "thin";
  return "usable";
}

function strikeValue(value: unknown): string | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return Number.isInteger(parsed) ? parsed.toFixed(0) : String(parsed);
}

function extractStrikeLabel(
  title: string,
  rulesPrimary: string | null,
  rawMarket: KalshiRawMarket,
): string | null {
  const source = `${title} ${rulesPrimary ?? ""}`;
  const unit = source.match(/\b(USd\/Bu|USD\/Bu|cents\/bushel|c\/bu)\b/i)?.[1] ?? null;
  const match = source.match(
    /(?:above|greater than|higher than|exceeds?)\s+\$?([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z/]+)?/i,
  );
  if (match) return `${match[1]} ${match[2] ?? unit ?? ""}`.trim();

  const floorStrike = strikeValue(rawMarket.floor_strike);
  if (floorStrike) return `${floorStrike} ${unit ?? ""}`.trim();

  const capStrike = strikeValue(rawMarket.cap_strike);
  if (capStrike) return `${capStrike} ${unit ?? ""}`.trim();

  return null;
}

function normalizeWhitespace(value: string | null): string | null {
  return value?.replace(/\s+/g, " ").trim() ?? null;
}

function statusRank(status: string): number {
  if (status === "open") return 0;
  if (status === "unopened") return 1;
  if (status === "paused") return 2;
  if (status === "closed") return 3;
  if (status === "settled" || status === "finalized") return 4;
  return 5;
}

function horizonRank(horizon: KalshiCommodityHorizon): number {
  return horizon === "weekly" ? 0 : 1;
}

function timestampRank(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

export function normalizeKalshiCommodityMarket(
  series: KalshiCommoditySeriesConfig,
  rawMarket: KalshiRawMarket,
  capturedAt: string,
  apiBaseUrl = KALSHI_API_BASE_URL,
): KalshiCommodityMarket {
  const marketTicker = asText(rawMarket.ticker) ?? "unknown";
  const title = asText(rawMarket.title) ?? marketTicker;
  const rulesPrimary = normalizeWhitespace(asText(rawMarket.rules_primary));
  const yesBidPct = dollarsToPct(rawMarket.yes_bid_dollars);
  const yesAskPct = dollarsToPct(rawMarket.yes_ask_dollars);
  const noBidPct = dollarsToPct(rawMarket.no_bid_dollars);
  const noAskPct = dollarsToPct(rawMarket.no_ask_dollars);
  const lastPricePct = dollarsToPct(rawMarket.last_price_dollars);
  const impliedPct = impliedYesPct(yesBidPct, yesAskPct, lastPricePct);
  const spreadPct =
    yesBidPct !== null && yesAskPct !== null && yesAskPct >= yesBidPct
      ? decimalPct(yesAskPct - yesBidPct)
      : null;
  const volume = asNumber(rawMarket.volume_fp);
  const openInterest = asNumber(rawMarket.open_interest_fp);
  const status = asText(rawMarket.status) ?? "unknown";
  const liquidity = liquidityStatus(impliedPct, spreadPct, volume, openInterest);
  const warnings: string[] = [];

  if (liquidity === "wide_spread") {
    warnings.push("Wide bid/ask spread; treat the implied probability as noisy.");
  }
  if (liquidity === "thin") {
    warnings.push("Thin volume/open interest; crowd signal is weak.");
  }
  if (liquidity === "unpriced") {
    warnings.push("No usable YES price was returned.");
  }
  if (!rulesPrimary) {
    warnings.push("Settlement rule text was not returned in the market payload.");
  }

  return {
    sourceId: "kalshi",
    capturedAt,
    grain: series.grain,
    country: "US",
    horizon: series.horizon,
    seriesTicker: series.seriesTicker,
    marketTicker,
    eventTicker: asText(rawMarket.event_ticker) ?? "unknown",
    status,
    title,
    subtitle: asText(rawMarket.subtitle),
    closeTime:
      asText(rawMarket.close_time) ??
      asText(rawMarket.expiration_time) ??
      asText(rawMarket.expected_expiration_time),
    yesBidPct,
    yesAskPct,
    noBidPct,
    noAskPct,
    lastPricePct,
    impliedYesPct: impliedPct,
    spreadPct,
    volume,
    volume24h: asNumber(rawMarket.volume_24h_fp),
    openInterest,
    strikeLabel: extractStrikeLabel(title, rulesPrimary, rawMarket),
    rulesPrimary,
    rulesSecondary: normalizeWhitespace(asText(rawMarket.rules_secondary)),
    contractTermsUrl: series.contractTermsUrl,
    apiUrl: `${apiBaseUrl}/markets/${encodeURIComponent(marketTicker)}`,
    marketLean: marketLeanFromProbability(impliedPct),
    liquidityStatus: liquidity,
    warnings,
  };
}

export function selectFeaturedKalshiMarkets(
  markets: KalshiCommodityMarket[],
): KalshiCommodityMarket[] {
  const byGrain = new Map<KalshiCommodityGrain, KalshiCommodityMarket[]>();
  for (const market of markets) {
    byGrain.set(market.grain, [...(byGrain.get(market.grain) ?? []), market]);
  }

  return KALSHI_CALIBRATION_GRAINS.flatMap((grain) => {
    const candidates = byGrain.get(grain) ?? [];
    const sorted = [...candidates].sort((a, b) => {
      const statusDelta = statusRank(a.status) - statusRank(b.status);
      if (statusDelta !== 0) return statusDelta;
      const horizonDelta = horizonRank(a.horizon) - horizonRank(b.horizon);
      if (horizonDelta !== 0) return horizonDelta;
      const closeDelta = timestampRank(a.closeTime) - timestampRank(b.closeTime);
      if (closeDelta !== 0) return closeDelta;
      return (b.volume ?? 0) - (a.volume ?? 0);
    });
    return sorted[0] ? [sorted[0]] : [];
  });
}

function thesisDirection(item: ThesisBoardItem | null): KalshiCalibrationRow["thesisDirection"] {
  if (!item) return "missing";
  if (item.stanceScore > 0) return "bullish";
  if (item.stanceScore < 0) return "bearish";
  return "balanced";
}

function thesisFromComparisonRow(
  row: ThesisComparisonRow | undefined,
): { item: ThesisBoardItem | null; country: "US" | "CA" | null } {
  if (!row) return { item: null, country: null };
  if (row.us) return { item: row.us, country: "US" };
  return { item: null, country: null };
}

function alignmentFor(
  marketLean: KalshiMarketLean,
  direction: KalshiCalibrationRow["thesisDirection"],
): KalshiCalibrationAlignment {
  if (marketLean === "unpriced") return "no_market";
  if (direction === "missing") return "no_thesis";
  if (direction === "balanced" || marketLean === "balanced") return "neutral";
  if (direction === "bullish" && marketLean === "yes") return "aligned";
  if (direction === "bearish" && marketLean === "no") return "aligned";
  return "divergent";
}

function alignmentLabel(alignment: KalshiCalibrationAlignment): string {
  const labels: Record<KalshiCalibrationAlignment, string> = {
    aligned: "Agreement",
    divergent: "Wide gap",
    neutral: "Watch",
    no_market: "No active market",
    no_thesis: "No thesis",
  };
  return labels[alignment];
}

function signedScore(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function driverConfidenceWeight(confidence: ThesisConfidence): number {
  if (confidence === "high") return 4;
  if (confidence === "medium") return 3;
  return 1.5;
}

function driverRank(driver: ThesisDriver): number {
  return driverConfidenceWeight(driver.confidence);
}

function lineReasons(
  drivers: ThesisDriver[],
  tone: BushelBoardImpliedLineReason["tone"],
): BushelBoardImpliedLineReason[] {
  return [...drivers]
    .sort((a, b) => driverRank(b) - driverRank(a))
    .slice(0, 2)
    .map((driver) => ({
      tone,
      title: driver.title,
      body: driver.body,
      sourceName: driver.sourceName,
      confidence: driver.confidence,
      metricLabel: driver.metricLabel,
    }));
}

function evidenceAdjustment(
  topBullReasons: BushelBoardImpliedLineReason[],
  topBearReasons: BushelBoardImpliedLineReason[],
): number {
  const bull = topBullReasons.reduce(
    (total, reason) => total + driverConfidenceWeight(reason.confidence),
    0,
  );
  const bear = topBearReasons.reduce(
    (total, reason) => total + driverConfidenceWeight(reason.confidence),
    0,
  );
  return decimalPct(clamp(bull - bear, -8, 8));
}

function lineStatusLabel(status: BushelBoardImpliedLineStatus): string {
  const labels: Record<BushelBoardImpliedLineStatus, string> = {
    available: "Line available",
    no_market: "No active market",
    no_thesis: "No thesis row",
    unparsed_contract: "Watched - threshold not parsed",
    insufficient_evidence: "Insufficient thesis evidence",
  };
  return labels[status];
}

function emptyLine(
  status: BushelBoardImpliedLineStatus,
  warning: string,
): BushelBoardImpliedLine {
  return {
    status,
    statusLabel: lineStatusLabel(status),
    probabilityPct: null,
    deltaPct: null,
    confidence: "missing",
    confidenceScore: null,
    country: null,
    sourceTimestamp: null,
    topBullReasons: [],
    topBearReasons: [],
    components: null,
    warnings: [warning],
  };
}

export function buildBushelBoardImpliedLine(
  thesisItem: ThesisBoardItem | null,
  thesisCountry: "US" | "CA" | null,
  market: KalshiCommodityMarket | null,
): BushelBoardImpliedLine {
  if (!market) {
    return emptyLine(
      "no_market",
      "No active Kalshi commodity market is available for this watched grain.",
    );
  }
  if (!thesisItem || !thesisCountry) {
    return emptyLine(
      "no_thesis",
      "No Bushel Board thesis row is available for this watched grain.",
    );
  }

  const topBullReasons = lineReasons(thesisItem.bullDrivers, "bull");
  const topBearReasons = lineReasons(thesisItem.bearDrivers, "bear");
  const warnings: string[] = [];

  if (!market.strikeLabel) {
    warnings.push(
      "Kalshi returned a market, but the above-threshold contract level could not be parsed; the Bushel Board Implied Line is withheld.",
    );
    return {
      status: "unparsed_contract",
      statusLabel: lineStatusLabel("unparsed_contract"),
      probabilityPct: null,
      deltaPct: null,
      confidence: thesisItem.confidence,
      confidenceScore: thesisItem.confidenceScore,
      country: thesisCountry,
      sourceTimestamp: thesisItem.packetGeneratedAt,
      topBullReasons,
      topBearReasons,
      components: null,
      warnings,
    };
  }

  if (topBullReasons.length + topBearReasons.length === 0) {
    warnings.push(
      "The current thesis packet has no ranked bull or bear drivers; probability is withheld to avoid false precision.",
    );
    return {
      status: "insufficient_evidence",
      statusLabel: lineStatusLabel("insufficient_evidence"),
      probabilityPct: null,
      deltaPct: null,
      confidence: thesisItem.confidence,
      confidenceScore: thesisItem.confidenceScore,
      country: thesisCountry,
      sourceTimestamp: thesisItem.packetGeneratedAt,
      topBullReasons,
      topBearReasons,
      components: null,
      warnings,
    };
  }

  const baseProbabilityPct = 50;
  const directionSign = thesisItem.stanceScore > 0 ? 1 : thesisItem.stanceScore < 0 ? -1 : 0;
  const stanceMagnitude = clamp(Math.abs(thesisItem.stanceScore) * 0.28, 0, 26);
  const confidenceMultiplier = decimalPct(clamp(thesisItem.confidenceScore / 100, 0.35, 0.9));
  const directionAdjustmentPct = Math.round(directionSign * stanceMagnitude * confidenceMultiplier);
  const evidenceAdjustmentPct = Math.round(evidenceAdjustment(topBullReasons, topBearReasons));
  const probabilityPct = Math.round(
    clamp(baseProbabilityPct + directionAdjustmentPct + evidenceAdjustmentPct, 5, 95),
  );
  const deltaPct =
    market.impliedYesPct === null ? null : Math.round(probabilityPct - market.impliedYesPct);

  warnings.push(
    "Bushel Board Implied Line is deterministic: thesis direction, confidence, and ranked evidence only. Liquidity is displayed separately.",
  );

  return {
    status: "available",
    statusLabel: lineStatusLabel("available"),
    probabilityPct,
    deltaPct,
    confidence: thesisItem.confidence,
    confidenceScore: thesisItem.confidenceScore,
    country: thesisCountry,
    sourceTimestamp: thesisItem.packetGeneratedAt,
    topBullReasons,
    topBearReasons,
    components: {
      baseProbabilityPct,
      directionAdjustmentPct,
      confidenceMultiplier,
      evidenceAdjustmentPct,
    },
    warnings,
  };
}

function alignmentForLine(
  market: KalshiCommodityMarket | null,
  line: BushelBoardImpliedLine,
  marketLean: KalshiMarketLean,
  direction: KalshiCalibrationRow["thesisDirection"],
): KalshiCalibrationAlignment {
  if (!market) return "no_market";
  if (line.status === "no_thesis") return "no_thesis";
  if (line.status === "unparsed_contract" || line.status === "insufficient_evidence") {
    return "neutral";
  }
  if (line.deltaPct !== null) {
    const gap = Math.abs(line.deltaPct);
    if (gap <= 8) return "aligned";
    if (gap >= 15) return "divergent";
    return "neutral";
  }
  return alignmentFor(marketLean, direction);
}

function explanationFor(
  grain: KalshiCommodityGrain,
  thesisItem: ThesisBoardItem | null,
  thesisCountry: "US" | "CA" | null,
  market: KalshiCommodityMarket | null,
  line: BushelBoardImpliedLine,
  alignment: KalshiCalibrationAlignment,
): string {
  if (!market) {
    return `${grain} is watched, but Kalshi returned no active commodity market for the configured weekly/monthly series.`;
  }
  if (!thesisItem || !thesisCountry) {
    return `${grain} has a Kalshi market, but no matching Bushel Board thesis row is available.`;
  }
  const probability =
    market.impliedYesPct === null ? "unpriced" : `${market.impliedYesPct.toFixed(0)}% YES`;
  const lineText =
    line.probabilityPct === null
      ? line.statusLabel.toLowerCase()
      : `${line.probabilityPct.toFixed(0)}% Bushel Board Implied Line`;
  const base = `${thesisCountry} thesis is ${signedScore(thesisItem.stanceScore)} ${thesisItem.stanceLabel}; Kalshi is ${probability} and Bushel Board is ${lineText} on an above-threshold ${market.horizon} contract.`;
  if (alignment === "divergent") return `${base} This is a disagreement to watch, not a model correction.`;
  if (alignment === "aligned") return `${base} The traded probability is directionally consistent with our thesis.`;
  return `${base} The signal is neutral or too close to call.`;
}

export function buildKalshiCalibrationRows(
  comparisonRows: ThesisComparisonRow[],
  markets: KalshiCommodityMarket[],
): KalshiCalibrationRow[] {
  const comparisonByGrain = new Map(comparisonRows.map((row) => [row.grain, row]));
  const featuredMarkets = new Map(
    selectFeaturedKalshiMarkets(markets).map((market) => [market.grain, market]),
  );

  return KALSHI_CALIBRATION_GRAINS.map((grain) => {
    const { item, country } = thesisFromComparisonRow(comparisonByGrain.get(grain));
    const featuredMarket = featuredMarkets.get(grain) ?? null;
    const direction = thesisDirection(item);
    const marketLean = featuredMarket?.marketLean ?? "unpriced";
    const bushelBoardLine = buildBushelBoardImpliedLine(item, country, featuredMarket);
    const alignment = alignmentForLine(featuredMarket, bushelBoardLine, marketLean, direction);
    const warnings = [
      ...(featuredMarket?.warnings ?? []),
      ...bushelBoardLine.warnings,
      "Kalshi is used as a calibration/comparison signal only; it is not fed back into thesis generation.",
      "Above-threshold contracts are directional proxies only when the strike is relevant to the current market.",
    ];

    return {
      grain,
      thesisItem: item,
      thesisCountry: country,
      thesisDirection: direction,
      featuredMarket,
      bushelBoardLine,
      marketLean,
      alignment,
      alignmentLabel: alignmentLabel(alignment),
      explanation: explanationFor(grain, item, country, featuredMarket, bushelBoardLine, alignment),
      warnings,
    };
  });
}

export async function fetchKalshiCommoditySnapshot({
  fetchImpl = fetch,
  apiBaseUrl = KALSHI_API_BASE_URL,
  capturedAt = new Date().toISOString(),
  series = KALSHI_COMMODITY_SERIES,
  status = "open",
  timeoutMs = 8000,
  delayMs = 350,
}: {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
  capturedAt?: string;
  series?: readonly KalshiCommoditySeriesConfig[];
  status?: "open" | "unopened" | "closed" | "settled";
  timeoutMs?: number;
  delayMs?: number;
} = {}): Promise<KalshiCommoditySnapshot> {
  const markets: KalshiCommodityMarket[] = [];
  const warnings: string[] = [];

  for (const config of series) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const url = new URL(`${apiBaseUrl}/markets`);
    url.searchParams.set("series_ticker", config.seriesTicker);
    url.searchParams.set("status", status);
    url.searchParams.set("limit", "100");
    url.searchParams.set("mve_filter", "exclude");

    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        warnings.push(
          `${config.seriesTicker} returned HTTP ${response.status}; market skipped.`,
        );
        continue;
      }
      const payload = (await response.json()) as { markets?: KalshiRawMarket[] };
      for (const market of payload.markets ?? []) {
        markets.push(normalizeKalshiCommodityMarket(config, market, capturedAt, apiBaseUrl));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${config.seriesTicker} fetch failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    capturedAt,
    markets,
    warnings,
  };
}
