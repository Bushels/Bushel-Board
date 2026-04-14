/**
 * Senior Analyst v2 prompt builder.
 *
 * Assembles the system prompt (identity + commodity knowledge + research protocol)
 * and the user prompt (shipping calendar + ratios + data + retrieved knowledge).
 *
 * Key difference from v1: NO prescriptive rules about what data points mean.
 * The commodity knowledge IS the guardrails.
 */

import { buildVikingPipelineContext } from "./knowledge/viking-retrieval";
import { buildBushelAgentTeamBrief } from "./bushel-agent-team";

export interface GrainResearchTier {
  webSearches: number;
  xSearches: number;
  tier: "major" | "mid" | "minor";
}

export const GRAIN_RESEARCH_TIERS: Record<string, GrainResearchTier> = {
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

Base your score on the weight of evidence. Do NOT cluster around -40 to -50 by default.`;

export function buildAnalystSystemPrompt(grain = "Wheat"): string {
  const vikingContext = buildVikingPipelineContext(grain).contextText;
  const agentTeamBrief = buildBushelAgentTeamBrief(grain);
  return [IDENTITY, agentTeamBrief, vikingContext, DATA_HYGIENE, RESEARCH_PROTOCOL].join(
    "\n\n"
  );
}

export interface AnalystPromptInput {
  grain: string;
  cropYear: string;
  shippingCalendarText: string;
  ratiosText: string;
  dataText: string;
  knowledgeText: string | null;
  tier: GrainResearchTier;
}

export function buildAnalystUserPrompt(input: AnalystPromptInput): string {
  const researchGuidance = `## Research Guidance
You are analyzing **${input.grain}** (${input.tier.tier} grain). Use up to ${input.tier.webSearches} web searches and ${input.tier.xSearches} X searches to research current conditions. Focus on Canadian prairie context first, then global factors.`;

  const knowledgeSection = input.knowledgeText
    ? `## Retrieved Grain Marketing Knowledge\n${input.knowledgeText}\n\nUse this as deep context for market structure, hedging, basis, and seasonal interpretation. If it conflicts with this week's data, prefer the data and note the tension.`
    : "No additional retrieved knowledge available. Rely on your commodity market framework and the data brief.";

  const taskSection = `## Task
Produce a structured JSON market analysis for **${input.grain}**, crop year ${input.cropYear}. Research first, then analyze the data, then conclude. Your output will be displayed to prairie grain farmers as their weekly market intelligence.

Treat the bull_case and bear_case as the weekly farmer summary of what is happening in the market right now. Each side should explain what is helping the farmer, what is hurting the farmer, and why the recommendation follows from that balance.`;

  return [
    input.shippingCalendarText,
    input.ratiosText,
    input.dataText,
    knowledgeSection,
    researchGuidance,
    taskSection,
  ].join("\n\n");
}
