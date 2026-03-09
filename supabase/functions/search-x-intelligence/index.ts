/**
 * Supabase Edge Function: search-x-intelligence
 *
 * Searches X/Twitter for grain-related posts using xAI Grok Responses API
 * with x_search tool. Scores posts for relevance and sentiment, stores
 * results in x_market_signals table.
 *
 * Pipeline position: import-cgc-weekly -> search-x-intelligence -> generate-intelligence -> generate-farm-summary
 *
 * Triggered by import-cgc-weekly on success, or manually via POST.
 *
 * Request body (optional):
 *   { "crop_year": "2025-26", "grain_week": 29, "grains": ["Canola"] }
 *
 * If grains is omitted, processes all 16 Canadian grains.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSearchQueries } from "./search-queries.ts";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";
const BATCH_SIZE = 4;

const ALL_GRAINS = [
  "Wheat", "Canola", "Amber Durum", "Barley", "Oats", "Peas",
  "Lentils", "Flaxseed", "Soybeans", "Corn", "Rye", "Mustard Seed",
  "Chick Peas", "Sunflower", "Canaryseed", "Beans",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

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
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const targetGrains: string[] | undefined = body.grains;

    console.log(`search-x-intelligence: week ${grainWeek}, crop year ${cropYear}`);

    // Determine which grains to process
    const allGrainNames = targetGrains || ALL_GRAINS;
    const grainNames = allGrainNames.slice(0, BATCH_SIZE);
    const remainingGrains = allGrainNames.slice(BATCH_SIZE);

    console.log(`Processing batch: [${grainNames.join(", ")}] (${remainingGrains.length} remaining)`);

    const results: { grain: string; status: string; signals_found?: number; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        // Build search queries for this grain
        const queries = buildSearchQueries(grainName, new Date());
        console.log(`${grainName}: searching with ${queries.length} queries`);

        // Call Grok Responses API with x_search tool and structured output
        const { from_date, to_date } = getXSearchDateRange();
        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_output_tokens: 2048,
            input: [{
              role: "user",
              content: buildScoringPrompt(grainName, queries),
            }],
            tools: [{ type: "x_search", from_date, to_date }],
            text: {
              format: {
                type: "json_schema",
                name: "x_signals",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    signals: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          post_summary: { type: "string" },
                          post_author: { type: ["string", "null"] },
                          post_date: { type: ["string", "null"] },
                          relevance_score: { type: "number" },
                          sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                          category: { type: "string", enum: ["farmer_report", "analyst_commentary", "elevator_bid", "export_news", "weather", "policy", "other"] },
                          confidence_score: { type: "number" },
                        },
                        required: ["post_summary", "post_author", "post_date", "relevance_score", "sentiment", "category", "confidence_score"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["signals"],
                  additionalProperties: false,
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
        const usage = aiResponse.usage ?? {};

        // Extract text content from Grok Responses API output array
        const messageOutput = (aiResponse.output ?? []).find(
          (o: { type: string }) => o.type === "message"
        );
        const content = messageOutput?.content?.find(
          (c: { type: string }) => c.type === "output_text"
        )?.text ?? "";

        // Structured outputs guarantees valid JSON -- parse directly
        let parsed: { signals: Array<{
          post_summary: string;
          post_author: string | null;
          post_date: string | null;
          relevance_score: number;
          sentiment: "bullish" | "bearish" | "neutral";
          category: string;
          confidence_score: number;
        }> };
        try {
          parsed = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: `JSON parse failed: ${content.slice(0, 100)}` });
          continue;
        }

        // Filter to only signals with relevance >= 60 (double-check, prompt already requests this)
        const relevantSignals = parsed.signals.filter(s => s.relevance_score >= 60);
        console.log(`${grainName}: ${parsed.signals.length} total signals, ${relevantSignals.length} with relevance >= 60`);

        if (relevantSignals.length > 0) {
          // Upsert into x_market_signals
          const { error: upsertError } = await supabase
            .from("x_market_signals")
            .upsert(
              relevantSignals.map(s => ({
                grain: grainName,
                crop_year: cropYear,
                grain_week: grainWeek,
                post_summary: s.post_summary,
                post_author: s.post_author,
                post_date: s.post_date,
                relevance_score: s.relevance_score,
                sentiment: s.sentiment,
                category: s.category,
                confidence_score: s.confidence_score,
                search_query: queries.join(" | "),
                raw_context: null,
              })),
              { onConflict: "grain,crop_year,grain_week,post_summary" }
            );

          if (upsertError) {
            results.push({ grain: grainName, status: "failed", signals_found: relevantSignals.length, error: upsertError.message });
          } else {
            results.push({ grain: grainName, status: "success", signals_found: relevantSignals.length });
          }
        } else {
          // No relevant signals is still a success -- just nothing to store
          results.push({ grain: grainName, status: "success", signals_found: 0 });
        }

        console.log(`${grainName}: tokens used — input: ${usage.input_tokens ?? "?"}, output: ${usage.output_tokens ?? "?"}`);
      } catch (err) {
        results.push({ grain: grainName, status: "failed", error: String(err).slice(0, 200) });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;
    const totalSignals = results.reduce((sum, r) => sum + (r.signals_found ?? 0), 0);

    console.log(`search-x-intelligence complete: ${succeeded} ok, ${failed} failed, ${totalSignals} signals stored (${duration}ms)`);

    // Use anon key for function-to-function calls (service role key causes 401 with verify_jwt)
    const triggerKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (remainingGrains.length > 0) {
      // Self-trigger for next batch of grains
      console.log(`${remainingGrains.length} grains remaining — triggering next batch`);
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/search-x-intelligence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${triggerKey}`,
            },
            body: JSON.stringify({ crop_year: cropYear, grain_week: grainWeek, grains: remainingGrains }),
          }
        );
        console.log("Triggered next batch of search-x-intelligence");
      } catch (err) {
        console.error("Next batch trigger failed:", err);
      }
    } else {
      // Last batch — chain-trigger: generate-intelligence
      console.log("All grains searched — triggering generate-intelligence");
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-intelligence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${triggerKey}`,
            },
            body: JSON.stringify({ crop_year: cropYear, grain_week: grainWeek }),
          }
        );
        console.log("Triggered generate-intelligence");
      } catch (err) {
        console.error("generate-intelligence chain-trigger failed (non-blocking):", err);
      }
    }

    return new Response(
      JSON.stringify({
        results,
        duration_ms: duration,
        succeeded,
        failed,
        total_signals: totalSignals,
        remaining: remainingGrains.length,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("search-x-intelligence error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildScoringPrompt(grain: string, queries: string[]): string {
  return `You are a Canadian prairie agriculture social media analyst.

Search X/Twitter for the following topics related to ${grain} in Canadian prairie agriculture:
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

For each relevant post you find, provide:
- post_summary: 1-2 sentence summary of the post content
- post_author: X handle if available (without @)
- post_date: ISO date string if available
- relevance_score: 0-100, how relevant is this to Canadian prairie ${grain} markets?
- sentiment: "bullish", "bearish", or "neutral"
- category: one of "farmer_report", "analyst_commentary", "elevator_bid", "export_news", "weather", "policy", "other"
- confidence_score: 0-100, how confident are you in this classification?

Only include posts with relevance_score >= 60. If no relevant posts found, return an empty array.
Focus on: Canadian prairie agriculture, elevator bids, crop conditions, export activity, transport/rail, crush/processing capacity.
Exclude: US-only markets, global commodity speculation unrelated to Canada, spam/promotional content.`;
}

// ---------------------------------------------------------------------------
// Helpers (same as generate-intelligence)
// ---------------------------------------------------------------------------

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
