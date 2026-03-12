import {
  buildIntelligenceSystemPrompt as buildSharedIntelligenceSystemPrompt,
  KNOWLEDGE_SOURCE_PATHS,
  MARKET_INTELLIGENCE_VERSIONS,
} from "../_shared/market-intelligence-config.ts";

/**
 * Prompt template for generating grain market intelligence.
 *
 * Designed by: innovation-agent
 * Signal taxonomy:
 *   - bullish: data supports price strength / farmer holding thesis
 *   - bearish: data suggests price weakness / urgency to sell
 *   - watch: noteworthy but directionally ambiguous
 *   - social: signal derived from saved X/web market sentiment
 */

export interface GrainContext {
  grain: string;
  crop_year: string;
  grain_week: number;
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  wow_deliveries_pct: number | null;
  cy_exports_kt: number;
  cy_crush_kt: number;
  commercial_stocks_kt: number;
  wow_stocks_change_kt: number;
  py_deliveries_kt: number;
  yoy_deliveries_pct: number | null;
  py_exports_kt: number;
  yoy_exports_pct: number | null;
  py_crush_kt: number;
  yoy_crush_pct: number | null;
  total_supply_kt: number | null;
  production_kt: number | null;
  carry_in_kt: number | null;
  projected_exports_kt: number | null;
  projected_crush_kt: number | null;
  projected_carry_out_kt: number | null;
  farmerSentiment?: {
    vote_count: number;
    pct_holding: number;
    pct_hauling: number;
    pct_neutral: number;
  } | null;
  socialSignals?: Array<{
    sentiment: string;
    category: string;
    relevance_score: number;
    confidence_score: number;
    post_summary: string;
    post_url?: string | null;
    post_author?: string;
    post_date?: string | null;
    search_query?: string;
    source?: string;
    search_mode?: string;
    total_votes?: number;
    farmer_relevance_pct?: number | null;
  }>;
  marketAnalysis?: {
    initial_thesis: string;
    bull_case: string;
    bear_case: string;
    historical_context: Record<string, unknown>;
    data_confidence: string;
    key_signals: Array<Record<string, unknown>>;
    model_used: string;
  } | null;
  knowledgeContext?: {
    contextText: string;
    sourcePaths: string[];
    query: string;
    topicTags: string[];
  } | null;
}

export const INTELLIGENCE_PROMPT_VERSION = MARKET_INTELLIGENCE_VERSIONS.generateIntelligence;
export const INTELLIGENCE_KNOWLEDGE_VERSION = MARKET_INTELLIGENCE_VERSIONS.knowledgeBase;
export const INTELLIGENCE_KNOWLEDGE_SOURCES = [...KNOWLEDGE_SOURCE_PATHS];

export function buildIntelligenceSystemPrompt(): string {
  return buildSharedIntelligenceSystemPrompt();
}

