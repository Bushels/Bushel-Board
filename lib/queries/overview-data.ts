// lib/queries/overview-data.ts
// Orchestrates all data fetches needed for the hybrid /overview redesign.
// Call this once from page.tsx; all fetches are parallelized.

import { createClient } from "@/lib/supabase/server";
import { ALL_GRAINS } from "@/lib/constants/grains";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { getMarketStances } from "@/lib/queries/market-stance";
import { getUsMarketStancesForOverview } from "@/lib/queries/us-market-stance";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import {
  getSupplyDispositionForGrains,
  type SupplyDisposition,
} from "@/lib/queries/supply-disposition";
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
  grainDeliveryBinRows: GrainDeliveryBinRow[];
  heroGrain: GrainStanceData | null;
  heroTrajectory: TrajectoryPoint[];
}

export interface GrainDeliveryBinRow {
  grain: string;
  slug: string;
  currentWeekDeliveriesKt: number;
  cropYearDeliveriesKt: number;
  productionKt: number;
  carryInKt: number;
  feedWasteKt: number;
  totalDomesticKt: number;
  startingSupplyKt: number;
  deliveredFromStartingSupplyKt: number;
  remainingInBinKt: number;
  remainingPct: number;
  lastYear: GrainStorageBenchmark | null;
  isApproximate: boolean;
}

export interface LatestCgcProducerDeliveryRow {
  grain: string;
  currentWeekDeliveriesKt: number;
  cropYearDeliveriesKt: number;
}

export interface GrainStorageBenchmark {
  cropYear: string;
  remainingPct: number;
  remainingInBinKt: number;
  startingSupplyKt: number;
  cropYearDeliveriesKt: number;
}

export interface HistoricalGrainStorageInput {
  cropYear: string;
  cgcRows: LatestCgcProducerDeliveryRow[];
  supplyRows: SupplyDisposition[];
}

interface CountryProducerDeliveryViewRow {
  grain: string | null;
  period: string | null;
  total_kt: number | string | null;
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

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0) || 0;
}

function getPreviousCropYears(cropYear: string, count: number): string[] {
  const [startYear, endYear] = cropYear.split("-").map((part) => Number(part));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return [];

  return Array.from(
    { length: count },
    (_, index) => `${startYear - index - 1}-${endYear - index - 1}`
  );
}

function buildStorageBenchmark(
  cropYear: string,
  cgc: LatestCgcProducerDeliveryRow | undefined,
  supply: SupplyDisposition | undefined
): GrainStorageBenchmark | null {
  const productionKt = toNumber(supply?.production_kt);
  const carryInKt = toNumber(supply?.carry_in_kt);
  const startingSupplyKt = productionKt + carryInKt;
  if (startingSupplyKt <= 0) return null;

  const cropYearDeliveriesKt = toNumber(cgc?.cropYearDeliveriesKt);
  const remainingInBinKt = Math.max(startingSupplyKt - cropYearDeliveriesKt, 0);
  const remainingPct = Number(((remainingInBinKt / startingSupplyKt) * 100).toFixed(1));

  return {
    cropYear,
    remainingPct,
    remainingInBinKt,
    startingSupplyKt,
    cropYearDeliveriesKt,
  };
}

