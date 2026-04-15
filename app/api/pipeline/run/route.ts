/**
 * POST /api/pipeline/run
 *
 * Parallel pipeline orchestrator — fires all grain analyses simultaneously
 * via pg_net, polls pipeline_runs for completion, then triggers farm
 * summaries and health checks.
 *
 * Auth: Requires either:
 *   - Authorization: Bearer <CRON_SECRET>
 *   - x-bushel-internal-secret header
 *
 * Body (all optional):
 *   { grains?: string[], skip_import?: boolean, crop_year?: string, triggered_by?: string }
 *
 * Returns JSON with run_id, status, duration, grain counts.
 */

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel serverless max — we need ~90-120s

// -- All 16 Canadian grains in the pipeline --
const ALL_GRAINS = [
  "Wheat",
  "Canola",
  "Barley",
  "Oats",
  "Peas",
  "Corn",
  "Flaxseed",
  "Soybeans",
  "Amber Durum",
  "Lentils",
  "Rye",
  "Mustard Seed",
  "Sunflower Seed",
  "Canary Seed",
  "Triticale",
  "Chickpeas",
];

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Auth — accept CRON_SECRET (Bearer) or BUSHEL_INTERNAL_FUNCTION_SECRET
// ---------------------------------------------------------------------------

function authorizePipelineRequest(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  // Check Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return null; // authorized
  }

  // Check x-bushel-internal-secret header
  const internalHeader = request.headers.get("x-bushel-internal-secret");
  if (internalSecret && internalHeader === internalSecret) {
    return null; // authorized
  }

  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// ---------------------------------------------------------------------------
