import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { IntelligenceKpis } from "@/components/dashboard/intelligence-kpis";
import { ProvinceMap } from "@/components/dashboard/province-map";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { StorageBreakdown } from "@/components/dashboard/storage-breakdown";
import { SupplyPipeline } from "@/components/dashboard/supply-pipeline";

import { WoWComparisonCard } from "@/components/dashboard/wow-comparison";
import { XSignalFeed } from "@/components/dashboard/x-signal-feed";
import { GamifiedGrainChart } from "@/components/dashboard/gamified-grain-chart";
import { FlowDonutChart } from "@/components/dashboard/flow-donut-chart";
import { CotPositioningCard } from "@/components/dashboard/cot-positioning-card";
import { LogisticsCard } from "@/components/dashboard/logistics-card";
import { CompactSignalStrip } from "@/components/dashboard/compact-signal-strip";
import { BullBearCards } from "@/components/dashboard/bull-bear-cards";
import { AnimatedCard } from "@/components/motion/animated-card";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { GlassCard } from "@/components/ui/glass-card";
import { MarketStanceBadge } from "@/components/ui/market-stance-badge";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/auth/role-guard";
import type { DeliveryEntry } from "@/lib/queries/crop-plans";
import { getGrainBySlug, getGrainOverviewBySlug } from "@/lib/queries/grains";
import { getGrainIntelligence, getMarketAnalysis } from "@/lib/queries/intelligence";
import {
  getCumulativeTimeSeries,
  getDeliveryTimeSeries,
  getProvincialDeliveries,
  getShipmentDistribution,
  getStorageBreakdown,
  getWeekOverWeekComparison,
} from "@/lib/queries/observations";
import { getCotPositioning } from "@/lib/queries/cot";
import { getLogisticsSnapshot } from "@/lib/queries/logistics";
import { getWeeklyFlowBreakdown } from "@/lib/queries/flow-breakdown";

import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR, cropYearLabel, getCurrentGrainWeek } from "@/lib/utils/crop-year";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { safeQuery } from "@/lib/utils/safe-query";
import { getXSignalsWithFeedback } from "@/lib/queries/x-signals";
import { getSupplyPipeline } from "@/lib/queries/intelligence";
import { GrainPageTransition } from "./client";

interface Props {
  params: Promise<{ slug: string }>;
}

/* ------------------------------------------------------------------ */
/*  Helper: parse thesis body into bullet points                      */
/* ------------------------------------------------------------------ */
function parseToBullets(text: string): string[] {
  // Strip markdown bold/italic
  const clean = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/_(.+?)_/g, "$1");

  // Check for bullet-style lines
  const bulletLines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+/.test(l))
    .map((l) => l.replace(/^[-•*]\s+/, ""));

  if (bulletLines.length >= 2) {
    return bulletLines.slice(0, 5);
  }

  // Fall back to sentence splitting
  const sentences = clean
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  return sentences.slice(0, 5);
}

