/**
 * Prompt template for generating grain market intelligence.
 *
 * Designed by: innovation-agent
 * Signal taxonomy:
 *   - bullish: data supports price strength / farmer holding thesis
 *   - bearish: data suggests price weakness / urgency to sell
 *   - watch: noteworthy but directionally ambiguous
 *   - social: signal derived from X/Twitter market sentiment
 */

export interface GrainContext {
  grain: string;
  crop_year: string;
  grain_week: number;
  // Current year metrics
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  wow_deliveries_pct: number | null;
  cy_exports_kt: number;
  cy_crush_kt: number;
  commercial_stocks_kt: number;
  wow_stocks_change_kt: number;
  // Year-over-year
  py_deliveries_kt: number;
  yoy_deliveries_pct: number | null;
  py_exports_kt: number;
  yoy_exports_pct: number | null;
  py_crush_kt: number;
  yoy_crush_pct: number | null;
  // Supply balance (from AAFC)
  total_supply_kt: number | null;
  production_kt: number | null;
  carry_in_kt: number | null;
  projected_exports_kt: number | null;
  projected_crush_kt: number | null;
  projected_carry_out_kt: number | null;
  // Farmer sentiment poll data (from grain_sentiment_votes view)
  farmerSentiment?: {
    vote_count: number;
    pct_holding: number;
    pct_hauling: number;
    pct_neutral: number;
  } | null;
  // Pre-scored social signals from x_market_signals table (with farmer feedback)
  socialSignals?: Array<{
    sentiment: string;
    category: string;
    relevance_score: number;
    confidence_score: number;
    post_summary: string;
    post_author?: string;
    total_votes?: number;
    farmer_relevance_pct?: number | null;
  }>;
  // Step 3.5 Flash market analysis (Round 1 of dual-LLM debate)
  marketAnalysis?: {
    initial_thesis: string;
    bull_case: string;
    bear_case: string;
    historical_context: Record<string, unknown>;
    data_confidence: string;
    key_signals: Array<Record<string, unknown>>;
    model_used: string;
  } | null;
}

