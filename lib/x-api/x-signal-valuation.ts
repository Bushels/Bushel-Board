import type { XScoutSignal } from "@/lib/x-api/x-scout-contract";
import { getSourceCredTier, sourceTierBoost, type SourceCredTier } from "@/lib/x-api/trusted-accounts";

export type StalenessClass = "same_day" | "fresh_72h" | "week_context" | "stale";
export type PriceSnapshotStatus = "not_checked" | "fresh" | "stale" | "missing" | "partial";

const HIGH_SENSITIVITY_CATEGORIES = new Set(["weather", "basis", "elevator_bid", "price"]);
const STRUCTURAL_CATEGORIES = new Set(["policy", "export_news", "analyst_commentary"]);

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 999;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}

export function classifyStaleness(
  postedAt: string,
  runDate: string,
  category: string,
): StalenessClass {
  const ageDays = daysBetween(postedAt, `${runDate}T23:59:59Z`);
  if (ageDays <= 1) return "same_day";
  if (ageDays <= 3) return "fresh_72h";
  if (ageDays <= 7) return "week_context";
  if (STRUCTURAL_CATEGORIES.has(category) && ageDays <= 14) return "week_context";
  return HIGH_SENSITIVITY_CATEGORIES.has(category) ? "stale" : "week_context";
}

export function stalenessScore(staleness: StalenessClass): number {
  if (staleness === "same_day") return 15;
  if (staleness === "fresh_72h") return 11;
  if (staleness === "week_context") return 6;
  return 0;
}

export function classifySeasonalPhase(text: string, fallback = "unknown"): string {
  const value = text.toLowerCase();
  if (/\b(seeding|seeded|planting|planted|emergence|emerged)\b/.test(value)) return "planting";
  if (/\b(heading|flowering|pollination|silking)\b/.test(value)) return "heading";
  if (/\b(grain fill|filling|milk stage|dough stage)\b/.test(value)) return "grain_fill";
  if (/\b(harvest|swathing|combine|combining|cutting)\b/.test(value)) return "harvest";
  if (/\b(basis|elevator|bin|binned|selling|deliveries|marketing)\b/.test(value)) return "marketing";
  return fallback;
}

export function sourceTierScore(tier: SourceCredTier): number {
  if (tier === "tier1") return 10;
  if (tier === "tier2") return 8;
  if (tier === "tier3") return 9;
  if (tier === "tier4") return 4;
  return 2;
}

export function signalCategoryBase(signal: Pick<XScoutSignal, "category" | "summary" | "why_it_matters">): number {
  if (signal.category === "weather") return 28;
  if (signal.category === "export_news") return 24;
  if (signal.category === "elevator_bid" || signal.category === "basis") return 20;
  if (signal.category === "logistics") return 20;
  if (signal.category === "policy") return 18;
  if (signal.category === "price") return 16;
  if (signal.category === "farmer_report") return 15;
  if (signal.category === "analyst_commentary") return 14;
  return /\b(drought|frost|flood|delay|strike|tariff|export)\b/i.test(
    `${signal.summary} ${signal.why_it_matters}`,
  )
    ? 16
    : 10;
}

export interface SignalValuation {
  relevanceScore: number;
  stalenessClass: StalenessClass;
  sourceTier: SourceCredTier;
  seasonalPhase: string;
  impactBreakdown: {
    supply: number;
    demand: number;
    price: number;
    logistics: number;
    policy: number;
    confidence: number;
  };
}

export function scoreXSignalImpact(
  signal: XScoutSignal,
  runDate: string,
  priceSnapshotStatus: PriceSnapshotStatus = "not_checked",
): SignalValuation {
  const sourceTier = getSourceCredTier(signal.handle);
  const stalenessClass = classifyStaleness(signal.posted_at, runDate, signal.category);
  const seasonalPhase = classifySeasonalPhase(
    `${signal.summary} ${signal.why_it_matters} ${signal.seasonal_phase}`,
    signal.seasonal_phase || "unknown",
  );
  const supply =
    signal.category === "weather" || /plant|seed|harvest|yield|stocks|drought|frost/i.test(signal.summary)
      ? signalCategoryBase(signal)
      : 0;
  const demand = signal.category === "export_news" ? 24 : 0;
  const price =
    signal.category === "price" || signal.category === "basis" || signal.category === "elevator_bid"
      ? priceSnapshotStatus === "fresh"
        ? 18
        : 8
      : 0;
  const logistics = signal.category === "logistics" ? 18 : 0;
  const policy = signal.category === "policy" ? 16 : 0;
  const confidence = Math.round(signal.confidence * 20);
  const breadth = clamp(signal.affected_grains.length + signal.affected_regions.length, 0, 10);
  const phaseBonus = ["grain_fill", "heading", "planting", "harvest"].includes(seasonalPhase) ? 8 : 0;
  const relevanceScore = clamp(
    Math.max(supply, demand, price, logistics, policy, signalCategoryBase(signal)) +
      sourceTierBoost(signal.handle) +
      sourceTierScore(sourceTier) +
      stalenessScore(stalenessClass) +
      confidence +
      breadth +
      phaseBonus,
  );

  return {
    relevanceScore,
    stalenessClass,
    sourceTier,
    seasonalPhase,
    impactBreakdown: { supply, demand, price, logistics, policy, confidence },
  };
}
