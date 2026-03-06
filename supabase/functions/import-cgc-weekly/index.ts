/**
 * Supabase Edge Function: import-cgc-weekly
 *
 * Downloads the latest weekly CGC grain statistics CSV from grainscanada.gc.ca,
 * parses it, and upserts rows into cgc_observations. Logs the result to cgc_imports.
 *
 * Triggered by pg_cron every Thursday at 8pm UTC (1pm MST) or manually via POST.
 *
 * Request body (optional):
 *   { "week": 29, "crop_year": "2025-2026" }
 *
 * If no body is provided, auto-detects the current grain week and crop year.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CGC_BASE_URL =
  "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/";

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

function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed: 7 = August
  if (month >= 7) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const cropYearStart =
    month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  const diffMs = now.getTime() - cropYearStart.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

// ---------------------------------------------------------------------------
// Edge Function handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept optional overrides in request body
    const body = await req.json().catch(() => ({}));
    const targetWeek: number = body.week || getCurrentGrainWeek();
    const cropYear: string = body.crop_year || getCurrentCropYear();

    console.log(
      `Fetching CGC data for week ${targetWeek}, crop year ${cropYear}`
    );

    // Fetch the individual week CSV from CGC
    const csvUrl = `${CGC_BASE_URL}gsw-shg-${targetWeek}-en.csv`;
    const response = await fetch(csvUrl);

    if (!response.ok) {
      // Log the failure and return a non-500 so pg_cron does not retry
      await supabase.from("cgc_imports").insert({
        crop_year: cropYear,
        grain_week: targetWeek,
        source_file: `gsw-shg-${targetWeek}-en.csv`,
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: `HTTP ${response.status}: ${response.statusText}`,
      });

      return new Response(
        JSON.stringify({
          error: `Failed to fetch week ${targetWeek}`,
          status: response.status,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const csvText = await response.text();
    const rows = parseCgcCsv(csvText);
    console.log(`Parsed ${rows.length} rows`);

    // Batch upsert — 500 rows per batch (Edge Function has tighter limits)
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
          ignoreDuplicates: true,
        });

      if (error) {
        console.error(`Batch error:`, error.message);
        skipped += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    // Log the import
    await supabase.from("cgc_imports").insert({
      crop_year: cropYear,
      grain_week: targetWeek,
      source_file: `gsw-shg-${targetWeek}-en.csv`,
      rows_inserted: inserted,
      rows_skipped: skipped,
      status: skipped > 0 ? "partial" : "success",
    });

    // Chain-trigger intelligence generation
    if (skipped === 0) {
      try {
        console.log("Triggering intelligence generation...");
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-intelligence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ crop_year: cropYear, grain_week: targetWeek }),
          }
        );
      } catch (chainErr) {
        console.error("Intelligence chain-trigger failed:", chainErr);
        // Don't fail the import — intelligence generation is best-effort
      }
    }

    return new Response(
      JSON.stringify({ week: targetWeek, crop_year: cropYear, inserted, skipped }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err);

    // Log the failure to cgc_imports for audit trail
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("cgc_imports").insert({
        crop_year: getCurrentCropYear(),
        grain_week: getCurrentGrainWeek(),
        source_file: "unknown (catch block)",
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: String(err).slice(0, 500),
      });
    } catch {
      // Best-effort audit logging — don't mask the original error
    }

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
