/**
 * Supabase Edge Function: analyze-market-data
 *
 * Step 3.5 Flash analytical workhorse in the dual-LLM intelligence pipeline.
 * Runs BEFORE generate-intelligence in the chain:
 *   search-x-intelligence -> analyze-market-data -> generate-intelligence -> generate-farm-summary
 *
 * Queries CGC data, AAFC supply balance, historical averages, farmer sentiment,
 * and community stats. Calls Step 3.5 Flash via OpenRouter to produce structured
 * market analysis (thesis, bull/bear cases, historical context, key signals).
 * Stores results in market_analysis table for Grok to cross-validate.
 *
 * Request body (optional):
 *   { "crop_year": "2025-2026", "grain_week": 29, "grains": ["Canola"] }
 *
 * If grains is omitted, analyzes all 16 Canadian grains.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildInternalHeaders,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";
import {
  buildAnalyzeMarketDataSystemPrompt,
  buildDataContextPreamble,
  KNOWLEDGE_SOURCE_PATHS,
  MARKET_INTELLIGENCE_VERSIONS,
} from "../_shared/market-intelligence-config.ts";
import { fetchKnowledgeContext } from "../_shared/knowledge-context.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "stepfun/step-3.5-flash:free";
const BATCH_SIZE = 4;

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

    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterKey) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const grainWeek: number = body.grain_week || getCurrentGrainWeek();
    const targetGrains: string[] | undefined = body.grains;

    console.log(`Analyzing market data for week ${grainWeek}, crop year ${cropYear}`);

    // Get the list of Canadian grains
    const { data: grains } = await supabase
      .from("grains")
      .select("name")
      .eq("category", "Canadian")
      .order("display_order");

    const allGrainNames = targetGrains || (grains ?? []).map((g: { name: string }) => g.name);
    const grainNames = allGrainNames.slice(0, BATCH_SIZE);
    const remainingGrains = allGrainNames.slice(BATCH_SIZE);

    // --- Batch data queries (shared across all grains in this batch) ---

    // 1. YoY comparison data for all grains
    const { data: yoyData } = await supabase
      .from("v_grain_yoy_comparison")
      .select("*");

    // 2. AAFC supply pipeline — filter by crop year
    const { data: supplyData } = await supabase
      .from("v_supply_pipeline")
      .select("*")
      .eq("crop_year", cropYear);

    // 3. Farmer sentiment
    const { data: sentimentData } = await supabase.rpc("get_sentiment_overview", {
      p_crop_year: cropYear,
      p_grain_week: grainWeek,
    });

    // 4. Community delivery analytics (all grains)
    const { data: deliveryAnalytics } = await supabase.rpc("get_delivery_analytics", {
      p_crop_year: cropYear,
      p_grain: null,
    });

    // Build lookup maps
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
    const deliveryByGrain = new Map(
      (deliveryAnalytics ?? []).map((r: Record<string, unknown>) => [r.grain as string, r])
    );

    const results: { grain: string; status: string; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const yoy = yoyByGrain.get(grainName) as Record<string, unknown> | undefined;
        const supply = supplyByGrain.get(grainName) as Record<string, unknown> | undefined;
        const sentiment = sentimentByGrain.get(grainName);
        const delivery = deliveryByGrain.get(grainName) as Record<string, unknown> | undefined;

        if (!yoy) {
          results.push({ grain: grainName, status: "skipped", error: "no YoY data" });
          continue;
        }

        // 5. Historical averages per grain (3 key metrics)
        const [deliveriesHist, exportsHist, stocksHist] = await Promise.all([
          supabase.rpc("get_historical_average", {
            p_grain: grainName,
            p_metric: "Deliveries",
            p_worksheet: "Primary",
            p_grain_week: grainWeek,
            p_years_back: 5,
          }).then(r => r.data),
          supabase.rpc("get_historical_average", {
            p_grain: grainName,
            p_metric: "Exports",
            p_worksheet: "Summary",
            p_grain_week: grainWeek,
            p_years_back: 5,
          }).then(r => r.data),
          // Stocks: no specific worksheet RPC — use commercial_stocks from YoY view
          // Query historical deliveries as proxy for stock context
          supabase.rpc("get_historical_average", {
            p_grain: grainName,
            p_metric: "Stocks In Store",
            p_worksheet: "Summary",
            p_grain_week: grainWeek,
            p_years_back: 5,
          }).then(r => r.data),
        ]);

        const knowledgeContext = await fetchKnowledgeContext(supabase, {
          grain: grainName,
          task: "analyze",
          extraTerms: [
            "delivery pace",
            "commercial stocks",
            "exports",
            "farmer sentiment",
            "western canada",
          ],
          limit: 5,
        });

        // Build prompts
        const systemPrompt = buildSystemPrompt();
        const dataPrompt = buildDataPrompt(
          grainName, cropYear, grainWeek,
          yoy, supply, sentiment, delivery,
          deliveriesHist, exportsHist, stocksHist,
          knowledgeContext.contextText,
        );

        // Call OpenRouter API
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openRouterKey}`,
            "HTTP-Referer": "https://bushelboard.ca",
            "X-Title": "Bushel Board",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: dataPrompt },
            ],
            response_format: { type: "json_object" },
            max_tokens: 16384,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          results.push({
            grain: grainName,
            status: "failed",
            error: `OpenRouter ${response.status}: ${errText.slice(0, 200)}`,
          });
          continue;
        }

        const aiResponse = await response.json();
        const usage = aiResponse.usage ?? {};

        // OpenRouter chat completions format
        const content = aiResponse.choices?.[0]?.message?.content ?? "";

        let analysis;
        try {
          analysis = JSON.parse(content);
        } catch {
          results.push({
            grain: grainName,
            status: "failed",
            error: `JSON parse failed: ${content.slice(0, 100)}`,
          });
          continue;
        }

        // Validate required fields before storing
        const validationErrors = validateAnalysisShape(analysis);
        if (validationErrors.length > 0) {
          console.warn(`Shape validation warnings for ${grainName}: ${validationErrors.join("; ")}`);
          // Apply safe defaults for missing fields rather than failing entirely
          analysis.initial_thesis = analysis.initial_thesis ?? "";
          analysis.bull_case = analysis.bull_case ?? "";
          analysis.bear_case = analysis.bear_case ?? "";
          analysis.historical_context = analysis.historical_context ?? {};
          analysis.data_confidence = ["high", "medium", "low"].includes(analysis.data_confidence)
            ? analysis.data_confidence
            : "medium";
          analysis.key_signals = Array.isArray(analysis.key_signals)
            ? analysis.key_signals
            : [];
        }

        // Upsert into market_analysis
        const { error: upsertError } = await supabase
          .from("market_analysis")
          .upsert(
            {
              grain: grainName,
              crop_year: cropYear,
              grain_week: grainWeek,
              initial_thesis: analysis.initial_thesis ?? "",
              bull_case: analysis.bull_case ?? "",
              bear_case: analysis.bear_case ?? "",
              historical_context: analysis.historical_context ?? {},
              data_confidence: analysis.data_confidence ?? "medium",
              key_signals: analysis.key_signals ?? [],
              model_used: MODEL,
              llm_metadata: {
                prompt_tokens: usage.prompt_tokens ?? null,
                completion_tokens: usage.completion_tokens ?? null,
                total_tokens: usage.total_tokens ?? null,
                openrouter_id: aiResponse.id ?? null,
                prompt_version: MARKET_INTELLIGENCE_VERSIONS.analyzeMarketData,
                knowledge_version: MARKET_INTELLIGENCE_VERSIONS.knowledgeBase,
                knowledge_sources: [...new Set([...KNOWLEDGE_SOURCE_PATHS, ...knowledgeContext.sourcePaths])],
                knowledge_query: knowledgeContext.query,
                knowledge_topic_tags: knowledgeContext.topicTags,
                retrieved_chunk_ids: knowledgeContext.chunkIds,
                retrieved_document_ids: knowledgeContext.documentIds,
              },
              generated_at: new Date().toISOString(),
            },
            {
              onConflict: "grain,crop_year,grain_week",
            }
          );

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
    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    console.log(
      `Market analysis complete: ${succeeded} ok, ${failed} failed, ${skipped} skipped (${duration}ms)`
    );

    if (remainingGrains.length > 0) {
      // Self-trigger for next batch of grains
      console.log(`${remainingGrains.length} grains remaining — triggering next batch`);
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-market-data`,
          {
            method: "POST",
            headers: buildInternalHeaders(),
            body: JSON.stringify({
              crop_year: cropYear,
              grain_week: grainWeek,
              grains: remainingGrains,
            }),
          }
        );
        console.log("Triggered next batch");
      } catch (err) {
        console.log("Next batch trigger failed:", err);
      }
    } else {
      // Last batch — chain trigger: generate-intelligence (Grok round 2)
      console.log("All grains analyzed — triggering generate-intelligence");
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-intelligence`,
          {
            method: "POST",
            headers: buildInternalHeaders(),
            body: JSON.stringify({ crop_year: cropYear, grain_week: grainWeek }),
          }
        );
        console.log("Triggered generate-intelligence");
      } catch (err) {
        console.log("generate-intelligence trigger failed:", err);
      }
    }

    return new Response(
      JSON.stringify({
        results,
        duration_ms: duration,
        succeeded,
        failed,
        skipped,
        remaining: remainingGrains.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("analyze-market-data error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// --- Prompt Builders ---

function buildSystemPrompt(): string {
  return `${buildAnalyzeMarketDataSystemPrompt()}

Your role: Produce a structured JSON market analysis for a specific grain using CGC weekly data, AAFC supply balance, 5-year historical averages, farmer sentiment, and community delivery statistics. Your analysis will be reviewed and challenged by a second AI (Grok) that has access to real-time X/Twitter market chatter — so be data-driven and defensible.

## Output Format

Return a JSON object with these fields:
- "initial_thesis": string — 1-2 sentence directional thesis (bullish/bearish/neutral) with key data point
- "bull_case": string — 2-3 bullet points supporting price strength, each citing specific data
- "bear_case": string — 2-3 bullet points supporting price weakness, each citing specific data
- "historical_context": object with:
  - "deliveries_vs_5yr_avg_pct": number | null — current CY deliveries vs 5-year average at this week (percentage difference)
  - "exports_vs_5yr_avg_pct": number | null — current CY exports vs 5-year average at this week (percentage difference)
  - "seasonal_observation": string — what the seasonal pattern suggests for next 4-8 weeks
  - "notable_patterns": string[] — array of standout historical comparison observations
- "data_confidence": "high" | "medium" | "low" — based on data completeness and consistency
- "key_signals": array of objects, each with:
  - "signal": "bullish" | "bearish" | "watch"
  - "title": string — short signal name
  - "body": string — 1-2 sentences with specific numbers
  - "confidence": "high" | "medium" | "low"
  - "source": "CGC" | "AAFC" | "Historical" | "Community"

## Rules
- Every claim MUST reference specific numbers from the provided data.
- If data is missing (N/A), note the gap rather than speculating.
- Do NOT give financial advice. Frame as "data suggests" or "the numbers show".
- Include 3-6 key signals. At least one must be "watch".
- For grains with minimal data, produce fewer signals (2-3) and set data_confidence to "low".
- Return ONLY the JSON object. No markdown, no explanation outside the JSON.`;
}

function buildDataPrompt(
  grain: string,
  cropYear: string,
  grainWeek: number,
  yoy: Record<string, unknown>,
  supply: Record<string, unknown> | undefined,
  sentiment: { vote_count: number; pct_holding: number; pct_hauling: number; pct_neutral: number } | undefined,
  delivery: Record<string, unknown> | undefined,
  deliveriesHist: Record<string, unknown> | null,
  exportsHist: Record<string, unknown> | null,
  stocksHist: Record<string, unknown> | null,
  knowledgeContext: string | null,
): string {
  const deliveredPct =
    supply && Number(supply.total_supply_kt) > 0
      ? ((Number(yoy.cy_deliveries_kt) / Number(supply.total_supply_kt)) * 100).toFixed(1)
      : "N/A";

  // Historical comparison calculations
  const deliveriesVs5yr =
    deliveriesHist && Number(deliveriesHist.avg_value) > 0
      ? (
          ((Number(yoy.cy_deliveries_kt) - Number(deliveriesHist.avg_value)) /
            Number(deliveriesHist.avg_value)) *
          100
        ).toFixed(1)
      : "N/A";

  const exportsVs5yr =
    exportsHist && Number(exportsHist.avg_value) > 0
      ? (
          ((Number(yoy.cy_exports_kt) - Number(exportsHist.avg_value)) /
            Number(exportsHist.avg_value)) *
          100
        ).toFixed(1)
      : "N/A";

  return `${buildDataContextPreamble(grainWeek, cropYear)}

## Market Data for ${grain} — CGC Week ${grainWeek}, Crop Year ${cropYear}

### Current Week (CGC Week ${grainWeek})
- Producer Deliveries: ${fmtNum(yoy.cw_deliveries_kt)} Kt (WoW: ${fmtPct(yoy.wow_deliveries_pct)})
- Commercial Stocks: ${fmtNum(yoy.commercial_stocks_kt)} Kt (WoW change: ${fmtChange(yoy.wow_stocks_change_kt)} Kt)

### Crop Year to Date
- CY Deliveries: ${fmtNum(yoy.cy_deliveries_kt)} Kt (YoY: ${fmtPct(yoy.yoy_deliveries_pct)}, Prior Year: ${fmtNum(yoy.py_deliveries_kt)} Kt)
- CY Exports: ${fmtNum(yoy.cy_exports_kt)} Kt (YoY: ${fmtPct(yoy.yoy_exports_pct)}, Prior Year: ${fmtNum(yoy.py_exports_kt)} Kt)
- CY Crush/Processing: ${fmtNum(yoy.cy_crush_kt)} Kt (YoY: ${fmtPct(yoy.yoy_crush_pct)}, Prior Year: ${fmtNum(yoy.py_crush_kt)} Kt)

### Supply Balance (AAFC Estimate)
- Production: ${fmtNum(supply?.production_kt)} Kt
- Carry-in: ${fmtNum(supply?.carry_in_kt)} Kt
- Total Supply: ${fmtNum(supply?.total_supply_kt)} Kt
- Projected Exports: ${fmtNum(supply?.projected_exports_kt)} Kt
- Projected Crush: ${fmtNum(supply?.projected_crush_kt)} Kt
- Projected Carry-out: ${fmtNum(supply?.projected_carry_out_kt)} Kt
- Delivered to Date: ${deliveredPct}% of total supply

### 5-Year Historical Averages (at Week ${grainWeek})
- Deliveries: avg ${fmtNum(deliveriesHist?.avg_value)} Kt, range ${fmtNum(deliveriesHist?.min_value)}-${fmtNum(deliveriesHist?.max_value)} Kt
  Current vs 5yr avg: ${deliveriesVs5yr}%
- Exports: avg ${fmtNum(exportsHist?.avg_value)} Kt, range ${fmtNum(exportsHist?.min_value)}-${fmtNum(exportsHist?.max_value)} Kt
  Current vs 5yr avg: ${exportsVs5yr}%
- Stocks: avg ${fmtNum(stocksHist?.avg_value)} Kt, range ${fmtNum(stocksHist?.min_value)}-${fmtNum(stocksHist?.max_value)} Kt

### Farmer Sentiment (Bushel Board poll — shipping week ${grainWeek + 1}, collected AFTER CGC data cutoff)
${
  sentiment && sentiment.vote_count >= 5
    ? `- ${sentiment.vote_count} farmers voted: ${sentiment.pct_holding}% holding, ${sentiment.pct_hauling}% hauling, ${sentiment.pct_neutral}% neutral
- NOTE: These votes reflect farmer outlook during Week ${grainWeek + 1}, not the CGC data week (${grainWeek}).`
    : "Insufficient farmer votes this week (need >= 5 for privacy). Skip sentiment analysis."
}

### Community Delivery Stats (anonymized, reported through shipping week ${grainWeek + 1})
${
  delivery
    ? `- Farmers reporting: ${delivery.farmer_count ?? "N/A"}
- Median delivery: ${fmtNum(delivery.median_delivered_kt)} Kt
- Mean delivery pace: ${fmtNum(delivery.mean_pace_pct)}%
- Pace range (P25-P75): ${fmtNum(delivery.p25_pace_pct)}%-${fmtNum(delivery.p75_pace_pct)}%`
    : "No community delivery data available."
}

### Retrieved Grain Marketing Knowledge
${knowledgeContext ?? "No retrieved corpus passages were available for this grain. Use the shared farmer-first framework and only rely on the data above."}

Use the retrieved knowledge as context for market structure, hedging, basis, logistics, and seasonal interpretation. If the retrieved knowledge conflicts with the current week data, prefer the current week data and note the tension.

## Task

Produce a structured JSON market analysis for ${grain} following the output format specified in your system instructions. Focus on:
1. Directional thesis based on supply/demand balance and delivery pace
2. Historical context — how does this week compare to 5-year patterns?
3. Bull and bear cases with specific data citations
4. Key signals with confidence levels`;
}

// --- Formatting Helpers ---

function fmtNum(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : n.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

function fmtPct(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtChange(val: unknown): string {
  if (val === null || val === undefined) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

// --- Crop Year / Grain Week Helpers (same as generate-intelligence) ---

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

/** Validates Step 3.5 Flash response shape. Returns array of issues (empty = valid). */
function validateAnalysisShape(obj: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof obj.initial_thesis !== "string") errors.push("missing/invalid initial_thesis");
  if (typeof obj.bull_case !== "string") errors.push("missing/invalid bull_case");
  if (typeof obj.bear_case !== "string") errors.push("missing/invalid bear_case");
  if (typeof obj.historical_context !== "object" || obj.historical_context === null) {
    errors.push("missing/invalid historical_context");
  }
  if (!["high", "medium", "low"].includes(obj.data_confidence as string)) {
    errors.push(`invalid data_confidence: ${obj.data_confidence}`);
  }
  if (!Array.isArray(obj.key_signals)) {
    errors.push("missing/invalid key_signals array");
  } else {
    for (const [i, sig] of (obj.key_signals as Record<string, unknown>[]).entries()) {
      if (!sig.signal || !sig.title || !sig.body) {
        errors.push(`key_signals[${i}] missing required fields`);
      }
    }
  }
  return errors;
}
