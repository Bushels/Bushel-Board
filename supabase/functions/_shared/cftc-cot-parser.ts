/**
 * CFTC Commitments of Traders — Disaggregated (Options + Futures Combined)
 * SODA API endpoint: https://publicreporting.cftc.gov/resource/kh3c-gbw2.json
 *
 * Fetches, parses, and maps CFTC COT data to Bushel Board's cftc_cot_positions table.
 * Deno runtime — no npm dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw row from the CFTC SODA API (Disaggregated Combined dataset kh3c-gbw2). */
export interface CftcApiRow {
  report_date_as_yyyy_mm_dd: string; // "2026-02-25T00:00:00.000"
  contract_market_name: string; // "WHEAT-SRW", "CANOLA", etc.
  market_and_exchange_names: string; // "WHEAT-SRW - CHICAGO BOARD OF TRADE"
  open_interest_all: string;

  // Producer/Merchant/Processor/User
  prod_merc_positions_long: string;
  prod_merc_positions_short: string;

  // Swap Dealer (note: double underscore on short and spread)
  swap_positions_long_all: string;
  swap__positions_short_all: string;
  swap__positions_spread_all: string;

  // Managed Money
  m_money_positions_long_all: string;
  m_money_positions_short_all: string;
  m_money_positions_spread: string;

  // Other Reportable
  other_rept_positions_long: string;
  other_rept_positions_short: string;
  other_rept_positions_spread: string;

  // Non-Reportable (small traders)
  nonrept_positions_long_all: string;
  nonrept_positions_short_all: string;

  // WoW change fields
  change_in_open_interest_all: string;
  change_in_prod_merc_long: string;
  change_in_prod_merc_short: string;
  change_in_swap_long_all: string;
  change_in_swap_short_all: string;
  change_in_m_money_long_all: string;
  change_in_m_money_short_all: string;
  change_in_other_rept_long: string;
  change_in_other_rept_short: string;
  change_in_nonrept_long_all: string;
  change_in_nonrept_short_all: string;

  // Percent of open interest
  pct_of_oi_prod_merc_long: string;
  pct_of_oi_prod_merc_short: string;
  pct_of_oi_swap_long_all: string;
  pct_of_oi_swap_short_all: string;
  pct_of_oi_m_money_long_all: string;
  pct_of_oi_m_money_short_all: string;
  pct_of_oi_other_rept_long: string;
  pct_of_oi_other_rept_short: string;
  pct_of_oi_nonrept_long_all: string;
  pct_of_oi_nonrept_short_all: string;

  // Number of traders
  traders_prod_merc_long_all: string;
  traders_prod_merc_short_all: string;
  // Note: swap trader counts are not in the disaggregated dataset (kh3c-gbw2)
  traders_m_money_long_all: string;
  traders_m_money_short_all: string;
  traders_m_money_spread_all: string;
  traders_other_rept_long_all: string;
  traders_other_rept_short: string;
  traders_other_rept_spread: string;
  traders_tot_all: string;

  // Concentration — top 4 / 8 traders
  conc_gross_le_4_tdr_long: string;
  conc_gross_le_4_tdr_short: string;
  conc_gross_le_8_tdr_long: string;
  conc_gross_le_8_tdr_short: string;
  conc_net_le_4_tdr_long_all: string;
  conc_net_le_4_tdr_short_all: string;
  conc_net_le_8_tdr_long_all: string;
  conc_net_le_8_tdr_short_all: string;

  // Allow additional fields we don't explicitly map
  [key: string]: string | undefined;
}

/** Parsed row matching the cftc_cot_positions table schema. */
export interface CftcCotPosition {
  report_date: string; // YYYY-MM-DD
  commodity: string; // contract_market_name value
  contract_market_name: string;
  exchange: string;

  open_interest: number;
  change_open_interest: number | null;

