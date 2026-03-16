#!/usr/bin/env npx tsx
/**
 * Mock thesis run: test Grok 4.1 Fast on a real Canola Week 31 analysis.
 *
 * Usage:
 *   npx tsx scripts/mock-grok-thesis.ts
 *   npx tsx scripts/mock-grok-thesis.ts --grain Wheat
 *
 * Requires XAI_API_KEY in .env.local or environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const XAI_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4-1-fast-reasoning";

const args = process.argv.slice(2);
const grain = args.includes("--grain") ? args[args.indexOf("--grain") + 1] : "Canola";

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error("ERROR: XAI_API_KEY not found in environment or .env.local");
  process.exit(1);
}

// ── Real data from Supabase (Canola Week 31, 2025-2026) ──

const yoyData = {
  grain: "Canola",
  crop_year: "2025-2026",
  grain_week: 31,
  cy_deliveries_kt: 12107.8,
  cw_deliveries_kt: 460.2,
  cy_exports_kt: 4586.7,
  cy_crush_kt: 6274.9,
  commercial_stocks_kt: 1470.5,
  wow_deliveries_pct: 5.0,
  wow_stocks_change_kt: 46.1,
  py_deliveries_kt: 12670.5,
  py_exports_kt: 6323.9,
  py_crush_kt: 6405.6,
  yoy_deliveries_pct: -4.4,
  yoy_exports_pct: -27.5,
  yoy_crush_pct: -2.0,
};

const supplyData = {
  production_kt: 21804,
  carry_in_kt: 1597,
  total_supply_kt: 23502,
  projected_exports_kt: 7000,
  projected_crush_kt: 11800,
  projected_carry_out_kt: 2500,
};

const historicalAvg = {
  avg_value: 4767.7,
  min_value: 77.1,
  max_value: 12670.5,
  stddev: 6110.9,
  years_count: 5,
};

const cotData = [
  { report_date: "2026-03-10", managed_money_net: 95152, managed_money_net_pct: 25.7, wow_net_change: 33813, commercial_net: -81433, commercial_net_pct: -22.0, spec_commercial_divergence: true, open_interest: 370216 },
  { report_date: "2026-03-03", managed_money_net: 61339, managed_money_net_pct: 17.7, wow_net_change: 33145, commercial_net: -43821, commercial_net_pct: -12.7, spec_commercial_divergence: true, open_interest: 346017 },
  { report_date: "2026-02-24", managed_money_net: 28194, managed_money_net_pct: 9.1, wow_net_change: 19802, commercial_net: -6891, commercial_net_pct: -2.2, spec_commercial_divergence: true, open_interest: 310667 },
  { report_date: "2026-02-17", managed_money_net: 8392, managed_money_net_pct: 2.6, wow_net_change: 8247, commercial_net: 20849, commercial_net_pct: 6.4, spec_commercial_divergence: false, open_interest: 323526 },
];

// ── Knowledge chunks from distilled books ──

const knowledgeChunks = [
  {
    heading: "Seasonal Patterns & Cyclical Tendencies",
    content: `Crop Calendar Triggers: Harvest Pressure Zone (Aug 15 - Nov 30) basis typically widens 20-50% above 5yr avg during first 30 days post-harvest start. Pre-Seeding Rally Window (Feb 15 - Apr 30) nearby futures tend to gain 8-12% if N.American stocks-to-use < 15%. Export Peak Season (Sep 1 - Mar 31) Pacific NW and Gulf port basis narrows 15-25% vs interior elevators. Weather Risk Windows: frost > 7 days past historical avg in major growing zones (MB/SK/AB), short-covering rallies in Nov-Mar futures average +6.5%.`,
  },
  {
    heading: "Basis Analysis Rules",
    content: `Basis = Local Cash Price - Nearby Futures Price. Adjusted Basis = Basis - Freight Differential to Reference Port. Reference Ports: Vancouver (W. Canada), Thunder Bay (Central), Montreal (East). Normalize: subtract 3-year average basis for same calendar week to identify wide/narrow conditions.`,
  },
  {
    heading: "Storage Decision Algorithm",
    content: `Store IF all conditions met: (1) Futures Curve Carry (Month+3 minus Month) > Storage Cost x 1.3. (2) Expected basis in 90 days < Current basis - 10 points. (3) Historical Q1-Q2 price increase probability > 60%. (4) No margin call pressure on hedged positions. Otherwise: Sell cash or minimal hedge (5-10%). Carry Charge = (Futures Spread) + (Basis Change Expectation) - (Storage + Interest). Storage = $0.015/tonne/day, Interest = 6% annual on avg inventory value. Exit Triggers: carry deteriorates >50%, basis widens 3+ consecutive days, cash price breaks 100-day MA, or regional storage >85% utilized.`,
  },
];

// ── Build system prompt (mirrors analyze-market-data) ──

const systemPrompt = `You are a sharp, experienced prairie grain market analyst. You produce structured JSON market analysis using CGC weekly data, AAFC supply balance, 5-year historical averages, farmer sentiment, CFTC COT positioning, and distilled knowledge from grain marketing textbooks.

Your analysis will be reviewed by a second round of synthesis. Be data-driven and defensible. Every claim must reference specific numbers.

## Output Format

Return a JSON object with these fields:
- "initial_thesis": string — 2-3 concise sentences stating the directional thesis (bullish/bearish/neutral) with key data points
- "bull_case": string — 3-4 bullet points supporting price strength, each starting with '• ' and citing specific data
- "bear_case": string — 3-4 bullet points supporting price weakness, each starting with '• ' and citing specific data
- "historical_context": object with:
  - "deliveries_vs_5yr_avg_pct": number | null
  - "exports_vs_5yr_avg_pct": number | null
  - "seasonal_observation": string
  - "notable_patterns": string[]
- "data_confidence": "high" | "medium" | "low"
- "confidence_score": integer 0-100
- "final_assessment": string — 1-2 plain-English sentences a farmer can act on
- "key_signals": array of objects with: signal ("bullish"/"bearish"/"watch"), title, body, confidence, source

## Rules
- Write for prairie farmers, not traders. Use plain English.
- Every claim MUST reference specific numbers from the provided data.
- If data is missing, note the gap.
- Do NOT give financial advice. Frame as "data suggests" or "the numbers show".
- Include 3-6 key signals. At least one must be "watch".
- Return ONLY the JSON object.`;

// ── Build data prompt ──

const deliveredPct = ((yoyData.cy_deliveries_kt / supplyData.total_supply_kt) * 100).toFixed(1);
const deliveriesVs5yr = ((yoyData.cy_deliveries_kt - historicalAvg.avg_value) / historicalAvg.avg_value * 100).toFixed(1);

const dataPrompt = `## Market Data for ${grain} — CGC Week ${yoyData.grain_week}, Crop Year ${yoyData.crop_year}

### Current Week (CGC Week ${yoyData.grain_week})
- Producer Deliveries: ${yoyData.cw_deliveries_kt} Kt (WoW: +${yoyData.wow_deliveries_pct}%)
- Commercial Stocks: ${yoyData.commercial_stocks_kt} Kt (WoW change: +${yoyData.wow_stocks_change_kt} Kt)

### Crop Year to Date
- CY Deliveries: ${yoyData.cy_deliveries_kt} Kt (YoY: ${yoyData.yoy_deliveries_pct}%, Prior Year: ${yoyData.py_deliveries_kt} Kt)
- CY Exports: ${yoyData.cy_exports_kt} Kt (YoY: ${yoyData.yoy_exports_pct}%, Prior Year: ${yoyData.py_exports_kt} Kt)
- CY Crush/Processing: ${yoyData.cy_crush_kt} Kt (YoY: ${yoyData.yoy_crush_pct}%, Prior Year: ${yoyData.py_crush_kt} Kt)

### Supply Balance (AAFC Estimate)
- Production: ${supplyData.production_kt} Kt
- Carry-in: ${supplyData.carry_in_kt} Kt
- Total Supply: ${supplyData.total_supply_kt} Kt
- Projected Exports: ${supplyData.projected_exports_kt} Kt
- Projected Crush: ${supplyData.projected_crush_kt} Kt
- Projected Carry-out: ${supplyData.projected_carry_out_kt} Kt
- Delivered to Date: ${deliveredPct}% of total supply

### 5-Year Historical Averages (at Week 31)
- Deliveries: avg ${historicalAvg.avg_value} Kt, range ${historicalAvg.min_value}-${historicalAvg.max_value} Kt
  Current vs 5yr avg: +${deliveriesVs5yr}%

### CFTC COT Positioning (ICE Futures — Canola)
${cotData.map(c => `- ${c.report_date}: Managed Money Net ${c.managed_money_net.toLocaleString()} (${c.managed_money_net_pct}% OI), WoW change +${c.wow_net_change.toLocaleString()}, Commercial Net ${c.commercial_net.toLocaleString()} (${c.commercial_net_pct}% OI), Divergence: ${c.spec_commercial_divergence ? "YES" : "No"}`).join("\n")}

NOTE: Managed money has gone from +8,392 net to +95,152 net in just 4 weeks — aggressive spec buying. Commercials have flipped from net long (+20,849) to heavily net short (-81,433).

### Retrieved Grain Marketing Knowledge
${knowledgeChunks.map(c => `**${c.heading}:**\n${c.content}`).join("\n\n")}

### Farmer Sentiment
Insufficient farmer votes this week (need >= 5 for privacy). Skip sentiment analysis.

## Task

Produce a structured JSON market analysis for ${grain} following the output format specified in your system instructions. Focus on:
1. Directional thesis based on supply/demand balance and delivery pace
2. Historical context — how does this week compare to 5-year patterns?
3. Bull and bear cases with specific data citations
4. Key signals with confidence levels
5. COT positioning implications for timing`;

// ── Call xAI API ──

async function main() {
  console.error(`\n🚀 Mock Grok 4.1 Fast thesis run — ${grain} Week 31\n`);
  console.error(`Model: ${MODEL}`);
  console.error(`API: ${XAI_API_URL}`);
  console.error(`System prompt: ${systemPrompt.length} chars`);
  console.error(`Data prompt: ${dataPrompt.length} chars`);
  console.error(`Knowledge chunks: ${knowledgeChunks.length}`);
  console.error(`\nCalling xAI API...\n`);

  const startTime = Date.now();

  const response = await fetch(XAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_output_tokens: 16384,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: dataPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "market_analysis",
          strict: true,
          schema: {
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
                    source: { type: "string", enum: ["CGC", "AAFC", "Historical", "Community", "CFTC"] },
                  },
                  required: ["signal", "title", "body", "confidence", "source"],
                  additionalProperties: false,
                },
              },
            },
            required: ["initial_thesis", "bull_case", "bear_case", "historical_context", "data_confidence", "confidence_score", "final_assessment", "key_signals"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    const errText = await response.text();
    console.error(`❌ API error ${response.status}: ${errText}`);
    process.exit(1);
  }

  const aiResponse = await response.json();
  const usage = aiResponse.usage ?? {};

  // Extract text from Responses API
  const messageOutput = (aiResponse.output ?? []).find(
    (o: { type: string }) => o.type === "message"
  );
  const content = messageOutput?.content?.find(
    (c: { type: string }) => c.type === "output_text"
  )?.text ?? "";

  let analysis;
  try {
    analysis = JSON.parse(content);
  } catch {
    console.error(`❌ JSON parse failed. Raw content:\n${content}`);
    process.exit(1);
  }

  // Output results
  console.error(`\n✅ Response received in ${(elapsed / 1000).toFixed(1)}s`);
  console.error(`   Input tokens:  ${usage.input_tokens ?? "?"}`);
  console.error(`   Output tokens: ${usage.output_tokens ?? "?"}`);
  console.error(`   Total tokens:  ${(usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)}`);

  const inputCost = ((usage.input_tokens ?? 0) / 1_000_000) * 0.20;
  const outputCost = ((usage.output_tokens ?? 0) / 1_000_000) * 0.50;
  console.error(`   Est. cost:     $${(inputCost + outputCost).toFixed(4)}`);

  console.error(`\n── THESIS ──────────────────────────────────────`);
  console.error(analysis.initial_thesis);
  console.error(`\n── BULL CASE ───────────────────────────────────`);
  console.error(analysis.bull_case);
  console.error(`\n── BEAR CASE ───────────────────────────────────`);
  console.error(analysis.bear_case);
  console.error(`\n── FINAL ASSESSMENT ────────────────────────────`);
  console.error(analysis.final_assessment);
  console.error(`\n── HISTORICAL CONTEXT ──────────────────────────`);
  console.error(`  Deliveries vs 5yr: ${analysis.historical_context.deliveries_vs_5yr_avg_pct}%`);
  console.error(`  Exports vs 5yr:    ${analysis.historical_context.exports_vs_5yr_avg_pct}%`);
  console.error(`  Seasonal:          ${analysis.historical_context.seasonal_observation}`);
  console.error(`  Patterns:          ${analysis.historical_context.notable_patterns?.join("; ")}`);
  console.error(`\n── KEY SIGNALS ─────────────────────────────────`);
  for (const sig of analysis.key_signals) {
    const icon = sig.signal === "bullish" ? "🟢" : sig.signal === "bearish" ? "🔴" : "🟡";
    console.error(`  ${icon} [${sig.confidence.toUpperCase()}] ${sig.title} (${sig.source})`);
    console.error(`     ${sig.body}`);
  }
  console.error(`\n── CONFIDENCE ──────────────────────────────────`);
  console.error(`  Data confidence: ${analysis.data_confidence}`);
  console.error(`  Score: ${analysis.confidence_score}/100`);
  console.error(`────────────────────────────────────────────────\n`);

  // Also output raw JSON to stdout for piping
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
