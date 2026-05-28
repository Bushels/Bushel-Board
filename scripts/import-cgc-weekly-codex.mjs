#!/usr/bin/env node
/**
 * Deterministic CGC weekly importer for Codex automation.
 *
 * Flow:
 *   1. Read current Supabase CGC week.
 *   2. Fetch the live CGC weekly page and current crop-year CSV.
 *   3. Import the latest published CSV week via import-cgc-weekly Edge Function
 *      using csv_data, service-role auth, and internal request auth.
 *   4. Verify cgc_observations advanced.
 *   5. Write collector_cgc heartbeat rows for the 16 CAD grains.
 *
 * This intentionally avoids:
 *   - /api/cron/import-cgc, which is not the active routine path.
 *   - /api/pipeline/run, which currently has a V1 Grok kill-switch.
 *   - Direct Edge Function CSV fetching from Supabase egress, which CGC can block.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { writeSourceRun } from "./source-run.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const CGC_WEEKLY_PAGE_URL =
  "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/";
const CGC_ORIGIN = "https://www.grainscanada.gc.ca";
const EDGE_FUNCTION_NAME = "import-cgc-weekly";

const CAD_GRAINS = [
  "Amber Durum",
  "Barley",
  "Beans",
  "Canaryseed",
  "Canola",
  "Chick Peas",
  "Corn",
  "Flaxseed",
  "Lentils",
  "Mustard Seed",
  "Oats",
  "Peas",
  "Rye",
  "Soybeans",
  "Sunflower",
  "Wheat",
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; BushelBoardBot/1.0; +https://bushel-board-app.vercel.app)",
  Accept: "text/html,application/xhtml+xml,text/csv,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function help() {
  console.log(`Usage: node scripts/import-cgc-weekly-codex.mjs [options]

Options:
  --help             Show this help.
  --dry-run          Fetch and report current state without importing.
  --week <n>         Override target grain week. Default: latest week in CGC CSV.
  --no-heartbeats    Skip collector_cgc score_trajectory heartbeats.

Output:
  JSON summary to stdout. Diagnostics go to stderr.
`);
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    noHeartbeats: false,
    week: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--no-heartbeats") {
      args.noHeartbeats = true;
      continue;
    }
    if (arg === "--week") {
      const raw = argv[i + 1];
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1 || n > 53) {
        throw new Error(`Invalid --week value: ${raw}`);
      }
      args.week = n;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function loadEnv() {
  loadEnvFile(path.join(REPO_ROOT, ".env.local"));
  loadEnvFile(path.join(REPO_ROOT, ".env"));
}

function requiredEnv(name, ...alternates) {
  for (const key of [name, ...alternates]) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error(`Missing required env var: ${[name, ...alternates].join(" or ")}`);
}

function readEnvConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
    internalSecret: process.env.BUSHEL_INTERNAL_FUNCTION_SECRET ?? null,
  };
}

function extractCurrentCgcCsvUrl(pageHtml) {
  const match = pageHtml.match(
    /href="([^"]*\/grain-statistics-weekly\/[^"]*\/gsw-shg-en\.csv)"/i,
  );
  if (!match?.[1]) {
    throw new Error("Could not find current CGC CSV link on weekly statistics page");
  }
  return new URL(match[1], CGC_ORIGIN).toString();
}

function normalizeHeader(column) {
  return column.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_");
}

function isLikelyCgcCsv(csvText) {
  const firstLine = csvText.trimStart().split(/\r?\n/, 1)[0];
  const expected = [
    "crop_year",
    "grain_week",
    "week_ending_date",
    "worksheet",
    "metric",
    "period",
    "grain",
    "grade",
    "region",
    "ktonnes",
  ];
  const cols = firstLine.split(",").map(normalizeHeader);
  return expected.every((col, i) => cols[i] === col);
}

function parseCsvMetadata(csvText) {
  let cropYear = null;
  let latestWeek = -1;
  let weekEndingDate = null;
  let rowsForLatestWeek = 0;

  const lines = csvText.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;

    const rowCropYear = parts[0].trim().replace(/^"|"$/g, "");
    const rowWeek = Number.parseInt(parts[1].trim().replace(/^"|"$/g, ""), 10);
    const rowDate = parts[2].trim().replace(/^"|"$/g, "");
    if (!rowCropYear || !Number.isFinite(rowWeek)) continue;

    if (rowWeek > latestWeek) {
      cropYear = rowCropYear;
      latestWeek = rowWeek;
      weekEndingDate = normalizeCgcDate(rowDate);
      rowsForLatestWeek = 1;
    } else if (rowWeek === latestWeek) {
      rowsForLatestWeek += 1;
    }
  }

  if (!cropYear || latestWeek < 1) {
    throw new Error("Could not determine latest crop year/week from CGC CSV");
  }

  return { cropYear, latestWeek, weekEndingDate, rowsForLatestWeek };
}

function normalizeCgcDate(value) {
  const parts = value.split("/");
  if (parts.length !== 3) return value;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function fetchCgcCsv() {
  const pageStart = Date.now();
  const pageRes = await fetch(CGC_WEEKLY_PAGE_URL, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
  });
  if (!pageRes.ok) {
    throw new Error(`Failed to load CGC weekly page: HTTP ${pageRes.status}`);
  }
  const pageHtml = await pageRes.text();
  const pageMs = Date.now() - pageStart;
  const csvUrl = extractCurrentCgcCsvUrl(pageHtml);

  const csvStart = Date.now();
  const csvRes = await fetch(csvUrl, {
    headers: { ...BROWSER_HEADERS, Referer: CGC_WEEKLY_PAGE_URL },
    cache: "no-store",
  });
  if (!csvRes.ok) {
    throw new Error(`Failed to load CGC CSV: HTTP ${csvRes.status}`);
  }
  const csvText = await csvRes.text();
  const csvMs = Date.now() - csvStart;
  if (!isLikelyCgcCsv(csvText)) {
    throw new Error(
      `CGC response did not look like CSV (${csvText.length} bytes, starts ${JSON.stringify(csvText.slice(0, 80))})`,
    );
  }

  return {
    csvUrl,
    csvText,
    bytes: Buffer.byteLength(csvText, "utf8"),
    pageMs,
    csvMs,
    ...parseCsvMetadata(csvText),
  };
}

async function getBaselineWeek(supabase, cropYear) {
  const { data, error } = await supabase
    .from("cgc_observations")
    .select("grain_week")
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Preflight latest_week failed: ${error.message}`);
  return data?.[0]?.grain_week ?? null;
}

async function getRecentImports(supabase, limit = 3) {
  const { data, error } = await supabase
    .from("cgc_imports")
    .select("imported_at,grain_week,status,rows_inserted,error_message")
    .order("imported_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Preflight cgc_imports failed: ${error.message}`);
  return data ?? [];
}

async function getImportForRun(supabase, { grainWeek, runStartedAt }) {
  const { data, error } = await supabase
    .from("cgc_imports")
    .select("imported_at,grain_week,status,rows_inserted,error_message")
    .eq("grain_week", grainWeek)
    .gte("imported_at", runStartedAt)
    .order("imported_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Post-import cgc_imports attribution failed: ${error.message}`);
  return data?.[0] ?? null;
}

async function getLatestValidation(supabase, cropYear, grainWeek) {
  const { data, error } = await supabase
    .from("validation_reports")
    .select("created_at,crop_year,grain_week,status,checks")
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    return { error: error.message, row: null };
  }
  return { error: null, row: data?.[0] ?? null };
}

async function callImportEdgeFunction({
  supabaseUrl,
  serviceKey,
  internalSecret,
  csvText,
  targetWeek,
  cropYear,
}) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${EDGE_FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      "x-bushel-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      csv_data: csvText,
      crop_year: cropYear,
      week: targetWeek,
    }),
  });

  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }

  return { httpStatus: res.status, ok: res.ok, body };
}

function writeHeartbeat({ grain, cropYear, grainWeek, weekEndingDate }) {
  const evidence = {
    collector: "import-cgc-weekly-codex",
    crop_year: cropYear,
    grain_week: grainWeek,
    week_ending_date: weekEndingDate,
  };
  const signalNote = `CGC week ${grainWeek} refreshed (${weekEndingDate ?? "unknown date"})`;

  const result = spawnSync(
    "python3",
    [
      path.join("scripts", "write-collector-heartbeat.py"),
      "--side",
      "cad",
      "--market",
      grain,
      "--scan-type",
      "collector_cgc",
      "--trigger",
      "CGC weekly grain stats refresh",
      "--severity",
      "normal",
      "--signal-note",
      signalNote,
      "--grain-week",
      String(grainWeek),
      "--evidence-json",
      JSON.stringify(evidence),
      "--quiet",
      ...(weekEndingDate ? ["--source-week-ending", weekEndingDate] : []),
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: process.env,
    },
  );

  return {
    grain,
    ok: result.status === 0,
    exit_code: result.status,
    stderr: result.status === 0 ? null : result.stderr?.trim().slice(0, 500),
  };
}

async function writeFailureSourceRun(context, error) {
  if (context.args?.dryRun) {
    return null;
  }

  const { supabaseUrl, serviceKey } = readEnvConfig();
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      error: "source_run_not_written_missing_supabase_env",
    };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const message = error instanceof Error ? error.message : String(error);
  const source = context.source;
  const latestSourceLabel =
    source && context.targetWeek ? `${source.cropYear} wk ${context.targetWeek}` : null;

  return await writeSourceRun(supabase, {
    source_name: "cgc_observations",
    source_lane: "canada",
    collector_name: "import-cgc-weekly-codex",
    status: "failed",
    source_period_end: source?.weekEndingDate ?? null,
    latest_source_label: latestSourceLabel,
    rows_inserted: 0,
    error_message: message,
    source_url: source?.csvUrl ?? CGC_WEEKLY_PAGE_URL,
    started_at: context.runStartedAt,
    metadata: {
      stage: context.stage,
      baseline_week: context.baselineWeek,
      target_week: context.targetWeek,
      source_crop_year: source?.cropYear ?? null,
      source_latest_week: source?.latestWeek ?? null,
      source_rows_for_latest_week: source?.rowsForLatestWeek ?? null,
      stack: error instanceof Error ? error.stack?.slice(0, 2000) : null,
    },
  });
}

async function main() {
  const runStartedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  const context = {
    runStartedAt,
    args,
    stage: "env",
    source: null,
    targetWeek: null,
    baselineWeek: null,
  };

  try {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const internalSecret = requiredEnv("BUSHEL_INTERNAL_FUNCTION_SECRET");
    const supabase = createClient(supabaseUrl, serviceKey);

    context.stage = "source_fetch";
    const source = await fetchCgcCsv();
    context.source = source;

    const targetWeek = args.week ?? source.latestWeek;
    context.targetWeek = targetWeek;

    context.stage = "preflight";
    const [baselineWeek, recentImports] = await Promise.all([
      getBaselineWeek(supabase, source.cropYear),
      getRecentImports(supabase, 3),
    ]);
    context.baselineWeek = baselineWeek;

    const baseSummary = {
      baseline_week: baselineWeek,
      target_week: targetWeek,
      source_latest_week: source.latestWeek,
      source_crop_year: source.cropYear,
      source_week_ending: source.weekEndingDate,
      source_rows_for_latest_week: source.rowsForLatestWeek,
      source_csv_url: source.csvUrl,
      source_bytes: source.bytes,
      recent_imports: recentImports,
    };

    if (args.dryRun) {
      console.log(
        JSON.stringify(
          {
            ...baseSummary,
            dry_run: true,
            import_status: "dry_run",
            verdict: "DRY_RUN",
          },
          null,
          2,
        ),
      );
      return;
    }

    if (baselineWeek !== null && targetWeek <= baselineWeek) {
      const sourceRun = await writeSourceRun(supabase, {
        source_name: "cgc_observations",
        source_lane: "canada",
        collector_name: "import-cgc-weekly-codex",
        status: "skipped",
        source_period_end: source.weekEndingDate,
        latest_source_label: `${source.cropYear} wk ${targetWeek}`,
        rows_skipped: source.rowsForLatestWeek,
        source_url: source.csvUrl,
        started_at: runStartedAt,
        metadata: {
          reason: "already_current",
          baseline_week: baselineWeek,
          target_week: targetWeek,
          source_crop_year: source.cropYear,
          source_latest_week: source.latestWeek,
          source_rows_for_latest_week: source.rowsForLatestWeek,
        },
      });
      console.log(
        JSON.stringify(
          {
            ...baseSummary,
            new_latest_week: baselineWeek,
            delta: 0,
            import_status: "skipped_already_current",
            rows_inserted: 0,
            error_message: null,
            source_run: sourceRun,
            verdict: "ALREADY_CURRENT",
          },
          null,
          2,
        ),
      );
      return;
    }

    context.stage = "edge_import";
    console.error(`Importing CGC week ${targetWeek} via ${EDGE_FUNCTION_NAME}...`);
    const importResponse = await callImportEdgeFunction({
      supabaseUrl,
      serviceKey,
      internalSecret,
      csvText: source.csvText,
      targetWeek,
      cropYear: source.cropYear,
    });

    if (!importResponse.ok) {
      const errorMessage = JSON.stringify(importResponse.body).slice(0, 1000);
      const sourceRun = await writeSourceRun(supabase, {
        source_name: "cgc_observations",
        source_lane: "canada",
        collector_name: "import-cgc-weekly-codex",
        status: "failed",
        source_period_end: source.weekEndingDate,
        latest_source_label: `${source.cropYear} wk ${targetWeek}`,
        rows_inserted: 0,
        error_message: errorMessage,
        source_url: source.csvUrl,
        started_at: runStartedAt,
        metadata: {
          stage: context.stage,
          http_status: importResponse.httpStatus,
          baseline_week: baselineWeek,
          target_week: targetWeek,
          source_crop_year: source.cropYear,
          source_latest_week: source.latestWeek,
          edge_function_body: importResponse.body,
        },
      });
      console.log(
        JSON.stringify(
          {
            ...baseSummary,
            http_status: importResponse.httpStatus,
            new_latest_week: baselineWeek,
            delta: 0,
            import_status: "failed",
            rows_inserted: 0,
            error_message: errorMessage,
            source_run: sourceRun,
            verdict: "FAILED",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    context.stage = "post_import_verify";
    const [newLatestWeek, attributedImport] = await Promise.all([
      getBaselineWeek(supabase, source.cropYear),
      getImportForRun(supabase, { grainWeek: targetWeek, runStartedAt }),
    ]);
    const delta =
      typeof baselineWeek === "number" && typeof newLatestWeek === "number"
        ? newLatestWeek - baselineWeek
        : null;
    const attributionError =
      attributedImport == null
        ? `No cgc_imports row found for grain_week ${targetWeek} at or after ${runStartedAt}`
        : null;
    const importStatus = attributedImport?.status ?? "failed";

    let heartbeatResults = [];
    if (delta !== null && delta >= 1 && importStatus === "success" && !args.noHeartbeats) {
      console.error("Writing collector_cgc heartbeats...");
      heartbeatResults = CAD_GRAINS.map((grain) =>
        writeHeartbeat({
          grain,
          cropYear: source.cropYear,
          grainWeek: newLatestWeek,
          weekEndingDate: source.weekEndingDate,
        }),
      );
    }

    const latestValidation =
      typeof newLatestWeek === "number"
        ? await getLatestValidation(supabase, source.cropYear, newLatestWeek)
        : { error: "new_latest_week_unavailable", row: null };

    const verdict =
      importStatus === "partial"
        ? "PARTIAL_IMPORT"
        : importStatus === "success" && delta !== null && delta >= 1
          ? "NEW_WEEK_IMPORTED"
          : importStatus === "success" && delta === 0
            ? "ALREADY_CURRENT"
            : "FAILED";

    const sourceRunStatus =
      importStatus === "partial" ? "partial" : importStatus === "success" ? "success" : "failed";
    const sourceRun = await writeSourceRun(supabase, {
      source_name: "cgc_observations",
      source_lane: "canada",
      collector_name: "import-cgc-weekly-codex",
      status: sourceRunStatus,
      source_period_end: source.weekEndingDate,
      latest_source_label: `${source.cropYear} wk ${newLatestWeek ?? targetWeek}`,
      rows_inserted: attributedImport?.rows_inserted ?? 0,
      rows_skipped: 0,
      error_message: attributedImport?.error_message ?? attributionError,
      source_url: source.csvUrl,
      started_at: runStartedAt,
      metadata: {
        baseline_week: baselineWeek,
        target_week: targetWeek,
        source_crop_year: source.cropYear,
        source_latest_week: source.latestWeek,
        source_rows_for_latest_week: source.rowsForLatestWeek,
        edge_function_body: importResponse.body,
        attributed_import: attributedImport,
        heartbeat_results: heartbeatResults,
        latest_validation: latestValidation,
        verdict,
      },
    });

    console.log(
      JSON.stringify(
        {
          ...baseSummary,
          http_status: importResponse.httpStatus,
          edge_function_body: importResponse.body,
          new_latest_week: newLatestWeek,
          delta,
          import_status: importStatus,
          rows_inserted: attributedImport?.rows_inserted ?? null,
          error_message: attributedImport?.error_message ?? attributionError,
          attributed_import: attributedImport,
          heartbeat_results: heartbeatResults,
          latest_validation: latestValidation,
          source_run: sourceRun,
          verdict,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const sourceRun = await writeFailureSourceRun(context, err);
    console.log(
      JSON.stringify(
        {
          baseline_week: context.baselineWeek,
          target_week: context.targetWeek,
          source_crop_year: context.source?.cropYear ?? null,
          source_latest_week: context.source?.latestWeek ?? null,
          source_week_ending: context.source?.weekEndingDate ?? null,
          stage: context.stage,
          import_status: "failed",
          rows_inserted: 0,
          error_message: message,
          source_run: sourceRun,
          verdict: "FAILED",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