export function buildGrainDeliveryBinRows(
  cgcRows: LatestCgcProducerDeliveryRow[],
  supplyRows: SupplyDisposition[],
  historicalInputs: HistoricalGrainStorageInput[] = []
): GrainDeliveryBinRow[] {
  const cgcByGrain = new Map(cgcRows.map((row) => [row.grain, row]));
  const supplyBySlug = new Map(supplyRows.map((row) => [row.grain_slug, row]));
  const historicalBySlug = new Map<string, GrainStorageBenchmark[]>();

  for (const input of historicalInputs) {
    const historicalCgcByGrain = new Map(input.cgcRows.map((row) => [row.grain, row]));
    const historicalSupplyBySlug = new Map(
      input.supplyRows.map((row) => [row.grain_slug, row])
    );

    for (const grain of ALL_GRAINS) {
      const benchmark = buildStorageBenchmark(
        input.cropYear,
        historicalCgcByGrain.get(grain.name),
        historicalSupplyBySlug.get(grain.slug)
      );
      if (!benchmark) continue;

      const existing = historicalBySlug.get(grain.slug) ?? [];
      existing.push(benchmark);
      historicalBySlug.set(grain.slug, existing);
    }
  }

  return ALL_GRAINS.map((grain) => {
    const cgc = cgcByGrain.get(grain.name);
    const supply = supplyBySlug.get(grain.slug);
    const historicalBenchmarks = historicalBySlug.get(grain.slug) ?? [];

    const productionKt = toNumber(supply?.production_kt);
    const carryInKt = toNumber(supply?.carry_in_kt);
    const feedWasteKt = toNumber(supply?.feed_waste_kt);
    const totalDomesticKt = toNumber(supply?.total_domestic_kt);
    const startingSupplyKt = productionKt + carryInKt;
    const currentWeekDeliveriesKt = toNumber(cgc?.currentWeekDeliveriesKt);
    const cropYearDeliveriesKt = toNumber(cgc?.cropYearDeliveriesKt);
    const remainingInBinKt = Math.max(startingSupplyKt - cropYearDeliveriesKt, 0);
    const deliveredFromStartingSupplyKt = Math.max(
      Math.min(cropYearDeliveriesKt, startingSupplyKt),
      0
    );
    const remainingPct =
      startingSupplyKt > 0
        ? Number(((remainingInBinKt / startingSupplyKt) * 100).toFixed(1))
        : 0;

    return {
      grain: grain.name,
      slug: grain.slug,
      currentWeekDeliveriesKt,
      cropYearDeliveriesKt,
      productionKt,
      carryInKt,
      feedWasteKt,
      totalDomesticKt,
      startingSupplyKt,
      deliveredFromStartingSupplyKt,
      remainingInBinKt,
      remainingPct,
      lastYear: historicalBenchmarks[0] ?? null,
      isApproximate: Boolean(supply?.is_approximate),
    };
  });
}

async function fetchCgcProducerDeliveries(
  cropYear: string,
  grainWeek: number
): Promise<LatestCgcProducerDeliveryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_country_producer_deliveries")
    .select("grain, period, total_kt")
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek)
    .in("period", ["Current Week", "Crop Year"]);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as CountryProducerDeliveryViewRow[];

  return ALL_GRAINS.map((grain) => {
    const grainRows = rows.filter((row) => row.grain === grain.name);
    return {
      grain: grain.name,
      currentWeekDeliveriesKt: grainRows
        .filter((row) => row.period === "Current Week")
        .reduce((sum, row) => sum + toNumber(row.total_kt), 0),
      cropYearDeliveriesKt: grainRows
        .filter((row) => row.period === "Crop Year")
        .reduce((sum, row) => sum + toNumber(row.total_kt), 0),
    };
  });
}

async function fetchHistoricalStorageInputs(
  grainWeek: number
): Promise<HistoricalGrainStorageInput[]> {
  const grainSlugs = ALL_GRAINS.map((grain) => grain.slug);
  const cropYears = getPreviousCropYears(CURRENT_CROP_YEAR, 1);

  return Promise.all(
    cropYears.map(async (cropYear) => {
      const [cgcRows, supplyRows] = await Promise.all([
        fetchCgcProducerDeliveries(cropYear, grainWeek),
        getSupplyDispositionForGrains(grainSlugs, cropYear),
      ]);

      return { cropYear, cgcRows, supplyRows };
    })
  );
}

async function fetchSpotPrices(): Promise<SpotPrice[]> {
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

  const [caResult, usResult, spotResult, cgcResult, supplyResult, historicalResult] = await Promise.all([
    safeQuery("CA stances overview", () => getMarketStances(grainWeek)),
    safeQuery("US stances overview", () => getUsMarketStancesForOverview(CURRENT_US_MARKET_YEAR)),
    safeQuery("spot prices overview", fetchSpotPrices),
    safeQuery("latest CGC producer deliveries panel", () =>
      fetchCgcProducerDeliveries(CURRENT_CROP_YEAR, grainWeek)
    ),
    safeQuery("AAFC supply panel", () =>
      getSupplyDispositionForGrains(ALL_GRAINS.map((grain) => grain.slug))
    ),
    safeQuery("last-year CGC storage benchmarks", () =>
      fetchHistoricalStorageInputs(grainWeek)
    ),
  ]);

  const caStances = caResult.data ?? [];
  const usStances = usResult.data ?? [];
  const spotPrices = spotResult.data ?? [];
  const grainDeliveryBinRows =
    cgcResult.error || supplyResult.error
      ? []
      : buildGrainDeliveryBinRows(
          cgcResult.data ?? [],
          supplyResult.data ?? [],
          historicalResult.data ?? []
        );

  const heroGrain = pickStrongestMove(caStances);
  const heroTrajectory = heroGrain
    ? await fetchTrajectory(heroGrain.grain).catch(() => [])
    : [];

  return {
    grainWeek,
    caStances,
    usStances,
    spotPrices,
    grainDeliveryBinRows,
    heroGrain,
    heroTrajectory,
  };
}
