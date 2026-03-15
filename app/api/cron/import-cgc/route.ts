import { parseCgcCsv } from "@/lib/cgc/parser";
import { fetchCurrentCgcCsv } from "@/lib/cgc/source";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OBSERVATION_CONFLICT_COLUMNS =
  "crop_year,grain_week,worksheet,metric,period,grain,grade,region";
const BATCH_SIZE = 1000;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildInternalHeaders(secret: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-bushel-internal-secret": secret,
  };
}

function parseJsonOrRaw(rawText: string): unknown {
  try {
    return rawText ? (JSON.parse(rawText) as unknown) : null;
  } catch {
    return rawText;
  }
}

async function countWeekRows(
  supabase: SupabaseClient,
  cropYear: string,
  grainWeek: number
): Promise<number> {
  const { count, error } = await supabase
    .from("cgc_observations")
    .select("*", { count: "exact", head: true })
    .eq("crop_year", cropYear)
    .eq("grain_week", grainWeek);

  if (error) {
    throw new Error(`Failed to count imported rows: ${error.message}`);
  }

  return count ?? 0;
}

async function logImport(
  supabase: SupabaseClient,
  payload: {
    crop_year: string;
    grain_week: number;
    source_file: string;
    rows_inserted: number;
    rows_skipped: number;
    status: string;
    error_message?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("cgc_imports").insert(payload);
  if (error) {
    console.error("[cron/import-cgc] Failed to write import audit log:", error);
  }
}

export async function GET(request: Request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !internalSecret) {
    return Response.json(
      {
        error:
          "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BUSHEL_INTERNAL_FUNCTION_SECRET",
      },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let cropYear: string | null = null;
  let grainWeek: number | null = null;
  let csvUrl: string | null = null;

  try {
    const source = await fetchCurrentCgcCsv();
    cropYear = source.cropYear;
    grainWeek = source.grainWeek;
    csvUrl = source.csvUrl;

    const allRows = parseCgcCsv(source.csvText);

    // Import ALL rows for the current crop year — not just the current week.
    // CGC revises prior-week data when publishing new weeks (preliminary → final).
    // Filtering to only the current week causes stale data for revised weeks.
    const cropYearRows = allRows.filter(
      (row) => row.crop_year === cropYear
    );

    if (cropYearRows.length === 0) {
      await logImport(supabase, {
        crop_year: cropYear,
        grain_week: grainWeek,
        source_file: `${csvUrl} (vercel-cron)`,
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: "Current CGC CSV did not contain rows for the detected crop year",
      });

      return Response.json(
        {
          error: "Current CGC CSV did not contain rows for the detected crop year",
          week: grainWeek,
          crop_year: cropYear,
          source_url: csvUrl,
        },
        { status: 502 }
      );
    }

    const beforeCount = await countWeekRows(supabase, cropYear, grainWeek);
    const batchErrors: string[] = [];

    for (let index = 0; index < cropYearRows.length; index += BATCH_SIZE) {
      const batch = cropYearRows.slice(index, index + BATCH_SIZE);
      // ignoreDuplicates: false = ON CONFLICT DO UPDATE — overwrites stale
      // rows with CGC's revised values instead of silently skipping them.
      const { error } = await supabase.from("cgc_observations").upsert(batch, {
        onConflict: OBSERVATION_CONFLICT_COLUMNS,
        ignoreDuplicates: false,
      });

      if (error) {
        batchErrors.push(error.message);
        console.error(
          `[cron/import-cgc] Batch ${Math.floor(index / BATCH_SIZE) + 1} failed:`,
          error
        );
      }
    }

    const afterCount = await countWeekRows(supabase, cropYear, grainWeek);
    const newCurrentWeekRows = Math.max(afterCount - beforeCount, 0);
    const importStatus = batchErrors.length > 0 ? "partial" : "success";

    await logImport(supabase, {
      crop_year: cropYear,
      grain_week: grainWeek,
      source_file: `${csvUrl} (vercel-cron)`,
      rows_inserted: cropYearRows.length,
      rows_skipped: 0,
      status: importStatus,
      error_message:
        batchErrors.length > 0
          ? batchErrors.join(" | ").slice(0, 500)
          : null,
    });

    console.log(
      `[cron/import-cgc] Upserted ${cropYearRows.length} crop-year rows from ${csvUrl} for ${cropYear} week ${grainWeek}; new_current_week_rows=${newCurrentWeekRows}`
    );

    if (batchErrors.length > 0) {
      return Response.json(
        {
          error: "One or more import batches failed",
          week: grainWeek,
          crop_year: cropYear,
          source_url: csvUrl,
          rows_upserted: cropYearRows.length,
          new_current_week_rows: newCurrentWeekRows,
          batch_errors: batchErrors,
        },
        { status: 502 }
      );
    }

    const validationResponse = await fetch(
      `${supabaseUrl}/functions/v1/validate-import`,
      {
        method: "POST",
        headers: buildInternalHeaders(internalSecret),
        body: JSON.stringify({
          crop_year: cropYear,
          grain_week: grainWeek,
        }),
      }
    );

    const rawValidationResult = await validationResponse.text();
    const validationResult = parseJsonOrRaw(rawValidationResult);

    console.log(
      "[cron/import-cgc] validate-import response:",
      validationResult
    );

    if (!validationResponse.ok) {
      return Response.json(
        {
          error: `validate-import returned HTTP ${validationResponse.status}`,
          week: grainWeek,
          crop_year: cropYear,
          source_url: csvUrl,
          rows_upserted: cropYearRows.length,
          validation_result: validationResult,
        },
        { status: 502 }
      );
    }

    const validationStatus =
      validationResult &&
      typeof validationResult === "object" &&
      "status" in validationResult &&
      typeof validationResult.status === "string"
        ? validationResult.status
        : null;

    const chainTriggered =
      validationResult &&
      typeof validationResult === "object" &&
      "chain_triggered" in validationResult &&
      validationResult.chain_triggered === true;

    if (
      validationStatus !== "pass" ||
      !chainTriggered
    ) {
      return Response.json(
        {
          error: "Import succeeded but validation did not pass cleanly",
          week: grainWeek,
          crop_year: cropYear,
          source_url: csvUrl,
          rows_upserted: cropYearRows.length,
          new_current_week_rows: newCurrentWeekRows,
          validation_result: validationResult,
        },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      source: "vercel-cron",
      week: grainWeek,
      crop_year: cropYear,
      source_url: csvUrl,
      rows_upserted: cropYearRows.length,
      new_current_week_rows: newCurrentWeekRows,
      validation_result: validationResult,
    });
  } catch (routeError) {
    console.error("[cron/import-cgc] Failed:", routeError);

    if (cropYear && grainWeek && csvUrl) {
      await logImport(supabase, {
        crop_year: cropYear,
        grain_week: grainWeek,
        source_file: `${csvUrl} (vercel-cron)`,
        rows_inserted: 0,
        rows_skipped: 0,
        status: "failed",
        error_message: getErrorMessage(routeError).slice(0, 500),
      });
    }

    return Response.json(
      {
        error: getErrorMessage(routeError),
        week: grainWeek,
        crop_year: cropYear,
      },
      { status: 500 }
    );
  }
}
