import type { XPulseSignalSummary, XPulseWatchSummary } from "@/lib/queries/x-scout-runs";
import { sanitizePublicAdviceCopy } from "@/lib/public-copy-guardrails";

export type WheatXLean =
  | "strong_bullish"
  | "lean_bullish"
  | "neutral"
  | "lean_bearish"
  | "strong_bearish"
  | "quiet";

export type BoardStanceLean = "bullish" | "bearish" | "balanced" | "missing";

export type TensionAlignment = "aligned" | "mixed" | "divergent" | "quiet" | "unavailable";

export interface ThematicWatch {
  id: string;
  label: string;
  summary: string;
  sentiment: "bullish_watch" | "bearish_watch" | "neutral_watch";
  whyItMatters: string;
  trustNote: string;
}

export interface RankedWheatXSignal {
  id: string;
  url: string | null;
  handle: string;
  quote: string;
  direction: "bullish" | "bearish" | "neutral";
  tier: string;
  tierWeight: number;
  locationWeight: number;
  recencyWeight: number;
  confidence: number;
  relevanceScore: number;
  weightedContribution: number;
  postedAt: string | null;
  needsOfficialVerification: boolean;
  regions: string[];
}

export interface WheatXRankingNotes {
  /** Desk-facing: how the -1..+1 score is built */
  methodSummary: string;
  weights: {
    sourceTier: number;
    location: number;
    directionTimesConfidence: number;
    recency: number;
    corroboration: number;
  };
  admissionRules: string[];
  trustRules: string[];
  scoreAuthority: string;
  deskImpact: string;
}

export interface WheatXSentimentResult {
  wheatSentimentScore: number;
  lean: WheatXLean;
  confidence: number;
  signalCount: number;
  prairieSignalCount: number;
  topSignals: RankedWheatXSignal[];
  tensionNote: string;
  tensionAlignment: TensionAlignment;
  boardStance: BoardStanceLean;
  thematicWatches: ThematicWatch[];
  rankingNotes: WheatXRankingNotes;
  dataProvenance: {
    sourceTables: string[];
    scoutRunner: string | null;
    scoutMode: string | null;
    runDate: string | null;
    runStartedAt: string | null;
    priceSnapshotStatus: string | null;
    acceptedSignalCount: number;
    rejectedSignalCount: number;
    artifactPath: string | null;
    recencyLabel: string;
    trustLabel: string;
  };
}

/** Standing thematic watches the desk should keep following even on quiet signal days. */
export const WHEAT_THEMATIC_WATCHES: ThematicWatch[] = [
  {
    id: "eu_heat",
    label: "EU Heatwave",
    summary: "Western EU / French wheat heat stress at grain fill",
    sentiment: "bullish_watch",
    whyItMatters:
      "Trader chatter about a weather premium. Lower EU supply could support Canadian export demand and basis later — only if prices and official yield cuts confirm.",
    trustNote: "Watch-only trader/media chatter until MARS or official EU yield revisions corroborate.",
  },
  {
    id: "us_northern_dryness",
    label: "US Northern Plains / HRW quality",
    summary: "Northern Plains dryness risk and mixed HRW harvest quality chatter",
    sentiment: "bullish_watch",
    whyItMatters:
      "US spring-wheat yield risk or HRW quality issues can offset a comfortable global-supply story. Confirm with USDA crop progress and harvest samples before treating as a driver.",
    trustNote: "Watch-only until USDA crop progress / harvest quality rows move.",
  },
];

export const WHEAT_X_RANKING_NOTES: WheatXRankingNotes = {
  methodSummary:
    "Wheat X Pulse ranks accepted Wheat/Durum posts only. Each post gets a contribution from who posted it, where it points, direction × confidence, and how fresh it is. The board scorecard never uses this number.",
  weights: {
    sourceTier: 0.25,
    location: 0.3,
    directionTimesConfidence: 0.25,
    recency: 0.1,
    corroboration: 0.1,
  },
  admissionRules: [
    "Must be Wheat or Durum primary grain (not generic ag chatter).",
    "Must include a source-linked x.com/twitter.com URL when stored from scout.",
    "Must describe a market mechanism: condition, quality, export, logistics, basis/cash, price confirmation, or policy flow.",
    "Advice-style wording (trade, hedge, or price-target language) is rejected upstream.",
  ],
  trustRules: [
    "tier1 prairie alpha / primary market voices weigh most (boost ~1.0).",
    "tier2 ag media / analysts weigh high (boost ~0.85).",
    "tier3 official/policy handles weigh solid (boost ~0.8).",
    "tier4 / unlisted weigh least (boost ~0.55–0.65).",
    "Prairie (SK/AB/MB) location weight = 1.0; Canada = 0.7; US/Black Sea/EU/Australia = 0.4–0.5.",
    "Same-claim corroboration and official_source_match add a small boost; they still do not move the scorecard.",
  ],
  scoreAuthority:
    "X Pulse is watch-only. Authority order: official sources → prices → X watch evidence → daily bounded overlays → Friday desk thesis of record.",
  deskImpact:
    "Desk should treat the X lean as market psychology and early warning. Use tensionAlignment: aligned raises conviction, divergent lowers conviction / raises inspection priority, quiet means no X pressure today.",
};

