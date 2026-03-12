import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Wheat } from "lucide-react";
import { IntelligenceKpis } from "@/components/dashboard/intelligence-kpis";
import { ProvinceMap } from "@/components/dashboard/province-map";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { SentimentPoll } from "@/components/dashboard/sentiment-poll";
import { StorageBreakdown } from "@/components/dashboard/storage-breakdown";
import { SupplyPipeline } from "@/components/dashboard/supply-pipeline";
import { ThesisBanner } from "@/components/dashboard/thesis-banner";

import { WoWComparisonCard } from "@/components/dashboard/wow-comparison";
import { XSignalFeed } from "@/components/dashboard/x-signal-feed";
import { GamifiedGrainChart } from "@/components/dashboard/gamified-grain-chart";
import { AnimatedCard } from "@/components/motion/animated-card";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/auth/role-guard";
import type { DeliveryEntry } from "@/lib/queries/crop-plans";
import { getGrainBySlug, getGrainOverviewBySlug } from "@/lib/queries/grains";
import { BullBearCards } from "@/components/dashboard/bull-bear-cards";
import { getGrainIntelligence, getMarketAnalysis } from "@/lib/queries/intelligence";
import {
  getCumulativeTimeSeries,
  getDeliveryTimeSeries,
  getProvincialDeliveries,
  getShipmentDistribution,
  getStorageBreakdown,
  getWeekOverWeekComparison,
} from "@/lib/queries/observations";
import { getGrainSentiment, getUserSentimentVote } from "@/lib/queries/sentiment";