// Helper: sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const authError = authorizePipelineRequest(request);
  if (authError) return authError;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  if (!supabaseUrl || !supabaseServiceKey || !internalSecret) {
    return Response.json(
      { error: "Missing required environment variables (SUPABASE_URL, SERVICE_ROLE_KEY, or INTERNAL_SECRET)" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startTime = Date.now();

  try {
    // -- Parse request body --
    const body = await request.json().catch(() => ({}));
    const requestedGrains: string[] = body.grains ?? ALL_GRAINS;
    const skipImport: boolean = body.skip_import === true;
    const triggeredBy: string = body.triggered_by ?? "manual";

    // -- Determine crop_year and grain_week --
    const cropYear: string =
      body.crop_year ?? getCurrentCropYear();

    const { data: latestWeekData } = await supabase
      .from("cgc_observations")
      .select("grain_week")
      .eq("crop_year", cropYear)
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();

    const grainWeek: number = latestWeekData?.grain_week ?? 1;

    console.log(
      `[pipeline/run] Starting parallel run: ${requestedGrains.length} grains, week ${grainWeek}, crop year ${cropYear}, skip_import=${skipImport}`
    );

    // -- Step 1: Optional CGC import --
    if (!skipImport) {
      console.log("[pipeline/run] Triggering CGC import...");
      try {
        const importRes = await fetch(
          `${supabaseUrl}/functions/v1/import-cgc-weekly`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-bushel-internal-secret": internalSecret,
            },
            body: JSON.stringify({ crop_year: cropYear }),
          }
        );
        const importResult = await importRes.json().catch(() => null);
        console.log(
          `[pipeline/run] Import: HTTP ${importRes.status}`,
          importResult
        );
      } catch (err) {
        console.error("[pipeline/run] Import failed (continuing):", err);
      }
    }

    // -- Step 2: Create pipeline_runs row --
    const { data: runRow, error: runInsertErr } = await supabase
      .from("pipeline_runs")
      .insert({
        crop_year: cropYear,
        grain_week: grainWeek,
        grains_requested: requestedGrains,
        triggered_by: triggeredBy,
      })
      .select("id")
      .single();

    if (runInsertErr || !runRow) {
      return Response.json(
        { error: `Failed to create pipeline run: ${runInsertErr?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    const runId: string = runRow.id;
    console.log(`[pipeline/run] Created run ${runId}`);

    // -- Step 3: Fire all grain analyses in parallel via pg_net --
    const enqueuePromises = requestedGrains.map((grain) =>
      supabase
        .rpc("enqueue_internal_function", {
          p_function_name: "analyze-grain-market",
          p_body: {
            crop_year: cropYear,
            grain_week: grainWeek,
            grains: [grain],
            run_id: runId,
          },
        })
        .then(({ data, error }) => {
          if (error) {
            console.error(`[pipeline/run] Failed to enqueue ${grain}:`, error.message);
            return { grain, queued: false, error: error.message };
          }
          console.log(`[pipeline/run] Queued ${grain} (pg_net request ${data})`);
          return { grain, queued: true, requestId: data };
        })
    );

    const enqueueResults = await Promise.all(enqueuePromises);
    const queuedCount = enqueueResults.filter((r) => r.queued).length;
    const failedToQueue = enqueueResults.filter((r) => !r.queued);

    // Mark grains that failed to queue
    for (const failed of failedToQueue) {
      const { error: statusErr } = await supabase.rpc("update_pipeline_grain_status", {
        p_run_id: runId,
        p_grain: failed.grain,
        p_status: "failed",
        p_error: `Queue failed: ${failed.error}`,
      });
      if (statusErr) console.error(`[pipeline/run] Status update failed for ${failed.grain}:`, statusErr.message);
    }

    console.log(
      `[pipeline/run] Queued ${queuedCount}/${requestedGrains.length} grains`
    );

    // -- Step 4: Poll for completion --
    const pollStart = Date.now();
    let lastCompleted = 0;
    let lastFailed = failedToQueue.length;

    while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);

      const { data: progress } = await supabase
        .from("pipeline_runs")
        .select("grains_completed, grains_failed")
        .eq("id", runId)
        .single();

      if (!progress) continue;

      const completed = progress.grains_completed?.length ?? 0;
      const failed = progress.grains_failed?.length ?? 0;
      const total = requestedGrains.length;

      if (completed !== lastCompleted || failed !== lastFailed) {
        console.log(
          `[pipeline/run] Progress: ${completed}/${total} completed, ${failed} failed`
        );
        lastCompleted = completed;
        lastFailed = failed;
      }

      if (completed + failed >= total) {
        console.log("[pipeline/run] All grains reported");
        break;
      }
    }

    // -- Step 5: Handle timeout — mark unreported grains as timed out --
    const { data: finalState } = await supabase
      .from("pipeline_runs")
      .select("grains_completed, grains_failed")
      .eq("id", runId)
      .single();

    const completedGrains = new Set(finalState?.grains_completed ?? []);
    const failedGrains = new Set(finalState?.grains_failed ?? []);

    for (const grain of requestedGrains) {
      if (!completedGrains.has(grain) && !failedGrains.has(grain)) {
        const { error: timeoutErr } = await supabase.rpc("update_pipeline_grain_status", {
          p_run_id: runId,
          p_grain: grain,
          p_status: "failed",
          p_error: "Timed out after 120s",
        });
        if (timeoutErr) console.error(`[pipeline/run] Timeout status update failed for ${grain}:`, timeoutErr.message);
      }
    }

    // -- Step 6: Finalize the run --
    await supabase.rpc("complete_pipeline_run", { p_run_id: runId });

    // Read final status
    const { data: finalRun } = await supabase
      .from("pipeline_runs")
      .select("*")
      .eq("id", runId)
      .single();

    const grainsCompleted = finalRun?.grains_completed?.length ?? 0;
    const grainsFailed = finalRun?.grains_failed?.length ?? 0;

    // -- Step 7: Trigger farm summaries (if any grains succeeded) --
    let farmSummaryTriggered = false;
    if (grainsCompleted > 0) {
      console.log("[pipeline/run] Triggering generate-farm-summary...");
      try {
        await supabase.rpc("enqueue_internal_function", {
          p_function_name: "generate-farm-summary",
          p_body: {
            crop_year: cropYear,
            grain_week: grainWeek,
          },
        });
        farmSummaryTriggered = true;
      } catch (err) {
        console.error("[pipeline/run] Farm summary trigger failed:", err);
      }
    }

    // -- Step 8: Trigger health check --
    let healthCheckTriggered = false;
    console.log("[pipeline/run] Triggering validate-site-health...");
    try {
      await fetch(`${supabaseUrl}/functions/v1/validate-site-health`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bushel-internal-secret": internalSecret,
        },
        body: JSON.stringify({
          source: "pipeline",
          expected_crop_year: cropYear,
          expected_grain_week: grainWeek,
        }),
      });
      healthCheckTriggered = true;
    } catch (err) {
      console.error("[pipeline/run] Health check trigger failed:", err);
    }

    const totalDuration = Date.now() - startTime;

    console.log(
      `[pipeline/run] Complete: ${finalRun?.status}, ${grainsCompleted}/${requestedGrains.length} grains, ${totalDuration}ms`
    );

    return Response.json({
      run_id: runId,
      status: finalRun?.status ?? "unknown",
      crop_year: cropYear,
      grain_week: grainWeek,
      grains_completed: grainsCompleted,
      grains_failed: grainsFailed,
      failure_details: finalRun?.failure_details ?? {},
      farm_summaries_triggered: farmSummaryTriggered,
      health_check_triggered: healthCheckTriggered,
      duration_ms: totalDuration,
    });
  } catch (err) {
    console.error("[pipeline/run] Fatal error:", err);
    return Response.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Crop year utility (duplicated from lib/utils/crop-year.ts for API route)
// Crop year runs Aug 1 – Jul 31. Format: "YYYY-YYYY" (always long).
// ---------------------------------------------------------------------------

function getCurrentCropYear(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0=Jan, 7=Aug)
  const year = now.getFullYear();
  if (month >= 7) {
    // Aug-Dec: current year starts the crop year
    return `${year}-${year + 1}`;
  }
  // Jan-Jul: previous year started the crop year
  return `${year - 1}-${year}`;
}
