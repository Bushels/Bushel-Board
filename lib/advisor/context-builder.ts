// lib/advisor/context-builder.ts

import { getUserCropPlans } from "@/lib/queries/crop-plans";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { getDeliveryAnalytics } from "@/lib/queries/delivery-analytics";
import { getRecentPrices } from "@/lib/queries/grain-prices";
import { getXSignalsForGrain } from "@/lib/queries/x-signals";
import { getGrainIntelligence, getMarketAnalysis } from "@/lib/queries/intelligence";
import { getSentimentOverview } from "@/lib/queries/sentiment";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

import {
  buildVikingAdvisorContext,
  type VikingContextResult,
} from "@/lib/knowledge/viking-retrieval";
import type { ChatContext, FarmerGrainContext, GrainPriceContext, XSignalContext } from "./types";

const STORAGE_QUESTION_PATTERN = /\b(store|storage|hold|haul|bin|carry)\b/i;
const BASIS_VALUE_PATTERN =
  /\bbasis\b[^\n]{0,24}(?:[$-]?\d+(?:\.\d+)?|\d+\s*(?:c|cent|cents|points?|pts?))/i;
const SPREAD_VALUE_PATTERN =
  /\b(?:spread|carry)\b[^\n]{0,24}(?:[$-]?\d+(?:\.\d+)?|\d+\s*(?:c|cent|cents|points?|pts?))/i;
