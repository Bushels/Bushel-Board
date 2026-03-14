#!/usr/bin/env node
/**
 * Import Grain Monitor Data from MonthlyReportDataTables.xlsx
 *
 * Downloads the Quorum Corp Excel data tables and extracts:
 * - Out-of-car time % by port (weekly granularity from 5C-5)
 * - Primary elevator stock levels by province (monthly from 5A-2)
 * - Terminal stock levels by port (monthly from 5C-2)
 * - Vessel time in port (monthly from 5D-1)
 *
 * Monthly data is mapped to the nearest grain week midpoint.
 * Weekly data is used directly.
 *
 * Usage:
 *   node scripts/import-grain-monitor.mjs [--download] [--crop-year 2025-2026]
 *
 * Options:
 *   --download    Re-download the Excel file from grainmonitor.ca
 *   --crop-year   Target crop year (default: current)
 *   --help        Show this help
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const XLSX_PATH = join(DATA_DIR, "grain-monitor-data-tables.xlsx");
const XLSX_URL = "https://grainmonitor.ca/Downloads/MonthlyReports/MonthlyReportDataTables.xlsx";

// --- Config ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Usage: node scripts/import-grain-monitor.mjs [--download] [--crop-year 2025-2026]`);
  process.exit(0);
}

const shouldDownload = args.includes("--download");
const cropYearIdx = args.indexOf("--crop-year");
const targetCropYear = cropYearIdx >= 0 ? args[cropYearIdx + 1] : getCurrentCropYear();

function getCurrentCropYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

/**
 * Month abbreviations to approximate grain week midpoints.
 * CGC crop year starts Aug 1. Grain weeks are ~7 days each.
 * AUG≈wk3, SEP≈wk7, OCT≈wk12, NOV≈wk16, DEC≈wk20, JAN≈wk24, FEB≈wk28, MAR≈wk32, etc.
 */
const MONTH_TO_APPROX_WEEK = {
  AUG: 3, SEP: 7, OCT: 12, NOV: 16, DEC: 20,
  JAN: 24, FEB: 28, MAR: 32, APR: 36, MAY: 40, JUN: 44, JUL: 48,
};

