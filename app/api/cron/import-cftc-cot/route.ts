export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalSecret = process.env.BUSHEL_INTERNAL_FUNCTION_SECRET;

  if (!supabaseUrl || !internalSecret) {
    return Response.json(
      { error: "Missing NEXT_PUBLIC_SUPABASE_URL or BUSHEL_INTERNAL_FUNCTION_SECRET" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/import-cftc-cot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bushel-internal-secret": internalSecret,
        },
        body: JSON.stringify({}),
      }
    );

    const result = await response.json();

    console.log(
      `[cron/import-cftc-cot] Edge function returned ${response.status}:`,
      result
    );

    return Response.json(
      {
        source: "vercel-cron",
        edge_function_status: response.status,
        ...result,
      },
      { status: response.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[cron/import-cftc-cot] Failed:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
