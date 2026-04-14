import { createClient } from "@/lib/supabase/server";
import { US_OVERVIEW_MARKETS } from "@/lib/constants/us-markets";

export const CURRENT_US_MARKET_YEAR = 2025;
export const CURRENT_US_CROP_YEAR = "2025-2026";

export interface UsMarketAnalysis {
  market_name: string;
  crop_year: string;
  market_year: number;
  initial_thesis: string;
  bull_case: string;
  bear_case: string;
  final_assessment: string | null;
  stance_score: number;
  confidence_score: number | null;
  recommendation: string;
  data_confidence: "high" | "medium" | "low" | null;
  key_signals: Array<{
    signal: "bullish" | "bearish" | "watch";
    title: string;
    body: string;
    source: string;
  }>;
  data_freshness: Record<string, unknown> | null;
  llm_metadata: Record<string, unknown> | null;
  model_used: string;
  generated_at: string;
}

export interface UsGrainIntelligence {
  market_name: string;
  crop_year: string;
  market_year: number;
  thesis_title: string;
  thesis_body: string;
  insights: string[];
  kpi_data: Record<string, unknown>;
  llm_metadata: Record<string, unknown> | null;
  model_used: string;
  generated_at: string;
}

export interface UsScoreTrajectory {
  market_name: string;
  crop_year: string;
  market_year: number;
  recorded_at: string;
  scan_type: string;
  stance_score: number;
  conviction_pct: number | null;
  recommendation: string;
  trigger: string | null;
  evidence: unknown;
  data_freshness: Record<string, unknown> | null;
  model_source: string;
}

export interface UsMarketStance {
  market: string;
  score: number;
  priorScore: number | null;
  confidence: "high" | "medium" | "low";
  futuresPrice: string | null;
  futuresChangePct: number | null;
  recommendation: string | null;
}

export async function getUsMarketAnalysis(
  marketName: string,
  marketYear = CURRENT_US_MARKET_YEAR,
): Promise<UsMarketAnalysis | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("us_market_analysis")
    .select("*")
    .eq("market_name", marketName)
    .eq("market_year", marketYear)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as UsMarketAnalysis;
}

export async function getUsGrainIntelligence(
  marketName: string,
  marketYear = CURRENT_US_MARKET_YEAR,
): Promise<UsGrainIntelligence | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("us_grain_intelligence")
    .select("*")
    .eq("market_name", marketName)
    .eq("market_year", marketYear)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as UsGrainIntelligence;
}

export async function getLatestUsScoreTrajectory(
  marketName: string,
  marketYear = CURRENT_US_MARKET_YEAR,
): Promise<UsScoreTrajectory | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("us_score_trajectory")
    .select("*")
    .eq("market_name", marketName)
    .eq("market_year", marketYear)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as UsScoreTrajectory;
}

export async function getUsMarketStances(
  marketYear = CURRENT_US_MARKET_YEAR,
): Promise<UsMarketStance[]> {
  const supabase = await createClient();

  const [currentRes, priorRes, priceRes] = await Promise.all([
    supabase
      .from("us_market_analysis")
      .select("market_name, stance_score, data_confidence, recommendation, generated_at")
      .eq("market_year", marketYear)
      .in("market_name", US_OVERVIEW_MARKETS.map((market) => market.name))
      .order("generated_at", { ascending: false }),
    supabase
      .from("us_market_analysis")
      .select("market_name, stance_score")
      .eq("market_year", marketYear - 1)
      .in("market_name", US_OVERVIEW_MARKETS.map((market) => market.name)),
    supabase
      .from("grain_prices")
      .select("grain, settlement_price, change_pct, price_date")
      .in("grain", US_OVERVIEW_MARKETS.map((market) => market.futuresGrain))
      .order("price_date", { ascending: false }),
  ]);

  if (currentRes.error) {
    console.error("Failed to fetch US market stances:", currentRes.error);
    return [];
  }

  const currentRows = currentRes.data ?? [];
  const priorRows = priorRes.data ?? [];
  const priceRows = priceRes.data ?? [];

  const currentMap = new Map<string, {
    stance_score: number;
    data_confidence: "high" | "medium" | "low" | null;
    recommendation: string | null;
  }>();
  for (const row of currentRows) {
    if (!currentMap.has(row.market_name)) {
      currentMap.set(row.market_name, {
        stance_score: Number(row.stance_score ?? 0),
        data_confidence: (row.data_confidence as "high" | "medium" | "low" | null) ?? "low",
        recommendation: row.recommendation ? String(row.recommendation) : null,
      });
    }
  }

  const priorMap = new Map(priorRows.map((row) => [String(row.market_name), row.stance_score == null ? null : Number(row.stance_score)]));
  const priceMap = new Map<string, { futuresPrice: string; futuresChangePct: number | null }>();
  for (const row of priceRows) {
    if (!priceMap.has(row.grain)) {
      priceMap.set(row.grain, {
        futuresPrice: `$${Number(row.settlement_price).toFixed(2)}`,
        futuresChangePct: row.change_pct == null ? null : Number(row.change_pct),
      });
    }
  }

  return US_OVERVIEW_MARKETS.map((market) => {
    const current = currentMap.get(market.name);
    const price = priceMap.get(market.futuresGrain);
    return {
      market: market.name,
      score: current?.stance_score ?? 0,
      priorScore: priorMap.get(market.name) ?? null,
      confidence: current?.data_confidence ?? "low",
      futuresPrice: price?.futuresPrice ?? null,
      futuresChangePct: price?.futuresChangePct ?? null,
      recommendation: current?.recommendation ?? null,
    };
  });
}