import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR, cropYearLabel, getCurrentGrainWeek } from "@/lib/utils/crop-year";
import { safeQuery } from "@/lib/utils/safe-query";
import { getXSignalsForGrain, getXSignalsWithFeedback } from "@/lib/queries/x-signals";
import { getSupplyPipeline } from "@/lib/queries/intelligence";
import { GrainPageTransition } from "./client";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GrainDetailPage({ params }: Props) {
  const { slug } = await params;

  const grain = await getGrainBySlug(slug);
  if (!grain) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userPlan = null;
  if (user) {
    const { data: plan } = await supabase
      .from("crop_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("crop_year", CURRENT_CROP_YEAR)
      .ilike("grain", grain.name)
      .single();
    userPlan = plan;
  }

  if (!userPlan) {
    return <GrainLockedView grain={grain.name} />;
  }

  const [
    marketCoreResult,
    deliverySeriesResult,
    pipelineVelocityResult,
    provincialResult,
    distributionResult,
    wowResult,
    supplyPipelineResult,
    storageResult,
    roleResult,
  ] = await Promise.all([
    safeQuery("Market intelligence", async () => {
      const [intelligence, xSignals, grainOverview, marketAnalysis] = await Promise.all([
        getGrainIntelligence(grain.name),
        getXSignalsForGrain(grain.name),
        getGrainOverviewBySlug(grain.slug),
        getMarketAnalysis(grain.name),
      ]);

      return { intelligence, xSignals, grainOverview, marketAnalysis };
    }),
    safeQuery("Delivery activity", () => getDeliveryTimeSeries(grain.name)),
    safeQuery("Pipeline velocity", () => getCumulativeTimeSeries(grain.name)),
    safeQuery("Provincial deliveries", () => getProvincialDeliveries(grain.name)),
    safeQuery("Domestic disappearance", () => getShipmentDistribution(grain.name)),
    safeQuery("Week-over-week comparison", () => getWeekOverWeekComparison(grain.name)),
    safeQuery("Supply pipeline", () => getSupplyPipeline(grain.slug)),
    safeQuery("Storage breakdown", () => getStorageBreakdown(grain.name)),
    safeQuery("User role", () => getUserRole()),
  ]);

  const marketCore = marketCoreResult.error ? null : marketCoreResult.data;
  const intelligence = marketCore?.intelligence ?? null;
  const xSignals = marketCore?.xSignals ?? [];
  const marketAnalysis = marketCore?.marketAnalysis ?? null;
  const correctedKpiData = buildCorrectedKpiData(intelligence, marketCore?.grainOverview ?? null);
  const latestGrainWeek = getLatestGrainWeek(
    deliverySeriesResult.error ? [] : deliverySeriesResult.data ?? [],
    intelligence?.grain_week ?? null
  );
  // Authenticated users (who passed the crop plan check above) default to "farmer"
  const role = roleResult.error ? "farmer" : (roleResult.data ?? "farmer");

  const [sentimentResult, signalFeedResult] = await Promise.all([
    safeQuery("Farmer sentiment", async () => ({
      userVote: await getUserSentimentVote(
        supabase,
        grain.name,
        CURRENT_CROP_YEAR,
        latestGrainWeek
      ),
      aggregate: await getGrainSentiment(
        supabase,
        grain.name,
        CURRENT_CROP_YEAR,
        latestGrainWeek
      ),
    })),
    safeQuery("Signal feedback feed", async () => {
      if (!user) {
        return [];
      }

      return getXSignalsWithFeedback(supabase, grain.name, latestGrainWeek);
    }),
  ]);

  const userDeliveries: DeliveryEntry[] = userPlan.deliveries ?? [];

  return (
    <GrainPageTransition>
      <div className="space-y-10">
        <div className="flex flex-col justify-between gap-4 border-b border-border/40 pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Link href="/overview">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-display font-bold text-foreground">
                <Wheat className="h-8 w-8 text-canola" />
                {grain.name} Market Intelligence
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                CGC flow data, live X market signals, and farmer relevance feedback grounded in your farm plan.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Market Intelligence */}
        <section className="space-y-6">
          <SectionHeader
            title="Market Intelligence"
            subtitle="AI-powered thesis for this week"
          />
          <StaggerGroup className="space-y-6">
            {marketCoreResult.error ? (
              <SectionStateCard
                title="Market intelligence unavailable"
                message="The thesis, KPI block, and market signal cards are temporarily unavailable. Delivery, pipeline, and farm context are still live."
              />
            ) : (
              <AnimatedCard index={0}>
                <SectionBoundary
                  title="Market intelligence unavailable"
                  message="The thesis, KPI block, and market signal cards are temporarily unavailable. Delivery, pipeline, and farm context are still live."
                >
                  <div className="space-y-4">
                    {!intelligence && (
                      <SectionStateCard
                        title="Intelligence is generating"
                        message="Check back after the next Thursday data update."
                      />
                    )}

                    {intelligence?.thesis_title && (
                      <ThesisBanner
                        title={intelligence.thesis_title}
                        body={intelligence.thesis_body ?? ""}
                        historicalContext={marketAnalysis?.historical_context ?? null}
                      />
                    )}

                    {marketAnalysis && (
                      <BullBearCards
                        bullCase={marketAnalysis.bull_case}
                        bearCase={marketAnalysis.bear_case}
                        confidence={marketAnalysis.data_confidence}
                        modelUsed={marketAnalysis.model_used}
                      />
                    )}
                  </div>
                </SectionBoundary>
              </AnimatedCard>
            )}

            {marketCoreResult.error ? null : correctedKpiData ? (
              <AnimatedCard index={1}>
                <SectionBoundary
                  title="Intelligence KPIs unavailable"
                  message="The KPI block is temporarily unavailable. The rest of the grain page is still live."
                >
                  <IntelligenceKpis data={correctedKpiData} />
                </SectionBoundary>
              </AnimatedCard>
            ) : null}

            {wowResult.error ? (
              <SectionStateCard
                title="Week-over-week comparison unavailable"
                message="Week-over-week comparisons are temporarily unavailable."
              />
            ) : wowResult.data ? (
              <AnimatedCard index={2}>
                <SectionBoundary
                  title="Week-over-week comparison unavailable"
                  message="Week-over-week comparisons are temporarily unavailable."
                >
                  <WoWComparisonCard data={wowResult.data} />
                </SectionBoundary>
              </AnimatedCard>
            ) : null}
          </StaggerGroup>
        </section>

        {/* Section 2: Supply & Movement */}
        <section className="space-y-6">
          <SectionHeader
            title="Supply & Movement"
            subtitle="Where grain is flowing this crop year"
          />
          <StaggerGroup className="space-y-6">
            {pipelineVelocityResult.error ? (
              <SectionStateCard
                title="Pipeline velocity unavailable"
                message="The pipeline velocity chart is temporarily unavailable."
              />
            ) : (
              <AnimatedCard index={0}>
                <SectionBoundary
                  title="Pipeline velocity unavailable"
                  message="The pipeline velocity chart is temporarily unavailable."
                >
                  <div className="pt-4">
                    <h2 className="mb-4 text-xl font-display font-semibold">Pipeline Velocity</h2>
                    <GamifiedGrainChart
                      weeklyData={pipelineVelocityResult.data ?? []}
                      userDeliveries={userDeliveries}
                    />
                  </div>
                </SectionBoundary>
              </AnimatedCard>
            )}

            {supplyPipelineResult.error ? (
              <SectionStateCard
                title="Supply pipeline unavailable"
                message="AAFC supply pipeline data is temporarily unavailable."
              />
            ) : supplyPipelineResult.data ? (
              <AnimatedCard index={1}>
                <SectionBoundary
                  title="Supply pipeline unavailable"
                  message="AAFC supply pipeline data is temporarily unavailable."
                >
                  <SupplyPipeline
                    carry_in_kt={supplyPipelineResult.data.carry_in_kt}
                    production_kt={supplyPipelineResult.data.production_kt}
                    total_supply_kt={supplyPipelineResult.data.total_supply_kt}
                    exports_kt={supplyPipelineResult.data.exports_kt ?? undefined}
                    food_industrial_kt={supplyPipelineResult.data.food_industrial_kt ?? undefined}
                    feed_waste_kt={supplyPipelineResult.data.feed_waste_kt ?? undefined}
                    carry_out_kt={supplyPipelineResult.data.carry_out_kt ?? undefined}
                    grain={grain.name}
                    domesticData={distributionResult.error ? undefined : (distributionResult.data ?? undefined)}
                  />
                </SectionBoundary>
              </AnimatedCard>
            ) : null}

            {provincialResult.error ? (
              <SectionStateCard
                title="Provincial deliveries unavailable"
                message="The provincial delivery map is temporarily unavailable."
              />
            ) : (
              <AnimatedCard index={2}>
                <SectionBoundary
                  title="Provincial deliveries unavailable"
                  message="The provincial delivery map is temporarily unavailable."
                >
                  <div className="space-y-3">
                    <h2 className="text-lg font-display font-semibold">
                      Provincial Deliveries (CY Total)
                    </h2>
                    <ProvinceMap
                      provinces={(provincialResult.data ?? []).map((province) => ({
                        region: province.region,
                        ktonnes: province.ktonnes,
                      }))}
                    />
                  </div>
                </SectionBoundary>
              </AnimatedCard>
            )}

            {storageResult.error ? (
              <SectionStateCard
                title="Storage breakdown unavailable"
                message="The storage breakdown is temporarily unavailable."
              />
            ) : storageResult.data ? (
              <AnimatedCard index={3}>
                <SectionBoundary
                  title="Storage breakdown unavailable"
                  message="The storage breakdown is temporarily unavailable."
                >
                  <StorageBreakdown data={storageResult.data} grainName={grain.name} />
                </SectionBoundary>
              </AnimatedCard>
            ) : null}
          </StaggerGroup>
        </section>

        {/* Section 3: Community Pulse */}
        <section className="space-y-6">
          <SectionHeader
            title="Community Pulse"
            subtitle="What farmers are thinking and seeing"
          />
          <StaggerGroup className="space-y-6">
            {signalFeedResult.error ? (
              <SectionStateCard
                title="Signal feedback feed unavailable"
                message="Signal voting is temporarily unavailable. The social feed will return automatically when the service recovers."
              />
            ) : (
              <AnimatedCard index={0}>
                <SectionBoundary
                  title="Signal feedback feed unavailable"
                  message="Signal voting is temporarily unavailable. The social feed will return automatically when the service recovers."
                >
                  <XSignalFeed
                    signals={signalFeedResult.data ?? []}
                    grain={grain.name}
                    grainWeek={latestGrainWeek}
                    cropYear={CURRENT_CROP_YEAR}
                    role={role}
                  />
                </SectionBoundary>
              </AnimatedCard>
            )}

            {sentimentResult.error ? (
              <SectionStateCard
                title="Farmer sentiment unavailable"
                message="Sentiment voting is temporarily unavailable. Grain intelligence and delivery data are still live."
              />
            ) : (
              <AnimatedCard index={1}>
                <SectionBoundary
                  title="Farmer sentiment unavailable"
                  message="Sentiment voting is temporarily unavailable. Grain intelligence and delivery data are still live."
                >
                  <SentimentPoll
                    grain={grain.name}
                    grainWeek={latestGrainWeek}
                    initialVote={sentimentResult.data?.userVote ?? null}
                    initialAggregate={sentimentResult.data?.aggregate ?? null}
                    role={role}
                  />
                </SectionBoundary>
              </AnimatedCard>
            )}
          </StaggerGroup>
        </section>
      </div>
    </GrainPageTransition>
  );
}

