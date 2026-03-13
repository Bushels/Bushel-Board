/**
 * CGC Data Audit Script
 *
 * Three-way comparison: Excel ↔ CSV ↔ Supabase
 * Spot-checks ~50 data points across Primary, Process, Terminal Receipts, and Summary.
 *
 * Usage:
 *   npm run audit-data                      # Audit latest week (auto-detected)
 *   npm run audit-data -- --week 30         # Audit specific week
 *   npm run audit-data -- --help            # Show usage
 *
 * Output: JSON audit report to stdout, diagnostics to stderr.
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Dependencies: xlsx@0.18.5 (pinned)
 */

import * as XLSX from "xlsx";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parseCgcCsv, getCurrentCropYear } from "../lib/cgc/parser";

// ─── Config ──────────────────────────────────────────────────────────

const TOLERANCE = 0.001; // Kt tolerance for float comparison
const DATA_DIR = resolve(process.cwd(), "data");

interface AuditCheck {
  source: "excel-csv" | "csv-supabase" | "excel-supabase";
  worksheet: string;
  metric: string;
  grain: string;
  region: string;
  period: string;
  grade: string;
  expected: number;
  actual: number;
  pass: boolean;
  note?: string;
}

interface AuditReport {
  week: number;
  crop_year: string;
  timestamp: string;
  excel_file: string;
  csv_file: string;
  total_checks: number;
  passed: number;
  failed: number;
  checks: AuditCheck[];
}

// ─── CLI ─────────────────────────────────────────────────────────────

function printHelp() {
  console.error(`
CGC Data Audit Script — Three-way Excel ↔ CSV ↔ Supabase comparison

Usage:
  npm run audit-data                   Audit latest week (auto-detected)
  npm run audit-data -- --week 30      Audit specific week
  npm run audit-data -- --help         Show this help

Environment:
  NEXT_PUBLIC_SUPABASE_URL             Supabase project URL (from .env.local)
  SUPABASE_SERVICE_ROLE_KEY            Service role key (from .env.local)

Output:
  JSON audit report to stdout with pass/fail per check.
`);
}

function parseArgs(): { week?: number } {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const weekIdx = args.indexOf("--week");
  if (weekIdx !== -1 && args[weekIdx + 1]) {
    return { week: parseInt(args[weekIdx + 1], 10) };
  }
  return {};
}

// ─── Load .env.local ─────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error("ERROR: .env.local not found. Create it with SUPABASE_URL and SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ─── Excel Reader ────────────────────────────────────────────────────

interface ExcelData {
  workbook: XLSX.WorkBook;
  week: number;
}

function loadExcel(week: number): ExcelData {
  const filename = `gsw-shg-${week}-en.xlsx`;
  const filepath = resolve(DATA_DIR, filename);
  if (!existsSync(filepath)) {
    console.error(`ERROR: Excel file not found: ${filepath}`);
    process.exit(1);
  }
  console.error(`Loading Excel: ${filename}`);
  const workbook = XLSX.readFile(filepath);
  return { workbook, week };
}

function getExcelCell(wb: XLSX.WorkBook, sheetName: string, row: number, col: number): number {
  const ws = wb.Sheets[sheetName];
  if (!ws) return 0;
  const cellRef = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 }); // 0-indexed
  const cell = ws[cellRef];
  if (!cell) return 0;
  return typeof cell.v === "number" ? cell.v : parseFloat(String(cell.v)) || 0;
}

// ─── Primary Sheet Layout ────────────────────────────────────────────
// Grains at fixed row offsets within each section
const PRIMARY_GRAINS: Record<string, number> = {
  "Wheat": 0, "Amber Durum": 1, "Oat": 2, "Barley": 3, "Rye": 4,
  "Flaxseed": 5, "Canola": 6, "Sunflower": 7, "Soybeans": 8, "Peas": 9,
  "Corn": 10, "Canaryseed": 11, "Mustard Seed": 12, "Beans": 13,
  "Lentil": 14, "Chick Peas": 15,
};

const PRIMARY_PROVINCES: Record<string, number> = {
  "Manitoba": 2, "Saskatchewan": 3, "Alberta": 4, "British Columbia": 5, "Total": 6,
};

