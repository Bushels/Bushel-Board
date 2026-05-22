/**
 * USDA Quarterly Grain Stocks Importer
 *
 * Parses normalized USDA NASS QuickStats CSV/XLSX exports for quarterly grain
 * stocks and upserts rows into public.usda_quarterly_stocks.
 *
 * Usage:
 *   npx tsx scripts/import-usda-quarterly-stocks.ts --file data/usda/quarterly-stocks.csv
 *   npx tsx scripts/import-usda-quarterly-stocks.ts --dry-run --file ...
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { existsSync, readFileSync } from "fs";
import * as XLSX from "xlsx";

import { writeSourceRun } from "./source-run";

dotenv.config({ path: ".env.local" });

export interface QuarterlyStocksInput {
  report_date: string;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  commodity: string;
  cgc_grain: string | null;
  on_farm_kt: number | null;
  off_farm_kt: number | null;
  total_stocks_kt: number;
  year_ago_total_kt: number | null;
  change_vs_year_ago_pct: number | null;
  source?: string;
}

export interface QuarterlyStocksContext {
  latest_report_date: string | null;
  commodity: string;
  total_stocks_kt: number | null;
  vs_wasde_estimate_kt: number | null;
  change_vs_year_ago_pct: number | null;
  freshness: "fresh" | "aging" | "stale";
}

type QuickStatsRow = Record<string, unknown>;

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

const BUSHEL_POUNDS_BY_COMMODITY: Record<string, number> = {
  BARLEY: 48,
  CORN: 56,
  OATS: 32,
  SOYBEANS: 60,
  WHEAT: 60,
  SORGHUM: 56,
};

const CGC_GRAIN_BY_COMMODITY: Record<string, string> = {
  BARLEY: "Barley",
  CANOLA: "Canola",
  CORN: "Corn",
  OATS: "Oats",
  SOYBEANS: "Soybeans",
  WHEAT: "Wheat",
  SORGHUM: "Sorghum",
};

function stringValue(row: QuickStatsRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function numberValue(row: QuickStatsRow, ...keys: string[]): number | null {
  const value = stringValue(row, ...keys).replace(/,/g, "").replace(/\(D\)/gi, "").trim();
  if (!value || value === "--") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, decimals = 0): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function bushelsToKilotonnes(bushels: number, commodity: string): number {
  const poundsPerBushel = BUSHEL_POUNDS_BY_COMMODITY[commodity];
  if (!poundsPerBushel) {
    throw new Error(`Unsupported quarterly-stocks commodity for bushel conversion: ${commodity}`);
  }
  return round((bushels * poundsPerBushel * 0.45359237) / 1_000_000, 0);
}

function valueToKilotonnes(value: number, commodity: string, unit: string): number {
  const normalizedUnit = unit.toUpperCase();
  if (normalizedUnit === "LB") {
    return round((value * 0.45359237) / 1_000_000, 0);
  }
  if (normalizedUnit === "BU") {
    return bushelsToKilotonnes(value, commodity);
  }
  throw new Error(`Unsupported quarterly-stocks unit for ${commodity}: ${unit}`);
}

function reportQuarter(reportDate: string): "Q1" | "Q2" | "Q3" | "Q4" {
  const month = Number(reportDate.slice(5, 7));
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

export function parseQuarterlyStocksReportDate(referencePeriod: string, year: number): string {
  const normalized = referencePeriod.toUpperCase().replace(/\s+/g, " ").trim();
  const monthByToken: Record<string, string> = {
    JAN: "01",
    MAR: "03",
    JUN: "06",
    SEP: "09",
    DEC: "12",
  };
  const firstOfMatch = normalized.match(/^FIRST OF (JAN|MAR|JUN|SEP|DEC)$/);
  if (firstOfMatch) {
    return `${year}-${monthByToken[firstOfMatch[1]]}-01`;
  }

  const match = normalized.match(/^(JAN|MAR|JUN|SEP|DEC)\s+(\d{1,2})/);
  if (!match) throw new Error(`Unsupported quarterly stocks reference period: ${referencePeriod}`);
  return `${year}-${monthByToken[match[1]]}-${match[2].padStart(2, "0")}`;
}

function stockScope(row: QuickStatsRow): "total" | "on_farm" | "off_farm" | null {
  const text = [
    stringValue(row, "domaincat_desc"),
    stringValue(row, "prodn_practice_desc"),
    stringValue(row, "short_desc"),
  ]
    .join(" ")
    .toUpperCase();
  if (text.includes("ON FARM")) return "on_farm";
  if (text.includes("OFF FARM")) return "off_farm";
  return "total";
}

function isQuarterlyStockRow(row: QuickStatsRow): boolean {
  const statistic = stringValue(row, "statisticcat_desc").toUpperCase();
  const referencePeriod = stringValue(row, "reference_period_desc").toUpperCase();
  const aggLevel = stringValue(row, "agg_level_desc").toUpperCase();
  const classDesc = stringValue(row, "class_desc").toUpperCase();
  return (
    statistic === "STOCKS" &&
    ["JAN 1", "MAR 1", "JUN 1", "SEP 1", "DEC 1", "FIRST OF JAN", "FIRST OF MAR", "FIRST OF JUN", "FIRST OF SEP", "FIRST OF DEC"].includes(referencePeriod) &&
    (!aggLevel || aggLevel === "NATIONAL") &&
    (!classDesc || classDesc === "ALL CLASSES" || classDesc === "NOT SPECIFIED")
  );
}

export function normalizeQuickStatsQuarterlyStocksRows(rows: QuickStatsRow[]): QuarterlyStocksInput[] {
  const groups = new Map<
    string,
    {
      report_date: string;
      quarter: "Q1" | "Q2" | "Q3" | "Q4";
      commodity: string;
      cgc_grain: string | null;
      on_farm_kt: number | null;
      off_farm_kt: number | null;
      total_stocks_kt: number | null;
    }
  >();

  for (const row of rows) {
    if (!isQuarterlyStockRow(row)) continue;
    const commodity = stringValue(row, "commodity_desc").toUpperCase();
    const year = numberValue(row, "year");
    const stockValue = numberValue(row, "Value", "value");
    const unit = stringValue(row, "unit_desc").toUpperCase();
    if (!commodity || !year || stockValue === null) continue;

    const report_date = parseQuarterlyStocksReportDate(stringValue(row, "reference_period_desc"), year);
    const key = `${report_date}:${commodity}`;
    const existing = groups.get(key) ?? {
      report_date,
      quarter: reportQuarter(report_date),
      commodity,
      cgc_grain: CGC_GRAIN_BY_COMMODITY[commodity] ?? null,
      on_farm_kt: null,
      off_farm_kt: null,
      total_stocks_kt: null,
    };
    const kilotonnes = valueToKilotonnes(stockValue, commodity, unit);
    const scope = stockScope(row);
    if (scope === "on_farm") existing.on_farm_kt = kilotonnes;
    if (scope === "off_farm") existing.off_farm_kt = kilotonnes;
    if (scope === "total") existing.total_stocks_kt = kilotonnes;
    groups.set(key, existing);
  }

  const baseRows = Array.from(groups.values())
    .filter((row): row is typeof row & { total_stocks_kt: number } => row.total_stocks_kt !== null)
    .sort((a, b) => a.report_date.localeCompare(b.report_date) || a.commodity.localeCompare(b.commodity));

  const priorTotals = new Map<string, number>();
  return baseRows.map((row) => {
    const priorKey = `${Number(row.report_date.slice(0, 4)) - 1}:${row.report_date.slice(5)}:${row.commodity}`;
    const yearAgoTotal = priorTotals.get(priorKey) ?? null;
    priorTotals.set(`${row.report_date.slice(0, 4)}:${row.report_date.slice(5)}:${row.commodity}`, row.total_stocks_kt);
    return {
      ...row,
      year_ago_total_kt: yearAgoTotal,
      change_vs_year_ago_pct:
        yearAgoTotal && yearAgoTotal !== 0 ? round(((row.total_stocks_kt - yearAgoTotal) / yearAgoTotal) * 100, 2) : null,
      source: "usda_nass_quickstats",
    };
  });
}

export function parseUSDAQuarterlyStocksCSV(filePathOrCsv: string): QuarterlyStocksInput[] {
  const input = existsSync(filePathOrCsv) ? readFileSync(filePathOrCsv) : filePathOrCsv;
  const workbook = XLSX.read(input, { type: typeof input === "string" ? "string" : "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("No worksheet found in USDA quarterly stocks file.");
  const rows = XLSX.utils.sheet_to_json<QuickStatsRow>(sheet, { defval: "" });
  const normalized = normalizeQuickStatsQuarterlyStocksRows(rows);
  if (normalized.length === 0) {
    throw new Error("No USDA quarterly stock rows found. Expected normalized NASS QuickStats STOCKS rows.");
  }
  return normalized;
}

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

export async function importQuarterlyStocks(
  rows: QuarterlyStocksInput[],
  dryRun = false,
  supabase?: SupabaseClient
) {
  if (dryRun) {
    console.log("[DRY RUN] Would import the following rows:");
    console.table(rows);
    return;
  }

  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  const { error } = await supabase.from("usda_quarterly_stocks").upsert(rows, {
    onConflict: "report_date,commodity",
    ignoreDuplicates: false,
  });

  if (error) throw error;

  await writeSourceRun(supabase, {
    source_name: "usda_quarterly_stocks",
    source_lane: "us",
    collector_name: "import-usda-quarterly-stocks",
    status: "success",
    source_period_start: rows[0]?.report_date ?? null,
    source_period_end: rows.at(-1)?.report_date ?? null,
    latest_source_label: rows.at(-1)?.report_date ?? null,
    rows_inserted: rows.length,
    source_url: "https://quickstats.nass.usda.gov/",
    metadata: { commodities: Array.from(new Set(rows.map((row) => row.commodity))).sort() },
  });

  console.log(`Successfully imported ${rows.length} quarterly stocks records.`);
}

export function parseQuarterlyStocksCliArgs(args: string[]): { file: string | undefined; dryRun: boolean } {
  const fileEqualsArg = args.find((a) => a.startsWith("--file="));
  const fileFlagIndex = args.indexOf("--file");
  const file = fileEqualsArg?.split("=")[1] ?? (fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined);
  return { file, dryRun: args.includes("--dry-run") };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const { file: fileArg, dryRun } = parseQuarterlyStocksCliArgs(args);

  if (!fileArg) {
    console.log("Usage: npx tsx scripts/import-usda-quarterly-stocks.ts --file <path> [--dry-run]");
    process.exit(1);
  }

  try {
    const rows = parseUSDAQuarterlyStocksCSV(fileArg);
    importQuarterlyStocks(rows, dryRun).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
