// lib/advisor/context-builder.ts

import { createClient } from "@/lib/supabase/server";
import { getUserCropPlans } from "@/lib/queries/crop-plans";
import { getGrainIntelligence, getMarketAnalysis } from "@/lib/queries/intelligence";
import { getSentimentOverview } from "@/lib/queries/sentiment";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import type { FarmerContext, FarmerGrainContext, ChatContext } from "./types";

/**
 * Build the complete farmer context for a chat message.
 * Fetches crop plans, intelligence, sentiment, and knowledge in parallel.
 * Reuses existing query functions — no new DB queries needed.
 */
export async function buildChatContext(
  userId: string,
  role: "farmer" | "observer",
  messageText: string,
  grainHint?: string
): Promise<ChatContext> {
  const grainWeek = await getLatestImportedWeek();

  // Parallel fetch: crop plans + sentiment overview
  const [cropPlans, sentimentData] = await Promise.all([
    getUserCropPlans(userId, CURRENT_CROP_YEAR),
    getSentimentOverview(CURRENT_CROP_YEAR, grainWeek),
  ]);

  // Fetch intelligence + market analysis for each grain in parallel
  const grainContexts: FarmerGrainContext[] = await Promise.all(
    cropPlans.map(async (plan) => {
      const [intelligence, marketAnalysis] = await Promise.all([
        getGrainIntelligence(plan.grain),
        getMarketAnalysis(plan.grain),
      ]);

      const sentiment = sentimentData?.find(
        (s: { grain: string }) => s.grain === plan.grain
      );

      const totalDelivered = (plan.deliveries ?? []).reduce(
        (sum, d) => sum + d.amount_kt,
        0
      );

      return {
        grain: plan.grain,
        acres: plan.acres_seeded,
        delivered_kt: totalDelivered,
        contracted_kt: plan.contracted_kt ?? 0,
        uncontracted_kt: plan.uncontracted_kt ?? 0,
        percentile: null, // Filled from delivery analytics if available
        platform_holding_pct: Number(sentiment?.pct_holding ?? 0),
        platform_hauling_pct: Number(sentiment?.pct_hauling ?? 0),
        platform_neutral_pct: Number(sentiment?.pct_neutral ?? 0),
        platform_vote_count: Number(sentiment?.vote_count ?? 0),
        intelligence_stance: (intelligence?.kpi_data?.market_stance as string) ?? null,
        recommendation: (intelligence?.kpi_data?.recommendation_signal as string) ?? null,
        thesis_title: intelligence?.thesis_title ?? null,
        thesis_body: intelligence?.thesis_body ?? null,
        bull_case: marketAnalysis?.bull_case ?? null,
        bear_case: marketAnalysis?.bear_case ?? null,
      };
    })
  );

  // Determine which grains the farmer grows
  const farmerGrains = cropPlans.map((plan) => plan.grain);

  // Knowledge retrieval via RPC — query based on the farmer's message
  const supabase = await createClient();
  const targetGrain = grainHint ?? farmerGrains[0] ?? null;
  let knowledgeText: string | null = null;

  if (targetGrain) {
    const { data: chunks } = await supabase.rpc("get_knowledge_context", {
      p_query: messageText,
      p_grain: targetGrain,
      p_topics: ["basis", "storage", "hedging", "deliveries", "marketing"],
      p_limit: 4,
    });

    if (Array.isArray(chunks) && chunks.length > 0) {
      knowledgeText = chunks
        .map((c: { title: string; heading: string | null; content: string }) =>
          `### ${c.title}${c.heading ? ` — ${c.heading}` : ""}\n${c.content}`
        )
        .join("\n\n");
    }
  }

  // Logistics snapshot via RPC
  let logisticsSnapshot: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.rpc("get_logistics_snapshot", {
      p_crop_year: CURRENT_CROP_YEAR,
      p_grain_week: grainWeek,
    });
    logisticsSnapshot = data as Record<string, unknown> | null;
  } catch {
    // Logistics data is optional — chat works without it
  }

  // COT summary for the target grain
  let cotSummary: string | null = null;
  if (targetGrain) {
    try {
      const { data: cotData } = await supabase.rpc("get_cot_positioning", {
        p_grain: targetGrain,
        p_crop_year: CURRENT_CROP_YEAR,
        p_weeks_back: 4,
      });
      if (Array.isArray(cotData) && cotData.length > 0) {
        const latest = cotData[0];
        cotSummary = `Managed Money: net ${Number(latest.managed_money_net) > 0 ? "long" : "short"} ${Math.abs(Number(latest.managed_money_net)).toLocaleString()} contracts (${latest.managed_money_net_pct}% OI). Commercial: net ${Number(latest.commercial_net) > 0 ? "long" : "short"} ${Math.abs(Number(latest.commercial_net)).toLocaleString()} contracts. Divergence: ${latest.spec_commercial_divergence ? "YES" : "No"}.`;
      }
    } catch {
      // COT data is optional
    }
  }

  return {
    farmer: {
      userId,
      cropYear: CURRENT_CROP_YEAR,
      grainWeek,
      role,
      grains: grainContexts,
    },
    knowledgeText,
    logisticsSnapshot,
    cotSummary,
  };
}