// Section start rows for grain data (first grain row in each section)
const PRIMARY_SECTIONS = {
  deliveries_cw: 7,       // Current Week deliveries
  shipments_cw: 32,       // Current Week shipments
  deliveries_cy: 57,      // Crop Year deliveries
  shipments_cy: 82,       // Crop Year shipments
  stocks: 107,            // Stocks
  condo: 132,             // Condo storage
};

// ─── Process Sheet Layout ────────────────────────────────────────────
const PROCESS_GRAINS: Record<string, number> = {
  "Wheat": 0, "Amber Durum": 1, "Oat": 2, "Barley": 3, "Rye": 4,
  "Flaxseed": 5, "Canola": 6, "Sunflower": 7, "Soybeans": 8, "Peas": 9,
  "Corn": 10, "Canaryseed": 11, "Beans": 12, "Lentil": 13, "Chick Peas": 14,
};

const PROCESS_METRICS: Record<string, number> = {
  "Producer Deliveries": 2, "Other Deliveries": 3, "Shipments": 4, "Milled/MFG Grain": 5,
};

const PROCESS_SECTIONS = {
  current_week: 7,  // First grain row, Current Week
  crop_year: 32,    // First grain row, Crop Year
};

// ─── Summary Sheet Layout ────────────────────────────────────────────
const SUMMARY_GRAINS: Record<string, number> = {
  "Wheat": 2, "Amber Durum": 3, "Oat": 4, "Barley": 5, "Rye": 6,
  "Flaxseed": 7, "Canola": 8, "Sunflower": 9, "Soybeans": 10, "Peas": 11,
  "Corn": 12, "Canaryseed": 13, "Mustard Seed": 14, "Beans": 15,
  "Lentil": 16, "Chick Peas": 17, "Total": 18,
};

const SUMMARY_ROWS: Record<string, number> = {
  "Deliveries_CW": 15, "Deliveries_CY": 17,
  "Terminal Receipts_CW": 21, "Terminal Receipts_CY": 23,
  "Exports_CW": 27, "Exports_CY": 29,
};

// ─── CSV Reader ──────────────────────────────────────────────────────

interface CsvLookup {
  get(worksheet: string, metric: string, period: string, grain: string, grade: string, region: string): number | undefined;
}

