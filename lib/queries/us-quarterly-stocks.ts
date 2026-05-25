/**
 * US Quarterly Stocks Context Helper
 *
 * Pulls the latest quarterly stocks data and compares it to WASDE estimates.
 * Used to enrich the US thesis packet with actual stocks surprises.
 */

import { createClient } from "@supabase/supabase-js";

export interface QuarterlyStocksContext {
  latest_report_date: string | null;
  commodity: string;
  total_stocks_kt: number | null;
  vs_wasde_estimate_kt: number | null;
  change_vs_year_ago_pct: number | null;
  freshness: "fresh" | "aging" | "stale";
}

type QuarterlyStocksRow = {
  report_date: string;
  commodity: string;
  total_stocks_kt: number | null;
  vs_wasde_estimate_kt: number | null;
  change_vs_year_ago_pct: number | null;
};

type QueryResult = {
  data: QuarterlyStocksRow | null;
  error: { message: string } | null;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  ilike: (column: string, value: string) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
};

type QueryClient = {
  from: (table: string) => {
    select: (columns: string) => QueryBuilder;
  };
};

export function classifyQuarterlyStocksFreshness(
  reportDate: string | null,
  now: Date = new Date()
): "fresh" | "aging" | "stale" {
  if (!reportDate) return "stale";
  const daysSince = Math.floor((now.getTime() - new Date(reportDate).getTime()) / (1000 * 3600 * 24));
  if (daysSince <= 100) return "fresh";
  if (daysSince <= 125) return "aging";
  return "stale";
}

export async function getLatestQuarterlyStocksFromClient(
  supabase: QueryClient,
  commodity: string,
  now: Date = new Date()
): Promise<QuarterlyStocksContext | null> {
  const { data, error } = await supabase
    .from("usda_quarterly_stocks")
    .select("report_date,commodity,total_stocks_kt,vs_wasde_estimate_kt,change_vs_year_ago_pct")
    .ilike("commodity", commodity.toUpperCase())
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    latest_report_date: data.report_date,
    commodity: data.commodity,
    total_stocks_kt: data.total_stocks_kt,
    vs_wasde_estimate_kt: data.vs_wasde_estimate_kt,
    change_vs_year_ago_pct: data.change_vs_year_ago_pct,
    freshness: classifyQuarterlyStocksFreshness(data.report_date, now),
  };
}

export async function getLatestQuarterlyStocks(commodity: string): Promise<QuarterlyStocksContext | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  return getLatestQuarterlyStocksFromClient(supabase as unknown as QueryClient, commodity);
}
