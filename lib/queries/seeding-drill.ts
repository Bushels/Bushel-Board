// lib/queries/seeding-drill.ts
// Server-only. Fetches multi-track drill data for a US state + commodity.

import { createClient } from "@/lib/supabase/server";
import {
  buildConditionSegments,
  tickerForCommodity,
  wowPctChange,
  type DrillData,
  type SeasonRow,
  type FiveYearAvgRow,
  type FuturesPoint,
  type CashBidRow,
  type WasdeOutlook,
} from "@/lib/queries/seeding-drill-utils";

export type { DrillData } from "@/lib/queries/seeding-drill-utils";

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const COMMODITY_TO_CGC: Record<string, string> = {
  CORN: "Corn",
  SOYBEANS: "Soybeans",
  WHEAT: "Wheat",
  BARLEY: "Barley",
  OATS: "Oats",
};

function cgcGrainFor(commodity: string): string {
  return COMMODITY_TO_CGC[commodity.toUpperCase()] ?? commodity;
}

/** Simple in-process cache so repeated calls within one request don't re-hit DB. */
const STATE_NAME_CACHE = new Map<string, string>();

async function stateCodeToName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
): Promise<string> {
  if (STATE_NAME_CACHE.has(code)) return STATE_NAME_CACHE.get(code)!;
  const { data } = await supabase
    .from("us_state_centroids")
    .select("state_name")
    .eq("state_code", code)
    .maybeSingle();
  const name = (data as { state_name?: string } | null)?.state_name ?? code;
  STATE_NAME_CACHE.set(code, name);
  return name;
}

/** posted_prices is FSA-keyed. Without a state→FSA proximity helper, return [] for now. */
async function fetchCashBidsForState(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  _stateCode: string,
  _commodity: string,
): Promise<CashBidRow[]> {
  // TODO: when a state→FSA proximity lookup exists, wire via get_area_prices.
  return [];
}

function wasdeFromRpc(data: unknown): WasdeOutlook | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const latest = data[0] as Record<string, unknown>;
  const previous = (data[1] ?? null) as Record<string, unknown> | null;
  const stocks = num(latest.ending_stocks_kt);
  const prevStocks = previous ? num(previous.ending_stocks_kt) : null;
  let direction: "up" | "down" | "flat" | null = null;
  if (stocks !== null && prevStocks !== null) {
    direction = stocks > prevStocks ? "up" : stocks < prevStocks ? "down" : "flat";
  }
  return {
    report_month:
      typeof latest.report_month === "string" ? latest.report_month : null,
    ending_stocks_kt: stocks,
    stocks_to_use_pct: num(latest.stocks_to_use_pct),
    mom_revision_direction: direction,
    unit: typeof latest.unit === "string" ? latest.unit : "kt",
  };
}

