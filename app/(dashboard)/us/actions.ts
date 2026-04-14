"use server";

import {
  CURRENT_US_CROP_YEAR,
  CURRENT_US_MARKET_YEAR,
  getLatestUsScoreTrajectory,
  getUsGrainIntelligence,
  getUsMarketAnalysis,
  getUsMarketStances,
} from "@/lib/queries/us-intelligence";

export async function getUsOverviewData() {
  const stances = await getUsMarketStances(CURRENT_US_MARKET_YEAR);
  return {
    cropYear: CURRENT_US_CROP_YEAR,
    marketYear: CURRENT_US_MARKET_YEAR,
    generatedAt: new Date().toISOString(),
    stances,
  };
}

export async function getUsMarketDetailData(marketName: string) {
  const [analysis, intelligence, trajectory] = await Promise.all([
    getUsMarketAnalysis(marketName, CURRENT_US_MARKET_YEAR),
    getUsGrainIntelligence(marketName, CURRENT_US_MARKET_YEAR),
    getLatestUsScoreTrajectory(marketName, CURRENT_US_MARKET_YEAR),
  ]);

  return {
    cropYear: CURRENT_US_CROP_YEAR,
    marketYear: CURRENT_US_MARKET_YEAR,
    marketName,
    analysis,
    intelligence,
    trajectory,
  };
}
