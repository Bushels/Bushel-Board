export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron route: Daily site health check.
 *
 * Triggers validate-site-health Edge Function with dynamic defaults.
 * Runs daily at 6am UTC (11pm MST previous day) to catch overnight issues.
 *
 * Schedule (vercel.json): 0 6 * * *
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  if (!supabaseUrl || !internalSecret) {
    return Response.json(
      { error: "Missing SUPABASE_URL or BUSHEL_INTERNAL_FUNCTION_SECRET" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/validate-site-health`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bushel-internal-secret": internalSecret,
        },
        body: JSON.stringify({ source: "scheduled" }),
      }
    );

    const result = await res.json();

    console.log(
      `[cron/health-check] Status: ${result.status}, passed: ${result.pass_count}/${(result.pass_count || 0) + (result.fail_count || 0)}`
    );

    return Response.json({
      triggered: true,
      status: result.status,
      pass_count: result.pass_count,
      fail_count: result.fail_count,
      duration_ms: result.duration_ms,
    });
  } catch (err) {
    console.error("[cron/health-check] Failed:", err);
    return Response.json(
      { error: String(err), triggered: false },
      { status: 500 }
    );
  }
}
