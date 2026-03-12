/**
 * Supabase Edge Function: search-x-intelligence
 *
 * Searches X/Twitter (and optionally the web) for grain-related posts using
 * xAI Grok Responses API. Scores posts for relevance and sentiment, stores
 * results in x_market_signals table.
 *
 * Two modes:
 *   - pulse (3x/day): Quick X-only scan, 2 queries/grain, no chain trigger.
 *   - deep  (weekly):  Comprehensive X + web search, 6-8 queries/grain,
 *                       chains to analyze-market-data on last batch.
 *
 * Pipeline position:
 *   import-cgc-weekly -> validate-import -> search-x-intelligence -> analyze-market-data -> generate-intelligence
 *
 * Request body:
 *   {
 *     "mode": "pulse" | "deep",         // default: "deep"
 *     "crop_year": "2025-2026",
 *     "grain_week": 29,
 *     "grains": ["Canola"],             // optional subset
 *     "morning_pulse": true              // include minor grains (morning only)
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPulseQueries,
  buildDeepQueries,
  MAJOR_GRAINS,
} from "./search-queries.ts";
import {
  buildInternalHeaders,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";
import {
  buildSignalResearchSystemPrompt,
  MARKET_INTELLIGENCE_VERSIONS,
} from "../_shared/market-intelligence-config.ts";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";
const PULSE_BATCH_SIZE = 8;
const DEEP_BATCH_SIZE = 4;

const ALL_GRAINS = [
  "Wheat", "Canola", "Amber Durum", "Barley", "Oats", "Peas",
  "Lentils", "Flaxseed", "Soybeans", "Corn", "Rye", "Mustard Seed",
  "Chick Peas", "Sunflower", "Canaryseed", "Beans",
];

type ScanMode = "pulse" | "deep";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const authError = requireInternalRequest(req);
  if (authError) {
    return authError;
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
    const mode: ScanMode = body.mode === "pulse" ? "pulse" : "deep";
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const morningPulse: boolean = body.morning_pulse === true;
    const targetGrains: string[] | undefined = body.grains;

    const batchSize = mode === "pulse" ? PULSE_BATCH_SIZE : DEEP_BATCH_SIZE;

    console.log(`search-x-intelligence [${mode}]: week ${grainWeek}, crop year ${cropYear}`);

    // Determine which grains to process
    let allGrainNames: string[];
    if (targetGrains) {
      allGrainNames = targetGrains;
    } else if (mode === "pulse" && !morningPulse) {
      // Midday/evening pulse: major grains only
      allGrainNames = [...MAJOR_GRAINS];
    } else {
      // Deep mode or morning pulse: all 16 grains
      allGrainNames = [...ALL_GRAINS];
    }

    const grainNames = allGrainNames.slice(0, batchSize);
    const remainingGrains = allGrainNames.slice(batchSize);

    console.log(`Processing batch [${mode}]: [${grainNames.join(", ")}] (${remainingGrains.length} remaining)`);

    const results: { grain: string; status: string; signals_found?: number; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const now = new Date();
        const queries = mode === "pulse"
          ? buildPulseQueries(grainName, now)
          : buildDeepQueries(grainName, now);
        const systemPrompt = buildSignalResearchSystemPrompt(mode);

        console.log(`${grainName}: searching with ${queries.length} queries [${mode}]`);

        // Configure tools based on mode
        const { from_date, to_date } = getXSearchDateRange(mode);
        const tools: Array<Record<string, unknown>> = [
          { type: "x_search", from_date, to_date },
        ];
        if (mode === "deep") {
          tools.push({ type: "web_search" });
        }

        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_output_tokens: mode === "deep" ? 2048 : 1024,
            input: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: buildScoringPrompt(grainName, queries, mode),
              },
            ],
            tools,
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
                          post_url: { type: ["string", "null"] },
                          post_author: { type: ["string", "null"] },
                          post_date: { type: ["string", "null"] },
                          relevance_score: { type: "number" },
                          sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                          category: { type: "string", enum: ["farmer_report", "analyst_commentary", "elevator_bid", "export_news", "weather", "policy", "other"] },
                          confidence_score: { type: "number" },
                          source: { type: "string", enum: ["x", "web"] },
                        },
                        required: ["post_summary", "post_url", "post_author", "post_date", "relevance_score", "sentiment", "category", "confidence_score", "source"],
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

        const messageOutput = (aiResponse.output ?? []).find(
          (o: { type: string }) => o.type === "message"
        );
        const content = messageOutput?.content?.find(
          (c: { type: string }) => c.type === "output_text"
        )?.text ?? "";

        let parsed: { signals: Array<{
          post_summary: string;
          post_url: string | null;
          post_author: string | null;
          post_date: string | null;
          relevance_score: number;
          sentiment: "bullish" | "bearish" | "neutral";
          category: string;
          confidence_score: number;
          source: "x" | "web";
        }> };
        try {
          parsed = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: `JSON parse failed: ${content.slice(0, 100)}` });
          continue;
        }

        const relevantSignals = parsed.signals.filter(s => s.relevance_score >= 60);
        console.log(`${grainName}: ${parsed.signals.length} total signals, ${relevantSignals.length} with relevance >= 60`);

        if (relevantSignals.length > 0) {
          const { error: upsertError } = await supabase
            .from("x_market_signals")
            .upsert(
              relevantSignals.map(s => ({
                grain: grainName,
                crop_year: cropYear,
                grain_week: grainWeek,
                post_summary: s.post_summary,
                post_url: s.post_url,
                post_author: s.post_author,
                post_date: s.post_date,
                relevance_score: s.relevance_score,
                sentiment: s.sentiment,
                category: s.category,
                confidence_score: s.confidence_score,
                search_query: queries.join(" | "),
                searched_at: new Date().toISOString(),
                search_mode: mode,
                source: s.source,
                raw_context: {
                  response_id: aiResponse.id ?? null,
                  prompt_version: MARKET_INTELLIGENCE_VERSIONS.searchSignals,
                  model_used: MODEL,
                  search_mode: mode,
                  search_queries: queries,
                  toolset: tools.map((tool) => tool.type),
                  source: s.source,
                },
              })),
              { onConflict: "grain,crop_year,grain_week,post_summary" }
            );

          if (upsertError) {
            results.push({ grain: grainName, status: "failed", signals_found: relevantSignals.length, error: upsertError.message });
          } else {
            results.push({ grain: grainName, status: "success", signals_found: relevantSignals.length });
          }
        } else {
          results.push({ grain: grainName, status: "success", signals_found: 0 });
        }

        console.log(`${grainName}: tokens — input: ${usage.input_tokens ?? "?"}, output: ${usage.output_tokens ?? "?"}`);
      } catch (err) {
        results.push({ grain: grainName, status: "failed", error: String(err).slice(0, 200) });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;
    const totalSignals = results.reduce((sum, r) => sum + (r.signals_found ?? 0), 0);

    console.log(`search-x-intelligence [${mode}] complete: ${succeeded} ok, ${failed} failed, ${totalSignals} signals (${duration}ms)`);

    // Log to signal_scan_log
    try {
      await supabase.from("signal_scan_log").insert({
        crop_year: cropYear,
        grain_week: grainWeek,
        scan_mode: mode,
        grains_scanned: grainNames,
        signals_found: totalSignals,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("Failed to log scan:", logErr);
    }

    if (remainingGrains.length > 0) {
      // Self-trigger for next batch
      console.log(`${remainingGrains.length} grains remaining — triggering next batch`);
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/search-x-intelligence`,
          {
            method: "POST",
            headers: buildInternalHeaders(),
            body: JSON.stringify({
              mode,
              crop_year: cropYear,
              grain_week: grainWeek,
              grains: remainingGrains,
              morning_pulse: morningPulse,
            }),
          }
        );
        console.log("Triggered next batch of search-x-intelligence");
      } catch (err) {
        console.error("Next batch trigger failed:", err);
      }
    } else if (mode === "deep") {
      // Deep mode last batch — chain to analyze-market-data (Step 3.5 Flash round 1)
      // Pipeline: search-x-intelligence → analyze-market-data → generate-intelligence → generate-farm-summary
      console.log("All grains searched [deep] — triggering analyze-market-data");
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-market-data`,
          {
            method: "POST",
            headers: buildInternalHeaders(),
            body: JSON.stringify({ crop_year: cropYear, grain_week: grainWeek }),
          }
        );
        console.log("Triggered analyze-market-data");
      } catch (err) {
        console.error("analyze-market-data chain-trigger failed (non-blocking):", err);
      }
    } else {
      // Pulse mode last batch — no chain trigger
      console.log("All grains searched [pulse] — scan complete, no chain trigger");
    }

    return new Response(
      JSON.stringify({
        mode,
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

function buildScoringPrompt(grain: string, queries: string[], mode: ScanMode): string {
  const basePrompt = `You are a Canadian prairie agriculture social media analyst.

Search X/Twitter for the following topics related to ${grain} in Canadian prairie agriculture:
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

For each relevant post you find, provide:
- post_summary: 1-2 sentence summary of the post content
- post_url: canonical https://x.com/... URL to the exact post when available
- post_author: X handle if available (without @)
- post_date: ISO date string if available
- relevance_score: 0-100, how relevant is this to Canadian prairie ${grain} markets?
- sentiment: "bullish", "bearish", or "neutral"
- category: one of "farmer_report", "analyst_commentary", "elevator_bid", "export_news", "weather", "policy", "other"
- confidence_score: 0-100, how confident are you in this classification?
- source: "x" if found on X/Twitter, "web" if found via web search

Only include posts with relevance_score >= 60. If no relevant posts found, return an empty array.
Focus on: Canadian prairie agriculture, elevator bids, crop conditions, export activity, transport/rail, crush/processing capacity.
Exclude: US-only markets, global commodity speculation unrelated to Canada, spam/promotional content.

Preserve provenance. Prefer exact post/article URLs and avoid vague paraphrases that lose who said what.`;

  if (mode === "deep") {
    return basePrompt + `

DEEP ANALYSIS MODE: Also search the broader web for:
- Government reports and announcements (AAFC, CGC, provincial agriculture ministries)
- Commodity analyst articles and price forecasts
- Port authority export data and vessel lineups
- Railway shipping reports and grain car allocations
- International buyer activity and trade policy updates

Include web sources alongside X posts in your analysis. Mark web results with source "web" and classify them into the appropriate category. Prioritize Canadian prairie-specific content over generic commodity news.

For web sources, strongly prefer official or directly market-relevant pages from CGC, AAFC, provincial ministries, ports, rail, grain companies, and reputable trade publications.`;
  }

  return basePrompt;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns crop year in long format: "2025-2026" (matches CGC CSV and cgc_observations convention). */
function getCurrentCropYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function getCurrentGrainWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= 7 ? new Date(year, 7, 1) : new Date(year - 1, 7, 1);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
}

/** Returns ISO8601 date range. Pulse: 2-day lookback. Deep: 7-day lookback. */
function getXSearchDateRange(mode: ScanMode): { from_date: string; to_date: string } {
  const now = new Date();
  const lookbackDays = mode === "pulse" ? 2 : 7;
  const past = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return {
    from_date: past.toISOString().slice(0, 10),
    to_date: now.toISOString().slice(0, 10),
  };
}
