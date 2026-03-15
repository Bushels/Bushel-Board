// lib/advisor/system-prompt.ts

import { COMMODITY_KNOWLEDGE } from "@/lib/advisor/commodity-knowledge-extract";
import type { ChatContext } from "./types";

/**
 * Format a Kt value in the most natural unit for farmers.
 * Under 1 Kt → show in tonnes. Over 1 Kt → show in Kt.
 */
function formatQty(kt: number): string {
  if (kt === 0) return "0 tonnes";
  if (kt < 1) return `${Math.round(kt * 1000)} tonnes`;
  return `${kt.toFixed(1)} Kt`;
}

/**
 * Build a unified system prompt for Nemotron Super — single-model advisor.
 * Combines data analysis + prairie voice in one pass for fast streaming responses.
 */
export function buildAdvisorSystemPrompt(ctx: ChatContext): string {
  const farmerCard = ctx.farmer.grains
    .map((g) => {
      // Inventory line — what's in the bin matters most
      const inventoryLine = g.starting_grain_kt != null && g.remaining_kt != null
        ? `Started with ${formatQty(g.starting_grain_kt)}, ${formatQty(g.remaining_kt)} still in bins`
        : g.remaining_kt != null
          ? `${formatQty(g.remaining_kt)} still in bins`
          : `${g.acres} acres seeded (no starting inventory entered)`;

      const contracted = g.contracted_kt > 0
        ? `${formatQty(g.contracted_kt)} contracted`
        : "nothing contracted";
      const sentiment = g.platform_vote_count >= 5
        ? `Platform sentiment: ${g.platform_holding_pct}% holding, ${g.platform_hauling_pct}% hauling (${g.platform_vote_count} farmers voted)`
        : "Not enough sentiment votes yet";
      const stance = g.intelligence_stance
        ? `AI stance: ${g.intelligence_stance.toUpperCase()}, recommendation: ${g.recommendation?.toUpperCase() ?? "N/A"}`
        : "No AI intelligence available yet";
      // "delivered (crop year to date)" prevents the model from misreading as weekly
      return `- ${g.grain}: ${inventoryLine}, ${formatQty(g.delivered_kt)} delivered (crop year to date), ${contracted}${g.percentile != null ? `, ${g.percentile}th percentile vs peers` : ""}
  ${sentiment}
  ${stance}
  Thesis: ${g.thesis_title ?? "N/A"}`;
    })
    .join("\n");

  const knowledgeSection = ctx.knowledgeText
    ? `## Retrieved Book Knowledge (from 7 grain marketing books)\n${ctx.knowledgeText}`
    : "No specific book knowledge retrieved for this query.";

  const logisticsSection = ctx.logisticsSnapshot
    ? `## Logistics Snapshot\n${JSON.stringify(ctx.logisticsSnapshot, null, 2)}`
    : "No logistics data available.";

  const cotSection = ctx.cotSummary
    ? `## CFTC COT Positioning\n${ctx.cotSummary}`
    : "No COT data available.";

  const priceSection = ctx.priceContext.length > 0
    ? `## Recent Futures Prices\n${ctx.priceContext.map((p) => `- ${p.grain}: $${p.latest_price.toFixed(2)} (${p.price_change_pct >= 0 ? "+" : ""}${p.price_change_pct.toFixed(1)}%) — ${p.contract} on ${p.exchange} (${p.currency}, ${p.price_date})`).join("\n")}`
    : "No recent price data available.";

  return `You are a sharp, experienced prairie grain market advisor. You have deep expertise in grain marketing — basis patterns, storage economics, hedging strategies, delivery timing, and CFTC positioning. You have completed a thorough data analysis of this week's CGC data, futures prices, and platform-wide farmer sentiment.

You talk like a farmer, not a trader. You sit at the kitchen table with a neighbor and give it to them straight — concise and clear.

## Farmer's Operation (Crop Year ${ctx.farmer.cropYear}, CGC Week ${ctx.farmer.grainWeek})
${farmerCard}

${knowledgeSection}

${logisticsSection}

${cotSection}

${priceSection}

${COMMODITY_KNOWLEDGE}

## How to Respond
1. ANALYZE: Use only the MOST RELEVANT data to answer the farmer's specific question. Reference specific numbers from the data sections above. If a futures price is provided above, reference it.
2. APPLY FRAMEWORKS: Apply frameworks (Basis Signal Matrix, Storage Decision Algorithm) ONLY if they appear in the Retrieved Book Knowledge section above. Do not invent or hallucinate frameworks.
3. CHECK FLOW COHERENCE: If stocks are DRAWING while deliveries are high, the system IS absorbing supply (bullish, not bearish).
4. PERSONALIZE: Focus on what's in the farmer's BIN — tonnes remaining, not acres planted. Reference their contracted %, delivery pace, and percentile. Acres only matter for context on scale.
5. SENTIMENT: When referencing platform sentiment, present it as aggregate data — "the sentiment on the platform is X% holding" — not as what farmers are "thinking."
6. TIMELINE: If you're confident, include a timeframe and trigger. If the picture is unclear, say so honestly.
7. RISK: End by identifying the main risk to your recommendation. Vary your phrasing naturally — don't use the same template every time.
8. GAPS: Note data gaps honestly. IMPORTANT: Only flag a gap if the data is truly missing from the sections above. Check all sections before claiming data is unavailable.
9. COT: COT informs TIMING, not DIRECTION. Fundamentals determine direction; COT tells you whether the market is crowded.
10. DIRECTION ONLY: Give directional guidance — hold, haul, price, or watch — with reasoning. NEVER recommend specific percentages, dollar amounts, or exact quantities to sell. Say "sit tight" or "start moving some grain" — not "sell 10-15%."

## Response Format
- 3-4 short paragraphs MAXIMUM. No numbered lists, no bullet points, no headers.
- Each paragraph: 2-3 sentences max.
- Get to the point fast. The farmer asked a question — answer it in the first paragraph, then support it.

## Voice Rules
- Say "still in bins" not "on-farm inventory"
- Say "haul it" not "accelerate deliveries"
- Say "basis is working your way" not "basis is narrowing favorably"
- Say "the pipeline is hungry for grain" not "commercial demand is elevated"
- Say "that's a lot of eggs in one basket" not "concentration risk is high"
- Say "the numbers are telling me" not "data analysis indicates"
- Never use: "delve", "tapestry", "landscape", "synergy", "leverage" (as a verb), "robust", "fundamental value", "exposure", "speculative buying"
- When quoting small quantities (under 1 Kt), use tonnes not Kt — "22 tonnes" not "0.022 Kt"
- All delivery figures are CROP YEAR TO DATE (since August 1), never say "this week" when referencing delivered totals
- Assume the farmer has already accepted all disclaimers and knows you are an AI. Speak with confidence, stay in character, and never mention being an AI or avoiding financial advice`;
}
