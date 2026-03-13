import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalRequest } from "../_shared/internal-auth.ts";
import {
  fetchCftcCotData,
  parseCftcCotRows,
} from "../_shared/cftc-cot-parser.ts";

Deno.serve(async (req: Request) => {
  // 1. Auth check — internal-secret only
  const authError = requireInternalRequest(req);
  if (authError) return authError;

  try {
    // 2. Parse optional report_date from body
    const body = await req.json().catch(() => ({}));
    const reportDate: string | undefined = body.report_date;

    // 3. Fetch from CFTC SODA API
    const apiRows = await fetchCftcCotData(reportDate);
    if (apiRows.length === 0) {
      return new Response(
        JSON.stringify({
          status: "empty",
          message: "No CFTC data returned for the requested date",
          report_date: reportDate ?? "latest",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Parse to DB schema
    const positions = parseCftcCotRows(apiRows);

    // 5. Supabase service-role client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 6. Upsert in batches of 50
    const BATCH_SIZE = 50;
    let upserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < positions.length; i += BATCH_SIZE) {
      const batch = positions.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("cftc_cot_positions")
        .upsert(batch, { onConflict: "report_date,commodity" });

      if (error) {
        errors.push(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`,
        );
        console.error(`[import-cftc-cot] Batch error:`, error);
      } else {
        upserted += batch.length;
      }
    }

    // 7. Summary
    const reportDates = [...new Set(positions.map((p) => p.report_date))];
    const commodities = [...new Set(positions.map((p) => p.commodity))];

    const result = {
      status: errors.length > 0 ? "partial" : "success",
      rows_fetched: apiRows.length,
      rows_parsed: positions.length,
      rows_upserted: upserted,
      report_dates: reportDates,
      commodities,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`[import-cftc-cot] Complete:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: errors.length > 0 ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[import-cftc-cot] Failed:", err);
    return new Response(
      JSON.stringify({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
