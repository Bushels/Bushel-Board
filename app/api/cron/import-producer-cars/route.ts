import { createClient } from "@supabase/supabase-js";
import {
  fetchProducerCarCsv,
  parseProducerCarCsv,
  getCurrentCropYear,
} from "@/lib/importers/producer-car-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron Route: Import Producer Car Allocations
 *
 * Fetches CGC Producer Car CSV directly from grainscanada.gc.ca,
 * parses it, and upserts into producer_car_allocations table.
 *
 * Runs on Vercel (not Edge Function) because CGC blocks Supabase
 * Edge Function IPs (connection reset).
 *
 * Schedule: Weekly Thursday ~2pm MST
 * vercel.json: { "path": "/api/cron/import-producer-cars", "schedule": "0 21 * * 4" }
 * (21:00 UTC = 2:00 PM MST on Thursdays)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const cropYear = getCurrentCropYear();

  try {
    // 1. Fetch CSV from CGC (Vercel nodes can reach grainscanada.gc.ca)
    console.log(`[cron/import-producer-cars] Fetching CSV for ${cropYear}`);
    const csvText = await fetchProducerCarCsv(cropYear);
    const lineCount = csvText.trim().split("\n").length - 1;
    console.log(`[cron/import-producer-cars] Fetched ${lineCount} CSV rows`);

    if (lineCount <= 0) {
      return Response.json({
        source: "vercel-cron",
        status: "empty",
        message: `No producer car data found for ${cropYear}`,
        crop_year: cropYear,
      });
    }

    // 2. Parse CSV to DB schema
    const rows = parseProducerCarCsv(csvText);

    if (rows.length === 0) {
      return Response.json({
        source: "vercel-cron",
        status: "empty",
        message: "CSV parsed but produced no valid rows",
        crop_year: cropYear,
        csv_rows: lineCount,
      });
    }

    // 3. Supabase service-role client (direct insert, no Edge Function)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4. Upsert in batches of 50
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
        console.error(`[cron/import-producer-cars] Batch error:`, error);
      } else {
        upserted += batch.length;
      }
    }

    // 5. Summary
    const grains = [...new Set(rows.map((r) => r.grain))];
    const weeks = [...new Set(rows.map((r) => r.grain_week))].sort(
      (a, b) => a - b
    );
    const maxWeek = weeks[weeks.length - 1] ?? 0;

    const result = {
      source: "vercel-cron",
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
      `[cron/import-producer-cars] Complete:`,
      JSON.stringify(result)
    );

    return Response.json(result, {
      status: errors.length > 0 ? 207 : 200,
    });
  } catch (error) {
    console.error("[cron/import-producer-cars] Failed:", error);
    return Response.json(
      {
        source: "vercel-cron",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
