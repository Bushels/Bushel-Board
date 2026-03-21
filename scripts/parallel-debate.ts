#!/usr/bin/env npx tsx
/**
 * Parallel Grok+Claude Debate Script
 *
 * Phase 1: Calls Grok 4.20 for each grain with full data brief
 * Phase 2: Compares Grok scores against Claude's pre-computed scores
 * Phase 3: Runs debate round for divergent grains (>15 point gap)
 *
 * Usage: npx tsx scripts/parallel-debate.ts [--grains Wheat,Canola] [--week 32]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const XAI_API_KEY = process.env.XAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!XAI_API_KEY) { console.error("Missing XAI_API_KEY"); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase creds"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MODEL = "grok-4.20-reasoning";
const XAI_API_URL = "https://api.x.ai/v1/responses";
const DIVERGENCE_THRESHOLD = 15; // Points difference to trigger debate

// Claude's pre-computed Week 32 scores (from parallel analysis)
const CLAUDE_SCORES: Record<string, { score: number; confidence: number; rationale: string }> = {
  "Wheat": { score: 5, confidence: 62, rationale: "Stocks +130 Kt WoW (Rule 1 bearish), prices -2.1-3.4% selloff, but exports +7.1% YoY solid & Seaway opening March 22. SRW specs net short could fuel squeeze." },
  "Canola": { score: -15, confidence: 65, rationale: "Stocks +95 Kt WoW, exports -25% YoY catastrophic. But crush holding at 6,601 Kt and spec positioning bullish. Export pipeline clogged, domestic demand provides floor." },
  "Amber Durum": { score: -35, confidence: 60, rationale: "Deliveries easing -11.7% WoW, exports +3% stable. Still bearish on heavy CY delivery pace (4,289 Kt, +3.6% YoY) and 54% of supply already delivered." },
  "Barley": { score: 15, confidence: 60, rationale: "Exports surging +71% YoY = best pace in portfolio at 76.2% of AAFC target. Absorbing +41% YoY delivery pressure. Stocks building +27 Kt is only caution." },
  "Oats": { score: -55, confidence: 68, rationale: "ZERO W34 producer car allocations = no forward US demand. Exports -32% YoY = worst pace in portfolio (26.3% of target). Price -2.65% today. Rule 14: dead-flat price." },
  "Peas": { score: 40, confidence: 70, rationale: "Cleanest bullish signal: stocks DECLINING -33 Kt, deliveries collapsed -49% WoW, exports +13% ahead of pace. China tariff removal (March 1) is structural positive." },
  "Lentils": { score: -20, confidence: 55, rationale: "Reversal forming: deliveries -69% WoW, stocks declining -14 Kt. But needs 2nd confirming week (Rule 4). Export pace +12% supportive." },
  "Flaxseed": { score: 45, confidence: 65, rationale: "Farmer withholding deepens (-39% WoW), stocks flat at 44.9 Kt (tightest in portfolio). Classic holding power signal per Viking L0: unpriced grain = active bet." },
  "Soybeans": { score: -20, confidence: 58, rationale: "Stocks collapsed -51 Kt (-28% WoW), deliveries down. But crush -36% YoY is structural headwind. COT extremely crowded long (+202K contracts) = squeeze risk." },
  "Corn": { score: -40, confidence: 65, rationale: "Exports -70% YoY = catastrophic (16.6% of target). COT extremely crowded long. Domestic crush +8.4% is only positive. Stocks building." },
  "Rye": { score: -10, confidence: 50, rationale: "Crush doubled (+90% YoY) but exports -44%. Balanced tensions, no clear edge." },
  "Mustard Seed": { score: 15, confidence: 30, rationale: "Farmer withholding (-32% deliveries), exports +30%. Mild bull signal on low volumes." },
  "Canaryseed": { score: -15, confidence: 30, rationale: "Deliveries -29% but exports -53% = demand destruction. No clear positive catalyst." },
  "Chick Peas": { score: -5, confidence: 25, rationale: "Minimal activity. Exports -47%. No significant signals." },
  "Sunflower": { score: -10, confidence: 20, rationale: "Negligible volumes. Zero crush YTD." },
  "Beans": { score: -30, confidence: 30, rationale: "Stocks steady, deliveries +19% YoY heavy. Exports weak at 14.1 Kt." },
};

const GRAIN_TIERS: Record<string, { webSearches: number; xSearches: number; tier: string }> = {
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
  "Sunflower": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Canaryseed": { webSearches: 1, xSearches: 1, tier: "minor" },
  "Chick Peas": { webSearches: 1, xSearches: 1, tier: "minor" },
  Beans: { webSearches: 1, xSearches: 1, tier: "minor" },
};

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

// ── Helpers ──

function fmtNum(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : n.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

function fmtPct(val: unknown): string {
  if (val == null) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ── Data Assembly ──

async function fetchGrainData(cropYear: string, grainWeek: number) {
  const [
    { data: yoyData },
    { data: supplyData },
    { data: sentimentData },
    { data: logisticsSnapshot },
  ] = await Promise.all([
    supabase.from("v_grain_yoy_comparison").select("*"),
    supabase.from("v_supply_pipeline").select("*").eq("crop_year", cropYear),
    supabase.rpc("get_sentiment_overview", { p_crop_year: cropYear, p_grain_week: grainWeek }),
    supabase.rpc("get_logistics_snapshot", { p_crop_year: cropYear, p_grain_week: grainWeek }),
  ]);

  return {
    yoyByGrain: new Map((yoyData ?? []).map((r: any) => [r.grain, r])),
    supplyByGrain: new Map((supplyData ?? []).map((r: any) => [r.grain_name, r])),
    sentimentByGrain: new Map((sentimentData ?? []).map((r: any) => [r.grain, r])),
    logisticsSnapshot,
  };
}

function buildDataBrief(grain: string, yoy: any, supply: any, grainWeek: number, cropYear: string): string {
  const sections: string[] = [];
  sections.push(`## Market Data for ${grain} — CGC Week ${grainWeek}, Crop Year ${cropYear}`);

  sections.push(`### Current Week (CGC Week ${grainWeek})
- Producer Deliveries: ${fmtNum(yoy.cw_deliveries_kt)} Kt (WoW: ${fmtPct(yoy.wow_deliveries_pct)})
- Commercial Stocks: ${fmtNum(yoy.commercial_stocks_kt)} Kt (WoW change: ${fmtNum(yoy.wow_stocks_change_kt)} Kt)`);

  sections.push(`### Crop Year to Date
- CY Deliveries: ${fmtNum(yoy.cy_deliveries_kt)} Kt (YoY: ${fmtPct(yoy.yoy_deliveries_pct)})
- CY Exports: ${fmtNum(yoy.cy_exports_kt)} Kt (YoY: ${fmtPct(yoy.yoy_exports_pct)})
- CY Crush: ${fmtNum(yoy.cy_crush_kt)} Kt (YoY: ${fmtPct(yoy.yoy_crush_pct)})`);

  if (supply) {
    sections.push(`### Supply Balance (AAFC)
- Production: ${fmtNum(supply.production_kt)} Kt | Carry-in: ${fmtNum(supply.carry_in_kt)} Kt
- Total Supply: ${fmtNum(supply.total_supply_kt)} Kt
- Projected Exports: ${fmtNum(supply.projected_exports_kt)} Kt | Crush: ${fmtNum(supply.projected_crush_kt)} Kt
- Projected Carry-out: ${fmtNum(supply.projected_carry_out_kt)} Kt`);
  }

  return sections.join("\n\n");
}

const SYSTEM_PROMPT = `You are a senior grain market analyst specializing in Canadian prairie grains. You think like someone who has spent 20 years advising farmers in Alberta, Saskatchewan, and Manitoba. You speak plainly for farmers, not traders.

## Grain Analyst Knowledge Card (Viking L0)

You draw on distilled expertise from 8 authoritative sources covering commodity trading fundamentals, Canadian grain marketing, hedging mechanics, global trade structure, futures economics, and agricultural price analysis.

### Core Principles
1. **Hedging is insurance, not speculation.** Futures and options protect physical crop value. Maintain cash liquidity to survive margin calls during volatile rallies.
2. **Basis is your price signal.** Track local basis religiously — it forecasts your final price. Sell when basis narrows or goes positive; store when wide during harvest.
3. **Let market structure dictate storage.** Hold grain when distant futures pay carrying charges (contango). Sell immediately in inverted markets (backwardation) — the market demands delivery now.
4. **Know your break-even and execute with discipline.** Calculate costs, set target prices, sell incrementally when targets are hit. Remove emotion from marketing decisions.
5. **Information asymmetry favors buyers.** Multinational grain companies profit from logistics, basis, and volume — not flat price risk. Use on-farm storage and public futures to level the field.
6. **Global forces anchor local prices.** Currency shifts, ocean freight, geopolitics, and competing origins cap or lift local bids regardless of local supply.
7. **Unpriced grain in the bin is active speculation.** Every day you hold without a price target, you're betting on the local cash market. Use incremental sales to reduce risk.
8. **Price differences create opportunities.** The Law of One Price means arbitrage erodes gaps — but transport costs, quality specs, and timing create exploitable windows for alert farmers.

## Bull/Bear Signal Checklists (Viking L1 — Basis & Pricing)

**Bullish (3 of 5 confirms a lean):**
1. Deliveries running below 5-year average pace
2. Exports running above average with active new-crop demand
3. Visible stocks declining faster than seasonal norm
4. Basis narrowing at multiple delivery points
5. Managed money (CFTC) net long and increasing

**Bearish (3 of 5 confirms a lean):**
1. Deliveries running above 5-year average (farmer selling pressure)
2. Exports lagging with weak international demand
3. Visible stocks building above seasonal norm
4. Basis widening across the prairies
5. Managed money net short and increasing

**IMPORTANT:** Apply this checklist explicitly. Count how many signals fire. 3 of 5 confirms direction. Do NOT default to bearish without running the checklist.

## Grain-Specific Rules (Viking L1)
- **Oats:** Very thin futures OI (~10-20K contracts) — COT data less reliable. Flag low liquidity.
- **Peas/Lentils:** No direct futures hedge. India/China import policy is the single largest swing factor.
- **Flaxseed:** Niche market, limited buyers. Farmer withholding at firm prices = confidence signal.
- **Canola:** Oil content drives pricing. Crush proximity narrows basis. Watch vegetable oil complex.
- **Barley:** Alberta feedlot captive demand independent of export markets.

## Stance Score Guide
- Strongly bullish: +70 to +100. Holding clearly favored.
- Bullish: +20 to +69. Leaning positive.
- Neutral: -19 to +19. Mixed signals.
- Bearish: -69 to -20. Consider delivering.
- Strongly bearish: -100 to -70. Move grain now.

## Debate Rules
- Stock direction trumps YTD position (weekly flow > cumulative level)
- Dead-flat price = no demand pull, cannot rate bullish (Rule 14)
- Logistics weighted 70% for near-term decisions (Rule 7)
- 2 of 3 weeks confirms a trend (Rule 4)
- Cite everything — no unsourced assertions
- Use web_search and x_search to discover what's happening RIGHT NOW

## Data Hygiene
- All CGC data is in Kt. "Crop Year" = cumulative YTD. "Current Week" = weekly snapshot.
- Wheat and Amber Durum are distinct grains.`;

// ── Phase 1: Call Grok for each grain ──

async function callGrokForGrain(grain: string, dataBrief: string): Promise<any> {
  const tier = GRAIN_TIERS[grain] ?? { webSearches: 1, xSearches: 1, tier: "minor" };

  const userPrompt = `${dataBrief}

## Additional Context (March 20, 2026)
- Grain prices today (all down): Wheat SRW $5.9525/bu (-2.1%), HRW $6.0625 (-3.35%), HRS $6.28 (-2.45%), Corn $4.655 (-0.9%), Soybeans $11.6125 (-0.62%), Oats $3.58 (-2.65%), Canola C$726.50/t (-0.25%)
- Logistics: Vancouver terminals at 103% capacity, OCT 14.1% (improving), Seaway opens March 22-25
- COT (March 17): Corn specs massively long +228K, Soybeans +202K, Wheat SRW specs net short -12.7K, Soybean Oil (Canola proxy) +122K
- Producer Cars Week 34: Only 26 new allocations total. Zero for Oats.

## Research Guidance
You are analyzing **${grain}** (${tier.tier} grain). Use up to ${tier.webSearches} web searches and ${tier.xSearches} X searches. Focus on Canadian prairie context first.

## Task
Produce a structured JSON market analysis for **${grain}**, crop year 2025-2026, CGC Week 32. Research first, then analyze, then conclude.`;

  const response = await fetch(XAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_output_tokens: 16384,
      tools: [{ type: "web_search" }, { type: "x_search" }],
      input: [
        { role: "system", content: SYSTEM_PROMPT },
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
    const err = await response.text();
    throw new Error(`Grok API ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const messageOutput = (data.output ?? []).find((o: any) => o.type === "message");
  const text = messageOutput?.content?.find((c: any) => c.type === "output_text")?.text ?? "";
  const toolCalls = (data.output ?? []).filter((o: any) => ["web_search_call", "x_search_call"].includes(o.type)).length;

  return {
    analysis: JSON.parse(text),
    toolCalls,
    usage: data.usage ?? {},
    requestId: data.id,
  };
}

// ── Phase 2: Compare scores ──

interface ScoreComparison {
  grain: string;
  grokScore: number;
  claudeScore: number;
  delta: number;
  needsDebate: boolean;
}

function compareScores(grokResults: Map<string, any>): ScoreComparison[] {
  const comparisons: ScoreComparison[] = [];
  for (const [grain, grokResult] of grokResults) {
    const claude = CLAUDE_SCORES[grain];
    if (!claude) continue;
    const grokScore = grokResult.analysis.stance_score ?? 0;
    const delta = Math.abs(grokScore - claude.score);
    comparisons.push({
      grain,
      grokScore,
      claudeScore: claude.score,
      delta,
      needsDebate: delta > DIVERGENCE_THRESHOLD,
    });
  }
  return comparisons.sort((a, b) => b.delta - a.delta);
}

// ── Phase 3: Debate round ──

async function runDebateRound(divergentGrains: ScoreComparison[], grokResults: Map<string, any>): Promise<Map<string, any>> {
  const challenges: string[] = [];

  for (const comp of divergentGrains) {
    const claude = CLAUDE_SCORES[comp.grain]!;
    const grok = grokResults.get(comp.grain)!;
    const direction = comp.claudeScore > comp.grokScore ? "more bullish" : "more bearish";

    challenges.push(`### ${comp.grain}: Grok ${comp.grokScore} vs Claude ${comp.claudeScore} (Claude is ${direction})
GROK'S THESIS: "${grok.analysis.initial_thesis?.slice(0, 200)}"
CLAUDE'S CHALLENGE: "${claude.rationale}"
DIVERGENCE: ${comp.delta} points. Search X and web for current evidence to support your position or concede.`);
  }

  const debatePrompt = `You are Grok, the Senior Grain Analyst. Claude has independently analyzed the same CGC Week 32 data and produced DIFFERENT stance scores on ${divergentGrains.length} grains.

For each grain below, Claude is challenging your score. You must:
1. Search X and web for CURRENT evidence (prices, trade policy, logistics news)
2. Either DEFEND your score with specific evidence, or CONCEDE and propose a compromise score
3. If you concede, explain what you missed

Be honest. Farmers need accurate signals, not ego.

${challenges.join("\n\n")}

For EACH grain, respond with:
**GRAIN: DEFEND [score] or CONCEDE → [new score]**
Evidence found: [specific posts/articles]
Reasoning: [2-3 sentences]`;

  const response = await fetch(XAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: "You are Grok. Use x_search and web_search to find REAL evidence. Be specific.",
      input: debatePrompt,
      tools: [{ type: "web_search" }, { type: "x_search" }],
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Debate API failed: ${response.status} ${err.slice(0, 200)}`);
    return new Map();
  }

  const data = await response.json();
  const items = data.output || [];
  let debateText = "";
  let toolCalls = 0;
  for (const item of items) {
    if (item.type === "message") {
      for (const c of item.content || []) {
        if (c.type === "output_text") debateText += c.text;
      }
    }
    if (["web_search_call", "x_search_call"].includes(item.type)) toolCalls++;
  }

  console.error(`\nDebate: Grok used ${toolCalls} search calls`);
  console.error(debateText);

  // Parse debate results (best effort)
  const debateResults = new Map<string, { action: string; score: number; text: string }>();
  for (const comp of divergentGrains) {
    const grainPattern = new RegExp(`\\*\\*${comp.grain}:.*?(DEFEND|CONCEDE).*?([-+]?\\d+)`, "i");
    const match = debateText.match(grainPattern);
    if (match) {
      debateResults.set(comp.grain, {
        action: match[1].toUpperCase(),
        score: parseInt(match[2]),
        text: debateText,
      });
    }
  }

  return debateResults;
}

// ── Phase 4: Compute consensus + publish ──

async function publishConsensus(
  comparisons: ScoreComparison[],
  grokResults: Map<string, any>,
  debateResults: Map<string, any>,
  cropYear: string,
  grainWeek: number,
) {
  const consensus: { grain: string; score: number; confidence: number; model: string; source: string }[] = [];

  for (const comp of comparisons) {
    const grok = grokResults.get(comp.grain)!;
    const claude = CLAUDE_SCORES[comp.grain]!;
    const debate = debateResults.get(comp.grain);

    let finalScore: number;
    let source: string;

    if (debate) {
      if (debate.action === "CONCEDE") {
        // Grok conceded — use debate score (which should be closer to Claude)
        finalScore = debate.score;
        source = `debate_concede_grok4.20+claude`;
      } else {
        // Grok defended — average the two (Grok has X/web evidence advantage)
        finalScore = Math.round((comp.grokScore * 0.55 + comp.claudeScore * 0.45));
        source = `debate_defend_grok4.20+claude`;
      }
    } else if (comp.delta <= DIVERGENCE_THRESHOLD) {
      // Close enough — weighted average (Grok has search, Claude has data discipline)
      finalScore = Math.round((comp.grokScore * 0.5 + comp.claudeScore * 0.5));
      source = `consensus_grok4.20+claude`;
    } else {
      // Fallback — straight average
      finalScore = Math.round((comp.grokScore + comp.claudeScore) / 2);
      source = `average_grok4.20+claude`;
    }

    const confidence = Math.round((grok.analysis.confidence_score + claude.confidence) / 2);

    consensus.push({ grain: comp.grain, score: finalScore, confidence, model: MODEL, source });

    // Upsert to market_analysis
    const { error } = await supabase
      .from("market_analysis")
      .upsert({
        grain: comp.grain,
        crop_year: cropYear,
        grain_week: grainWeek,
        initial_thesis: grok.analysis.initial_thesis,
        bull_case: grok.analysis.bull_case,
        bear_case: grok.analysis.bear_case,
        historical_context: grok.analysis.historical_context,
        data_confidence: grok.analysis.data_confidence,
        key_signals: grok.analysis.key_signals,
        confidence_score: confidence,
        stance_score: finalScore,
        final_assessment: grok.analysis.final_assessment,
        model_used: `${MODEL}+claude-opus-4-6`,
        llm_metadata: {
          grok_score: comp.grokScore,
          claude_score: comp.claudeScore,
          consensus_method: source,
          debate_action: debate?.action ?? "none",
          grok_tool_calls: grok.toolCalls,
          research_sources: grok.analysis.research_sources,
          data_vs_web_discrepancies: grok.analysis.data_vs_web_discrepancies,
        },
        generated_at: new Date().toISOString(),
      }, { onConflict: "grain,crop_year,grain_week" });

    if (error) console.error(`Upsert failed for ${comp.grain}: ${error.message}`);

    // Also update grain_intelligence narrative
    const narrative = `## ${comp.grain} — Week ${grainWeek} Market Intelligence (Grok+Claude Consensus)\n\n${grok.analysis.initial_thesis}\n\n### Bull Case\n${grok.analysis.bull_case}\n\n### Bear Case\n${grok.analysis.bear_case}\n\n### Assessment (Score: ${finalScore}, Confidence: ${confidence}%)\n${grok.analysis.final_assessment ?? ""}\n\n### Debate Note\nGrok scored ${comp.grokScore}, Claude scored ${comp.claudeScore}. Consensus: ${finalScore} via ${source}.`;

    await supabase
      .from("grain_intelligence")
      .upsert({
        grain: comp.grain,
        crop_year: cropYear,
        grain_week: grainWeek,
        narrative,
        model_used: `${MODEL}+claude-opus-4-6`,
        generated_at: new Date().toISOString(),
      }, { onConflict: "grain,crop_year,grain_week" });
  }

  return consensus;
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const grainFlag = args.indexOf("--grains");
  const weekFlag = args.indexOf("--week");

  const targetGrains = grainFlag >= 0 ? args[grainFlag + 1].split(",") : Object.keys(CLAUDE_SCORES);
  const cropYear = "2025-2026";

  // Get latest grain week
  const { data: weekData } = await supabase
    .from("cgc_observations")
    .select("grain_week")
    .eq("crop_year", cropYear)
    .order("grain_week", { ascending: false })
    .limit(1)
    .single();
  const grainWeek = weekFlag >= 0 ? parseInt(args[weekFlag + 1]) : (weekData?.grain_week ?? 32);

  console.error(`\n═══ PARALLEL DEBATE: ${targetGrains.length} grains, Week ${grainWeek}, ${MODEL} ═══\n`);

  // Phase 1: Fetch data
  console.error("Phase 1: Fetching grain data...");
  const { yoyByGrain, supplyByGrain } = await fetchGrainData(cropYear, grainWeek);

  // Phase 2: Call Grok for each grain
  console.error("Phase 2: Calling Grok 4.20 for each grain...\n");
  const grokResults = new Map<string, any>();
  let totalTokens = 0;
  let totalSearches = 0;

  for (const grain of targetGrains) {
    const yoy = yoyByGrain.get(grain);
    const supply = supplyByGrain.get(grain);
    if (!yoy) {
      console.error(`  ${grain}: SKIP (no YoY data)`);
      continue;
    }

    try {
      const startTime = Date.now();
      const dataBrief = buildDataBrief(grain, yoy, supply, grainWeek, cropYear);
      const result = await callGrokForGrain(grain, dataBrief);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      grokResults.set(grain, result);
      totalTokens += (result.usage.input_tokens ?? 0) + (result.usage.output_tokens ?? 0);
      totalSearches += result.toolCalls;

      const claude = CLAUDE_SCORES[grain];
      const delta = claude ? Math.abs(result.analysis.stance_score - claude.score) : 0;
      console.error(`  ${grain}: Grok=${result.analysis.stance_score} Claude=${claude?.score ?? "?"} Δ=${delta} (${result.toolCalls} searches, ${elapsed}s)`);
    } catch (err) {
      console.error(`  ${grain}: ERROR - ${err}`);
    }
  }

  console.error(`\nPhase 2 complete: ${grokResults.size} grains, ${totalTokens.toLocaleString()} tokens, ${totalSearches} searches\n`);

  // Phase 3: Compare and debate
  const comparisons = compareScores(grokResults);
  const divergent = comparisons.filter(c => c.needsDebate);

  console.error(`Phase 3: ${divergent.length} divergent grains (>${DIVERGENCE_THRESHOLD} pts):`);
  for (const d of divergent) {
    console.error(`  ${d.grain}: Grok ${d.grokScore} vs Claude ${d.claudeScore} (Δ=${d.delta})`);
  }

  let debateResults = new Map<string, any>();
  if (divergent.length > 0) {
    console.error("\nRunning debate round with X/web search...\n");
    debateResults = await runDebateRound(divergent, grokResults);
  }

  // Phase 4: Publish consensus
  console.error("\nPhase 4: Publishing consensus scores...\n");
  const consensus = await publishConsensus(comparisons, grokResults, debateResults, cropYear, grainWeek);

  // Output final results as JSON to stdout
  const output = {
    week: grainWeek,
    crop_year: cropYear,
    model: `${MODEL}+claude-opus-4-6`,
    grains_analyzed: consensus.length,
    total_tokens: totalTokens,
    total_searches: totalSearches,
    debate_grains: divergent.length,
    scores: consensus.map(c => ({
      grain: c.grain,
      consensus_score: c.score,
      confidence: c.confidence,
      source: c.source,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