  prod_merc_long: number;
  prod_merc_short: number;
  swap_long: number;
  swap_short: number;
  swap_spread: number | null;
  managed_money_long: number;
  managed_money_short: number;
  managed_money_spread: number | null;
  other_long: number;
  other_short: number;
  other_spread: number | null;
  nonreportable_long: number;
  nonreportable_short: number;

  change_prod_merc_long: number | null;
  change_prod_merc_short: number | null;
  change_swap_long: number | null;
  change_swap_short: number | null;
  change_managed_money_long: number | null;
  change_managed_money_short: number | null;
  change_other_long: number | null;
  change_other_short: number | null;
  change_nonreportable_long: number | null;
  change_nonreportable_short: number | null;

  pct_prod_merc_long: number | null;
  pct_prod_merc_short: number | null;
  pct_swap_long: number | null;
  pct_swap_short: number | null;
  pct_managed_money_long: number | null;
  pct_managed_money_short: number | null;
  pct_other_long: number | null;
  pct_other_short: number | null;
  pct_nonreportable_long: number | null;
  pct_nonreportable_short: number | null;

  traders_prod_merc_long: number | null;
  traders_prod_merc_short: number | null;
  traders_swap_long: number | null;
  traders_swap_short: number | null;
  traders_swap_spread: number | null;
  traders_managed_money_long: number | null;
  traders_managed_money_short: number | null;
  traders_managed_money_spread: number | null;
  traders_other_long: number | null;
  traders_other_short: number | null;
  traders_other_spread: number | null;
  traders_total: number | null;

  concentration_gross_4_long: number | null;
  concentration_gross_4_short: number | null;
  concentration_gross_8_long: number | null;
  concentration_gross_8_short: number | null;
  concentration_net_4_long: number | null;
  concentration_net_4_short: number | null;
  concentration_net_8_long: number | null;
  concentration_net_8_short: number | null;

