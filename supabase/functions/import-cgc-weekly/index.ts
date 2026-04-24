/**
 * Supabase Edge Function: import-cgc-weekly
 *
 * Imports weekly CGC grain statistics into cgc_observations.
 *
 * The canonical production ingest path is the Vercel pipeline route at
 * /api/pipeline/run which calls this function with the desired week.
 *
 * Request body (all optional):
 *   {
 *     "week": 36,              // target week hint — filter rows to this week
 *     "crop_year": "2025-2026",// target crop year hint (long format)
 *     "csv_data": "..."        // pre-fetched CSV for operator recovery
 *   }
 *
 * CSV source strategy (in order of preference):
 *   1. `csv_data` from the request body (operator recovery — e.g. when CGC
 *      is bot-filtering Supabase IPs)
 *   2. Scrape the CGC index page, extract the current CSV URL, fetch it.
 *      (The real URL is `/{crop-year}/gsw-shg-en.csv` — a single crop-year
 *      file that CGC overwrites weekly.)
 *
 * The CSV contains the full crop-year (all weeks 1..N). When `week` is
 * provided we filter to that week to keep the upsert small and fast. When
 * omitted we upsert everything — useful for manual full-year recovery.
 *
 * Auth: requires x-bushel-internal-secret via requireInternalRequest().
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enqueueInternalFunction,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";
import { fetchLatestCgcCsv } from "../_shared/cgc-source.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CgcRow {
  crop_year: string;
  grain_week: number;
  week_ending_date: string;
  worksheet: string;
  metric: string;
  period: string;
  grain: string;
  grade: string;
  region: string;
  ktonnes: number;
}

// ---------------------------------------------------------------------------
// CSV Parser (duplicated from lib/cgc/parser.ts for Deno runtime)
// ---------------------------------------------------------------------------

function parseCgcCsv(csvText: string): CgcRow[] {
  const strip = (s: string) => s.trim().replace(/^"|"$/g, "");

  const lines = csvText.trim().split("\n");
  const rows: CgcRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length < 10) continue;

    const cropYear = strip(parts[0]);
    const grainWeek = strip(parts[1]);
    const dateStr = strip(parts[2]);
    const worksheet = strip(parts[3]);
    const metric = strip(parts[4]);
    const period = strip(parts[5]);
    const grain = strip(parts[6]);
    const grade = strip(parts[7] || "");
    const region = strip(parts[8]);
    const ktonnes = strip(parts[9]);

    // Convert DD/MM/YYYY to YYYY-MM-DD
    const dateParts = dateStr.split("/");
    const isoDate =
      dateParts.length === 3
        ? `${dateParts[2]}-${dateParts[1].padStart(2, "0")}-${dateParts[0].padStart(2, "0")}`
        : dateStr;

    rows.push({
      crop_year: cropYear,
      grain_week: parseInt(grainWeek, 10),
      week_ending_date: isoDate,
      worksheet: worksheet,
      metric: metric,
      period: period,
      grain: grain,
      grade: grade,
      region: region,
      ktonnes: parseFloat(ktonnes) || 0,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Crop year / week helpers
// ---------------------------------------------------------------------------

/** Returns crop year in long format: "2025-2026" (matches CGC CSV + cgc_observations convention).
 * Migrations 20260306200100 and 20260312153000 normalized all persisted crop_year values to
 * long format. Any helper that writes to cgc_imports/cgc_observations must stay in long format. */
function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed: 7 = August
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