async function downloadExcel() {
  console.log(`Downloading ${XLSX_URL}...`);
  const resp = await fetch(XLSX_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${XLSX_URL}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(XLSX_PATH, buf);
  console.log(`Saved ${(buf.length / 1024 / 1024).toFixed(1)} MB to ${XLSX_PATH}`);
}

/**
 * Find the starting column index for a given crop year in a header row.
 */
function findCropYearColumn(headerRow, cropYear) {
  if (!headerRow) return -1;
  for (let i = 0; i < headerRow.length; i++) {
    if (headerRow[i] && String(headerRow[i]).includes(cropYear)) return i;
  }
  return -1;
}

/**
 * Extract Out-of-Car Time (%) from sheet 5C-5 M.
 * This sheet has WEEKLY granularity — each grain week is a column.
 * Returns: Map<grainWeek, { oct_pct, oct_vancouver_pct, oct_prince_rupert_pct }>
 */
function extractOutOfCarTime(wb, cropYear) {
  const ws = wb.Sheets["5C-5 M"];
  if (!ws) { console.warn("Sheet 5C-5 M not found"); return new Map(); }
  const data = sheetToArray(ws);

  // Row 3 has crop year headers
  const startCol = findCropYearColumn(data[3], cropYear);
  if (startCol < 0) { console.warn(`${cropYear} not found in 5C-5 M`); return new Map(); }

  // Row 7 has week numbers (integers) and month labels (strings)
  const weekRow = data[7];
  // Build column->week mapping (only integer values are weeks)
  const colToWeek = {};
  for (let c = startCol; c < startCol + 60 && c < (weekRow?.length || 0); c++) {
    const val = weekRow[c];
    if (typeof val === "number" && Number.isInteger(val)) {
      colToWeek[c] = val;
    }
  }

  // Find data rows: Vancouver OCT% (row 12), Prince Rupert OCT% (row 17), Thunder Bay OCT% (varies)
  // Row structure: [null, "Vancouver", ...], then sub-rows for OCT hours, Total hours, % OCT
  const result = new Map();

  // Find port section rows by scanning for port names
  const portRows = {};
  for (let r = 9; r < Math.min(data.length, 50); r++) {
    const row = data[r];
    if (!row) continue;
    const label = String(row[1] || "").trim().toLowerCase();
    if (label === "vancouver") portRows.vancouver = r;
    else if (label === "prince rupert") portRows.prince_rupert = r;
    else if (label === "thunder bay") portRows.thunder_bay = r;
    else if (label === "all ports" || label === "total") portRows.all = r;
  }

  // For each port, % OCT is 3 rows after the port header (row+3)
  for (const [col, week] of Object.entries(colToWeek)) {
    const c = parseInt(col);
    if (!result.has(week)) result.set(week, {});
    const entry = result.get(week);

    if (portRows.vancouver) {
      const val = data[portRows.vancouver + 3]?.[c];
      if (typeof val === "number") entry.oct_vancouver_pct = +(val * 100).toFixed(1);
    }
    if (portRows.prince_rupert) {
      const val = data[portRows.prince_rupert + 3]?.[c];
      if (typeof val === "number") entry.oct_prince_rupert_pct = +(val * 100).toFixed(1);
    }
    // Overall OCT: use "All Ports" or average of individual ports
    if (portRows.all) {
      const val = data[portRows.all + 3]?.[c];
      if (typeof val === "number") entry.oct_pct = +(val * 100).toFixed(1);
    } else if (entry.oct_vancouver_pct != null) {
      // Fallback: just use Vancouver as primary indicator
      entry.oct_pct = entry.oct_vancouver_pct;
    }
  }

  console.log(`  5C-5: Extracted OCT for ${result.size} weeks`);
  return result;
}

/**
 * Extract Primary Elevator Stock Levels from 5A-2 M.
 * Monthly granularity — mapped to approximate grain weeks.
 * Returns: Map<approxWeek, { country_stocks_mb_kt, country_stocks_sk_kt, country_stocks_ab_kt, country_stocks_kt }>
 */
function extractCountryStocks(wb, cropYear) {
  const ws = wb.Sheets["5A-2 M"];
  if (!ws) { console.warn("Sheet 5A-2 M not found"); return new Map(); }
  const data = globalThis._XLSX.utils.sheet_to_json(ws, { header: 1 });

  const startCol = findCropYearColumn(data[2], cropYear);
  if (startCol < 0) { console.warn(`${cropYear} not found in 5A-2 M`); return new Map(); }

  // Row 5 has month labels
  const monthRow = data[5];
  const colToWeek = {};
  for (let c = startCol; c < startCol + 22 && c < (monthRow?.length || 0); c++) {
    const label = String(monthRow[c] || "").trim().toUpperCase();
    // Stop before YTD AVG / variance section (cols 20+ after start are variance data)
    if (label === "YTD AVG" || label === "YTD") break;
    if (MONTH_TO_APPROX_WEEK[label]) colToWeek[c] = MONTH_TO_APPROX_WEEK[label];
  }

  // Dynamically find province sections by scanning for province header rows.
  // Each province has: header row (col 0), then commodity rows (col 1), no explicit TOTAL.
  const result = new Map();

  // Find province header rows
  const provinceHeaders = [];
  for (let r = 7; r < data.length; r++) {
    const label = String(data[r]?.[0] || "").trim().toUpperCase();
    if (label === "MANITOBA") provinceHeaders.push({ key: "mb", headerRow: r });
    else if (label === "SASKATCHEWAN") provinceHeaders.push({ key: "sk", headerRow: r });
    else if (label === "ALBERTA") provinceHeaders.push({ key: "ab", headerRow: r });
    else if (label.includes("BRITISH COLUMBIA")) provinceHeaders.push({ key: "bc", headerRow: r });
    else if (label === "WESTERN CANADA" || label.includes("WESTERN CAN")) {
      provinceHeaders.push({ key: "wc", headerRow: r });
      break; // Stop after Western Canada
    }
  }

  // For each province, sum all commodity rows between its header and the next header
  for (let pi = 0; pi < provinceHeaders.length; pi++) {
    const { key, headerRow } = provinceHeaders[pi];
    if (key === "wc" || key === "bc") continue; // Skip BC and WC aggregate
    const nextHeader = provinceHeaders[pi + 1]?.headerRow || data.length;

    for (const [col, week] of Object.entries(colToWeek)) {
      const c = parseInt(col);
      let sum = 0;
      let hasData = false;
      for (let r = headerRow + 1; r < nextHeader; r++) {
        const val = data[r]?.[c];
        if (typeof val === "number") { sum += val; hasData = true; }
      }
      if (hasData) {
        if (!result.has(week)) result.set(week, {});
        result.get(week)[`country_stocks_${key}_kt`] = +sum.toFixed(1);
      }
    }
  }

  // Sum provinces for total
  for (const [week, entry] of result) {
    entry.country_stocks_kt = +(
      (entry.country_stocks_mb_kt || 0) +
      (entry.country_stocks_sk_kt || 0) +
      (entry.country_stocks_ab_kt || 0)
    ).toFixed(1);
  }

  console.log(`  5A-2: Extracted country stocks for ${result.size} months`);
  return result;
}

/**
 * Extract Terminal Stock Levels by port from 5C-2 M.
 * Monthly granularity. Data layout: port header (col 0), commodity rows (col 1),
 * subtotal row (empty label, has numeric value). Sum commodity rows per port.
 * Port sections: VANCOUVER (~rows 23-36), PRINCE RUPERT (~38-51), THUNDER BAY (~55+).
 */
function extractTerminalStocks(wb, cropYear) {
  const ws = wb.Sheets["5C-2 M"];
  if (!ws) { console.warn("Sheet 5C-2 M not found"); return new Map(); }
  const data = globalThis._XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Find crop year column in row 3 (header row)
  const startCol = findCropYearColumn(data[3], cropYear);
  if (startCol < 0) { console.warn(`${cropYear} not found in 5C-2 M`); return new Map(); }

  // Row 6 has month labels
  const monthRow = data[6];
  const colToWeek = {};
  for (let c = startCol; c < startCol + 22 && c < (monthRow?.length || 0); c++) {
    const label = String(monthRow[c] || "").trim().toUpperCase();
    if (label === "YTD AVG" || label === "YTD") break; // Stop before variance section
    if (MONTH_TO_APPROX_WEEK[label]) colToWeek[c] = MONTH_TO_APPROX_WEEK[label];
  }

  if (Object.keys(colToWeek).length === 0) {
    console.warn("No month columns found in 5C-2 M");
    return new Map();
  }

  const result = new Map();

  // Port commodity ranges (determined from sheet structure)
  // Vancouver: rows 25-35, subtotal row 36
  // Prince Rupert: rows 40-50, subtotal row 51
  // Thunder Bay: rows 62-72, subtotal row 73 (second section, col 55 starts)
  // Use subtotal rows which have the aggregate
  const portSubtotals = [
    { port: "vancouver", row: 36 },
    { port: "prince_rupert", row: 51 },
  ];

  // Find Thunder Bay subtotal dynamically - scan for second PORT header
  let tbSubtotal = -1;
  for (let r = 55; r < Math.min(data.length, 100); r++) {
    const row = data[r];
    if (!row) continue;
    // Subtotal row: col 0 and col 1 are empty, but has numeric data at startCol
    const c0 = String(row[0] || "").trim();
    const c1 = String(row[1] || "").trim();
    const val = row[startCol];
    if (!c0 && !c1 && typeof val === "number" && val > 0) {
      tbSubtotal = r;
      break;
    }
  }
  if (tbSubtotal > 0) {
    portSubtotals.push({ port: "thunder_bay", row: tbSubtotal });
  }

  for (const { port, row: subRow } of portSubtotals) {
    const row = data[subRow];
    if (!row) continue;
    for (const [col, week] of Object.entries(colToWeek)) {
      const c = parseInt(col);
      const val = row[c];
      if (typeof val !== "number") continue;
      if (!result.has(week)) result.set(week, {});
      result.get(week)[`terminal_stocks_${port}_kt`] = val;
    }
  }

  // Sum terminal stocks
  for (const [week, entry] of result) {
    entry.terminal_stocks_kt = +(
      (entry.terminal_stocks_vancouver_kt || 0) +
      (entry.terminal_stocks_prince_rupert_kt || 0) +
      (entry.terminal_stocks_thunder_bay_kt || 0)
    ).toFixed(1);
  }

  console.log(`  5C-2: Extracted terminal stocks for ${result.size} months`);
  return result;
}

/**
 * Convert worksheet to 2D array efficiently.
 */
function sheetToArray(ws) {
  // Dynamic import workaround — use global xlsx
  const range = ws["!ref"];
  if (!range) return [];
  const decoded = decodeRange(range);
  const result = [];
  for (let r = decoded.s.r; r <= decoded.e.r; r++) {
    const row = [];
    for (let c = decoded.s.c; c <= decoded.e.c; c++) {
      const cell = ws[encodeCell(r, c)];
      row[c] = cell ? cell.v : undefined;
    }
    result[r] = row;
  }
  return result;
}

function decodeRange(ref) {
  const parts = ref.split(":");
  const s = decodeCellRef(parts[0]);
  const e = parts[1] ? decodeCellRef(parts[1]) : s;
  return { s, e };
}

function decodeCellRef(ref) {
  let c = 0, r = 0, i = 0;
  while (i < ref.length && ref.charCodeAt(i) >= 65) {
    c = c * 26 + (ref.charCodeAt(i) - 64);
    i++;
  }
  r = parseInt(ref.substring(i)) - 1;
  return { r, c: c - 1 };
}

function encodeCell(r, c) {
  let col = "";
  let cc = c + 1;
  while (cc > 0) {
    col = String.fromCharCode(((cc - 1) % 26) + 65) + col;
    cc = Math.floor((cc - 1) / 26);
  }
  return col + (r + 1);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  // Download if requested or file doesn't exist
  if (shouldDownload || !existsSync(XLSX_PATH)) {
    await downloadExcel();
  }

  console.log(`\nParsing ${XLSX_PATH} for crop year ${targetCropYear}...\n`);

  // Use xlsx library (ESM dynamic import returns { default: ... })
  const XLSXModule = await import("xlsx");
  const XLSXLib = XLSXModule.default || XLSXModule;
  const wb = XLSXLib.readFile(XLSX_PATH);
  // Make XLSX available globally for helper functions
  globalThis._XLSX = XLSXLib;

  // Extract data from key sheets
  const octData = extractOutOfCarTime(wb, targetCropYear);
  const countryStocks = extractCountryStocks(wb, targetCropYear);
  const terminalStocks = extractTerminalStocks(wb, targetCropYear);

  // Merge all data by grain week
  const allWeeks = new Set([
    ...octData.keys(),
    ...countryStocks.keys(),
    ...terminalStocks.keys(),
  ]);

  if (allWeeks.size === 0) {
    console.log("No data found for the target crop year.");
    process.exit(0);
  }

  // Build upsert rows
  const rows = [];
  for (const week of [...allWeeks].sort((a, b) => a - b)) {
    const oct = octData.get(week) || {};
    const cs = countryStocks.get(week) || {};
    const ts = terminalStocks.get(week) || {};

    // Approximate report date from grain week
    // Crop year starts Aug 1, week 1 ends ~Aug 7
    const cropStartYear = parseInt(targetCropYear.split("-")[0]);
    const reportDate = new Date(cropStartYear, 7, week * 7); // rough approximation
    const reportDateStr = reportDate.toISOString().split("T")[0];

    rows.push({
      crop_year: targetCropYear,
      grain_week: week,
      report_date: reportDateStr,
      // Country stocks
      country_stocks_kt: cs.country_stocks_kt || null,
      country_stocks_mb_kt: cs.country_stocks_mb_kt || null,
      country_stocks_sk_kt: cs.country_stocks_sk_kt || null,
      country_stocks_ab_kt: cs.country_stocks_ab_kt || null,
      // Terminal stocks
      terminal_stocks_kt: ts.terminal_stocks_kt || null,
      terminal_stocks_vancouver_kt: ts.terminal_stocks_vancouver_kt || null,
      terminal_stocks_prince_rupert_kt: ts.terminal_stocks_prince_rupert_kt || null,
      terminal_stocks_thunder_bay_kt: ts.terminal_stocks_thunder_bay_kt || null,
      terminal_stocks_churchill_kt: ts.terminal_stocks_churchill_kt || null,
      // Out-of-car time
      out_of_car_time_pct: oct.oct_pct || null,
      out_of_car_time_vancouver_pct: oct.oct_vancouver_pct || null,
      out_of_car_time_prince_rupert_pct: oct.oct_prince_rupert_pct || null,
      // Source
      source_notes: `Quorum MonthlyReportDataTables.xlsx (auto-imported)`,
    });
  }

  console.log(`\nMerged ${rows.length} rows across weeks ${[...allWeeks].sort((a, b) => a - b).join(", ")}`);

  // Upsert to Supabase (skip weeks that already have richer manual data)
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check existing rows to avoid overwriting richer manual entries
  const { data: existing } = await supabase
    .from("grain_monitor_snapshots")
    .select("grain_week, source_notes")
    .eq("crop_year", targetCropYear);

  const manualWeeks = new Set(
    (existing || [])
      .filter((r) => !r.source_notes?.includes("auto-imported"))
      .map((r) => r.grain_week)
  );

  const toUpsert = rows.filter((r) => !manualWeeks.has(r.grain_week));
  console.log(`Skipping ${rows.length - toUpsert.length} weeks with manual data`);
  console.log(`Upserting ${toUpsert.length} rows...`);

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("grain_monitor_snapshots")
      .upsert(toUpsert, { onConflict: "crop_year,grain_week" });

    if (error) {
      console.error("Upsert error:", error.message);
    } else {
      console.log(`Successfully upserted ${toUpsert.length} rows`);
    }
  }

  // Verify
  const { data: verify } = await supabase
    .from("grain_monitor_snapshots")
    .select("grain_week, country_stocks_kt, terminal_stocks_kt, out_of_car_time_pct, source_notes")
    .eq("crop_year", targetCropYear)
    .order("grain_week", { ascending: true });

  console.log(`\nAll ${targetCropYear} rows:`);
  console.table(verify);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