export async function getStateDrillData(
  stateCode: string,
  commodity: string,
  marketYear: number,
): Promise<DrillData> {
  const supabase = await createClient();
  const upperCommodity = commodity.toUpperCase();
  const stateName = await stateCodeToName(supabase, stateCode);

  // 1. Season trajectory + condition rows for this state
  const seasonPromise = supabase
    .from("usda_crop_progress")
    .select(
      [
        "week_ending",
        "planted_pct",
        "emerged_pct",
        "harvested_pct",
        "good_excellent_pct",
        "condition_very_poor_pct",
        "condition_poor_pct",
        "condition_fair_pct",
        "condition_good_pct",
        "condition_excellent_pct",
        "ge_pct_yoy_change",
      ].join(","),
    )
    .eq("commodity", upperCommodity)
    .ilike("state", stateName)
    .eq("crop_year", marketYear)
    .order("week_ending", { ascending: true });

  // 2. 5-year average planted pct per week (previous 5 crop years)
  const fiveYearPromise = supabase
    .from("usda_crop_progress")
    .select("week_ending,planted_pct,crop_year")
    .eq("commodity", upperCommodity)
    .ilike("state", stateName)
    .gte("crop_year", marketYear - 5)
    .lt("crop_year", marketYear);

  // 3. CBOT futures (last 90 days)
  const { ticker, label } = tickerForCommodity(upperCommodity);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const futuresPromise = ticker
    ? supabase
        .from("grain_prices")
        .select("price_date,settle_price")
        .eq("symbol", ticker)
        .gte("price_date", cutoff.toISOString().slice(0, 10))
        .order("price_date", { ascending: true })
    : Promise.resolve({
        data: [] as Array<{ price_date: string; settle_price: number | string }>,
        error: null,
      });

  // 4. WASDE outlook
  const wasdePromise = supabase.rpc("get_usda_wasde_context", {
    p_cgc_grain: cgcGrainFor(upperCommodity),
    p_months_back: 2,
  });

  const [seasonRes, fiveYearRes, futuresRes, wasdeRes] = await Promise.all([
    seasonPromise,
    fiveYearPromise,
    futuresPromise,
    wasdePromise,
  ]);

  // Map season rows — cast via unknown to avoid Supabase generic type conflicts
  type SeasonRaw = Record<string, unknown>;
  const seasonRawArr = (seasonRes.data ?? []) as unknown as SeasonRaw[];
  const season: SeasonRow[] = seasonRawArr.map((r) => ({
    week_ending: String(r.week_ending),
    planted_pct: num(r.planted_pct),
    emerged_pct: num(r.emerged_pct),
    harvested_pct: num(r.harvested_pct),
    good_excellent_pct: num(r.good_excellent_pct),
  }));

  const latestRow = seasonRawArr.at(-1) ?? null;
  const conditionSegments = latestRow
    ? buildConditionSegments({
        very_poor: num(latestRow.condition_very_poor_pct),
        poor: num(latestRow.condition_poor_pct),
        fair: num(latestRow.condition_fair_pct),
        good: num(latestRow.condition_good_pct),
        excellent: num(latestRow.condition_excellent_pct),
      })
    : null;

  // 5-year avg: group by MM-DD across years, average planted_pct
  type FiveYearRaw = { week_ending: string; planted_pct: unknown; crop_year: unknown };
  const buckets = new Map<string, number[]>();
  for (const r of (fiveYearRes.data ?? []) as FiveYearRaw[]) {
    const wk = String(r.week_ending).slice(5); // MM-DD
    const v = num(r.planted_pct);
    if (v === null) continue;
    if (!buckets.has(wk)) buckets.set(wk, []);
    buckets.get(wk)!.push(v);
  }
  const fiveYearAvg: FiveYearAvgRow[] = Array.from(buckets.entries())
    .map(([mmdd, values]) => ({
      week_ending: `${marketYear}-${mmdd}`,
      avg_planted_pct: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => a.week_ending.localeCompare(b.week_ending));

  // Futures
  type FuturesRaw = { price_date: string; settle_price: number | string };
  const points: FuturesPoint[] = ((futuresRes.data ?? []) as FuturesRaw[]).map(
    (r) => ({
      date: String(r.price_date),
      settle: Number(r.settle_price),
    }),
  );
  const last_settle = points.at(-1)?.settle ?? null;
  const wow_pct = wowPctChange(points);

  const cashBids = await fetchCashBidsForState(supabase, stateCode, upperCommodity);

  const wasde: WasdeOutlook | null = wasdeFromRpc(wasdeRes.data);

  return {
    state_code: stateCode,
    state_name: stateName,
    commodity: upperCommodity,
    current_week:
      latestRow?.week_ending ? String(latestRow.week_ending) : null,
    season,
    five_year_avg: fiveYearAvg,
    condition_segments: conditionSegments,
    ge_pct: latestRow ? num(latestRow.good_excellent_pct) : null,
    ge_yoy_change: latestRow ? num(latestRow.ge_pct_yoy_change) : null,
    futures:
      points.length > 0
        ? { ticker, contract_label: label, points, last_settle, wow_pct }
        : null,
    cash_bids: cashBids,
    wasde,
  };
}
