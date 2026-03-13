import { getCurrentCropYear } from "@/lib/utils/crop-year";
import { getCurrentGrainWeek } from "@/lib/cgc/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron route: Pulse scan for X signals (3x/day).
 *
 * Triggers search-x-intelligence in pulse mode. On Thursdays,
 * skips if a CGC import already ran today (deep scan handles it).
 *
 * Schedule (vercel.json):
 *   6am MST  (13:00 UTC) — morning pulse (all grains)
 *   1pm MST  (20:00 UTC) — midday pulse (major grains, non-Thursday)
 *   6pm MST  (01:00 UTC) — evening pulse (major grains)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cropYear = getCurrentCropYear();
  const grainWeek = getCurrentGrainWeek();
  const now = new Date();
  const utcHour = now.getUTCHours();

  // On Thursdays, the 20:00 UTC (1pm MST) slot is handled by
  // /api/cron/import-cgc which chains to a deep scan. Skip pulse.
  const isThursday = now.getUTCDay() === 4;
  if (isThursday && utcHour >= 19 && utcHour <= 21) {
    console.log(
      `[cron/scan-signals] Skipping midday pulse — Thursday CGC import handles deep scan`
    );
    return Response.json({
      skipped: true,
      reason: "thursday_midday_deep_scan",
      week: grainWeek,
      crop_year: cropYear,
    });
  }

  // Morning pulse (13:00 UTC / 6am MST) includes all grains.
  // Midday and evening pulses scan major grains only.
  const isMorningPulse = utcHour >= 12 && utcHour <= 14;

  console.log(
    `[cron/scan-signals] Pulse scan: week ${grainWeek}, morning=${isMorningPulse}`
  );

  try {
    if (!process.env.BUSHEL_INTERNAL_FUNCTION_SECRET) {
      return Response.json(
        { error: "BUSHEL_INTERNAL_FUNCTION_SECRET is not configured" },
        { status: 500 }
      );
    }

    const edgeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-x-intelligence`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bushel-internal-secret":
            process.env.BUSHEL_INTERNAL_FUNCTION_SECRET,
        },
        body: JSON.stringify({
          mode: "pulse",
          crop_year: cropYear,
          grain_week: grainWeek,
          morning_pulse: isMorningPulse,
        }),
      }
    );

    const result = await edgeResponse.json();
    console.log(`[cron/scan-signals] Edge Function response:`, result);

    return Response.json({
      success: edgeResponse.ok,
      source: "vercel-cron-pulse",
      mode: "pulse",
      morning_pulse: isMorningPulse,
      week: grainWeek,
      crop_year: cropYear,
      edge_function_result: result,
    });
  } catch (edgeError) {
    console.error(`[cron/scan-signals] Edge Function error:`, edgeError);
    return Response.json(
      {
        error: `Edge Function call failed: ${String(edgeError)}`,
        week: grainWeek,
        crop_year: cropYear,
      },
      { status: 500 }
    );
  }
}
