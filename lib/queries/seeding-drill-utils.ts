// lib/queries/seeding-drill-utils.ts
// Client-safe types + pure helpers. NO Supabase imports.

export interface SeasonRow {
  week_ending: string;
  planted_pct: number | null;
  emerged_pct: number | null;
  harvested_pct: number | null;
  good_excellent_pct: number | null;
}

export interface FiveYearAvgRow {
  week_ending: string; // representative week (current year's matching week)
  avg_planted_pct: number | null;
}

export interface ConditionSegment {
  label: "VP" | "P" | "F" | "G" | "E";
  pct: number;
  color: string;
}

export interface FuturesPoint {
  date: string;
  settle: number;
}

export interface FuturesSummary {
  ticker: string;
  contract_label: string;
  points: FuturesPoint[];
  last_settle: number | null;
  wow_pct: number | null;
}

export interface CashBidRow {
  facility_name: string;
  cash_price: number | null;
  basis: number | null;
  fsa_code: string;
  distance_km: number | null;
}

export interface WasdeOutlook {
  report_month: string | null;
  ending_stocks_kt: number | null;
  stocks_to_use_pct: number | null;
  mom_revision_direction: "up" | "down" | "flat" | null;
  unit: string;
}

export interface DrillData {
  state_code: string;
  state_name: string;
  commodity: string;
  current_week: string | null;
  season: SeasonRow[];
  five_year_avg: FiveYearAvgRow[];
  condition_segments: ConditionSegment[] | null;
  ge_pct: number | null;
  ge_yoy_change: number | null;
  futures: FuturesSummary | null;
  cash_bids: CashBidRow[];
  wasde: WasdeOutlook | null;
}

const COMMODITY_TO_TICKER: Record<string, { ticker: string; label: string }> = {
  CORN: { ticker: "ZC", label: "Corn (ZC)" },
  SOYBEANS: { ticker: "ZS", label: "Soybeans (ZS)" },
  WHEAT: { ticker: "ZW", label: "Wheat (ZW)" },
  BARLEY: { ticker: "KE", label: "Barley (KE)" },
  OATS: { ticker: "ZO", label: "Oats (ZO)" },
};

export function tickerForCommodity(
  commodity: string,
): { ticker: string; label: string } {
  return (
    COMMODITY_TO_TICKER[commodity.toUpperCase()] ?? { ticker: "", label: commodity }
  );
}

export function buildConditionSegments(args: {
  very_poor: number | null;
  poor: number | null;
  fair: number | null;
  good: number | null;
  excellent: number | null;
}): ConditionSegment[] | null {
  const { very_poor, poor, fair, good, excellent } = args;
  if ([very_poor, poor, fair, good, excellent].every((v) => v === null)) return null;
  return [
    { label: "VP", pct: very_poor ?? 0, color: "#b8350f" },
    { label: "P", pct: poor ?? 0, color: "#d97706" },
    { label: "F", pct: fair ?? 0, color: "#a89060" },
    { label: "G", pct: good ?? 0, color: "#437a22" },
    { label: "E", pct: excellent ?? 0, color: "#7ba84e" },
  ];
}

export function commoditySlug(commodity: string): string {
  return commodity.toLowerCase();
}

/** Compute WoW % change from latest 2 settle prices. Returns null if not enough data. */
export function wowPctChange(points: FuturesPoint[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1)!.settle;
  // Find a point ~7 days back
  const target = sorted.find((p) => {
    const daysBack =
      (new Date(sorted.at(-1)!.date).getTime() - new Date(p.date).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysBack >= 6 && daysBack <= 8;
  });
  if (!target || !target.settle) return null;
  return ((latest - target.settle) / target.settle) * 100;
}
