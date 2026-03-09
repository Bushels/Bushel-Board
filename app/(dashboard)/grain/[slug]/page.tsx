import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Wheat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGrainBySlug, getGrainOverviewBySlug } from "@/lib/queries/grains";
import {
  getDeliveryTimeSeries,
  getProvincialDeliveries,
  getShipmentDistribution,
  getCumulativeTimeSeries,
  getStorageBreakdown,
  getWeekOverWeekComparison,
} from "@/lib/queries/observations";
import { getGrainIntelligence, getSupplyPipeline } from "@/lib/queries/intelligence";
import { getXSignalsForGrain } from "@/lib/queries/x-signals";
import { ThesisBanner } from "@/components/dashboard/thesis-banner";
import { SignalTape } from "@/components/dashboard/signal-tape";
import { IntelligenceKpis } from "@/components/dashboard/intelligence-kpis";
import { SupplyPipeline } from "@/components/dashboard/supply-pipeline";
import { InsightCards } from "@/components/dashboard/insight-cards";
import { DispositionBar } from "@/components/dashboard/disposition-bar";
import { Button } from "@/components/ui/button";

import { FlowBreakdownWidget } from "@/components/dashboard/flow-breakdown-widget";
import { GrainElevator } from "@/components/dashboard/grain-elevator";
import { SupplySankey } from "@/components/dashboard/supply-sankey";
import { PrairiePulseMap } from "@/components/dashboard/prairie-pulse-map";
import { GamifiedGrainChart } from "@/components/dashboard/gamified-grain-chart";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { AnimatedCard } from "@/components/motion/animated-card";
import type { DeliveryEntry } from "@/lib/queries/crop-plans";
import { CURRENT_CROP_YEAR, cropYearLabel } from "@/lib/utils/crop-year";
import { getGrainSentiment, getUserSentimentVote } from "@/lib/queries/sentiment";
import { SentimentPoll } from "@/components/dashboard/sentiment-poll";
import { WoWComparisonCard } from "@/components/dashboard/wow-comparison";
import { GrainPageTransition } from "./client";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GrainDetailPage({ params }: Props) {
  const { slug } = await params;

  const grain = await getGrainBySlug(slug);
  if (!grain) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Check if user has unlocked this grain via my-farm
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

  const isUnlocked = !!userPlan;

  if (!isUnlocked) {
    return <GrainLockedView grain={grain.name} />;
  }

  const [deliveries, provincial, distribution, weeklyData, storageData, intelligence, supplyPipeline, xSignals, wowComparison, grainOverview] = await Promise.all([
    getDeliveryTimeSeries(grain.name),
    getProvincialDeliveries(grain.name),
    getShipmentDistribution(grain.name),
    getCumulativeTimeSeries(grain.name),
    getStorageBreakdown(grain.name),
    getGrainIntelligence(grain.name),
    getSupplyPipeline(grain.slug),
    getXSignalsForGrain(grain.name),
    getWeekOverWeekComparison(grain.name),
    getGrainOverviewBySlug(grain.slug),
  ]);

  // Determine current grain week from delivery data
  const latestGrainWeek = deliveries.length > 0
    ? Math.max(...deliveries.map(d => d.grain_week))
    : 1;

  // Fetch sentiment data (user vote + aggregate)
  const [userVote, sentimentAggregate] = await Promise.all([
    getUserSentimentVote(supabase, grain.name, CURRENT_CROP_YEAR, latestGrainWeek),
    getGrainSentiment(supabase, grain.name, CURRENT_CROP_YEAR, latestGrainWeek),
  ]);

  // Aggregate total deliveries
  const totalDeliveries = deliveries.reduce((acc, row) => acc + row.ktonnes, 0);

  // Override AI-generated delivery KPIs with v_grain_overview values.
  // The AI kpi_data undercounts because the intelligence pipeline only used
  // Primary Elevator deliveries. v_grain_overview includes both Primary +
  // direct-to-processor (Process) pathways using actual period='Current Week'
  // values, which avoids the cumulative differencing error where CGC revisions
  // cause CY(week N) - CY(week N-1) ≠ CW(week N).
  const correctedKpiData = intelligence?.kpi_data
    ? { ...intelligence.kpi_data }
    : undefined;
  if (correctedKpiData && grainOverview) {
    correctedKpiData.cw_deliveries_kt = grainOverview.cw_deliveries_kt;
    correctedKpiData.cy_deliveries_kt = grainOverview.cy_deliveries_kt;
    correctedKpiData.wow_deliveries_pct = grainOverview.wow_pct_change;
  }

  // Extract user's deliveries from crop plan (or empty array)
  const userDeliveries: DeliveryEntry[] = userPlan?.deliveries ?? [];

  return (
    <GrainPageTransition>
    <div className="space-y-8">

      {/* ═══ Zone 1: Header + Signal Tape ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/overview">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
              <Wheat className="h-8 w-8 text-canola" />
              {grain.name} Market Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detailed {CURRENT_CROP_YEAR} pipeline breakdown comparing macro data with your physical farm scale.
            </p>
          </div>
        </div>
      </div>

      {!intelligence && (
        <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Market intelligence is being generated. Check back after the next Thursday data update.
          </p>
        </div>
      )}

      {intelligence?.thesis_title && (
        <ThesisBanner
          title={intelligence.thesis_title}
          body={intelligence.thesis_body ?? ""}
        />
      )}

      {/* Signal Tape — ticker of X/social signals below thesis banner */}
      {xSignals && xSignals.length > 0 && (
        <SignalTape
          signals={xSignals.map((s) => ({
            sentiment: s.sentiment,
            category: s.category,
            post_summary: s.post_summary,
            grain: grain.name,
          }))}
        />
      )}

      {/* ═══ Zone 2: Market Signals ═══ */}
      <StaggerGroup className="space-y-6">
        {correctedKpiData && (
          <AnimatedCard index={0}>
            <IntelligenceKpis data={correctedKpiData} />
          </AnimatedCard>
        )}

        {wowComparison && (
          <AnimatedCard index={1}>
            <WoWComparisonCard data={wowComparison} />
          </AnimatedCard>
        )}

        {supplyPipeline && (
          <AnimatedCard index={2}>
            <SupplyPipeline
              carry_in_kt={supplyPipeline.carry_in_kt}
              production_kt={supplyPipeline.production_kt}
              total_supply_kt={supplyPipeline.total_supply_kt}
              exports_kt={supplyPipeline.exports_kt ?? undefined}
              food_industrial_kt={supplyPipeline.food_industrial_kt ?? undefined}
              feed_waste_kt={supplyPipeline.feed_waste_kt ?? undefined}
              carry_out_kt={supplyPipeline.carry_out_kt ?? undefined}
              grain={grain.name}
            />
          </AnimatedCard>
        )}

        {intelligence?.insights && intelligence.insights.length > 0 && (
          <AnimatedCard index={3}>
            <div className="space-y-3">
              <h2 className="text-lg font-display font-semibold">Market Signals</h2>
              <InsightCards insights={intelligence.insights} xSignals={xSignals} grainName={grain.name} />
            </div>
          </AnimatedCard>
        )}
      </StaggerGroup>

      {/* Farmer Sentiment Poll */}
      <SentimentPoll
        grain={grain.name}
        grainWeek={latestGrainWeek}
        initialVote={userVote}
        initialAggregate={sentimentAggregate}
      />

      {/* ═══ Zone 3: Decision Window ═══ */}
      <StaggerGroup className="space-y-6">
        <AnimatedCard index={0}>
          <h2 className="text-xl font-display font-semibold mb-4">Decision Window</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Supply Sankey — full-width flow diagram */}
            {supplyPipeline && (
              <div className="lg:col-span-2 rounded-xl border border-border/40 bg-card p-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Supply Flow</h3>
                <SupplySankey
                  carry_in_kt={supplyPipeline.carry_in_kt}
                  production_kt={supplyPipeline.production_kt}
                  total_supply_kt={supplyPipeline.total_supply_kt}
                  exports_kt={supplyPipeline.exports_kt ?? undefined}
                  food_industrial_kt={supplyPipeline.food_industrial_kt ?? undefined}
                  feed_waste_kt={supplyPipeline.feed_waste_kt ?? undefined}
                  carry_out_kt={supplyPipeline.carry_out_kt ?? undefined}
                  grain={grain.name}
                />
              </div>
            )}

            {/* Grain Elevator — storage visualization */}
            <div className="rounded-xl border border-border/40 bg-card p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Storage Levels</h3>
              <GrainElevator storageData={storageData} />
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard index={1}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Prairie Pulse Map — provincial deliveries */}
            <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
              <h3 className="text-lg font-display font-semibold">Provincial Deliveries (CY Total)</h3>
              <PrairiePulseMap provinces={provincial.map((p) => ({
                region: p.region,
                ktonnes: p.ktonnes,
              }))} />
            </div>

            {/* Flow Breakdown */}
            <FlowBreakdownWidget distribution={distribution} totalDeliveries={totalDeliveries} />
          </div>
        </AnimatedCard>
      </StaggerGroup>

      {/* ═══ Zone 4: Deep Dive ═══ */}
      <StaggerGroup className="space-y-6">
        <AnimatedCard index={0}>
          <div className="pt-4">
            <h2 className="text-xl font-display font-semibold mb-4">Pipeline Velocity</h2>
            <GamifiedGrainChart
              weeklyData={weeklyData}
              userDeliveries={userDeliveries}
            />
          </div>
        </AnimatedCard>

        <AnimatedCard index={1}>
          <div className="space-y-4">
            <h2 className="text-lg font-display font-semibold">
              Domestic Disappearance Breakdown
            </h2>
            <DispositionBar data={distribution} />
          </div>
        </AnimatedCard>
      </StaggerGroup>

    </div>
    </GrainPageTransition>
  );
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
            {cropYearLabel()} · Weekly Statistics
          </p>
        </div>
      </div>

      <div className="rounded-xl border-2 border-dashed border-canola/30 bg-canola/5 p-12 text-center space-y-6 max-w-2xl mx-auto mt-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm border border-border">
          <Lock className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-semibold text-2xl text-foreground">
            {grain} analytics are locked
          </h2>
          <p className="text-base text-muted-foreground">
            Add {grain} to your My Farm pipeline to unlock detailed macro-to-micro charts, provincial breakdowns, and actionable trend analysis.
          </p>
        </div>
        <Link href="/my-farm" className="inline-block mt-4">
          <Button className="font-semibold bg-prairie text-foreground hover:bg-prairie/90">
            Set Up My Farm
          </Button>
        </Link>
      </div>
    </div>
  );
}
