// lib/queries/overview-data.ts
// Orchestrates all data fetches needed for the hybrid /overview redesign.
// Call this once from page.tsx; all fetches are parallelized.

import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { getMarketStances } from "@/lib/queries/market-stance";
import { getUsMarketStancesForOverview } from "@/lib/queries/us-market-stance";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { safeQuery } from "@/lib/utils/safe-query";
import type { GrainStanceData } from "@/components/dashboard/market-stance-chart";

export interface SpotPrice {
  grain: string;
  symbol: string;
  settlementPrice: number;
  changeAmount: number;
  changePct: number;
  unit: string;
  priceDate: string;
}

export interface TrajectoryPoint {
  recordedAt: string;
  stanceScore: number;
  scanType: string;
}

export interface OverviewData {
  grainWeek: number;
  caStances: GrainStanceData[];
  usStances: GrainStanceData[];
  spotPrices: SpotPrice[];
  heroGrain: GrainStanceData | null;
  heroTrajectory: TrajectoryPoint[];
}

// Grains in grain_prices that map to CBOT futures shown on the spot rail
const SPOT_GRAINS: { grain: string; symbol: string; unit: string }[] = [
  { grain: "Corn", symbol: "ZC", unit: "/bu" },
  { grain: "Soybeans", symbol: "ZS", unit: "/bu" },
  { grain: "Wheat", symbol: "ZW", unit: "/bu" },
  { grain: "Oats", symbol: "ZO", unit: "/bu" },
];

/** Pick the grain with the highest |stance_score| from CA stances. */
export function pickStrongestMove(stances: GrainStanceData[]): GrainStanceData | null {
  if (!stances.length) return null;
  return stances.reduce<GrainStanceData | null>((best, row) => {
    if (!best) return row;
    return Math.abs(row.score) > Math.abs(best.score) ? row : best;
  }, null);
}

/** WoW % change helper — avoids division by zero. */
export function computeWow(current: number, prior: number): number | null {
  if (!prior) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export async function fetchSpotPrices(): Promise<SpotPrice[]> {
  const supabase = await createClient();
  const grainNames = SPOT_GRAINS.map((g) => g.grain);

  const { data, error } = await supabase
    .from("grain_prices")
    .select("grain, settlement_price, change_amount, change_pct, unit, price_date")
    .in("grain", grainNames)
    .order("price_date", { ascending: false });

  if (error || !data) return [];

  // Dedupe to latest per grain
  const seen = new Set<string>();
  const results: SpotPrice[] = [];
  for (const row of data) {
    if (seen.has(row.grain)) continue;
    seen.add(row.grain);
    const def = SPOT_GRAINS.find((g) => g.grain === row.grain);
    if (!def) continue;
    results.push({
      grain: row.grain,
      symbol: def.symbol,
      settlementPrice: Number(row.settlement_price),
      changeAmount: Number(row.change_amount),
      changePct: Number(row.change_pct),
      unit: def.unit,
      priceDate: String(row.price_date),
    });
  }
  return results;
}

async function fetchTrajectory(grain: string): Promise<TrajectoryPoint[]> {
  const supabase = await createClient();

  // Grab last 7 entries for the hero grain (weekly + collector ticks)
  const { data, error } = await supabase
    .from("score_trajectory")
    .select("recorded_at, stance_score, scan_type")
    .eq("crop_year", CURRENT_CROP_YEAR)
    .eq("grain", grain)
    .not("stance_score", "is", null)
    .order("recorded_at", { ascending: false })
    .limit(7);

  if (error || !data) return [];

  return data
    .slice()
    .reverse()
    .map((row) => ({
      recordedAt: String(row.recorded_at),
      stanceScore: Number(row.stance_score),
      scanType: String(row.scan_type),
    }));
}

export async function fetchOverviewData(): Promise<OverviewData> {
  const grainWeek = await getLatestImportedWeek();

  const [caResult, usResult, spotResult] = await Promise.all([
    safeQuery("CA stances overview", () => getMarketStances(grainWeek)),
    safeQuery("US stances overview", () => getUsMarketStancesForOverview(CURRENT_US_MARKET_YEAR)),
    safeQuery("spot prices overview", fetchSpotPrices),
  ]);

  const caStances = caResult.data ?? [];
  const usStances = usResult.data ?? [];
  const spotPrices = spotResult.data ?? [];

  const heroGrain = pickStrongestMove(caStances);
  const heroTrajectory = heroGrain
    ? await fetchTrajectory(heroGrain.grain).catch(() => [])
    : [];

  return {
    grainWeek,
    caStances,
    usStances,
    spotPrices,
    heroGrain,
    heroTrajectory,
  };
}
