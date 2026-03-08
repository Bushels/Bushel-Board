/**
 * Supabase Edge Function: generate-intelligence
 *
 * After weekly CGC data import, generates AI market intelligence for each grain.
 * Calls xAI Grok Responses API per grain with x_search for real-time X/Twitter agriculture sentiment, stores results in grain_intelligence table.
 *
 * Triggered by import-cgc-weekly on success, or manually via POST.
 *
 * Request body (optional):
 *   { "crop_year": "2025-26", "grain_week": 29, "grains": ["Canola"] }
 *
 * If grains is omitted, generates for all 16 Canadian grains.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIntelligencePrompt, type GrainContext } from "./prompt-template.ts";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const xaiKey = Deno.env.get("XAI_API_KEY");
    if (!xaiKey) {
      return new Response(
        JSON.stringify({ error: "XAI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const targetGrains: string[] | undefined = body.grains;

    console.log(`Generating intelligence for week ${grainWeek}, crop year ${cropYear}`);

    // Get the list of Canadian grains
    const { data: grains } = await supabase
      .from("grains")
      .select("name")
      .eq("category", "Canadian")
      .order("display_order");

    const grainNames = targetGrains || (grains ?? []).map((g: { name: string }) => g.name);

    // Get YoY comparison data for all grains
    const { data: yoyData } = await supabase
      .from("v_grain_yoy_comparison")
      .select("*");

    // Get supply pipeline data — filter by crop year to avoid cross-year contamination
    const { data: supplyData } = await supabase
      .from("v_supply_pipeline")
      .select("*")
      .eq("crop_year", cropYear);

    const yoyByGrain = new Map((yoyData ?? []).map((r: Record<string, unknown>) => [r.grain, r]));
    const supplyByGrain = new Map((supplyData ?? []).map((r: Record<string, unknown>) => [r.grain_name, r]));

    const results: { grain: string; status: string; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const yoy = yoyByGrain.get(grainName);
        const supply = supplyByGrain.get(grainName);

        if (!yoy) {
          results.push({ grain: grainName, status: "skipped", error: "no YoY data" });
          continue;
        }

        const ctx: GrainContext = {
          grain: grainName,
          crop_year: cropYear,
          grain_week: grainWeek,
          cy_deliveries_kt: yoy.cy_deliveries_kt ?? 0,
          cw_deliveries_kt: yoy.cw_deliveries_kt ?? 0,
          wow_deliveries_pct: yoy.wow_deliveries_pct,
          cy_exports_kt: yoy.cy_exports_kt ?? 0,
          cy_crush_kt: yoy.cy_crush_kt ?? 0,
          commercial_stocks_kt: yoy.commercial_stocks_kt ?? 0,
          wow_stocks_change_kt: yoy.wow_stocks_change_kt ?? 0,
          py_deliveries_kt: yoy.py_deliveries_kt ?? 0,
          yoy_deliveries_pct: yoy.yoy_deliveries_pct,
          py_exports_kt: yoy.py_exports_kt ?? 0,
          yoy_exports_pct: yoy.yoy_exports_pct,
          py_crush_kt: yoy.py_crush_kt ?? 0,
          yoy_crush_pct: yoy.yoy_crush_pct,
          total_supply_kt: supply?.total_supply_kt ?? null,
          production_kt: supply?.production_kt ?? null,
          carry_in_kt: supply?.carry_in_kt ?? null,
          projected_exports_kt: supply?.projected_exports_kt ?? null,
          projected_crush_kt: supply?.projected_crush_kt ?? null,
          projected_carry_out_kt: supply?.projected_carry_out_kt ?? null,
        };

        const prompt = buildIntelligencePrompt(ctx);

        // Call xAI Grok Responses API with x_search and structured outputs
        const { from_date, to_date } = getXSearchDateRange();
        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_output_tokens: 1024,
            input: [{ role: "user", content: prompt }],
            tools: [{ type: "x_search", from_date, to_date }],
            text: {
              format: {
                type: "json_schema",
                json_schema: {
                  name: "grain_intelligence",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      thesis_title: { type: "string" },
                      thesis_body: { type: "string" },
                      insights: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            signal: { type: "string", enum: ["bullish", "bearish", "watch", "social"] },
                            title: { type: "string" },
                            body: { type: "string" },
                          },
                          required: ["signal", "title", "body"],
                          additionalProperties: false,
                        },
                      },
                      kpi_data: {
                        type: "object",
                        properties: {
                          cy_deliveries_kt: { type: "number" },
                          cw_deliveries_kt: { type: "number" },
                          wow_deliveries_pct: { type: ["number", "null"] },
                          cy_exports_kt: { type: "number" },
                          yoy_exports_pct: { type: ["number", "null"] },
                          cy_crush_kt: { type: "number" },
                          yoy_crush_pct: { type: ["number", "null"] },
                          commercial_stocks_kt: { type: "number" },
                          wow_stocks_change_kt: { type: "number" },
                          total_supply_kt: { type: ["number", "null"] },
                          delivered_pct: { type: ["number", "null"] },
                          yoy_deliveries_pct: { type: ["number", "null"] },
                        },
                        required: [
                          "cy_deliveries_kt", "cw_deliveries_kt", "wow_deliveries_pct",
                          "cy_exports_kt", "yoy_exports_pct", "cy_crush_kt", "yoy_crush_pct",
                          "commercial_stocks_kt", "wow_stocks_change_kt", "total_supply_kt",
                          "delivered_pct", "yoy_deliveries_pct",
                        ],
                        additionalProperties: false,
                      },
                    },
                    required: ["thesis_title", "thesis_body", "insights", "kpi_data"],
                    additionalProperties: false,
                  },
                },
              },
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          results.push({ grain: grainName, status: "failed", error: `Grok API ${response.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        const aiResponse = await response.json();
        const requestId = aiResponse.id ?? null;
        const usage = aiResponse.usage ?? {};

        // Extract text content from Grok Responses API output array
        const messageOutput = (aiResponse.output ?? []).find(
          (o: { type: string }) => o.type === "message"
        );
        const content = messageOutput?.content?.find(
          (c: { type: string }) => c.type === "text"
        )?.text ?? "";

        // Structured outputs guarantees valid JSON — parse directly
        let intelligence;
        try {
          intelligence = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: `JSON parse failed: ${content.slice(0, 100)}` });
          continue;
        }

        // Upsert into grain_intelligence (includes LLM metadata for observability)
        const { error: upsertError } = await supabase
          .from("grain_intelligence")
          .upsert({
            grain: grainName,
            crop_year: cropYear,
            grain_week: grainWeek,
            thesis_title: intelligence.thesis_title,
            thesis_body: intelligence.thesis_body,
            insights: intelligence.insights,
            kpi_data: intelligence.kpi_data,
            generated_at: new Date().toISOString(),
            model_used: MODEL,
            llm_metadata: { request_id: requestId, input_tokens: usage.input_tokens ?? null, output_tokens: usage.output_tokens ?? null },
          }, {
            onConflict: "grain,crop_year,grain_week",
          });

        if (upsertError) {
          results.push({ grain: grainName, status: "failed", error: upsertError.message });
        } else {
          results.push({ grain: grainName, status: "success" });
        }
      } catch (err) {
        results.push({ grain: grainName, status: "failed", error: String(err).slice(0, 200) });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;
    const skipped = results.filter(r => r.status === "skipped").length;

    console.log(`Intelligence generation complete: ${succeeded} ok, ${failed} failed, ${skipped} skipped (${duration}ms)`);

    // Chain trigger: generate farm summaries after intelligence
    try {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-farm-summary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ crop_year: cropYear, grain_week: grainWeek }),
        }
      );
      console.log("Triggered generate-farm-summary");
    } catch (err) {
      console.log("Farm summary trigger failed (non-blocking):", err);
    }

    return new Response(
      JSON.stringify({ results, duration_ms: duration, succeeded, failed, skipped }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-intelligence error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// --- Helpers (same as import-cgc-weekly) ---

/** Returns crop year in short format: "2025-26" (matches app convention). */
function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${endYear.toString().padStart(2, "0")}`;
}

function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
}

/** Returns ISO8601 date strings for the past 7 days (for x_search tool). */
function getXSearchDateRange(): { from_date: string; to_date: string } {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from_date: weekAgo.toISOString().slice(0, 10),
    to_date: now.toISOString().slice(0, 10),
  };
}
