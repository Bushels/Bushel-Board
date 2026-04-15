/**
 * Supabase Edge Function: analyze-grain-market (Pipeline v2)
 *
 * Single-pass Senior Analyst with web_search + x_search tools.
 * Replaces the dual-LLM chain: analyze-market-data + generate-intelligence.
 *
 * Pipeline v2: search-x-intelligence → analyze-grain-market → generate-farm-summary
 *
 * Request body (optional):
 *   { "crop_year": "2025-2026", "grain_week": 31, "grains": ["Canola"] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enqueueInternalFunction,
  requireInternalRequest,
} from "../_shared/internal-auth.ts";
import { buildVikingPipelineContext } from "../_shared/viking-knowledge.ts";
import { buildShippingCalendar } from "../_shared/shipping-calendar.ts";
import { computeAnalystRatios } from "../_shared/data-brief.ts";
import {
  MARKET_INTELLIGENCE_VERSIONS,
  KNOWLEDGE_SOURCE_PATHS,
} from "../_shared/market-intelligence-config.ts";
import { buildBushelAgentTeamBrief } from "../_shared/bushel-agent-team.ts";
import {
  buildCalibrationPromptSection,
  buildPriceVerificationPromptSection,
  summarizeCalibrationOutcome,
  summarizePriceVerificationOutcome,
} from "../_shared/market-calibration.ts";
import { buildWeeklyTrajectoryRow } from "../../../lib/trajectory-mapping.ts";

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.20-reasoning";
const BATCH_SIZE = 1;
const PIPELINE_VERSION = "analyze-grain-market-v1";

// -- Grain research tiers (search depth by importance) --

interface GrainTier {
  webSearches: number;
  xSearches: number;
  tier: "major" | "mid" | "minor";
}

const GRAIN_TIERS: Record<string, GrainTier> = {
  Wheat: { webSearches: 4, xSearches: 4, tier: "major" },
  Canola: { webSearches: 4, xSearches: 4, tier: "major" },
  "Amber Durum": { webSearches: 4, xSearches: 4, tier: "major" },
  Barley: { webSearches: 4, xSearches: 4, tier: "major" },
  Oats: { webSearches: 4, xSearches: 4, tier: "major" },
  Peas: { webSearches: 4, xSearches: 4, tier: "major" },
  Flaxseed: { webSearches: 2, xSearches: 2, tier: "mid" },
  Soybeans: { webSearches: 2, xSearches: 2, tier: "mid" },
  Corn: { webSearches: 2, xSearches: 2, tier: "mid" },
  Lentils: { webSearches: 2, xSearches: 2, tier: "mid" },
  Rye: { webSearches: 2, xSearches: 2, tier: "mid" },
  "Mustard Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Sunflower Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Canary Seed": { webSearches: 1, xSearches: 1, tier: "minor" },
  Triticale: { webSearches: 1, xSearches: 1, tier: "minor" },
  Chickpeas: { webSearches: 1, xSearches: 1, tier: "minor" },
};

// -- System prompt (stable across grains, cacheable) --

const IDENTITY = `You are a senior grain market analyst specializing in Canadian prairie grains. You think like someone who has spent 20 years advising farmers in Alberta, Saskatchewan, and Manitoba on delivery timing, basis opportunities, and risk management. You speak plainly — no trader jargon, no academic hedging. When a farmer asks "should I haul or hold?", you give a direct answer backed by evidence.

You write for prairie grain farmers, not Wall Street traders. Always optimize for the decisions a farmer can act on this week: deliver now or wait, price a slice or stay patient, watch basis and logistics, identify the catalyst and the risk to the thesis.`;

const DATA_HYGIENE = `## Data Hygiene Notes
- All CGC data is in thousands of metric tonnes (Kt). Do not convert to bushels.
- "Crop Year" values are cumulative year-to-date. "Current Week" values are weekly snapshots.
- Wheat and Amber Durum are distinct grains. Never combine unless analyzing "Total Wheat."
- During the first 4 weeks (Aug-Sep), high visible stocks are carry-in, not new-crop.
- Never sum "Current Week" values to get cumulative — CGC revises past weeks. Use published "Crop Year" figure.`;

const RESEARCH_PROTOCOL = `## Research Protocol

1. RESEARCH FIRST: Before forming any thesis, use your web_search and x_search tools to discover what's happening RIGHT NOW for this grain. Search for: recent price action, trade policy changes, weather events, logistics disruptions, export deals, crush/processing news.

2. REASON THROUGH DATA: Compare what you found online against the verified Supabase data in your Data Brief. If web numbers differ from CGC numbers, note the discrepancy — CGC is the source of truth for historical data; web/X reveals what's happening between data releases.

3. CONCLUDE WITH CONVICTION: Answer the farmer's questions:
   - "Is price going up or down?" → stance_score (-100 to +100)
   - "How sure are you?" → confidence_score (0-100)
   - "What would you recommend?" → actionable final_assessment
   - "How do I look vs everyone else?" → use community delivery stats for peer context

4. CITE EVERYTHING: Every claim must trace to either Supabase data, a web source, or an X post. No unsourced assertions.

## Stance Score Guide
- Strongly bullish: +70 to +100. Holding is clearly favored, multiple confirming signals.
- Bullish: +20 to +69. Leaning positive, some uncertainty.
- Neutral: -19 to +19. Genuinely mixed signals, no clear edge.
- Bearish: -69 to -20. Leaning negative, consider delivering.
- Strongly bearish: -100 to -70. Move grain, multiple confirming bearish signals.

Base your score on the weight of evidence. Do NOT default to moderate-bearish.`;

function buildSystemPrompt(grain: string): string {
  const vikingContext = buildVikingPipelineContext(grain);
  const agentTeamBrief = buildBushelAgentTeamBrief(grain);
  return [IDENTITY, agentTeamBrief, vikingContext, DATA_HYGIENE, RESEARCH_PROTOCOL].join("\n\n");
}

// -- JSON output schema (xAI structured outputs) --

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    initial_thesis: { type: "string" },
    bull_case: { type: "string" },
    bear_case: { type: "string" },
    historical_context: {
      type: "object",
      properties: {
        deliveries_vs_5yr_avg_pct: { type: ["number", "null"] },
        exports_vs_5yr_avg_pct: { type: ["number", "null"] },
        seasonal_observation: { type: "string" },
        notable_patterns: { type: "array", items: { type: "string" } },
      },
      required: ["deliveries_vs_5yr_avg_pct", "exports_vs_5yr_avg_pct", "seasonal_observation", "notable_patterns"],
      additionalProperties: false,
    },
    data_confidence: { type: "string", enum: ["high", "medium", "low"] },
    confidence_score: { type: ["integer", "null"] },
    stance_score: { type: ["integer", "null"] },
    final_assessment: { type: ["string", "null"] },
    key_signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal: { type: "string", enum: ["bullish", "bearish", "watch"] },
          title: { type: "string" },
          body: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          source: { type: "string", enum: ["CGC", "AAFC", "Historical", "Community", "CFTC", "Web", "X"] },
        },
        required: ["signal", "title", "body", "confidence", "source"],
        additionalProperties: false,
      },
    },
    research_sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          source_type: { type: "string", enum: ["web", "x_post"] },
          relevance: { type: "string" },
        },
        required: ["url", "title", "source_type", "relevance"],
        additionalProperties: false,
      },
    },
    data_vs_web_discrepancies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metric: { type: "string" },
          supabase_value: { type: "string" },
          web_value: { type: "string" },
          analyst_note: { type: "string" },
        },
        required: ["metric", "supabase_value", "web_value", "analyst_note"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "initial_thesis", "bull_case", "bear_case", "historical_context",
    "data_confidence", "confidence_score", "stance_score", "final_assessment",
    "key_signals", "research_sources", "data_vs_web_discrepancies",
  ],
  additionalProperties: false,
};

// -- Main handler --

Deno.serve(async (req) => {
  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const xaiKey = Deno.env.get("XAI_API_KEY");
    if (!xaiKey) {
      return new Response(
        JSON.stringify({ error: "XAI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const cropYear: string = body.crop_year || getCurrentCropYear();
    const requestedWeek: number | undefined = body.grain_week;
    const targetGrains: string[] | undefined = body.grains;
    const runId: string | undefined = body.run_id;

    // Compute the dynamic shipping calendar
    const currentCalendarWeek = getCurrentGrainWeek();

    // Get latest data week from the database
    const { data: latestWeekData } = await supabase
      .from("cgc_observations")
      .select("grain_week")
      .eq("crop_year", cropYear)
      .order("grain_week", { ascending: false })
      .limit(1)
      .single();
    const latestDataWeek = requestedWeek || (latestWeekData?.grain_week as number) || currentCalendarWeek;

    const shippingCalendar = buildShippingCalendar(currentCalendarWeek, latestDataWeek, cropYear);

    console.log(`[v2] Analyzing grains for week ${latestDataWeek}, crop year ${cropYear} (calendar week ${currentCalendarWeek})`);

    // Get grain list
    const { data: grains } = await supabase
      .from("grains")
      .select("name")
      .eq("category", "Canadian")
      .order("display_order");

    const allGrainNames = targetGrains || (grains ?? []).map((g: { name: string }) => g.name);
    const grainNames = allGrainNames.slice(0, BATCH_SIZE);
    const remainingGrains = allGrainNames.slice(BATCH_SIZE);

    // -- Batch data queries (shared across grains in this batch) --
    const [
      { data: yoyData },
      { data: supplyData },
      { data: sentimentData },
      { data: deliveryAnalytics },
      { data: logisticsSnapshot },
      { data: usdaExportSales },
    ] = await Promise.all([
      supabase.from("v_grain_yoy_comparison").select("*"),
      supabase.from("v_supply_pipeline").select("*").eq("crop_year", cropYear),
      supabase.rpc("get_sentiment_overview", { p_crop_year: cropYear, p_grain_week: latestDataWeek }),
      supabase.rpc("get_delivery_analytics", { p_crop_year: cropYear, p_grain: null }),
      supabase.rpc("get_logistics_snapshot", { p_crop_year: cropYear, p_grain_week: latestDataWeek }),
      supabase
        .from("usda_export_sales")
        .select("commodity, cgc_grain, week_ending, net_sales_mt, exports_mt, outstanding_mt, total_commitments_mt")
        .eq("market_year", cropYear)
        .in("commodity", ["ALL WHEAT", "BARLEY", "OATS", "SOYBEANS", "CORN"])
        .order("commodity", { ascending: true })
        .order("week_ending", { ascending: false }),
    ]);

    // Build lookup maps
    const yoyByGrain = new Map((yoyData ?? []).map((r: Record<string, unknown>) => [r.grain, r]));
    const supplyByGrain = new Map((supplyData ?? []).map((r: Record<string, unknown>) => [r.grain_name, r]));
    const sentimentByGrain = new Map(
      (sentimentData ?? []).map((r: Record<string, unknown>) => [
        r.grain as string,
        { vote_count: Number(r.vote_count), pct_holding: Number(r.pct_holding), pct_hauling: Number(r.pct_hauling), pct_neutral: Number(r.pct_neutral) },
      ]),
    );
    const deliveryByGrain = new Map(
      (deliveryAnalytics ?? []).map((r: Record<string, unknown>) => [r.grain as string, r]),
    );
    const usdaByCommodity = new Map(
      (usdaExportSales ?? []).map((r: Record<string, unknown>) => [r.commodity as string, r]),
    );

    // -- Stored X signals (supplementary context from pulse/deep scanning) --
    const { data: storedSignals } = await supabase
      .from("x_market_signals")
      .select("grain, post_summary, relevance_score, sentiment, category, post_date, source, search_mode, post_url")
      .eq("crop_year", cropYear)
      .gte("grain_week", latestDataWeek - 1)
      .order("relevance_score", { ascending: false })
      .limit(50);

    const signalsByGrain = new Map<string, Array<Record<string, unknown>>>();
    for (const sig of (storedSignals ?? [])) {
      const grain = sig.grain as string;
      if (!signalsByGrain.has(grain)) signalsByGrain.set(grain, []);
      signalsByGrain.get(grain)!.push(sig);
    }

    const results: { grain: string; status: string; error?: string }[] = [];

    for (const grainName of grainNames) {
      try {
        const yoy = yoyByGrain.get(grainName) as Record<string, unknown> | undefined;
        const supply = supplyByGrain.get(grainName) as Record<string, unknown> | undefined;
        const sentiment = sentimentByGrain.get(grainName);
        const delivery = deliveryByGrain.get(grainName) as Record<string, unknown> | undefined;
        const grainSignals = signalsByGrain.get(grainName) ?? [];
        const usdaExport = getLatestUsdaExportSales(grainName, usdaByCommodity);
        const tier = GRAIN_TIERS[grainName] ?? { webSearches: 1, xSearches: 1, tier: "minor" as const };

        if (!yoy) {
          results.push({ grain: grainName, status: "skipped", error: "no YoY data" });
          continue;
        }

        // Per-grain queries
        const [deliveriesHist, exportsHist, stocksHist, cotData, selfSufficiencyData, processorCapacity, priorAnalysis, latestPrice] = await Promise.all([
          supabase.rpc("get_historical_average", { p_grain: grainName, p_metric: "Deliveries", p_worksheet: "Primary", p_grain_week: latestDataWeek, p_years_back: 5 }).then(r => r.data),
          supabase.rpc("get_historical_average", { p_grain: grainName, p_metric: "Exports", p_worksheet: "Summary", p_grain_week: latestDataWeek, p_years_back: 5 }).then(r => r.data),
          supabase.rpc("get_historical_average", { p_grain: grainName, p_metric: "Stocks In Store", p_worksheet: "Summary", p_grain_week: latestDataWeek, p_years_back: 5 }).then(r => r.data),
          supabase.rpc("get_cot_positioning", { p_grain: grainName, p_crop_year: cropYear, p_weeks_back: 4, p_max_grain_week: latestDataWeek }).then(r => r.data),
          supabase.rpc("get_processor_self_sufficiency", { p_grain: grainName, p_crop_year: cropYear }).then(r => r.data),
          supabase.from("processor_capacity").select("annual_capacity_kt").eq("grain", grainName).eq("crop_year", cropYear).maybeSingle().then(r => r.data),
          supabase.from("market_analysis").select("grain_week, stance_score, final_assessment").eq("grain", grainName).eq("crop_year", cropYear).lt("grain_week", latestDataWeek).order("grain_week", { ascending: false }).limit(1).maybeSingle().then(r => r.data),
          supabase.from("grain_prices").select("price_date, settlement_price, change_amount, change_pct").eq("grain", grainName).order("price_date", { ascending: false }).limit(1).maybeSingle().then(r => r.data),
        ]);

        // Compute analyst ratios
        const latestCot = Array.isArray(cotData) && cotData.length > 0 ? cotData[0] as Record<string, unknown> : null;
        const ratios = computeAnalystRatios({
          cyExportsKt: Number(yoy.cy_exports_kt ?? 0),
          projectedExportsKt: supply ? Number(supply.projected_exports_kt) : null,
          cyCrushKt: Number(yoy.cy_crush_kt ?? 0),
          projectedCrushKt: supply ? Number(supply.projected_crush_kt) : null,
          cyDeliveriesKt: Number(yoy.cy_deliveries_kt ?? 0),
          totalSupplyKt: supply ? Number(supply.total_supply_kt) : null,
          commercialStocksKt: Number(yoy.commercial_stocks_kt ?? 0),
          annualCrushCapacityKt: processorCapacity ? Number(processorCapacity.annual_capacity_kt) : null,
          latestDataWeek,
          deliveriesHistAvg: deliveriesHist ? Number(deliveriesHist.avg_value) : null,
          exportsHistAvg: exportsHist ? Number(exportsHist.avg_value) : null,
          mmNetContracts: latestCot ? Number(latestCot.managed_money_net ?? 0) : null,
          mmNetPctOi: latestCot ? Number(latestCot.managed_money_net_pct ?? 0) : null,
        });

        // Build data text
        const dataText = buildDataSection(grainName, cropYear, latestDataWeek, yoy, supply, sentiment, delivery, deliveriesHist, exportsHist, stocksHist, logisticsSnapshot, cotData, selfSufficiencyData, grainSignals, usdaExport);

        const calibrationSection = buildCalibrationPromptSection({
          grain: grainName,
          latestGrainWeek: latestDataWeek,
          priorAnalysis: priorAnalysis ? {
            grainWeek: Number(priorAnalysis.grain_week),
            stanceScore: typeof priorAnalysis.stance_score === "number" ? priorAnalysis.stance_score : null,
            finalAssessment: typeof priorAnalysis.final_assessment === "string" ? priorAnalysis.final_assessment : null,
          } : null,
          latestPrice: latestPrice ? {
            priceDate: String(latestPrice.price_date),
            settlementPrice: Number(latestPrice.settlement_price),
            changeAmount: latestPrice.change_amount == null ? null : Number(latestPrice.change_amount),
            changePct: latestPrice.change_pct == null ? null : Number(latestPrice.change_pct),
          } : null,
        });

        const priceVerificationSection = buildPriceVerificationPromptSection({
          grain: grainName,
          latestGrainWeek: latestDataWeek,
          analysisDate: new Date().toISOString(),
          latestPrice: latestPrice ? {
            priceDate: String(latestPrice.price_date),
            settlementPrice: Number(latestPrice.settlement_price),
            changeAmount: latestPrice.change_amount == null ? null : Number(latestPrice.change_amount),
            changePct: latestPrice.change_pct == null ? null : Number(latestPrice.change_pct),
          } : null,
        });

        // Assemble prompts (Viking L0+L1 is in system prompt, grain-specific)
        const systemPrompt = buildSystemPrompt(grainName);
        const userPrompt = [
          shippingCalendar.promptText,
          ratios.promptSection,
          dataText,
          calibrationSection,
          priceVerificationSection,
          `## Research Guidance\nYou are analyzing **${grainName}** (${tier.tier} grain). Use up to ${tier.webSearches} web searches and ${tier.xSearches} X searches to research current conditions. Focus on Canadian prairie context first, then global factors.`,
          `## Task\nProduce a structured JSON market analysis for **${grainName}**, crop year ${cropYear}. Research first, then analyze the data, then conclude. Treat the bull_case and bear_case as the weekly farmer summary of what is helping and hurting the farmer right now. Before sounding bullish, verify that the latest futures check is fresh and not working the other way. If price verification contradicts a bullish read, lower conviction or move to WATCH unless cash truth and basis clearly override it.`,
        ].join("\n\n");

        // Call xAI with search tools
        const tools: Array<Record<string, unknown>> = [
          { type: "web_search" },
          { type: "x_search" },
        ];

        const response = await fetch(XAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${xaiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_output_tokens: 16384,
            tools,
            input: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "market_analysis_v2",
                strict: true,
                schema: OUTPUT_SCHEMA,
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

        // Extract text content
        const messageOutput = (aiResponse.output ?? []).find((o: { type: string }) => o.type === "message");
        const content = messageOutput?.content?.find((c: { type: string }) => c.type === "output_text")?.text ?? "";

        let analysis;
        try {
          analysis = JSON.parse(content);
        } catch {
          results.push({ grain: grainName, status: "failed", error: `JSON parse failed: ${content.slice(0, 100)}` });
          continue;
        }

        // Validate and apply safe defaults
        analysis.initial_thesis = analysis.initial_thesis ?? "";
        analysis.bull_case = analysis.bull_case ?? "";
        analysis.bear_case = analysis.bear_case ?? "";
        analysis.historical_context = analysis.historical_context ?? {};
        analysis.data_confidence = ["high", "medium", "low"].includes(analysis.data_confidence) ? analysis.data_confidence : "medium";
        analysis.key_signals = Array.isArray(analysis.key_signals) ? analysis.key_signals : [];
        analysis.confidence_score = typeof analysis.confidence_score === "number" ? Math.max(0, Math.min(100, Math.round(analysis.confidence_score))) : null;
        analysis.stance_score = typeof analysis.stance_score === "number" ? Math.max(-100, Math.min(100, Math.round(analysis.stance_score))) : null;
        analysis.final_assessment = typeof analysis.final_assessment === "string" ? analysis.final_assessment : null;
        analysis.research_sources = Array.isArray(analysis.research_sources) ? analysis.research_sources : [];
        analysis.data_vs_web_discrepancies = Array.isArray(analysis.data_vs_web_discrepancies) ? analysis.data_vs_web_discrepancies : [];

        const calibrationOutcome = summarizeCalibrationOutcome({
          grain: grainName,
          latestGrainWeek: latestDataWeek,
          priorAnalysis: priorAnalysis ? {
            grainWeek: Number(priorAnalysis.grain_week),
            stanceScore: typeof priorAnalysis.stance_score === "number" ? priorAnalysis.stance_score : null,
            finalAssessment: typeof priorAnalysis.final_assessment === "string" ? priorAnalysis.final_assessment : null,
          } : null,
          currentAnalysis: {
            grainWeek: latestDataWeek,
            stanceScore: analysis.stance_score,
            finalAssessment: analysis.final_assessment,
          },
          latestPrice: latestPrice ? {
            priceDate: String(latestPrice.price_date),
            settlementPrice: Number(latestPrice.settlement_price),
            changeAmount: latestPrice.change_amount == null ? null : Number(latestPrice.change_amount),
            changePct: latestPrice.change_pct == null ? null : Number(latestPrice.change_pct),
          } : null,
        });

        const priceVerificationOutcome = summarizePriceVerificationOutcome({
          grain: grainName,
          latestGrainWeek: latestDataWeek,
          analysisDate: new Date().toISOString(),
          currentAnalysis: {
            grainWeek: latestDataWeek,
            stanceScore: analysis.stance_score,
            finalAssessment: analysis.final_assessment,
          },
          latestPrice: latestPrice ? {
            priceDate: String(latestPrice.price_date),
            settlementPrice: Number(latestPrice.settlement_price),
            changeAmount: latestPrice.change_amount == null ? null : Number(latestPrice.change_amount),
            changePct: latestPrice.change_pct == null ? null : Number(latestPrice.change_pct),
          } : null,
        });

        if (priceVerificationOutcome.shouldBlockBullish && typeof analysis.stance_score === "number" && analysis.stance_score > 20) {
          analysis.stance_score = Math.min(analysis.stance_score, 19);
          analysis.confidence_score = typeof analysis.confidence_score === "number"
            ? Math.min(analysis.confidence_score, 55)
            : 55;
          analysis.data_confidence = analysis.data_confidence === "high" ? "medium" : analysis.data_confidence;
          const gateNote = "WATCH — futures are not confirming the bullish read yet.";
          analysis.final_assessment = typeof analysis.final_assessment === "string" && analysis.final_assessment.trim().length > 0
            ? `${gateNote} ${analysis.final_assessment}`
            : gateNote;
        }

        // Upsert market_analysis (backward compatible)
        const { error: upsertError } = await supabase
          .from("market_analysis")
          .upsert({
            grain: grainName,
            crop_year: cropYear,
            grain_week: latestDataWeek,
            initial_thesis: analysis.initial_thesis,
            bull_case: analysis.bull_case,
            bear_case: analysis.bear_case,
            historical_context: analysis.historical_context,
            data_confidence: analysis.data_confidence,
            key_signals: analysis.key_signals,
            confidence_score: analysis.confidence_score,
            stance_score: analysis.stance_score,
            final_assessment: analysis.final_assessment,
            model_used: MODEL,
            llm_metadata: {
              request_id: aiResponse.id ?? null,
              input_tokens: usage.input_tokens ?? null,
              output_tokens: usage.output_tokens ?? null,
              prompt_version: PIPELINE_VERSION,
              knowledge_version: MARKET_INTELLIGENCE_VERSIONS.knowledgeBase,
              knowledge_sources: [...new Set([...KNOWLEDGE_SOURCE_PATHS, ...knowledgeContext.sourcePaths])],
              knowledge_query: knowledgeContext.query,
              knowledge_topic_tags: knowledgeContext.topicTags,
              retrieved_chunk_ids: knowledgeContext.chunkIds,
              retrieved_document_ids: knowledgeContext.documentIds,
              research_sources: analysis.research_sources,
              data_vs_web_discrepancies: analysis.data_vs_web_discrepancies,
              calibration: calibrationOutcome,
              price_verification: priceVerificationOutcome,
            },
            generated_at: new Date().toISOString(),
          }, { onConflict: "grain,crop_year,grain_week" });

        if (upsertError) {
          results.push({ grain: grainName, status: "failed", error: upsertError.message });
          continue;
        }

        // Also write to grain_intelligence for backward compat with dashboard
        const intelligenceNarrative = `## ${grainName} — Week ${latestDataWeek} Market Intelligence\n\n${analysis.initial_thesis}\n\n### Bull Case\n${analysis.bull_case}\n\n### Bear Case\n${analysis.bear_case}\n\n### Assessment\n${analysis.final_assessment ?? ""}`;

        await supabase
          .from("grain_intelligence")
          .upsert({
            grain: grainName,
            crop_year: cropYear,
            grain_week: latestDataWeek,
            narrative: intelligenceNarrative,
            model_used: MODEL,
            generated_at: new Date().toISOString(),
          }, { onConflict: "grain,crop_year,grain_week" });

        // Also write/update weekly anchor trajectory for score tracking
        const trajectoryRow = buildWeeklyTrajectoryRow({
          grain: grainName,
          cropYear,
          grainWeek: latestDataWeek,
          stanceScore: typeof analysis.stance_score === "number" ? analysis.stance_score : 0,
          confidenceScore: typeof analysis.confidence_score === "number" ? analysis.confidence_score : null,
          modelSource: MODEL,
          trigger: "weekly thesis anchor",
          evidence: typeof analysis.final_assessment === "string" && analysis.final_assessment.trim().length > 0
            ? analysis.final_assessment
            : analysis.initial_thesis,
          dataFreshness: {
            cgc_week: latestDataWeek,
            crop_year: cropYear,
            market_analysis_generated_at: new Date().toISOString(),
            price_date: latestPrice ? String(latestPrice.price_date) : null,
            price_verification: priceVerificationOutcome.status,
          },
        });

        await supabase
          .from("score_trajectory")
          .insert(trajectoryRow);

        results.push({ grain: grainName, status: "success" });
        console.log(`[v2] ${grainName}: stance=${analysis.stance_score}, confidence=${analysis.confidence_score}, signals=${analysis.key_signals?.length ?? 0}, sources=${analysis.research_sources?.length ?? 0}`);
      } catch (err) {
        results.push({ grain: grainName, status: "failed", error: String(err).slice(0, 200) });
      }
    }

    const duration = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;

    // Report completion to pipeline_runs (if orchestrated)
    if (runId) {
      const grainStatus = results.some((r: { status: string }) => r.status === "failed") ? "failed" : "completed";
      const errorMsg = results.find((r: { status: string; error?: string }) => r.status === "failed")?.error ?? null;
      const { error: pipelineErr } = await supabase.rpc("update_pipeline_grain_status", {
        p_run_id: runId,
        p_grain: grainNames[0],  // BATCH_SIZE=1, always one grain
        p_status: grainStatus,
        p_error: errorMsg,
      });
      if (pipelineErr) console.error("Pipeline status update failed:", pipelineErr.message);
    }

    return new Response(
      JSON.stringify({ results, duration_ms: duration, succeeded, failed, remaining: remainingGrains.length, pipeline_version: PIPELINE_VERSION }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[v2] analyze-grain-market error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

// -- Data section builder (reuses v1 format with stored signals appended) --

function buildDataSection(
  grain: string, cropYear: string, grainWeek: number,
  yoy: Record<string, unknown>,
  supply: Record<string, unknown> | undefined,
  sentiment: { vote_count: number; pct_holding: number; pct_hauling: number; pct_neutral: number } | undefined,
  delivery: Record<string, unknown> | undefined,
  deliveriesHist: Record<string, unknown> | null,
  exportsHist: Record<string, unknown> | null,
  stocksHist: Record<string, unknown> | null,
  logisticsSnapshot: Record<string, unknown> | null,
  cotData: unknown,
  selfSufficiency: unknown,
  storedSignals: Array<Record<string, unknown>>,
  usdaExportSales: Record<string, unknown> | null,
): string {
  const sections: string[] = [];

  sections.push(`## Market Data for ${grain} — CGC Week ${grainWeek}, Crop Year ${cropYear}`);

  sections.push(`### Current Week (CGC Week ${grainWeek})
- Producer Deliveries: ${fmtNum(yoy.cw_deliveries_kt)} Kt (WoW: ${fmtPct(yoy.wow_deliveries_pct)})
- Commercial Stocks: ${fmtNum(yoy.commercial_stocks_kt)} Kt (WoW change: ${fmtChange(yoy.wow_stocks_change_kt)} Kt)`);

  sections.push(`### Crop Year to Date
- CY Deliveries: ${fmtNum(yoy.cy_deliveries_kt)} Kt (YoY: ${fmtPct(yoy.yoy_deliveries_pct)}, Prior Year: ${fmtNum(yoy.py_deliveries_kt)} Kt)
- CY Exports: ${fmtNum(yoy.cy_exports_kt)} Kt (YoY: ${fmtPct(yoy.yoy_exports_pct)}, Prior Year: ${fmtNum(yoy.py_exports_kt)} Kt)
- CY Crush/Processing: ${fmtNum(yoy.cy_crush_kt)} Kt (YoY: ${fmtPct(yoy.yoy_crush_pct)}, Prior Year: ${fmtNum(yoy.py_crush_kt)} Kt)`);

  if (supply) {
    sections.push(`### Supply Balance (AAFC Estimate)
- Production: ${fmtNum(supply.production_kt)} Kt
- Carry-in: ${fmtNum(supply.carry_in_kt)} Kt
- Total Supply: ${fmtNum(supply.total_supply_kt)} Kt
- Projected Exports: ${fmtNum(supply.projected_exports_kt)} Kt
- Projected Crush: ${fmtNum(supply.projected_crush_kt)} Kt
- Projected Carry-out: ${fmtNum(supply.projected_carry_out_kt)} Kt`);
  }

  if (deliveriesHist || exportsHist || stocksHist) {
    sections.push(`### 5-Year Historical Averages (at Week ${grainWeek})
- Deliveries: avg ${fmtNum(deliveriesHist?.avg_value)} Kt, range ${fmtNum(deliveriesHist?.min_value)}-${fmtNum(deliveriesHist?.max_value)} Kt
- Exports: avg ${fmtNum(exportsHist?.avg_value)} Kt, range ${fmtNum(exportsHist?.min_value)}-${fmtNum(exportsHist?.max_value)} Kt
- Stocks: avg ${fmtNum(stocksHist?.avg_value)} Kt, range ${fmtNum(stocksHist?.min_value)}-${fmtNum(stocksHist?.max_value)} Kt`);
  }

  if (sentiment && sentiment.vote_count >= 5) {
    sections.push(`### Farmer Sentiment (Bushel Board poll — Week ${grainWeek + 1})
- ${sentiment.vote_count} farmers voted: ${sentiment.pct_holding}% holding, ${sentiment.pct_hauling}% hauling, ${sentiment.pct_neutral}% neutral`);
  }

  if (delivery) {
    sections.push(`### Community Delivery Stats
- Farmers reporting: ${delivery.farmer_count ?? "N/A"}
- Median delivery: ${fmtNum(delivery.median_delivered_kt)} Kt
- Mean pace: ${fmtNum(delivery.mean_pace_pct)}%
- P25-P75 range: ${fmtNum(delivery.p25_pace_pct)}%-${fmtNum(delivery.p75_pace_pct)}%`);
  }

  if (usdaExportSales) {
    const mappingNote = grain === "Canola"
      ? "Proxy note: using USDA SOYBEANS export sales as the global oilseed demand signal for canola."
      : grain === "Soybeans"
        ? "USDA soybean export sales used here as the direct US/global soybean demand signal."
        : null;

    sections.push(`### USDA Export Sales (global demand signal)
- Commodity: ${String(usdaExportSales.commodity ?? "N/A")}
- Week ending: ${String(usdaExportSales.week_ending ?? "N/A")}
- Net sales: ${fmtNum(usdaExportSales.net_sales_mt)} MT
- Exports: ${fmtNum(usdaExportSales.exports_mt)} MT
- Outstanding sales: ${fmtNum(usdaExportSales.outstanding_mt)} MT
- Total commitments: ${fmtNum(usdaExportSales.total_commitments_mt)} MT${mappingNote ? `
- ${mappingNote}` : ""}`);
  }

  // Stored X signals as supplementary context
  if (storedSignals.length > 0) {
    const topSignals = storedSignals.slice(0, 5);
    sections.push(`### Recent X/Web Signals (pre-collected)
${topSignals.map(s => `- [${s.category}] (${s.source}/${s.search_mode}, ${s.sentiment ?? "neutral"}, score: ${s.relevance_score}) ${String((s.post_summary ?? "") as string).slice(0, 150)}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

// -- Helpers --

function fmtNum(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : n.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

function fmtPct(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtChange(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

function getLatestUsdaExportSales(
  grain: string,
  usdaByCommodity: Map<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const commodity = grain === "Wheat"
    ? "ALL WHEAT"
    : grain === "Barley"
      ? "BARLEY"
      : grain === "Oats"
        ? "OATS"
        : grain === "Canola" || grain === "Soybeans"
          ? "SOYBEANS"
          : grain === "Corn"
            ? "CORN"
            : null;

  return commodity ? (usdaByCommodity.get(commodity) ?? null) : null;
}

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
