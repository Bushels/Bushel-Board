/**
 * US Acreage Context Helper
 *
 * Pulls national USDA/NASS planted acreage rows from crop_acreage_estimates.
 * Used to make US thesis planting-progress reads farmer-readable with actual
 * planted-acre context instead of percentages only.
 */

import { createClient } from "@supabase/supabase-js";

export interface UsAcreageContext {
  market_year: number;
  commodity: string;
  planted_acres: number;
  planted_acres_million: number;
  source_program: string | null;
  source_release_date: string | null;
  freshness: "fresh" | "aging" | "stale";
}

type UsAcreageRow = {
  market_year: number;
  commodity: string;
  planted_acres: number | string | null;
  source_program: string | null;
  source_release_date: string | null;
  region_code?: string | null;
};

type QueryResult = {
  data: UsAcreageRow | null;
  error: { message: string } | null;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  ilike: (column: string, value: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
};

type QueryClient = {
  from: (table: string) => {
    select: (columns: string) => QueryBuilder;
  };
};

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function numericValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyUsAcreageFreshness(
  sourceReleaseDate: string | null,
  now: Date = new Date(),
): "fresh" | "aging" | "stale" {
  if (!sourceReleaseDate) return "stale";
  const daysSince = Math.floor((now.getTime() - new Date(sourceReleaseDate).getTime()) / (1000 * 3600 * 24));
  if (daysSince <= 180) return "fresh";
  if (daysSince <= 365) return "aging";
  return "stale";
}

export function pickLatestNationalUsAcreage(rows: UsAcreageRow[]): Omit<UsAcreageContext, "freshness" | "planted_acres_million"> | null {
  const nationalRows = rows
    .filter((row) => String(row.region_code ?? "").toUpperCase() === "US TOTAL")
    .filter((row) => numericValue(row.planted_acres) !== null)
    .sort((a, b) => {
      const dateCompare = String(b.source_release_date ?? "").localeCompare(String(a.source_release_date ?? ""));
      if (dateCompare !== 0) return dateCompare;
      return String(b.source_program ?? "").localeCompare(String(a.source_program ?? ""));
    });

  const row = nationalRows[0];
  const plantedAcres = numericValue(row?.planted_acres);
  if (!row || plantedAcres === null) return null;

  return {
    market_year: Number(row.market_year),
    commodity: String(row.commodity).toUpperCase(),
    planted_acres: plantedAcres,
    source_program: row.source_program,
    source_release_date: row.source_release_date,
  };
}

function normalizeUsAcreageContext(row: UsAcreageRow, now: Date): UsAcreageContext | null {
  const plantedAcres = numericValue(row.planted_acres);
  if (plantedAcres === null) return null;

  return {
    market_year: Number(row.market_year),
    commodity: String(row.commodity).toUpperCase(),
    planted_acres: plantedAcres,
    planted_acres_million: round(plantedAcres / 1_000_000, 2),
    source_program: row.source_program,
    source_release_date: row.source_release_date,
    freshness: classifyUsAcreageFreshness(row.source_release_date, now),
  };
}

export async function getLatestUsAcreageFromClient(
  supabase: QueryClient,
  commodity: string,
  marketYear: number,
  now: Date = new Date(),
): Promise<UsAcreageContext | null> {
  const { data, error } = await supabase
    .from("crop_acreage_estimates")
    .select("market_year,commodity,planted_acres,source_program,source_release_date")
    .ilike("commodity", commodity.toUpperCase())
    .eq("region_code", "US TOTAL")
    .eq("market_year", marketYear)
    .order("source_release_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeUsAcreageContext(data, now);
}

export async function getLatestUsAcreage(
  commodity: string,
  marketYear: number,
): Promise<UsAcreageContext | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  return getLatestUsAcreageFromClient(supabase as unknown as QueryClient, commodity, marketYear);
}