export function buildIntelligencePrompt(ctx: GrainContext): string {
  const deliveredPct = ctx.total_supply_kt && ctx.total_supply_kt > 0
    ? ((ctx.cy_deliveries_kt / ctx.total_supply_kt) * 100).toFixed(1)
    : "N/A";

  return `You are writing a grain market intelligence brief for Canadian prairie farmers.

## Data for ${ctx.grain} - Week ${ctx.grain_week}, Crop Year ${ctx.crop_year}

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

### Farmer Sentiment (from Bushel Board poll this week)
${ctx.farmerSentiment && ctx.farmerSentiment.vote_count >= 5
  ? `- ${ctx.farmerSentiment.vote_count} farmers voted: ${ctx.farmerSentiment.pct_holding}% holding, ${ctx.farmerSentiment.pct_hauling}% hauling, ${ctx.farmerSentiment.pct_neutral}% neutral
- Consider divergence between farmer sentiment and social or market signals when generating insights.`
  : "Insufficient farmer votes this week (need >= 5 for privacy). Skip sentiment analysis."}

## Retrieved Grain Knowledge
${ctx.knowledgeContext?.contextText ?? "No retrieved corpus passages were available for this grain. Use the shared system framework plus the structured data above."}

Treat this section as domain context, not as a replacement for this week's data. When live signals contradict the retrieved knowledge, explain the conflict instead of forcing agreement.

## Recent X/Web Market Signals (scored by AI and verified by farmers)

${ctx.socialSignals?.length ? ctx.socialSignals.map((signal) => formatSignalLine(signal)).join("\n") : "No social signals available for this grain this week."}

Reference these signals when generating "social" insights. Use the saved URL when present. If no URL is available, cite the author handle or note that the signal came from saved web research.

Posts marked "farmer-validated" (farmer_relevance_pct >= 70%, votes >= 3) should be weighted heavily. Posts marked "farmer-dismissed" (farmer_relevance_pct < 40%, votes >= 3) should be deprioritized unless the underlying data contradicts farmer sentiment. Posts marked "unrated" have no farmer feedback yet.

## Prior Analyst Assessment (Step 3.5 Flash, round 1)

${ctx.marketAnalysis ? `A quantitative analyst (${ctx.marketAnalysis.model_used}) already reviewed the CGC, AAFC, and historical data.

Thesis: ${ctx.marketAnalysis.initial_thesis}

Bull Case:
${ctx.marketAnalysis.bull_case}

Bear Case:
${ctx.marketAnalysis.bear_case}

Historical Context:
${ctx.marketAnalysis.historical_context?.seasonal_observation ?? "No seasonal observation."}
${Array.isArray(ctx.marketAnalysis.historical_context?.notable_patterns)
  ? (ctx.marketAnalysis.historical_context.notable_patterns as string[]).map((pattern: string) => `- ${pattern}`).join("\n")
  : ""}

Data Confidence: ${ctx.marketAnalysis.data_confidence}

Key Signals:
${ctx.marketAnalysis.key_signals.map((signal: Record<string, unknown>) =>
  `- [${signal.signal}] ${signal.title}: ${signal.body} (confidence: ${signal.confidence}, source: ${signal.source})`
).join("\n")}

Your role is to challenge and refine this assessment. Ask:
1. Do saved X/web signals support or contradict the thesis?
2. Are there breaking developments the round-1 analysis missed?
3. Does farmer sentiment align with the analytical assessment?
4. Should the thesis be updated or confidence adjusted?`
  : "No prior market analysis available. Generate the assessment from scratch."}

## Your Task

Generate a JSON object with the intelligence analysis. Include 3-6 insight cards. Use signal types: "bullish", "bearish", "watch", or "social" (for insights driven by saved X or web signals). Include at least one "watch" signal. If relevant saved X or web signals exist, include at least one "social" signal referencing them. The kpi_data must echo the exact numbers above.

## Rules
- Every insight MUST reference specific numbers from the data or a specific saved X/web signal.
- If data is insufficient (for example N/A values), note the gap rather than speculating.
- Do NOT give financial advice. Frame insights as "data suggests" or "the numbers show".
- For grains with minimal data, generate fewer insights (2-3).
- If no relevant saved X/web signals are available, skip "social" signals.
- Return ONLY the JSON object.
- Each insight MUST include a "sources" array with one or more of: "CGC", "AAFC", "X", "Derived".
- Each insight MUST include a "confidence" field with one of: "high", "medium", "low".`;
}

function formatSignalLine(signal: NonNullable<GrainContext["socialSignals"]>[number]): string {
  let farmerLabel = "unrated";
  if ((signal.total_votes ?? 0) >= 3) {
    if ((signal.farmer_relevance_pct ?? 0) >= 70) {
      farmerLabel = "farmer-validated";
    } else if ((signal.farmer_relevance_pct ?? 100) < 40) {
      farmerLabel = "farmer-dismissed";
    } else {
      farmerLabel = "mixed";
    }
  }

  const votesInfo = (signal.total_votes ?? 0) > 0
    ? ` | farmer: ${signal.farmer_relevance_pct ?? 0}% (${signal.total_votes} votes) [${farmerLabel}]`
    : ` [${farmerLabel}]`;

  const provenance = [
    signal.source ? `source: ${signal.source}` : null,
    signal.search_mode ? `scan: ${signal.search_mode}` : null,
    signal.post_date ? `date: ${signal.post_date}` : null,
    signal.search_query ? `query: ${signal.search_query}` : null,
  ].filter(Boolean).join(" | ");

  const citation = signal.post_url
    ? ` | url: ${signal.post_url}`
    : signal.post_author
      ? ` | handle: @${signal.post_author}`
      : "";

  return `- [${signal.sentiment}/${signal.category}] (relevance: ${signal.relevance_score}, confidence: ${signal.confidence_score}${votesInfo}) ${signal.post_summary}${provenance ? ` | ${provenance}` : ""}${citation}`;
}
