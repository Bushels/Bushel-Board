import { fetchCurrentCgcCsv } from "@/lib/cgc/source";
import { authorizeCronRequest } from "@/lib/cron/route-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function numberFromUnknown(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Vercel Cron route: Daily site health check.
 *
 * Triggers validate-site-health Edge Function with dynamic defaults.
 * Runs daily at 6am UTC (11pm MST previous day) to catch overnight issues.
 *
 * Schedule (vercel.json): 0 6 * * *
 */
export async function GET(request: Request) {
  const authError = authorizeCronRequest(request);
  if (authError) return authError;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  if (!supabaseUrl || !internalSecret) {
    return Response.json(
      { error: "Missing SUPABASE_URL or BUSHEL_INTERNAL_FUNCTION_SECRET" },
      { status: 500 }
    );
  }

  try {
    const liveSource = await fetchCurrentCgcCsv();
    const res = await fetch(
      `${supabaseUrl}/functions/v1/validate-site-health`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bushel-internal-secret": internalSecret,
        },
        body: JSON.stringify({
          source: "scheduled",
          expected_crop_year: liveSource.cropYear,
          expected_grain_week: liveSource.grainWeek,
        }),
      }
    );

    const rawResult = await res.text();
    let result: Record<string, unknown> | null = null;
    try {
      result = rawResult ? (JSON.parse(rawResult) as Record<string, unknown>) : null;
    } catch {
      result = null;
    }

    if (!res.ok || !result) {
      return Response.json(
        {
          error: `validate-site-health returned HTTP ${res.status}`,
          triggered: false,
          edge_function_result: result ?? rawResult,
        },
        { status: 502 }
      );
    }

    const status = typeof result.status === "string" ? result.status : "fail";
    const passCount = numberFromUnknown(result.pass_count);
    const failCount = numberFromUnknown(result.fail_count);
    const durationMs = numberFromUnknown(result.duration_ms);

    console.log(
      `[cron/health-check] Status: ${status}, passed: ${passCount}/${passCount + failCount}`
    );

    return Response.json({
      triggered: true,
      status,
      pass_count: passCount,
      fail_count: failCount,
      duration_ms: durationMs,
    }, {
      status: status === "pass" ? 200 : 503,
    });
  } catch (err) {
    console.error("[cron/health-check] Failed:", err);
    return Response.json(
      { error: String(err), triggered: false },
      { status: 500 }
    );
  }
}