export function buildIntelligencePrompt(ctx: GrainContext): string {
  const deliveredPct = ctx.total_supply_kt && ctx.total_supply_kt > 0
    ? ((ctx.cy_deliveries_kt / ctx.total_supply_kt) * 100).toFixed(1)
    : "N/A";

  return `You are a grain market analyst writing intelligence briefings for Canadian prairie farmers (Alberta, Saskatchewan, Manitoba). Your tone is direct, data-driven, and actionable — like a Bloomberg terminal meets a coffee shop conversation with a sharp grain buyer.

## Data for ${ctx.grain} — Week ${ctx.grain_week}, Crop Year ${ctx.crop_year}

### Current Week
- Producer Deliveries: ${ctx.cw_deliveries_kt} Kt (WoW: ${ctx.wow_deliveries_pct !== null ? ctx.wow_deliveries_pct + "%" : "N/A"})
- Commercial Stocks: ${ctx.commercial_stocks_kt} Kt (WoW change: ${ctx.wow_stocks_change_kt > 0 ? "+" : ""}${ctx.wow_stocks_change_kt} Kt)

### Crop Year to Date
- CY Deliveries: ${ctx.cy_deliveries_kt} Kt (YoY: ${ctx.yoy_deliveries_pct !== null ? ctx.yoy_deliveries_pct + "%" : "N/A"}, Prior Year: ${ctx.py_deliveries_kt} Kt)
- CY Exports: ${ctx.cy_exports_kt} Kt (YoY: ${ctx.yoy_exports_pct !== null ? ctx.yoy_exports_pct + "%" : "N/A"}, Prior Year: ${ctx.py_exports_kt} Kt)
- CY Crush/Processing: ${ctx.cy_crush_kt} Kt (YoY: ${ctx.yoy_crush_pct !== null ? ctx.yoy_crush_pct + "%" : "N/A"}, Prior Year: ${ctx.py_crush_kt} Kt)

### Supply Balance (AAFC Estimate)
- Production: ${ctx.production_kt ?? "N/A"} Kt
- Carry-in: ${ctx.carry_in_kt ?? "N/A"} Kt
- Total Supply: ${ctx.total_supply_kt ?? "N/A"} Kt
- Projected Exports: ${ctx.projected_exports_kt ?? "N/A"} Kt
- Projected Crush: ${ctx.projected_crush_kt ?? "N/A"} Kt
- Projected Carry-out: ${ctx.projected_carry_out_kt ?? "N/A"} Kt
- Delivered to Date: ${deliveredPct}% of total supply

### Farmer Sentiment (from Bushel Board poll — this week)
${ctx.farmerSentiment && ctx.farmerSentiment.vote_count >= 5
  ? `- ${ctx.farmerSentiment.vote_count} farmers voted: ${ctx.farmerSentiment.pct_holding}% holding, ${ctx.farmerSentiment.pct_hauling}% hauling, ${ctx.farmerSentiment.pct_neutral}% neutral
- Consider divergence between farmer sentiment and social/market signals when generating insights.`
  : "Insufficient farmer votes this week (need ≥ 5 for privacy). Skip sentiment analysis."}

## Recent X/Twitter Market Signals (scored by AI + verified by farmers)

${ctx.socialSignals?.length ? ctx.socialSignals.map(s => {
  // Label signals based on farmer vote data
  let farmerLabel = "unrated";
  if ((s.total_votes ?? 0) >= 3) {
    if ((s.farmer_relevance_pct ?? 0) >= 70) {
      farmerLabel = "farmer-validated";
    } else if ((s.farmer_relevance_pct ?? 100) < 40) {
      farmerLabel = "farmer-dismissed";
    } else {
      farmerLabel = "mixed";
    }
  }
  const votesInfo = (s.total_votes ?? 0) > 0
    ? ` | farmer: ${s.farmer_relevance_pct ?? 0}% (${s.total_votes} votes) [${farmerLabel}]`
    : ` [${farmerLabel}]`;
  return `- [${s.sentiment}/${s.category}] (relevance: ${s.relevance_score}, confidence: ${s.confidence_score}${votesInfo}) ${s.post_summary}${s.post_author ? ` — @${s.post_author}` : ""}`;
}).join("\n") : "No social signals available for this grain this week."}

Reference these signals when generating "social" insights. Cite the author handle when available.

Posts marked "farmer-validated" (farmer_relevance_pct >= 70%, votes >= 3) should be weighted heavily in your analysis — real farmers on the prairies confirmed these signals matter. Posts marked "farmer-dismissed" (farmer_relevance_pct < 40%, votes >= 3) should be deprioritized unless the underlying data contradicts farmer sentiment. Posts marked "unrated" have no farmer feedback yet — use AI scores as normal.

## Prior Analyst's Assessment (Step 3.5 Flash — data-driven analysis)

${ctx.marketAnalysis ? `A quantitative analyst (${ctx.marketAnalysis.model_used}) has already analyzed this grain's CGC data, AAFC supply balance, and 5-year historical patterns. Their assessment:

**Thesis:** ${ctx.marketAnalysis.initial_thesis}

**Bull Case:**
${ctx.marketAnalysis.bull_case}

**Bear Case:**
${ctx.marketAnalysis.bear_case}

**Historical Context:**
${ctx.marketAnalysis.historical_context?.seasonal_observation ?? "No seasonal observation."}
${Array.isArray(ctx.marketAnalysis.historical_context?.notable_patterns)
  ? (ctx.marketAnalysis.historical_context.notable_patterns as string[]).map((p: string) => `- ${p}`).join("\n")
  : ""}

**Data Confidence:** ${ctx.marketAnalysis.data_confidence}

**Key Signals:**
${ctx.marketAnalysis.key_signals.map((s: Record<string, unknown>) =>
  `- [${s.signal}] ${s.title}: ${s.body} (confidence: ${s.confidence}, source: ${s.source})`
).join("\n")}

Your role is to CHALLENGE this analysis. You have access to real-time X/Twitter signals that the prior analyst did not. Consider:
1. Does the social sentiment on X support or contradict this thesis?
2. Are there breaking developments the data-driven analysis missed?
3. Does farmer sentiment align with the analytical assessment?
4. Update the thesis if your real-time signals warrant it.` : "No prior market analysis available. Generate your assessment from scratch."}

## Your Task

Generate a JSON object with the intelligence analysis. Include 3-6 insight cards. Use signal types: "bullish", "bearish", "watch", or "social" (for insights driven by X/Twitter market sentiment). Include at least one "watch" signal. If you found relevant X posts, include at least one "social" signal referencing them. The kpi_data must echo the exact numbers from above — do not invent new metrics.

## Rules
- Every insight MUST reference specific numbers from the data or specific X posts.
- If data is insufficient (e.g. N/A values), note the gap rather than speculating.
- Do NOT give financial advice. Frame insights as "data suggests" or "the numbers show".
- For grains with minimal data (low volumes, few regions), generate fewer insights (2-3).
- If no relevant X posts are found, skip "social" signals — do not fabricate social media references.
- Return ONLY the JSON object.
10. Each insight MUST include a "sources" array listing data provenance:
    - "CGC" for Canadian Grain Commission weekly data (deliveries, shipments, stocks)
    - "AAFC" for Agriculture & Agri-Food Canada balance sheet (production, supply, carry-out)
    - "X" for X/Twitter social signal (only if referencing social data)
    - "Derived" for calculated metrics (ratios, percentages, comparisons)
11. Each insight MUST include a "confidence" field:
    - "high" — based on official data with clear directional signal
    - "medium" — based on partial data or mixed signals
    - "low" — speculative or based primarily on social sentiment`;
}