function buildCorrectedKpiData(
  intelligence: Awaited<ReturnType<typeof getGrainIntelligence>>,
  grainOverview: Awaited<ReturnType<typeof getGrainOverviewBySlug>>
) {
  const correctedKpiData = intelligence?.kpi_data
    ? { ...intelligence.kpi_data }
    : undefined;

  if (correctedKpiData && grainOverview) {
    correctedKpiData.cw_deliveries_kt = grainOverview.cw_deliveries_kt;
    correctedKpiData.cy_deliveries_kt = grainOverview.cy_deliveries_kt;
    correctedKpiData.wow_deliveries_pct = grainOverview.wow_pct_change;
  }

  return correctedKpiData;
}

function getLatestGrainWeek(
  deliveries: Array<{ grain_week: number }>,
  intelligenceWeek: number | null
): number {
  if (deliveries.length > 0) {
    return Math.max(...deliveries.map((delivery) => delivery.grain_week));
  }

  if (intelligenceWeek) {
    return intelligenceWeek;
  }

  return getCurrentGrainWeek();
}

function GrainLockedView({ grain }: { grain: string }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/overview">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-semibold">{grain}</h1>
          <p className="text-sm text-muted-foreground">
            {cropYearLabel()} - Weekly Statistics
          </p>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-2xl space-y-6 rounded-xl border-2 border-dashed border-canola/30 bg-canola/5 p-12 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-border bg-background shadow-sm">
          <Lock className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-display font-semibold text-foreground">
            {grain} analytics are locked
          </h2>
          <p className="text-base text-muted-foreground">
            Add {grain} to My Farm to unlock its grain page now, then sharpen the insight with your starting grain, remaining tonnes, deliveries, and X feedback over time.
          </p>
        </div>
        <div className="grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-2xl border border-canola/20 bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-canola">
              Unlock now
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Acres open the dashboard and its AI market brief.
            </p>
          </div>
          <div className="rounded-2xl border border-canola/20 bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-canola">
              Sharpen later
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Starting grain, remaining tonnes, and deliveries make the pacing and thesis more farm-specific.
            </p>
          </div>
          <div className="rounded-2xl border border-canola/20 bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-canola">
              Improve signals
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your X feedback helps rank the posts prairie farmers actually find useful.
            </p>
          </div>
        </div>
        <Link href="/my-farm" className="mt-4 inline-block">
          <Button className="bg-prairie font-semibold text-foreground hover:bg-prairie/90">
            Set Up My Farm
          </Button>
        </Link>
      </div>
    </div>
  );
}
