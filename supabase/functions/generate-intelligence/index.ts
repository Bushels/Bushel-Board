/**
 * Supabase Edge Function: generate-intelligence
 *
 * Round 2 of dual-LLM intelligence pipeline. After Step 3.5 Flash (analyze-market-data)
 * produces a data-driven thesis, Grok reviews/challenges it with real-time X/Twitter signals
 * and farmer sentiment. Stores final intelligence in grain_intelligence table.
 *
 * Pipeline: search-x-intelligence → analyze-market-data → generate-intelligence → generate-farm-summary
 * Triggered by analyze-market-data on success, or manually via POST.
 *
 * Request body (optional):
 *   { "crop_year": "2025-2026", "grain_week": 29, "grains": ["Canola"] }
 *
 * If grains is omitted, generates for all 16 Canadian grains.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildIntelligencePrompt,
  INTELLIGENCE_KNOWLEDGE_VERSION,
  buildIntelligenceSystemPrompt,
  INTELLIGENCE_KNOWLEDGE_SOURCES,
  INTELLIGENCE_PROMPT_VERSION,
  type GrainContext,
} from "./prompt-template.ts";
import {
  enqueueInternalFunction,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";
import { fetchKnowledgeContext } from "../_shared/knowledge-context.ts";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.20-beta-0309-reasoning";

Deno.serve(async (req) => {
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
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const targetGrains: string[] | undefined = body.grains;
    const BATCH_SIZE = 1; // Single-grain batches keep chain handoffs below the project timeout ceiling

    console.log(`Generating intelligence for week ${grainWeek}, crop year ${cropYear}`);

    // Get the list of Canadian grains
    const { data: grains } = await supabase
      .from("grains")
      .select("name")
      .eq("category", "Canadian")
      .order("display_order");

    const allGrainNames = targetGrains || (grains ?? []).map((g: { name: string }) => g.name);
    const grainNames = allGrainNames.slice(0, BATCH_SIZE);
    const remainingGrains = allGrainNames.slice(BATCH_SIZE);

    // Get YoY comparison data for all grains
    const { data: yoyData } = await supabase
      .from("v_grain_yoy_comparison")
      .select("*");

    // Get supply pipeline data — filter by crop year to avoid cross-year contamination
    const { data: supplyData } = await supabase
      .from("v_supply_pipeline")
      .select("*")
      .eq("crop_year", cropYear);

    // Get farmer sentiment data for each grain this week
    const { data: sentimentData } = await supabase.rpc("get_sentiment_overview", {
      p_crop_year: cropYear,
      p_grain_week: grainWeek,
    });

    // Get logistics snapshot (Grain Monitor + Producer Car data)
    const { data: logisticsSnapshot } = await supabase.rpc("get_logistics_snapshot", {
      p_crop_year: cropYear,
      p_grain_week: grainWeek,
    });

    // Get Step 3.5 Flash market analysis (Round 1) for debate context
    const { data: marketAnalysisData } = await supabase
      .from("market_analysis")
      .select("grain, initial_thesis, bull_case, bear_case, historical_context, data_confidence, key_signals, model_used")
      .eq("crop_year", cropYear)
      .eq("grain_week", grainWeek);

    const yoyByGrain = new Map((yoyData ?? []).map((r: Record<string, unknown>) => [r.grain, r]));
    const supplyByGrain = new Map((supplyData ?? []).map((r: Record<string, unknown>) => [r.grain_name, r]));
    const sentimentByGrain = new Map(
      (sentimentData ?? []).map((r: Record<string, unknown>) => [
        r.grain as string,
        {
          vote_count: Number(r.vote_count),
          pct_holding: Number(r.pct_holding),
          pct_hauling: Number(r.pct_hauling),
          pct_neutral: Number(r.pct_neutral),
        },
      ])
    );
    const marketAnalysisByGrain = new Map(
      (marketAnalysisData ?? []).map((r: Record<string, unknown>) => [r.grain as string, r])
    );

    const results: { grain: string; status: string; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const yoy = yoyByGrain.get(grainName);
        const supply = supplyByGrain.get(grainName);

        if (!yoy) {
          results.push({ grain: grainName, status: "skipped", error: "no YoY data" });
          continue;
        }

        // Fetch pre-scored social signals with farmer relevance blending
        // RPC LEFT JOINs v_signal_relevance_scores for blended scoring + farmer validation data
        const { data: socialSignals } = await supabase.rpc("get_signals_for_intelligence", {
          p_grain: grainName,
          p_crop_year: cropYear,
          p_grain_week: grainWeek,
        });

        // Get Step 3.5 Flash analysis for this grain (may be null if not available)
        const priorAnalysis = marketAnalysisByGrain.get(grainName) as Record<string, unknown> | undefined;

        // CFTC COT positioning (last 4 weeks, bounded to target analysis week)
        const { data: cotPositioning } = await supabase.rpc("get_cot_positioning", {
          p_grain: grainName,
          p_crop_year: cropYear,
          p_weeks_back: 4,
          p_max_grain_week: grainWeek,
        });

        const knowledgeContext = await fetchKnowledgeContext(supabase, {
          grain: grainName,
          task: "intelligence",
          extraTerms: [
            "policy",
            "basis",
            "logistics",
            ...((socialSignals ?? [])
              .flatMap((signal: Record<string, unknown>) => [
                typeof signal.category === "string" ? signal.category : null,
                typeof signal.search_query === "string" ? signal.search_query : null,
              ])
              .filter((value): value is string => Boolean(value))
              .slice(0, 4)),
          ],
          limit: 5,
        });

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
          farmerSentiment: sentimentByGrain.get(grainName) ?? null,
          marketAnalysis: priorAnalysis ? {
            initial_thesis: priorAnalysis.initial_thesis as string,
            bull_case: priorAnalysis.bull_case as string,
            bear_case: priorAnalysis.bear_case as string,
            historical_context: priorAnalysis.historical_context as Record<string, unknown>,
            data_confidence: priorAnalysis.data_confidence as string,
            key_signals: priorAnalysis.key_signals as Array<Record<string, unknown>>,
            model_used: priorAnalysis.model_used as string,
          } : null,
          knowledgeContext: knowledgeContext.contextText ? {
            contextText: knowledgeContext.contextText,
            sourcePaths: knowledgeContext.sourcePaths,
            query: knowledgeContext.query,
            topicTags: knowledgeContext.topicTags,
          } : null,
          logisticsSnapshot: logisticsSnapshot ? {
            grain_monitor: (logisticsSnapshot as Record<string, unknown>).grain_monitor as Record<string, unknown> | null,
            producer_cars: (logisticsSnapshot as Record<string, unknown>).producer_cars as Array<Record<string, unknown>> | null,
          } : null,
          cotPositioning: (cotPositioning ?? []).map((c: Record<string, unknown>) => ({
            report_date: String(c.report_date),
            commodity: String(c.commodity),
            exchange: String(c.exchange),
            mapping_type: String(c.mapping_type),
            open_interest: Number(c.open_interest),
            managed_money_net: Number(c.managed_money_net),
            managed_money_net_pct: Number(c.managed_money_net_pct),
            wow_net_change: Number(c.wow_net_change),
            commercial_net: Number(c.commercial_net),
            commercial_net_pct: Number(c.commercial_net_pct),
            spec_commercial_divergence: Boolean(c.spec_commercial_divergence),
            grain_week: Number(c.grain_week),
          })),
          socialSignals: (socialSignals ?? []).map((s: Record<string, unknown>) => ({
            sentiment: s.sentiment as string,
            category: s.category as string,
            relevance_score: s.relevance_score as number,
            confidence_score: s.confidence_score as number,
            post_summary: s.post_summary as string,
            post_url: (s.post_url as string | null) ?? null,
            post_author: s.post_author as string | undefined,
            post_date: s.post_date ? String(s.post_date) : null,
            search_query: s.search_query as string | undefined,
            source: s.source as string | undefined,
            search_mode: s.search_mode as string | undefined,
            total_votes: (s.total_votes as number) ?? 0,
            farmer_relevance_pct: (s.farmer_relevance_pct as number) ?? null,
          })),
          crossGrainContext: (yoyData ?? []).map((g: Record<string, unknown>) => ({
            grain: g.grain as string,
            cy_deliveries_kt: Number(g.cy_deliveries_kt ?? 0),
            yoy_deliveries_pct: g.yoy_deliveries_pct != null ? Number(g.yoy_deliveries_pct) : null,
            cy_exports_kt: Number(g.cy_exports_kt ?? 0),
            yoy_exports_pct: g.yoy_exports_pct != null ? Number(g.yoy_exports_pct) : null,
            wow_stocks_change_kt: Number(g.wow_stocks_change_kt ?? 0),
          })),
        };

        const prompt = buildIntelligencePrompt(ctx);
        const systemPrompt = buildIntelligenceSystemPrompt();

        // Call xAI Grok Responses API with structured outputs (social signals pre-fetched from x_market_signals)
        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_output_tokens: 4096,
            input: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
            text: {
              format: {
                type: "json_schema",
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
                          sources: { type: "array", items: { type: "string", enum: ["CGC", "AAFC", "X", "Derived", "CFTC"] } },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                        },
                        required: ["signal", "title", "body", "sources", "confidence"],
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
          (c: { type: string }) => c.type === "output_text"
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
            llm_metadata: {
              request_id: requestId,
              input_tokens: usage.input_tokens ?? null,
              output_tokens: usage.output_tokens ?? null,
              prompt_version: INTELLIGENCE_PROMPT_VERSION,
              knowledge_version: INTELLIGENCE_KNOWLEDGE_VERSION,
              knowledge_sources: [...new Set([...INTELLIGENCE_KNOWLEDGE_SOURCES, ...knowledgeContext.sourcePaths])],
              knowledge_query: knowledgeContext.query,
              knowledge_topic_tags: knowledgeContext.topicTags,
              retrieved_chunk_ids: knowledgeContext.chunkIds,
              retrieved_document_ids: knowledgeContext.documentIds,
              source_signal_count: ctx.socialSignals?.length ?? 0,
            },
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

    if (remainingGrains.length > 0) {
      // Self-trigger for next batch of grains
      console.log(`${remainingGrains.length} grains remaining — triggering next batch`);
      try {
        await enqueueInternalFunction(supabase, "generate-intelligence", {
          crop_year: cropYear,
          grain_week: grainWeek,
          grains: remainingGrains,
        });
        console.log("Triggered next batch");
      } catch (err) {
        console.log("Next batch trigger failed:", err);
      }
    } else {
      // Last batch — chain trigger: generate farm summaries
      try {
        await enqueueInternalFunction(supabase, "generate-farm-summary", {
          crop_year: cropYear,
          grain_week: grainWeek,
        });
        console.log("Triggered generate-farm-summary");
      } catch (err) {
        console.log("Farm summary trigger failed (non-blocking):", err);
      }
    }

    return new Response(
      JSON.stringify({ results, duration_ms: duration, succeeded, failed, skipped, remaining: remainingGrains.length }),
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

/** Returns crop year in long format: "2025-2026" (matches DB convention). */
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