// ---------------------------------------------------------------------------
// Edge Function handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const authError = requireInternalRequest(req);
  if (authError) {
    return authError;
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept optional overrides in request body
    const body = await req.json().catch(() => ({}));
    const targetWeek: number | undefined =
      typeof body.week === "number" ? body.week : undefined;
    const cropYearHint: string | undefined = body.crop_year;

    console.log(
      `Importing CGC data — target week: ${targetWeek ?? "(all)"}, crop year hint: ${cropYearHint ?? "(auto)"}`
    );

    // -- 1. Obtain the CSV --
    // Priority: explicit csv_data → scrape CGC index → fail
    let csvText: string;
    let sourceFile: string;

    if (body.csv_data && typeof body.csv_data === "string") {
      console.log(`Using pre-fetched CSV data (${body.csv_data.length} bytes)`);
      csvText = body.csv_data;
      sourceFile = "csv_data (operator)";
    } else {
      console.log("Scraping CGC index page for current CSV URL...");
      const payload = await fetchLatestCgcCsv();
      csvText = payload.csvText;
      sourceFile = payload.csvUrl;
      console.log(
        `Fetched CGC CSV: ${payload.csvUrl} (${csvText.length} bytes, crop year ${payload.cropYear}, latest week ${payload.grainWeek})`
      );
    }

    // -- 2. Parse CSV --
    const allRows = parseCgcCsv(csvText);
    console.log(`Parsed ${allRows.length} rows from CSV`);

    if (allRows.length === 0) {
      const msg = "No rows parsed — CSV may be empty or malformed";
      await supabase.from("cgc_imports").insert({
        crop_year: cropYearHint ?? getCurrentCropYear(),
        grain_week: targetWeek ?? 0,
        source_file: sourceFile,
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: msg,
      });
      return new Response(
        JSON.stringify({ error: msg, source: sourceFile }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // -- 3. Optionally filter to target week (fast-path for scheduled runs) --
    const rows = targetWeek
      ? allRows.filter((r) => r.grain_week === targetWeek)
      : allRows;

    // Actual crop year / week from data (authoritative, not caller hint)
    const actualCropYear =
      rows[0]?.crop_year ?? cropYearHint ?? getCurrentCropYear();
    const actualMaxWeek = rows.reduce((m, r) => Math.max(m, r.grain_week), 0);

    console.log(
      `Importing ${rows.length} rows (crop_year=${actualCropYear}, max week=${actualMaxWeek})`
    );

    if (rows.length === 0) {
      const msg = `CSV did not contain any rows for week ${targetWeek} — CGC may not have published it yet`;
      // grain_week 0 here instead of targetWeek: a failed attempt to import a
      // not-yet-published week must NOT leave a row tagged with a real week
      // number, or getLatestImportedWeek()/getDisplayWeek() would advertise a
      // phantom week to the UI. error_message preserves what was attempted.
      await supabase.from("cgc_imports").insert({
        crop_year: actualCropYear,
        grain_week: 0,
        source_file: sourceFile,
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: `${msg} (attempted week=${targetWeek ?? "(all)"})`,
      });
      return new Response(
        JSON.stringify({
          week: targetWeek,
          crop_year: actualCropYear,
          inserted: 0,
          skipped: 0,
          message: msg,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // -- 4. Batch upsert --
    let inserted = 0;
    let skipped = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("cgc_observations")
        .upsert(batch, {
          onConflict:
            "crop_year,grain_week,worksheet,metric,period,grain,grade,region",
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`Batch error:`, error.message);
        skipped += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    // -- 5. Audit row uses authoritative max week from the CSV --
    await supabase.from("cgc_imports").insert({
      crop_year: actualCropYear,
      grain_week: actualMaxWeek,
      source_file: sourceFile,
      rows_inserted: inserted,
      rows_skipped: skipped,
      status: skipped > 0 ? "partial" : "success",
    });

    // -- 6. Chain to validator on success --
    if (skipped === 0) {
      try {
        console.log("Queueing post-import validation...");
        await enqueueInternalFunction(supabase, "validate-import", {
          crop_year: actualCropYear,
          grain_week: actualMaxWeek,
        });
        console.log("Queued validate-import");
      } catch (chainErr) {
        console.error("validate-import queue failed:", chainErr);
        // Don't fail the import; validation is best-effort
      }
    }

    return new Response(
      JSON.stringify({
        week: actualMaxWeek,
        crop_year: actualCropYear,
        inserted,
        skipped,
        source: sourceFile,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err);

    // Best-effort audit logging — don't mask the original error
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      // grain_week 0: we don't know what week this attempt was targeting from
      // inside the catch. Do not advertise a calendar-derived week number here
      // — the freshness helpers key off max(grain_week) and would jump forward
      // into non-existent data. The error_message preserves diagnostic detail.
      await supabase.from("cgc_imports").insert({
        crop_year: getCurrentCropYear(),
        grain_week: 0,
        source_file: "unknown (catch block)",
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: String(err).slice(0, 500),
      });
    } catch {
      // swallow
    }

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