/* ------------------------------------------------------------------ */
/*  Helper: derive stance from thesis title keywords                  */
/* ------------------------------------------------------------------ */
function deriveStanceFromThesis(
  title: string
): "bullish" | "bearish" | "neutral" {
  const lower = title.toLowerCase();
  if (
    /\b(bullish|strong|surge|rally|soar|boom|uptick|rising)\b/.test(lower)
  ) {
    return "bullish";
  }
  if (
    /\b(bearish|weak|decline|pressure|slump|drop|falling|downturn)\b/.test(
      lower
    )
  ) {
    return "bearish";
  }
  return "neutral";
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

  // Use the latest *imported* week, not the calendar week — prevents
  // querying future weeks that have no data yet (e.g., calendar week 33
  // but latest CGC import is week 31).
  const shippingWeek = await getLatestImportedWeek();

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
    cotResult,
    logisticsResult,
    flowResult,
  ] = await Promise.all([
    safeQuery("Market intelligence", async () => {
      const [intelligence, grainOverview, marketAnalysis] = await Promise.all([
        getGrainIntelligence(grain.name),
        getGrainOverviewBySlug(grain.slug),
        getMarketAnalysis(grain.name),
      ]);

      return { intelligence, grainOverview, marketAnalysis };
    }),
    safeQuery("Delivery activity", () => getDeliveryTimeSeries(grain.name)),
    safeQuery("Pipeline velocity", () => getCumulativeTimeSeries(grain.name)),
    safeQuery("Provincial deliveries", () => getProvincialDeliveries(grain.name)),
    safeQuery("Domestic disappearance", () => getShipmentDistribution(grain.name)),
    safeQuery("Week-over-week comparison", () => getWeekOverWeekComparison(grain.name)),
    safeQuery("Supply pipeline", () => getSupplyPipeline(grain.slug)),
    safeQuery("Storage breakdown", () => getStorageBreakdown(grain.name)),
    safeQuery("User role", () => getUserRole()),
    safeQuery("COT positioning", () => getCotPositioning(grain.name, CURRENT_CROP_YEAR)),
    safeQuery("Logistics snapshot", () => getLogisticsSnapshot(CURRENT_CROP_YEAR, shippingWeek)),
    safeQuery("Weekly flow breakdown", () => getWeeklyFlowBreakdown(grain.name, CURRENT_CROP_YEAR, shippingWeek)),
  ]);

  const marketCore = marketCoreResult.error ? null : marketCoreResult.data;
  const intelligence = marketCore?.intelligence ?? null;
  const marketAnalysis = marketCore?.marketAnalysis ?? null;
  const correctedKpiData = buildCorrectedKpiData(intelligence, marketCore?.grainOverview ?? null);
  const latestGrainWeek = getLatestGrainWeek(
    deliverySeriesResult.error ? [] : deliverySeriesResult.data ?? [],
    intelligence?.grain_week ?? null
  );
  // Authenticated users (who passed the crop plan check above) default to "farmer"
  const role = roleResult.error ? "farmer" : (roleResult.data ?? "farmer");

  const [signalFeedResult] = await Promise.all([
    safeQuery("Signal feedback feed", async () => {
      if (!user) {
        return [];
      }

      return getXSignalsWithFeedback(supabase, grain.name, latestGrainWeek);
    }),
  ]);

  const userDeliveries: DeliveryEntry[] = userPlan.deliveries ?? [];

  // Build compact signals for the strip from the full signal feed
  const compactSignals = (signalFeedResult.error ? [] : signalFeedResult.data ?? []).map((s) => ({
    sentiment: s.sentiment ?? "neutral",
    category: s.category ?? "other",
    post_summary: s.post_summary ?? "",
    post_url: s.post_url ?? null,
    post_author: s.post_author ?? null,
    grain: s.grain ?? grain.name,
    searched_at: s.searched_at ?? null,
  }));

  return (
    <GrainPageTransition>
      <div className="space-y-10">
        {/* ========== HERO SECTION (full-width) ========== */}
        <GlassCard hover={false} elevation={3} className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <Link href="/overview" className="mt-1 shrink-0">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                  {grain.name}
                </h1>
                {intelligence && (
                  <MarketStanceBadge
                    stance={deriveStanceFromThesis(intelligence.thesis_title ?? "")}
                    size="lg"
                  />
                )}
              </div>
              {intelligence?.thesis_title && (
                <p className="text-lg font-display font-semibold text-foreground/90">
                  {intelligence.thesis_title}
                </p>
              )}
              {intelligence?.thesis_body && (
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {parseToBullets(intelligence.thesis_body).map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-canola mt-0.5">&#9656;</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!intelligence && (
                <SectionStateCard
                  title="Intelligence is generating"
                  message="Check back after the next Thursday data update."
                />
              )}
            </div>
          </div>
        </GlassCard>

        {/* ========== KEY METRICS (full-width) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Key Metrics"
            subtitle="This week at a glance"
          />
          <StaggerGroup className="space-y-6">
            {marketCoreResult.error ? (
              <SectionStateCard
                title="Intelligence KPIs unavailable"
                message="The KPI block is temporarily unavailable."
              />
            ) : correctedKpiData ? (
              <AnimatedCard index={0}>
                <SectionBoundary
                  title="Intelligence KPIs unavailable"
                  message="The KPI block is temporarily unavailable. The rest of the grain page is still live."
                >
                  <IntelligenceKpis data={correctedKpiData} />
                </SectionBoundary>
              </AnimatedCard>
            ) : null}
          </StaggerGroup>
        </section>

        {/* ========== THIS WEEK'S FLOW (2-col grid) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="This Week's Flow"
            subtitle="Where grain moved and who's positioned"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: FlowDonutChart */}
            {flowResult.error ? (
              <SectionStateCard
                title="Flow breakdown unavailable"
                message="The weekly flow chart is temporarily unavailable."
              />
            ) : flowResult.data && flowResult.data.segments.length > 0 ? (
              <SectionBoundary
                title="Flow breakdown unavailable"
                message="The weekly flow chart is temporarily unavailable."
              >
                <FlowDonutChart
                  segments={flowResult.data.segments}
                  totalFlow={flowResult.data.totalFlow}
                  grainWeek={flowResult.data.grainWeek}
                  grainName={grain.name}
                />
              </SectionBoundary>
            ) : (
              <SectionStateCard
                title="No flow data"
                message="Flow breakdown data is not yet available for this week."
              />
            )}

            {/* Right: CotPositioningCard */}
            {cotResult.error ? (
              <SectionStateCard
                title="COT positioning unavailable"
                message="CFTC COT data is temporarily unavailable."
              />
            ) : cotResult.data ? (
              <SectionBoundary
                title="COT positioning unavailable"
                message="CFTC COT data is temporarily unavailable."
              >
                <CotPositioningCard
                  positions={cotResult.data.positions}
                  latest={cotResult.data.latest}
                  hasDivergence={cotResult.data.hasDivergence}
                />
              </SectionBoundary>
            ) : null}
          </div>
        </section>

        {/* ========== X SIGNAL STRIP (full-width, inline) ========== */}
        {compactSignals.length > 0 && (
          <section>
            <div className="border-t border-border/30 pt-6">
              <SectionBoundary
                title="Signal strip unavailable"
                message="The signal preview is temporarily unavailable."
              >
                <CompactSignalStrip signals={compactSignals.slice(0, 8)} />
              </SectionBoundary>
            </div>
          </section>
        )}

        {/* ========== MOVEMENT & LOGISTICS (2-col grid) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Movement & Logistics"
            subtitle="Provincial flow and rail/port capacity"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: ProvinceMap */}
            {provincialResult.error ? (
              <SectionStateCard
                title="Provincial deliveries unavailable"
                message="The provincial delivery map is temporarily unavailable."
              />
            ) : (
              <SectionBoundary
                title="Provincial deliveries unavailable"
                message="The provincial delivery map is temporarily unavailable."
              >
                <div className="space-y-3">
                  <h3 className="text-lg font-display font-semibold">
                    Provincial Deliveries (CY Total)
                  </h3>
                  <ProvinceMap
                    provinces={(provincialResult.data ?? []).map((province) => ({
                      region: province.region,
                      ktonnes: province.ktonnes,
                    }))}
                  />
                </div>
              </SectionBoundary>
            )}

            {/* Right: LogisticsCard */}
            {logisticsResult.error ? (
              <SectionStateCard
                title="Logistics unavailable"
                message="Port and railcar data is temporarily unavailable."
              />
            ) : logisticsResult.data ? (
              <SectionBoundary
                title="Logistics unavailable"
                message="Port and railcar data is temporarily unavailable."
              >
                <LogisticsCard
                  grainMonitor={logisticsResult.data.grainMonitor}
                  producerCars={logisticsResult.data.producerCars}
                  grainName={grain.name}
                />
              </SectionBoundary>
            ) : null}
          </div>
        </section>

        {/* ========== DEEPER ANALYSIS (2-col grid) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Deeper Analysis"
            subtitle="Pipeline velocity and storage position"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: GamifiedGrainChart (Pipeline Velocity) */}
            {pipelineVelocityResult.error ? (
              <SectionStateCard
                title="Pipeline velocity unavailable"
                message="The pipeline velocity chart is temporarily unavailable."
              />
            ) : (
              <SectionBoundary
                title="Pipeline velocity unavailable"
                message="The pipeline velocity chart is temporarily unavailable."
              >
                <div className="pt-4">
                  <h3 className="mb-4 text-xl font-display font-semibold">Pipeline Velocity</h3>
                  <GamifiedGrainChart
                    weeklyData={pipelineVelocityResult.data ?? []}
                    userDeliveries={userDeliveries}
                  />
                </div>
              </SectionBoundary>
            )}

            {/* Right: StorageBreakdown */}
            {storageResult.error ? (
              <SectionStateCard
                title="Storage breakdown unavailable"
                message="The storage breakdown is temporarily unavailable."
              />
            ) : storageResult.data ? (
              <SectionBoundary
                title="Storage breakdown unavailable"
                message="The storage breakdown is temporarily unavailable."
              >
                <StorageBreakdown data={storageResult.data} grainName={grain.name} />
              </SectionBoundary>
            ) : null}
          </div>
        </section>

        {/* ========== GRAIN BALANCE (full-width) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Grain Balance"
            subtitle="AAFC supply and disposition outlook"
          />
          {supplyPipelineResult.error ? (
            <SectionStateCard
              title="Supply pipeline unavailable"
              message="AAFC supply pipeline data is temporarily unavailable."
            />
          ) : supplyPipelineResult.data ? (
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
          ) : null}
        </section>

        {/* ========== EXPANDABLE DETAIL (full-width) ========== */}
        <section className="space-y-4">
          {/* All Market Signals */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              All Market Signals
            </summary>
            <div className="mt-4">
              {signalFeedResult.error ? (
                <SectionStateCard
                  title="Signal feedback feed unavailable"
                  message="Signal voting is temporarily unavailable. The social feed will return automatically when the service recovers."
                />
              ) : (
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
              )}
            </div>
          </details>

          {/* Bull / Bear Cases */}
          {marketAnalysis && (
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                Bull &amp; Bear Cases
              </summary>
              <div className="mt-4">
                <SectionBoundary
                  title="Bull/Bear cases unavailable"
                  message="The bull/bear analysis is temporarily unavailable."
                >
                  <BullBearCards
                    bullCase={marketAnalysis.bull_case}
                    bearCase={marketAnalysis.bear_case}
                    confidence={marketAnalysis.data_confidence}
                    modelUsed={marketAnalysis.model_used}
                  />
                </SectionBoundary>
              </div>
            </details>
          )}

          {/* WoW Detailed Comparison */}
          {!wowResult.error && wowResult.data && (
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                Week-over-Week Detailed Comparison
              </summary>
              <div className="mt-4">
                <SectionBoundary
                  title="Week-over-week comparison unavailable"
                  message="Week-over-week comparisons are temporarily unavailable."
                >
                  <WoWComparisonCard data={wowResult.data} />
                </SectionBoundary>
              </div>
            </details>
          )}
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
