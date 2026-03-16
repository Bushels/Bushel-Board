// lib/advisor/types.ts

export interface FarmerGrainContext {
  grain: string;
  acres: number;
  starting_grain_kt: number | null;
  remaining_kt: number | null;
  delivered_kt: number;
  contracted_kt: number;
  uncontracted_kt: number;
  percentile: number | null;
  platform_holding_pct: number;
  platform_hauling_pct: number;
  platform_neutral_pct: number;
  platform_vote_count: number;
  intelligence_stance: string | null;
  recommendation: string | null;
  thesis_title: string | null;
  thesis_body: string | null;
  bull_case: string | null;
  bear_case: string | null;
}

export interface FarmerContext {
  userId: string;
  cropYear: string;
  grainWeek: number;
  role: "farmer" | "observer";
  grains: FarmerGrainContext[];
}

export interface GrainPriceContext {
  grain: string;
  latest_price: number;
  price_change_pct: number;
  contract: string;
  exchange: string;
  currency: string;
  price_date: string;
}

export interface XSignalContext {
  grain: string;
  sentiment: string;
  category: string;
  post_summary: string;
  relevance_score: number;
  post_date: string | null;
  source: string | null;
}

export interface ChatContext {
  farmer: FarmerContext;
  knowledgeText: string | null;
  decisionSupportText: string | null;
  logisticsSnapshot: Record<string, unknown> | null;
  cotSummary: string | null;
  priceContext: GrainPriceContext[];
  xSignals: XSignalContext[];
}