function loadCsv(): CsvLookup {
  const csvPath = resolve(DATA_DIR, "gsw-shg-en.csv");
  if (!existsSync(csvPath)) {
    console.error(`ERROR: CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  console.error("Loading CSV...");
  const content = readFileSync(csvPath, "utf-8");
  const rows = parseCgcCsv(content);
  console.error(`  Parsed ${rows.length} CSV rows`);

  // Build lookup map
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.worksheet}|${r.metric}|${r.period}|${r.grain}|${r.grade}|${r.region}|${r.grain_week}|${r.crop_year}`;
    map.set(key, r.ktonnes);
  }

  return {
    get(worksheet, metric, period, grain, grade, region) {
      // CSV uses long crop year format like "2025-2026"
      const cropYear = getCurrentCropYear();
      // Try with the latest week first
      for (let w = 52; w >= 1; w--) {
        const key = `${worksheet}|${metric}|${period}|${grain}|${grade}|${region}|${w}|${cropYear}`;
        if (map.has(key)) return map.get(key);
      }
      return undefined;
    },
  };
}

function loadCsvForWeek(week: number): CsvLookup {
  const csvPath = resolve(DATA_DIR, "gsw-shg-en.csv");
  if (!existsSync(csvPath)) {
    console.error(`ERROR: CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  console.error("Loading CSV...");
  const content = readFileSync(csvPath, "utf-8");
  const rows = parseCgcCsv(content);
  console.error(`  Parsed ${rows.length} CSV rows`);

  const cropYear = getCurrentCropYear();
  const weekRows = rows.filter((r) => r.grain_week === week && r.crop_year === cropYear);
  console.error(`  ${weekRows.length} rows for week ${week}, crop year ${cropYear}`);

  const map = new Map<string, number>();
  for (const r of weekRows) {
    const key = `${r.worksheet}|${r.metric}|${r.period}|${r.grain}|${r.grade}|${r.region}`;
    map.set(key, r.ktonnes);
  }

  return {
    get(worksheet, metric, period, grain, grade, region) {
      const key = `${worksheet}|${metric}|${period}|${grain}|${grade}|${region}`;
      return map.get(key);
    },
  };
}

// ─── Supabase Reader ─────────────────────────────────────────────────

async function querySupabase(
  worksheet: string,
  metric: string,
  period: string,
  grain: string,
  region: string,
  grainWeek: number,
  cropYear: string,
  sumGrades: boolean = false
): Promise<number | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("ERROR: Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return undefined;
  }

  if (sumGrades) {
    // Use raw SQL via the REST API for aggregation (bypasses PostgREST row limits)
    const sql = `SELECT COALESCE(SUM(ktonnes), 0) as total FROM cgc_observations WHERE worksheet='${worksheet}' AND metric='${metric}' AND period='${period}' AND grain='${grain}' AND region='${region}' AND grain_week=${grainWeek} AND crop_year='${cropYear}'`;

    const resp = await fetch(`${url}/rest/v1/rpc/execute_raw_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ query: sql }),
    });

    // Fallback: query with PostgREST if RPC doesn't exist
    if (!resp.ok) {
      // Direct PostgREST query — may be truncated for large result sets
      const params = new URLSearchParams({
        worksheet: `eq.${worksheet}`,
        metric: `eq.${metric}`,
        period: `eq.${period}`,
        grain: `eq.${grain}`,
        region: `eq.${region}`,
        grain_week: `eq.${grainWeek}`,
        crop_year: `eq.${cropYear}`,
        select: "ktonnes",
      });

      const fallbackResp = await fetch(`${url}/rest/v1/cgc_observations?${params}`, {
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      });

      if (!fallbackResp.ok) return undefined;
      const data = (await fallbackResp.json()) as { ktonnes: string | number }[];
      return data.reduce((sum, r) => sum + Number(r.ktonnes), 0);
    }

    const data = await resp.json();
    return Number(data?.[0]?.total ?? 0);
  }

  // Simple single-row query
  const params = new URLSearchParams({
    worksheet: `eq.${worksheet}`,
    metric: `eq.${metric}`,
    period: `eq.${period}`,
    grain: `eq.${grain}`,
    grade: `eq.`,
    region: `eq.${region}`,
    grain_week: `eq.${grainWeek}`,
    crop_year: `eq.${cropYear}`,
    select: "ktonnes",
    limit: "1",
  });

  const resp = await fetch(`${url}/rest/v1/cgc_observations?${params}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });

  if (!resp.ok) return undefined;
  const data = (await resp.json()) as { ktonnes: string | number }[];
  if (data.length === 0) return undefined;
  return Number(data[0].ktonnes);
}

// ─── Comparison Logic ────────────────────────────────────────────────

function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { week: argWeek } = parseArgs();
  loadEnv();

  // Determine week
  const latestWeek = argWeek ?? detectLatestWeek();
  const cropYear = getCurrentCropYear();

  console.error(`\nAuditing Week ${latestWeek}, Crop Year ${cropYear}`);
  console.error("─".repeat(50));

  // Load sources
  const excel = loadExcel(latestWeek);
  const csv = loadCsvForWeek(latestWeek);

  const checks: AuditCheck[] = [];

  // ─── 1. Primary Deliveries: 8 grains × 3 provinces × 2 periods ───

  const auditGrains = ["Wheat", "Amber Durum", "Canola", "Barley", "Oat", "Peas", "Lentil", "Flaxseed"];
  const auditProvinces = ["Alberta", "Saskatchewan", "Manitoba"];

  console.error("\n[1/4] Primary Deliveries...");
  for (const grain of auditGrains) {
    for (const prov of auditProvinces) {
      // Current Week
      const excelRow = PRIMARY_SECTIONS.deliveries_cw + PRIMARY_GRAINS[grain];
      const excelCol = PRIMARY_PROVINCES[prov];
      const excelVal = getExcelCell(excel.workbook, "Primary", excelRow, excelCol);
      const csvVal = csv.get("Primary", "Deliveries", "Current Week", grain, "", prov);

      if (csvVal !== undefined) {
        checks.push({
          source: "excel-csv",
          worksheet: "Primary",
          metric: "Deliveries",
          grain,
          region: prov,
          period: "Current Week",
          grade: "",
          expected: excelVal,
          actual: csvVal,
          pass: closeEnough(excelVal, csvVal),
        });
      }

      // Crop Year
      const cyRow = PRIMARY_SECTIONS.deliveries_cy + PRIMARY_GRAINS[grain];
      const cyExcelVal = getExcelCell(excel.workbook, "Primary", cyRow, excelCol);
      const cyCsvVal = csv.get("Primary", "Deliveries", "Crop Year", grain, "", prov);

      if (cyCsvVal !== undefined) {
        checks.push({
          source: "excel-csv",
          worksheet: "Primary",
          metric: "Deliveries",
          grain,
          region: prov,
          period: "Crop Year",
          grade: "",
          expected: cyExcelVal,
          actual: cyCsvVal,
          pass: closeEnough(cyExcelVal, cyCsvVal),
        });
      }
    }
  }

  // ─── 2. Process Producer Deliveries: 4 grains ─────────────────────

  console.error("[2/4] Process Producer Deliveries...");
  const processGrains = ["Canola", "Soybeans", "Flaxseed", "Wheat"];
  for (const grain of processGrains) {
    const grainOffset = PROCESS_GRAINS[grain];
    if (grainOffset === undefined) continue;

    const excelRow = PROCESS_SECTIONS.current_week + grainOffset;
    const excelCol = PROCESS_METRICS["Producer Deliveries"];
    const excelVal = getExcelCell(excel.workbook, "Process", excelRow, excelCol);
    const csvVal = csv.get("Process", "Producer Deliveries", "Current Week", grain, "", "");

    if (csvVal !== undefined) {
      checks.push({
        source: "excel-csv",
        worksheet: "Process",
        metric: "Producer Deliveries",
        grain,
        region: "",
        period: "Current Week",
        grade: "",
        expected: excelVal,
        actual: csvVal,
        pass: closeEnough(excelVal, csvVal),
      });
    }
  }

  // ─── 3. Summary spot checks ───────────────────────────────────────

  console.error("[3/4] Summary spot checks...");
  const summaryChecks = [
    { grain: "Wheat", metric: "Deliveries", row: 15, period: "Current Week" },
    { grain: "Canola", metric: "Deliveries", row: 15, period: "Current Week" },
    { grain: "Peas", metric: "Deliveries", row: 17, period: "Crop Year" },
    { grain: "Wheat", metric: "Deliveries", row: 17, period: "Crop Year" },
    { grain: "Canola", metric: "Exports", row: 27, period: "Current Week" },
    { grain: "Wheat", metric: "Exports", row: 29, period: "Crop Year" },
  ];

  for (const sc of summaryChecks) {
    const col = SUMMARY_GRAINS[sc.grain];
    if (!col) continue;
    const excelVal = getExcelCell(excel.workbook, "Summary", sc.row, col);

    // Summary in CSV maps to specific metric names
    const csvMetric = sc.metric === "Exports" ? "Exports" : "Deliveries";
    const csvVal = csv.get("Summary", csvMetric, sc.period, sc.grain, "", "");

    if (csvVal !== undefined) {
      checks.push({
        source: "excel-csv",
        worksheet: "Summary",
        metric: sc.metric,
        grain: sc.grain,
        region: "",
        period: sc.period,
        grade: "",
        expected: excelVal,
        actual: csvVal,
        pass: closeEnough(excelVal, csvVal),
      });
    }
  }

  // ─── 4. CSV ↔ Supabase checks ─────────────────────────────────────

  console.error("[4/4] CSV ↔ Supabase checks...");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    // Primary Deliveries — spot check 4 grains × 3 provinces
    const sbGrains = ["Wheat", "Canola", "Barley", "Peas"];
    for (const grain of sbGrains) {
      for (const prov of auditProvinces) {
        const csvVal = csv.get("Primary", "Deliveries", "Current Week", grain, "", prov);
        if (csvVal === undefined) continue;

        const sbVal = await querySupabase(
          "Primary", "Deliveries", "Current Week", grain, prov,
          latestWeek, cropYear
        );

        if (sbVal !== undefined) {
          checks.push({
            source: "csv-supabase",
            worksheet: "Primary",
            metric: "Deliveries",
            grain,
            region: prov,
            period: "Current Week",
            grade: "",
            expected: csvVal,
            actual: sbVal,
            pass: closeEnough(csvVal, sbVal),
          });
        }
      }
    }

    // Terminal Receipts — sum all grades (3 grains)
    for (const grain of ["Wheat", "Canola", "Barley"]) {
      const sbVal = await querySupabase(
        "Terminal Receipts", "Receipts", "Current Week", grain, "Total",
        latestWeek, cropYear, true // sumGrades
      );

      if (sbVal !== undefined) {
        // Get the CSV total by finding the Terminal Receipts Total row
        // CSV has per-grade rows for Terminal, so we need to sum them
        const csvTotal = sumCsvTerminalGrades(csv, grain, "Receipts", "Current Week");

        if (csvTotal !== undefined) {
          checks.push({
            source: "csv-supabase",
            worksheet: "Terminal Receipts",
            metric: "Receipts",
            grain,
            region: "Total",
            period: "Current Week",
            grade: "(sum all grades)",
            expected: csvTotal,
            actual: sbVal,
            pass: closeEnough(csvTotal, sbVal),
            note: "Terminal Receipts requires summing all grades",
          });
        }
      }
    }
  } else {
    console.error("  ⚠ Skipping Supabase checks — missing credentials");
  }

  // ─── Report ────────────────────────────────────────────────────────

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.filter((c) => !c.pass).length;

  const report: AuditReport = {
    week: latestWeek,
    crop_year: cropYear,
    timestamp: new Date().toISOString(),
    excel_file: `gsw-shg-${latestWeek}-en.xlsx`,
    csv_file: "gsw-shg-en.csv",
    total_checks: checks.length,
    passed,
    failed,
    checks,
  };

  console.error("\n─".repeat(50));
  console.error(`Audit complete: ${passed} passed, ${failed} failed out of ${checks.length} checks`);

  if (failed > 0) {
    console.error("\nFailed checks:");
    for (const c of checks.filter((c) => !c.pass)) {
      console.error(`  ✗ ${c.source}: ${c.worksheet}/${c.metric} ${c.grain} ${c.region} ${c.period} — expected ${c.expected}, got ${c.actual}`);
    }
  }

  // Output JSON to stdout
  console.log(JSON.stringify(report, null, 2));
}

// ─── Helpers ─────────────────────────────────────────────────────────

function detectLatestWeek(): number {
  // Find the highest week Excel file in data/
  for (let w = 52; w >= 1; w--) {
    const filepath = resolve(DATA_DIR, `gsw-shg-${w}-en.xlsx`);
    if (existsSync(filepath)) return w;
  }
  console.error("ERROR: No Excel files found in data/");
  process.exit(1);
}

function sumCsvTerminalGrades(
  csv: CsvLookup,
  grain: string,
  metric: string,
  period: string
): number | undefined {
  // Terminal worksheets in the CSV have per-grade rows
  // We need to re-parse the CSV to sum all grades for a given grain
  const csvPath = resolve(DATA_DIR, "gsw-shg-en.csv");
  const content = readFileSync(csvPath, "utf-8");
  const rows = parseCgcCsv(content);
  const cropYear = getCurrentCropYear();

  // Find the latest week in the CSV
  const weekRows = rows.filter(
    (r) =>
      r.worksheet === "Terminal Receipts" &&
      r.metric === metric &&
      r.period === period &&
      r.grain === grain &&
      r.region === "Total" &&
      r.crop_year === cropYear
  );

  if (weekRows.length === 0) return undefined;

  // Get the max week
  const maxWeek = Math.max(...weekRows.map((r) => r.grain_week));
  const targetRows = weekRows.filter((r) => r.grain_week === maxWeek);

  return targetRows.reduce((sum, r) => sum + r.ktonnes, 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
