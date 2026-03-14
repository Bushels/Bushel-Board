import { createClient } from "@/lib/supabase/server";
import { getFarmSummary, getGrainIntelligence } from "@/lib/queries/intelligence";
import { getDeliveryAnalytics } from "@/lib/queries/delivery-analytics";
import { getSupplyDispositionForGrains } from "@/lib/queries/supply-disposition";
import { getGrainOverview } from "@/lib/queries/grains";
import { getSentimentOverview } from "@/lib/queries/sentiment";
import { getUserSentimentVote } from "@/lib/queries/sentiment";
import { getUserRole } from "@/lib/auth/role-guard";
import { CURRENT_CROP_YEAR, getCurrentGrainWeek } from "@/lib/utils/crop-year";
import { grainSlug } from "@/lib/constants/grains";
import { deriveRecommendation } from "@/lib/utils/recommendations";
import type { RecommendationResult } from "@/lib/utils/recommendations";
import { FarmSummaryCard } from "@/components/dashboard/farm-summary-card";
import { DeliveryPaceCard } from "@/components/dashboard/delivery-pace-card";
import { YourImpact } from "@/components/dashboard/your-impact";
import { SectionHeader } from "@/components/dashboard/section-header";
import { RecommendationCard } from "@/components/dashboard/recommendation-card";
import { MultiGrainSentiment } from "@/components/dashboard/multi-grain-sentiment";
import { SentimentBanner } from "@/components/dashboard/sentiment-banner";
import { MyFarmClient, type MarketSupplyData } from "./client";
import { Wheat } from "lucide-react";

function deriveStanceFromThesis(
  thesis: string | null | undefined
): "bullish" | "bearish" | "neutral" {
  if (!thesis) return "neutral";
  const lower = thesis.toLowerCase();
  if (lower.includes("bullish") || lower.includes("upside") || lower.includes("rally")) {
    return "bullish";
  }
  if (lower.includes("bearish") || lower.includes("downside") || lower.includes("pressure")) {
    return "bearish";
  }
  return "neutral";
}