  cgc_grain: string;
  mapping_type: string; // "primary" | "secondary"
  crop_year: string;
  grain_week: number;
  import_source: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CFTC_API_BASE =
  "https://publicreporting.cftc.gov/resource/kh3c-gbw2.json";

/**
 * Map CFTC contract_market_name → CGC grain name + mapping type.
 * "primary" = the main proxy for the CGC grain.
 * "secondary" = a related contract that provides additional context.
 */
export const CFTC_GRAIN_MAP: Record<
  string,
  { cgcGrain: string; mappingType: "primary" | "secondary" }
> = {
  "WHEAT-SRW": { cgcGrain: "Wheat", mappingType: "secondary" },
  "WHEAT-HRW": { cgcGrain: "Wheat", mappingType: "secondary" },
  "WHEAT-HRSpring": { cgcGrain: "Wheat", mappingType: "primary" },
  SOYBEANS: { cgcGrain: "Soybeans", mappingType: "primary" },
  "SOYBEAN OIL": { cgcGrain: "Canola", mappingType: "secondary" },
  "SOYBEAN MEAL": { cgcGrain: "Canola", mappingType: "secondary" },
  CORN: { cgcGrain: "Corn", mappingType: "primary" },
  CANOLA: { cgcGrain: "Canola", mappingType: "primary" },
};

/** contract_market_name values to include in SODA API queries. */
export const CFTC_COMMODITY_FILTERS: string[] = Object.keys(CFTC_GRAIN_MAP);

// ---------------------------------------------------------------------------
// Crop Year / Grain Week helpers
// ---------------------------------------------------------------------------

/**
 * Convert a report date to the CGC crop year format "YYYY-YYYY".
 * Crop year starts August 1: dates Aug 1+ belong to startYear-startYear+1.
 */
export function reportDateToCropYear(reportDate: Date): string {
  const year = reportDate.getFullYear();
  const month = reportDate.getMonth(); // 0-indexed; July = 6, August = 7
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

/**
 * Convert a report date to the CGC grain week number (1-52).
 * Week 1 starts on August 1 of the crop year.
 */
export function reportDateToGrainWeek(reportDate: Date): number {
  const cropYear = reportDateToCropYear(reportDate);
  const startYear = parseInt(cropYear.split("-")[0], 10);
  const augFirst = new Date(startYear, 7, 1); // Aug 1
  const diffMs = reportDate.getTime() - augFirst.getTime();
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(52, week));
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Fetch CFTC COT data from the SODA API.
 *
 * @param reportDate Optional YYYY-MM-DD string to fetch a single report date.
 *                   If omitted, returns the most recent 50 rows across all
 *                   commodities in CFTC_COMMODITY_FILTERS.
 */
export async function fetchCftcCotData(
  reportDate?: string
): Promise<CftcApiRow[]> {
  const commodityList = CFTC_COMMODITY_FILTERS.map((c) => `'${c}'`).join(",");
  let whereClause = `contract_market_name in (${commodityList})`;

  if (reportDate) {
    // SODA expects the timestamp format for date comparisons
    whereClause += ` AND report_date_as_yyyy_mm_dd='${reportDate}T00:00:00.000'`;
  }

  const params = new URLSearchParams({
    $where: whereClause,
    $order: "report_date_as_yyyy_mm_dd DESC",
    $limit: "50",
  });

  const url = `${CFTC_API_BASE}?${params.toString()}`;
  console.log(`[cftc-cot-parser] Fetching: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `CFTC API error ${response.status}: ${body.slice(0, 500)}`
    );
  }

  const rows: CftcApiRow[] = await response.json();
  console.log(`[cftc-cot-parser] Received ${rows.length} rows from CFTC API`);
  return rows;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Safe numeric coercion: returns null for undefined/empty, Number() otherwise. */
function num(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** Required numeric coercion: returns 0 for undefined/empty. */
function numReq(value: string | undefined | null): number {
  return num(value) ?? 0;
}

/** Extract exchange name from "COMMODITY - EXCHANGE NAME" format. */
function extractExchange(marketAndExchange: string): string {
  const parts = marketAndExchange.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ").trim() : marketAndExchange;
}

/** Parse report_date_as_yyyy_mm_dd ("2026-02-25T00:00:00.000") to YYYY-MM-DD. */
function parseReportDate(raw: string): { dateStr: string; date: Date } {
  const dateStr = raw.slice(0, 10); // "2026-02-25"
  const date = new Date(dateStr + "T00:00:00Z");
  return { dateStr, date };
}

/**
 * Transform an array of raw CFTC API rows into CftcCotPosition objects
 * ready for Supabase upsert into cftc_cot_positions.
 */
export function parseCftcCotRows(apiRows: CftcApiRow[]): CftcCotPosition[] {
  const results: CftcCotPosition[] = [];

  for (const row of apiRows) {
    const contractName = row.contract_market_name;
    const mapping = CFTC_GRAIN_MAP[contractName];
    if (!mapping) {
      console.warn(
        `[cftc-cot-parser] Skipping unmapped commodity: ${contractName}`
      );
      continue;
    }

    const { dateStr, date } = parseReportDate(row.report_date_as_yyyy_mm_dd);

    results.push({
      report_date: dateStr,
      commodity: contractName,
      contract_market_name: contractName,
      exchange: extractExchange(row.market_and_exchange_names),

      open_interest: numReq(row.open_interest_all),
      change_open_interest: num(row.change_in_open_interest_all),

      // Producer/Merchant
      prod_merc_long: numReq(row.prod_merc_positions_long),
      prod_merc_short: numReq(row.prod_merc_positions_short),

      // Swap Dealer (note double underscore on short and spread)
      swap_long: numReq(row.swap_positions_long_all),
      swap_short: numReq(row.swap__positions_short_all),
      swap_spread: num(row.swap__positions_spread_all),

      // Managed Money
      managed_money_long: numReq(row.m_money_positions_long_all),
      managed_money_short: numReq(row.m_money_positions_short_all),
      managed_money_spread: num(row.m_money_positions_spread),

      // Other Reportable
      other_long: numReq(row.other_rept_positions_long),
      other_short: numReq(row.other_rept_positions_short),
      other_spread: num(row.other_rept_positions_spread),

      // Non-Reportable
      nonreportable_long: numReq(row.nonrept_positions_long_all),
      nonreportable_short: numReq(row.nonrept_positions_short_all),

      // WoW changes
      change_prod_merc_long: num(row.change_in_prod_merc_long),
      change_prod_merc_short: num(row.change_in_prod_merc_short),
      change_swap_long: num(row.change_in_swap_long_all),
      change_swap_short: num(row.change_in_swap_short_all),
      change_managed_money_long: num(row.change_in_m_money_long_all),
      change_managed_money_short: num(row.change_in_m_money_short_all),
      change_other_long: num(row.change_in_other_rept_long),
      change_other_short: num(row.change_in_other_rept_short),
      change_nonreportable_long: num(row.change_in_nonrept_long_all),
      change_nonreportable_short: num(row.change_in_nonrept_short_all),

      // Percent of open interest
      pct_prod_merc_long: num(row.pct_of_oi_prod_merc_long),
      pct_prod_merc_short: num(row.pct_of_oi_prod_merc_short),
      pct_swap_long: num(row.pct_of_oi_swap_long_all),
      pct_swap_short: num(row.pct_of_oi_swap_short_all),
      pct_managed_money_long: num(row.pct_of_oi_m_money_long_all),
      pct_managed_money_short: num(row.pct_of_oi_m_money_short_all),
      pct_other_long: num(row.pct_of_oi_other_rept_long),
      pct_other_short: num(row.pct_of_oi_other_rept_short),
      pct_nonreportable_long: num(row.pct_of_oi_nonrept_long_all),
      pct_nonreportable_short: num(row.pct_of_oi_nonrept_short_all),

      // Number of traders
      traders_prod_merc_long: num(row.traders_prod_merc_long_all),
      traders_prod_merc_short: num(row.traders_prod_merc_short_all),
      traders_swap_long: null, // swap trader counts not in disaggregated dataset
      traders_swap_short: null,
      traders_swap_spread: null,
      traders_managed_money_long: num(row.traders_m_money_long_all),
      traders_managed_money_short: num(row.traders_m_money_short_all),
      traders_managed_money_spread: num(row.traders_m_money_spread_all),
      traders_other_long: num(row.traders_other_rept_long_all),
      traders_other_short: num(row.traders_other_rept_short),
      traders_other_spread: num(row.traders_other_rept_spread),
      traders_total: num(row.traders_tot_all),

      // Concentration ratios
      concentration_gross_4_long: num(row.conc_gross_le_4_tdr_long),
      concentration_gross_4_short: num(row.conc_gross_le_4_tdr_short),
      concentration_gross_8_long: num(row.conc_gross_le_8_tdr_long),
      concentration_gross_8_short: num(row.conc_gross_le_8_tdr_short),
      concentration_net_4_long: num(row.conc_net_le_4_tdr_long_all),
      concentration_net_4_short: num(row.conc_net_le_4_tdr_short_all),
      concentration_net_8_long: num(row.conc_net_le_8_tdr_long_all),
      concentration_net_8_short: num(row.conc_net_le_8_tdr_short_all),

      // Bushel Board mapping
      cgc_grain: mapping.cgcGrain,
      mapping_type: mapping.mappingType,
      crop_year: reportDateToCropYear(date),
      grain_week: reportDateToGrainWeek(date),
      import_source: "cftc-api",
    });
  }

  console.log(
    `[cftc-cot-parser] Parsed ${results.length} positions from ${apiRows.length} API rows`
  );
  return results;
}
