// lib/advisor/types.ts

export interface FarmerGrainContext {
  grain: string;
  acres: number;
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

export interface ChatContext {
  farmer: FarmerContext;
  knowledgeText: string | null;
  logisticsSnapshot: Record<string, unknown> | null;
  cotSummary: string | null;
}
