export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildInternalHeaders(secret: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-bushel-internal-secret": secret,
  };
}

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
    // 1. Import CFTC COT data
    const importResponse = await fetch(
      `${supabaseUrl}/functions/v1/import-cftc-cot`,
      {
        method: "POST",
        headers: buildInternalHeaders(internalSecret),
        body: JSON.stringify({}),
      }
    );

    const importResult = await importResponse.json();

    console.log(
      `[cron/import-cftc-cot] Edge function returned ${importResponse.status}:`,
      importResult
    );

    if (!importResponse.ok || importResult.status === "error") {
      return Response.json(
        {
          source: "vercel-cron",
          edge_function_status: importResponse.status,
          ...importResult,
        },
        { status: 502 }
      );
    }

    // 2. Chain to analyze-market-data → generate-intelligence
    //    The Thursday CGC pipeline already ran, but without COT data.
    //    Re-running analyze-market-data refreshes intelligence with COT context.
    //    analyze-market-data auto-chains to generate-intelligence after its last batch.
    let chainResult: unknown = null;
    try {
      const chainResponse = await fetch(
        `${supabaseUrl}/functions/v1/analyze-market-data`,
        {
          method: "POST",
          headers: buildInternalHeaders(internalSecret),
          body: JSON.stringify({}),
        }
      );
      chainResult = await chainResponse.json().catch(() => null);
      console.log(
        `[cron/import-cftc-cot] analyze-market-data chain returned ${chainResponse.status}:`,
        chainResult
      );
    } catch (chainErr) {
      console.error("[cron/import-cftc-cot] Chain trigger failed:", chainErr);
      chainResult = {
        error: chainErr instanceof Error ? chainErr.message : String(chainErr),
      };
    }

    return Response.json({
      source: "vercel-cron",
      edge_function_status: importResponse.status,
      ...importResult,
      chain_triggered: true,
      chain_result: chainResult,
    });
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