const MONTH_SPREAD_VALUE_PATTERN =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-/ ](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b[^\n]{0,16}(?:[$-]?\d+(?:\.\d+)?|\d+\s*(?:c|cent|cents|points?|pts?))/i;
const STORAGE_COST_PATTERN =
  /\b(?:storage cost|cost to store|bin cost|interest)\b[^\n]{0,24}(?:[$-]?\d+(?:\.\d+)?|\d+\s*(?:c|cent|cents|points?|pts?))/i;

function formatNaturalList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

type LegacyKnowledgeContext = {
  topicTags?: string[];
  chunks?: Array<{
    heading?: string | null;
    topicTags?: string[];
  }>;
};

function hasStorageDecisionFramework(
  context: VikingContextResult | LegacyKnowledgeContext | null
): boolean {
  if (!context) return false;

  if (
    "loadedTopics" in context &&
    Array.isArray(context.loadedTopics) &&
    context.loadedTopics.includes("storage_carry")
  ) {
    return true;
  }

  const chunks = "chunks" in context && Array.isArray(context.chunks)
    ? context.chunks
    : [];
  const headings = chunks.map((chunk) => chunk.heading ?? "");
  const hasStorageHeading = headings.some((heading) =>
    /storage decision algorithm/i.test(heading)
  );
  if (hasStorageHeading) return true;

  return false;
}

export function buildStorageDecisionSupport(
  messageText: string,
  vikingContext: VikingContextResult | LegacyKnowledgeContext | null,
): string | null {
  if (!STORAGE_QUESTION_PATTERN.test(messageText)) {
    return null;
  }

  // Viking L1 includes storage algorithm when storage_carry topic is loaded
  const hasStorageAlgorithm = hasStorageDecisionFramework(vikingContext);
  if (!hasStorageAlgorithm) {
    return null;
  }

  const missingInputs: string[] = [];
  if (!BASIS_VALUE_PATTERN.test(messageText)) {
    missingInputs.push("your current elevator basis");
  }
  if (!SPREAD_VALUE_PATTERN.test(messageText) && !MONTH_SPREAD_VALUE_PATTERN.test(messageText)) {
    missingInputs.push("the nearby futures spread/carry");
  }
  if (!STORAGE_COST_PATTERN.test(messageText)) {
    missingInputs.push("your storage cost");
  }

  if (missingInputs.length === 0) {
    return (
      "Storage decision guardrail: Core storage inputs are already present in the message " +
      "(current basis, nearby spread/carry, and storage cost). Make the best directional call from those numbers " +
      "and the current logistics picture. Do not ask a follow-up question. End without a question unless the " +
      "farmer explicitly asks for scenario planning beyond the current setup."
    );
  }

  return (
    `Storage decision guardrail: Storage Decision Algorithm is in play, ` +
    `but the message still does not include ${formatNaturalList(missingInputs)}. ` +
    "Give only a tentative lean from the current basis and logistics picture, then ask one short follow-up question. " +
    "Best follow-up: ask for the current elevator basis and the nearby spread first."
  );
}

/**
 * Build the complete farmer context for a chat message.
 * Fetches crop plans, intelligence, sentiment, and knowledge in parallel.
 * Reuses existing query functions - no new product data queries needed.
 */
export async function buildChatContext(
  userId: string,
  role: "farmer" | "observer",
  messageText: string,
  grainHint?: string,
): Promise<ChatContext> {
  const grainWeek = await getLatestImportedWeek();

  const [cropPlans, sentimentData, deliveryAnalytics] = await Promise.all([
    getUserCropPlans(userId, CURRENT_CROP_YEAR),
    getSentimentOverview(CURRENT_CROP_YEAR, grainWeek),
    getDeliveryAnalytics(CURRENT_CROP_YEAR).catch(() => []),
  ]);

  const grainContexts: FarmerGrainContext[] = await Promise.all(
    cropPlans.map(async (plan) => {
      const [intelligence, marketAnalysis] = await Promise.all([
        getGrainIntelligence(plan.grain),
        getMarketAnalysis(plan.grain),
      ]);

      const sentiment = sentimentData?.find((entry: { grain: string }) => entry.grain === plan.grain);
      const totalDelivered = (plan.deliveries ?? []).reduce((sum, delivery) => sum + delivery.amount_kt, 0);

      const analytics = deliveryAnalytics.find((entry) => entry.grain === plan.grain);
      let percentile: number | null = null;

      if (analytics && analytics.farmer_count >= 5 && analytics.total_starting_kt > 0) {
        const farmerPace =
          analytics.total_starting_kt > 0
            ? (totalDelivered / (plan.acres_seeded > 0 ? plan.acres_seeded : 1)) /
              (analytics.mean_delivered_kt / (analytics.farmer_count > 0 ? analytics.farmer_count : 1))
            : 0;

        if (farmerPace <= analytics.p25_pace_pct / 100) percentile = 25;
        else if (farmerPace <= analytics.p50_pace_pct / 100) percentile = 50;
        else if (farmerPace <= analytics.p75_pace_pct / 100) percentile = 75;
        else percentile = 90;
      }

      const startingGrain = plan.starting_grain_kt ?? null;
      const remainingKt =
        startingGrain != null ? Math.max(0, startingGrain - totalDelivered) : plan.volume_left_to_sell_kt ?? null;

      return {
        grain: plan.grain,
        acres: plan.acres_seeded,
        starting_grain_kt: startingGrain,
        remaining_kt: remainingKt,
        delivered_kt: totalDelivered,
        contracted_kt: plan.contracted_kt ?? 0,
        uncontracted_kt: plan.uncontracted_kt ?? 0,
        percentile,
        platform_holding_pct: Number(sentiment?.pct_holding ?? 0),
        platform_hauling_pct: Number(sentiment?.pct_hauling ?? 0),
        platform_neutral_pct: Number(sentiment?.pct_neutral ?? 0),
        platform_vote_count: Number(sentiment?.vote_count ?? 0),
        intelligence_stance:
          intelligence?.kpi_data?.market_stance != null ? String(intelligence.kpi_data.market_stance) : null,
        recommendation:
          intelligence?.kpi_data?.recommendation_signal != null
            ? String(intelligence.kpi_data.recommendation_signal)
            : null,
        thesis_title: intelligence?.thesis_title ?? null,
        thesis_body: intelligence?.thesis_body ?? null,
        bull_case: marketAnalysis?.bull_case ?? null,
        bear_case: marketAnalysis?.bear_case ?? null,
      };
    }),
  );

  const farmerGrains = cropPlans.map((plan) => plan.grain);

  const priceContext: GrainPriceContext[] = (
    await Promise.all(
      farmerGrains.map(async (grain) => {
        const prices = await getRecentPrices(grain, 5).catch(() => []);
        if (prices.length === 0) return null;

        const latest = prices[0];
        return {
          grain,
          latest_price: latest.settlement_price,
          price_change_pct: latest.change_pct,
          contract: latest.contract,
          exchange: latest.exchange,
          currency: latest.currency,
          unit: latest.unit,
          price_date: latest.price_date,
        };
      }),
    )
  ).filter((price): price is GrainPriceContext => price !== null);

  const supabase = await createClient();
  const targetGrain = grainHint ?? farmerGrains[0] ?? null;

  let knowledgeText: string | null = null;
  let decisionSupportText: string | null = null;
  if (targetGrain) {
    const vikingContext = await buildVikingAdvisorContext({
      messageText,
      grain: targetGrain,
    });
    knowledgeText = vikingContext.contextText;
    decisionSupportText = buildStorageDecisionSupport(messageText, vikingContext);
  }

  // Fetch recent X market signals for the target grain
  let xSignals: XSignalContext[] = [];
  if (targetGrain) {
    try {
      const signals = await getXSignalsForGrain(targetGrain);
      xSignals = signals.slice(0, 5).map((s) => ({
        grain: s.grain,
        sentiment: s.sentiment,
        category: s.category,
        post_summary: s.post_summary,
        relevance_score: s.relevance_score,
        post_date: s.post_date,
        source: s.source ?? null,
      }));
    } catch {
      // X signals are optional — chat still works without them.
    }
  }

  let logisticsSnapshot: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.rpc("get_logistics_snapshot", {
      p_crop_year: CURRENT_CROP_YEAR,
      p_grain_week: grainWeek,
    });
    logisticsSnapshot = data as Record<string, unknown> | null;
  } catch {
    // Logistics data is optional - chat still works without it.
  }

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
        cotSummary =
          `Managed Money: net ${Number(latest.managed_money_net) > 0 ? "long" : "short"} ` +
          `${Math.abs(Number(latest.managed_money_net)).toLocaleString()} contracts ` +
          `(${latest.managed_money_net_pct}% OI). Commercial: net ` +
          `${Number(latest.commercial_net) > 0 ? "long" : "short"} ` +
          `${Math.abs(Number(latest.commercial_net)).toLocaleString()} contracts. ` +
          `Divergence: ${latest.spec_commercial_divergence ? "YES" : "No"}.`;
      }
    } catch {
      // COT data is optional.
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
    decisionSupportText,
    logisticsSnapshot,
    cotSummary,
    priceContext,
    xSignals,
  };
}
