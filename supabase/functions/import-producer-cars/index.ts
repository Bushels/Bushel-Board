import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalRequest } from "../_shared/internal-auth.ts";
import {
  fetchProducerCarCsv,
  parseProducerCarCsv,
} from "../_shared/producer-car-parser.ts";

/**
 * import-producer-cars Edge Function
 *
 * Fetches the cumulative Producer Car Allocation CSV from CGC
 * and upserts into the producer_car_allocations table.
 *
 * Auth: internal-secret only (no public access)
 * Trigger: Vercel cron via /api/cron/import-producer-cars
 * Schedule: Weekly Thursday ~2pm MST (after CGC publishes)
 *
 * POST body (optional):
 *   { "crop_year": "2025-2026" }
 *   Defaults to current crop year if omitted.
 */

/** Determine current crop year based on date. CGC crop year starts August 1. */
function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  // Crop year 2025-2026 starts August 1 2025, ends July 31 2026
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

Deno.serve(async (req: Request) => {
  // 1. Auth check — internal-secret only
  const authError = requireInternalRequest(req);
  if (authError) return authError;

  try {
    // 2. Parse optional crop_year from body
    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year ?? getCurrentCropYear();

    console.log(
      `[import-producer-cars] Starting import for crop year ${cropYear}`
    );

    // 3. Fetch CSV from CGC
    const csvText = await fetchProducerCarCsv(cropYear);
    const lineCount = csvText.trim().split("\n").length - 1;
    console.log(`[import-producer-cars] Fetched ${lineCount} CSV rows`);

    if (lineCount <= 0) {
      return new Response(
        JSON.stringify({
          status: "empty",
          message: `No producer car data found for crop year ${cropYear}`,
          crop_year: cropYear,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Parse CSV to DB schema
    const rows = parseProducerCarCsv(csvText);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          status: "empty",
          message: "CSV parsed but produced no valid rows",
          crop_year: cropYear,
          csv_rows: lineCount,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Supabase service-role client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 6. Upsert in batches of 50
    const BATCH_SIZE = 50;
    let upserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("producer_car_allocations")
        .upsert(batch, { onConflict: "crop_year,grain_week,grain" });

      if (error) {
        errors.push(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`
        );
        console.error(`[import-producer-cars] Batch error:`, error);
      } else {
        upserted += batch.length;
      }
    }

    // 7. Summary
    const grains = [...new Set(rows.map((r) => r.grain))];
    const weeks = [...new Set(rows.map((r) => r.grain_week))].sort(
      (a, b) => a - b
    );
    const maxWeek = weeks[weeks.length - 1] ?? 0;

    const result = {
      status: errors.length > 0 ? "partial" : "success",
      crop_year: cropYear,
      csv_rows: lineCount,
      rows_parsed: rows.length,
      rows_upserted: upserted,
      grains,
      weeks_range: `${weeks[0] ?? 0}-${maxWeek}`,
      max_week: maxWeek,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(
      `[import-producer-cars] Complete:`,
      JSON.stringify(result)
    );

    return new Response(JSON.stringify(result), {
      status: errors.length > 0 ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[import-producer-cars] Failed:", err);
    return new Response(
      JSON.stringify({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
