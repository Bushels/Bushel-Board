import { getCurrentCropYear } from "@/lib/utils/crop-year";
import { getCurrentGrainWeek } from "@/lib/cgc/parser";

const CGC_BASE_URL =
  "https://www.grainscanada.gc.ca/en/grain-research/statistics/grain-statistics-weekly/";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cropYear = getCurrentCropYear();
  const grainWeek = getCurrentGrainWeek();
  const csvFilename = `gsw-shg-${grainWeek}-en.csv`;

  console.log(
    `[cron/import-cgc] Fetching week ${grainWeek}, crop year ${cropYear}`
  );

  // Fetch CSV from CGC (Vercel IPs are not blocked)
  let csvText: string;
  try {
    const cgcResponse = await fetch(`${CGC_BASE_URL}${csvFilename}`);

    if (!cgcResponse.ok) {
      console.error(
        `[cron/import-cgc] CGC returned HTTP ${cgcResponse.status}`
      );
      return Response.json(
        {
          error: `CGC fetch failed: HTTP ${cgcResponse.status}`,
          week: grainWeek,
          crop_year: cropYear,
        },
        { status: 502 }
      );
    }

    csvText = await cgcResponse.text();
    console.log(
      `[cron/import-cgc] Fetched ${csvText.length} bytes from CGC`
    );
  } catch (fetchError) {
    console.error(`[cron/import-cgc] CGC fetch error:`, fetchError);
    return Response.json(
      {
        error: `CGC fetch error: ${String(fetchError)}`,
        week: grainWeek,
        crop_year: cropYear,
      },
      { status: 502 }
    );
  }

  // Forward CSV to Supabase Edge Function
  try {
    if (!process.env.BUSHEL_INTERNAL_FUNCTION_SECRET) {
      return Response.json(
        { error: "BUSHEL_INTERNAL_FUNCTION_SECRET is not configured" },
        { status: 500 }
      );
    }

    const edgeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/import-cgc-weekly`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bushel-internal-secret":
            process.env.BUSHEL_INTERNAL_FUNCTION_SECRET,
        },
        body: JSON.stringify({
          week: grainWeek,
          crop_year: cropYear,
          csv_data: csvText,
        }),
      }
    );

    const result = await edgeResponse.json();
    console.log(`[cron/import-cgc] Edge Function response:`, result);

    return Response.json({
      success: edgeResponse.ok,
      source: "vercel-cron",
      week: grainWeek,
      crop_year: cropYear,
      edge_function_result: result,
    });
  } catch (edgeError) {
    console.error(`[cron/import-cgc] Edge Function error:`, edgeError);
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