export default async function MyFarmPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const grainWeek = getCurrentGrainWeek();

  const [{ data: cropPlans }, farmSummary, analytics, role] = await Promise.all([
    supabase
      .from("crop_plans")
      .select("*")
      .eq("user_id", user?.id)
      .eq("crop_year", CURRENT_CROP_YEAR)
      .order("created_at", { ascending: false }),
    user?.id ? getFarmSummary(user.id) : Promise.resolve(null),
    getDeliveryAnalytics(CURRENT_CROP_YEAR),
    getUserRole(),
  ]);

  const plans = cropPlans || [];
  const percentiles = farmSummary?.percentiles ?? {};
  const hasLoggedDeliveries = plans.some(
    (plan) => (plan.deliveries ?? []).length > 0
  );

  // Build grain info for sentiment + recommendations
  const grainSlugs = plans.map((p) => grainSlug(p.grain));
  const grainInfos = plans.map((p) => ({
    name: p.grain,
    slug: grainSlug(p.grain),
  }));

  // Fetch AAFC supply data, sentiment overview, intelligence, and user votes in parallel
  const [supplyData, sentimentOverview, grainOverviewData, ...intelligenceAndVotes] =
    await Promise.all([
      grainSlugs.length > 0
        ? getSupplyDispositionForGrains(grainSlugs)
        : Promise.resolve([]),
      getSentimentOverview(CURRENT_CROP_YEAR, grainWeek),
      getGrainOverview(),
      ...plans.flatMap((p) => [
        getGrainIntelligence(p.grain),
        user?.id
          ? (async () => {
              const vote = await getUserSentimentVote(
                supabase,
                p.grain,
                CURRENT_CROP_YEAR,
                grainWeek
              );
              return { grain: p.grain, vote };
            })()
          : Promise.resolve({ grain: p.grain, vote: null }),
      ]),
    ]);

  // Parse intelligence results and user votes from interleaved array
  const intelligenceMap: Record<string, Awaited<ReturnType<typeof getGrainIntelligence>>> = {};
  const initialVotes: Record<string, number | null> = {};

  for (let i = 0; i < plans.length; i++) {
    const intel = intelligenceAndVotes[i * 2] as Awaited<
      ReturnType<typeof getGrainIntelligence>
    >;
    const voteResult = intelligenceAndVotes[i * 2 + 1] as {
      grain: string;
      vote: number | null;
    };
    intelligenceMap[plans[i].grain] = intel;
    initialVotes[voteResult.grain] = voteResult.vote;
  }

  // Build market supply map
  const marketSupply: Record<string, MarketSupplyData> = {};
  for (const sd of supplyData) {
    if (sd.total_supply_kt) {
      const matchingPlan = plans.find(
        (p) => grainSlug(p.grain) === sd.grain_slug
      );
      if (matchingPlan) {
        // Find CYTD deliveries from grain overview data
        const overviewRow = grainOverviewData.find(
          (g) => g.grain?.toLowerCase() === matchingPlan.grain.toLowerCase()
        );
        const cytdDeliveries = overviewRow ? Number(overviewRow.cy_deliveries_kt ?? 0) : 0;

        marketSupply[matchingPlan.grain] = {
          total_opening_supply_kt: Number(sd.total_supply_kt),
          cytd_producer_deliveries_kt: cytdDeliveries,
          is_approximate: sd.is_approximate ?? false,
        };
      }
    }
  }

  // Derive recommendations for each grain
  const recommendations: Array<{
    grainName: string;
    grainSlug: string;
    recommendation: RecommendationResult;
    deliveredPct: number;
  }> = [];

  for (const plan of plans) {
    const intel = intelligenceMap[plan.grain];
    const marketStance = deriveStanceFromThesis(intel?.thesis_body);
    const startingGrain = Number(plan.starting_grain_kt ?? 0);
    const remainingToSell = Number(plan.volume_left_to_sell_kt ?? 0);
    const contracted = Number(plan.contracted_kt ?? 0);
    const uncontracted = Number(plan.uncontracted_kt ?? 0);
    const totalPlanned = startingGrain > 0 ? startingGrain : remainingToSell;
    const contractedPct =
      totalPlanned > 0 ? (contracted / totalPlanned) * 100 : 0;
    const deliveryPacePct = percentiles[plan.grain] ?? 50;
    const totalDelivered = (plan.deliveries || []).reduce(
      (sum: number, d: { amount_kt: number }) => sum + d.amount_kt,
      0
    );
    const deliveredPct =
      startingGrain > 0 ? (totalDelivered / startingGrain) * 100 : 0;

    const rec = deriveRecommendation({
      marketStance,
      deliveryPacePct,
      contractedPct,
      uncontractedKt: uncontracted,
      totalPlannedKt: totalPlanned,
    });

    recommendations.push({
      grainName: plan.grain,
      grainSlug: grainSlug(plan.grain),
      recommendation: rec,
      deliveredPct,
    });
  }

  const unlockedSlugs = grainSlugs;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HERO */}
      <div className="rounded-2xl border border-canola/15 bg-gradient-to-br from-canola/5 to-background p-6">
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Wheat className="h-8 w-8 text-canola" />
          My Farm
        </h1>
        <p className="text-base text-muted-foreground mt-2 max-w-2xl">
          Your grain. Your decisions.
        </p>
      </div>

      {/* MARKET SENTIMENT */}
      {plans.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="Market Sentiment"
            subtitle="Vote on your grains and see how the community feels"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiGrainSentiment
              grains={grainInfos}
              grainWeek={grainWeek}
              cropYear={CURRENT_CROP_YEAR}
              role={role}
              initialVotes={initialVotes}
              sentimentOverview={sentimentOverview}
            />
            <SentimentBanner
              sentimentData={sentimentOverview}
              grainWeek={grainWeek}
              unlockedSlugs={unlockedSlugs}
            />
          </div>
        </section>
      )}

      {/* YOUR RECOMMENDATIONS */}
      {recommendations.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="Your Recommendations"
            subtitle="AI-powered guidance for your grains"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.map((rec, i) => (
              <RecommendationCard
                key={rec.grainSlug}
                grainName={rec.grainName}
                grainSlug={rec.grainSlug}
                recommendation={rec.recommendation}
                deliveredPct={rec.deliveredPct}
              />
            ))}
          </div>
        </section>
      )}

      {/* YOUR GRAINS */}
      <section className="space-y-4">
        <SectionHeader
          title="Your Grains"
          subtitle="Manage crop plans, log deliveries, and track progress"
        />
        <MyFarmClient
          currentPlans={plans}
          percentiles={percentiles}
          role={role}
          marketSupply={marketSupply}
        />
      </section>

      {/* DELIVERY PACE + YOUR IMPACT */}
      {role === "farmer" && plans.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="Delivery Pace"
            subtitle="How your marketing compares to other prairie farmers"
          />
          <DeliveryPaceCard
            plans={plans}
            percentiles={percentiles}
            analytics={analytics}
          />
          <YourImpact variant="farm" />
        </section>
      )}

      {/* WEEKLY SUMMARY */}
      <section className="space-y-4">
        <SectionHeader
          title="Weekly Summary"
          subtitle="Your personalized farm brief"
        />
        <FarmSummaryCard
          summary={farmSummary}
          hasPlans={plans.length > 0}
          hasLoggedDeliveries={hasLoggedDeliveries}
        />
      </section>
    </div>
  );
}