const TIER_WEIGHT: Record<string, number> = {
  tier1: 1,
  tier2: 0.85,
  tier3: 0.8,
  tier4: 0.55,
  unlisted: 0.65,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isWheatSignal(signal: XPulseSignalSummary): boolean {
  const grains = [
    signal.grain,
    signal.primaryImpactGrain ?? "",
    ...signal.affectedGrains,
  ].map((value) => value.toLowerCase());
  return grains.some((grain) => grain === "wheat" || grain === "durum" || grain.includes("wheat"));
}

function tierWeight(tier: string | null): number {
  if (!tier) return TIER_WEIGHT.unlisted;
  return TIER_WEIGHT[tier.toLowerCase()] ?? TIER_WEIGHT.unlisted;
}

function locationWeight(signal: XPulseSignalSummary): number {
  const text = `${signal.affectedRegions.join(" ")} ${signal.postSummary}`.toLowerCase();
  if (
    text.includes("saskatchewan") ||
    text.includes("alberta") ||
    text.includes("manitoba") ||
    text.includes("prairie") ||
    text.includes(" sk ") ||
    text.includes(" ab ") ||
    text.includes(" mb ")
  ) {
    return 1;
  }
  if (text.includes("canada") || text.includes("canadian")) return 0.7;
  if (text.includes("europe") || text.includes("france") || text.includes("eu ")) return 0.45;
  if (
    text.includes("black sea") ||
    text.includes("russia") ||
    text.includes("ukraine") ||
    text.includes("australia") ||
    text.includes("united states") ||
    text.includes(" u.s") ||
    text.includes(" us ") ||
    text.includes("kansas") ||
    text.includes("north dakota")
  ) {
    return 0.4;
  }
  return 0.5;
}

function recencyWeight(postedAt: string | null, runDate: string | null): number {
  if (!postedAt) return 0.7;
  const posted = new Date(postedAt).getTime();
  if (Number.isNaN(posted)) return 0.7;
  const anchor = runDate ? new Date(`${runDate}T12:00:00Z`).getTime() : Date.now();
  const ageHours = Math.max(0, (anchor - posted) / (1000 * 60 * 60));
  if (ageHours <= 24) return 1;
  if (ageHours <= 72) return 0.85;
  if (ageHours <= 168) return 0.65;
  return 0.45;
}

function directionScore(sentiment: XPulseSignalSummary["sentiment"]): number {
  if (sentiment === "bullish") return 1;
  if (sentiment === "bearish") return -1;
  return 0;
}

function confidence01(score: number): number {
  // Stored confidence is often 0–100; also accept 0–1.
  if (score > 1) return clamp(score / 100, 0, 1);
  return clamp(score, 0, 1);
}

function leanFromScore(score: number, signalCount: number): WheatXLean {
  if (signalCount === 0) return "quiet";
  if (score > 0.55) return "strong_bullish";
  if (score > 0.2) return "lean_bullish";
  if (score < -0.55) return "strong_bearish";
  if (score < -0.2) return "lean_bearish";
  return "neutral";
}

export function boardStanceFromScore(score: number | null | undefined): BoardStanceLean {
  if (score == null || Number.isNaN(score)) return "missing";
  if (score > 2) return "bullish";
  if (score < -2) return "bearish";
  return "balanced";
}

function leanBucket(lean: WheatXLean): "bullish" | "bearish" | "neutral" | "quiet" {
  if (lean === "quiet") return "quiet";
  if (lean.includes("bullish")) return "bullish";
  if (lean.includes("bearish")) return "bearish";
  return "neutral";
}

export function buildTensionNote(
  lean: WheatXLean,
  boardStance: BoardStanceLean,
  signalCount: number,
): { note: string; alignment: TensionAlignment } {
  if (signalCount === 0 || lean === "quiet") {
    return {
      alignment: "quiet",
      note: "X Pulse is quiet on Wheat today. Desk should not invent pressure from silence; keep thematic watches only.",
    };
  }
  if (boardStance === "missing") {
    return {
      alignment: "unavailable",
      note: "X Pulse has Wheat chatter, but the official board score is missing so tension cannot be scored yet.",
    };
  }

  const xSide = leanBucket(lean);
  if (xSide === "neutral") {
    return {
      alignment: "mixed",
      note: `X Pulse is mixed/neutral while the official board is ${boardStance}. Treat X as background noise unless a post is corroborated.`,
    };
  }
  if (
    (xSide === "bullish" && boardStance === "bullish") ||
    (xSide === "bearish" && boardStance === "bearish")
  ) {
    return {
      alignment: "aligned",
      note: `X Pulse ${lean.replaceAll("_", " ")} aligns with the official ${boardStance} board. Desk may raise conviction language only after checking official rows still support the lean.`,
    };
  }
  if (
    (xSide === "bullish" && boardStance === "bearish") ||
    (xSide === "bearish" && boardStance === "bullish")
  ) {
    return {
      alignment: "divergent",
      note: `Tension: X Pulse is ${lean.replaceAll("_", " ")} while the official board is ${boardStance}. Desk should inspect whether X is early (weather/basis chatter) or noise — X cannot overturn the scorecard alone.`,
    };
  }
  return {
    alignment: "mixed",
    note: `X Pulse is ${lean.replaceAll("_", " ")} against an official ${boardStance} board. Mixed read: use X as a watch lead, not a score mover.`,
  };
}

function recencyLabel(runStartedAt: string | null, runDate: string | null): string {
  if (runStartedAt) {
    const started = new Date(runStartedAt).getTime();
    if (!Number.isNaN(started)) {
      const hours = (Date.now() - started) / (1000 * 60 * 60);
      if (hours < 24) return `Scout run within the last ${Math.max(1, Math.round(hours))}h (MT-aware storage)`;
      if (hours < 72) return `Scout run about ${Math.round(hours / 24)} day(s) ago`;
      return `Scout run is ${Math.round(hours / 24)} days old — treat as stale watch context`;
    }
  }
  if (runDate) return `Latest stored scout date ${runDate}`;
  return "No stored X scout run yet";
}

function trustLabel(result: {
  signalCount: number;
  prairieSignalCount: number;
  confidence: number;
  latestRun: XPulseWatchSummary["latestRun"];
}): string {
  if (!result.latestRun && result.signalCount === 0) {
    return "No stored scout proof — do not treat thematic watches as confirmed signals";
  }
  if (result.signalCount === 0) {
    return "Clean quiet day or no Wheat-admitted posts — high trust that silence is intentional, zero trust for inventing pressure";
  }
  const parts = [
    `Composite confidence ${Math.round(result.confidence * 100)}%`,
    `${result.prairieSignalCount}/${result.signalCount} prairie-weighted`,
  ];
  if (result.latestRun?.priceSnapshotStatus === "fresh") {
    parts.push("price snapshot fresh at scout time");
  } else if (result.latestRun?.priceSnapshotStatus) {
    parts.push(`price snapshot ${result.latestRun.priceSnapshotStatus}`);
  }
  return parts.join(" · ");
}

/**
 * Compute watch-only Wheat X sentiment for farmer card + Friday desk packet.
 * boardScore is the official Wheat scorecard aggregate (not modified by X).
 */
export function computeWheatXSentiment(
  watch: XPulseWatchSummary | null | undefined,
  boardScore?: number | null,
): WheatXSentimentResult {
  const boardStance = boardStanceFromScore(boardScore);
  const latestRun = watch?.latestRun ?? null;
  const wheatSignals = (watch?.topSignals ?? []).filter(isWheatSignal);

  const ranked: RankedWheatXSignal[] = wheatSignals.map((signal) => {
    const tier = signal.sourceCredTier ?? "unlisted";
    const tWeight = tierWeight(tier);
    const locWeight = locationWeight(signal);
    const rWeight = recencyWeight(signal.postDate, latestRun?.runDate ?? null);
    const conf = confidence01(signal.confidenceScore);
    const dir = directionScore(signal.sentiment);
    const corroborationBoost =
      (signal.corroboration.sameClaimCount >= 2 ? 0.08 : 0) +
      (signal.corroboration.officialSourceMatch ? 0.07 : 0);

    // Weighted contribution toward -1..+1 lean (direction-aware)
    const contribution =
      dir *
      (tWeight * WHEAT_X_RANKING_NOTES.weights.sourceTier +
        locWeight * WHEAT_X_RANKING_NOTES.weights.location +
        conf * WHEAT_X_RANKING_NOTES.weights.directionTimesConfidence +
        rWeight * WHEAT_X_RANKING_NOTES.weights.recency +
        corroborationBoost * WHEAT_X_RANKING_NOTES.weights.corroboration);

    // Soft relevance dampener so low-relevance posts do not dominate
    const relevanceDamp = clamp((signal.relevanceScore || 50) / 100, 0.35, 1);

    return {
      id: signal.id,
      url: signal.postUrl,
      handle: signal.postAuthor ?? "unknown",
      quote: sanitizePublicAdviceCopy(signal.postSummary),
      direction: signal.sentiment,
      tier,
      tierWeight: tWeight,
      locationWeight: locWeight,
      recencyWeight: rWeight,
      confidence: conf,
      relevanceScore: signal.relevanceScore,
      weightedContribution: Number((contribution * relevanceDamp).toFixed(4)),
      postedAt: signal.postDate,
      needsOfficialVerification: signal.needsOfficialVerification,
      regions: signal.affectedRegions,
    };
  });

  ranked.sort((a, b) => Math.abs(b.weightedContribution) - Math.abs(a.weightedContribution));

  const totalWeight = ranked.reduce((sum, item) => sum + Math.abs(item.weightedContribution) + 0.001, 0);
  const rawScore =
    ranked.length === 0
      ? 0
      : ranked.reduce((sum, item) => sum + item.weightedContribution, 0) / Math.max(totalWeight, 0.001);

  // Normalize into a readable -1..1 band for desk display
  const wheatSentimentScore = Number(clamp(rawScore * 2.2, -1, 1).toFixed(3));
  const prairieSignalCount = ranked.filter((item) => item.locationWeight >= 0.9).length;
  const lean = leanFromScore(wheatSentimentScore, ranked.length);
  const confidence =
    ranked.length === 0
      ? 0
      : Number(
          clamp(
            ranked.reduce((sum, item) => sum + item.confidence * item.tierWeight, 0) / ranked.length +
              (prairieSignalCount > 0 ? 0.05 : 0) +
              (ranked.length >= 3 ? 0.05 : 0),
            0,
            0.95,
          ).toFixed(2),
        );

  const tension = buildTensionNote(lean, boardStance, ranked.length);

  return {
    wheatSentimentScore,
    lean,
    confidence,
    signalCount: ranked.length,
    prairieSignalCount,
    topSignals: ranked.slice(0, 3),
    tensionNote: tension.note,
    tensionAlignment: tension.alignment,
    boardStance,
    thematicWatches: WHEAT_THEMATIC_WATCHES,
    rankingNotes: WHEAT_X_RANKING_NOTES,
    dataProvenance: {
      sourceTables: ["x_scout_runs", "x_market_signals"],
      scoutRunner: latestRun?.runner ?? null,
      scoutMode: latestRun?.mode ?? null,
      runDate: latestRun?.runDate ?? null,
      runStartedAt: latestRun?.runStartedAt ?? null,
      priceSnapshotStatus: latestRun?.priceSnapshotStatus ?? null,
      acceptedSignalCount: latestRun?.acceptedSignalCount ?? ranked.length,
      rejectedSignalCount: latestRun?.rejectedSignalCount ?? 0,
      artifactPath: latestRun?.artifactPath ?? null,
      recencyLabel: recencyLabel(latestRun?.runStartedAt ?? null, latestRun?.runDate ?? null),
      trustLabel: trustLabel({
        signalCount: ranked.length,
        prairieSignalCount,
        confidence,
        latestRun,
      }),
    },
  };
}

export function wheatXLeanLabel(lean: WheatXLean): string {
  switch (lean) {
    case "strong_bullish":
      return "Strongly bullish on X";
    case "lean_bullish":
      return "Leaning bullish on X";
    case "lean_bearish":
      return "Leaning bearish on X";
    case "strong_bearish":
      return "Strongly bearish on X";
    case "quiet":
      return "Quiet day on X";
    default:
      return "Neutral / mixed on X";
  }
}
