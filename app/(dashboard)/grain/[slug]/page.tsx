import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { type KeyMetric } from "@/components/dashboard/key-metrics-cards";
import { KeyMetricsWithVoting } from "./key-metrics-with-voting";
import { NetBalanceChart, type NetBalanceWeek } from "@/components/dashboard/net-balance-chart";
import { DeliveryBreakdownChart } from "@/components/dashboard/delivery-breakdown-chart";
import { GrainQualityDonut } from "@/components/dashboard/grain-quality-donut";
import { ProvinceMap } from "@/components/dashboard/province-map";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { StorageBreakdown } from "@/components/dashboard/storage-breakdown";
import { TerminalFlowChart } from "@/components/dashboard/terminal-flow-chart";

import { WoWComparisonCard } from "@/components/dashboard/wow-comparison";
import { GamifiedGrainChart } from "@/components/dashboard/gamified-grain-chart";
import { FarmerCotCard } from "@/components/dashboard/farmer-cot-card";
import { LogisticsCard } from "@/components/dashboard/logistics-card";
import { BullBearCards } from "@/components/dashboard/bull-bear-cards";
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
  getDeliveryChannelBreakdown,
  getGradeDistribution,
  getHistoricalPipelineAvg,
  getProcessorInventory,
  getProvincialDeliveries,
  getStorageBreakdown,
  getWeekOverWeekComparison,
  type CumulativeWeekRow,
  type ProcessorInventory,
  type WoWComparison,
} from "@/lib/queries/observations";
import { getCotPositioning } from "@/lib/queries/cot";
import { getLogisticsSnapshot } from "@/lib/queries/logistics";
import { getProcessorCapacity } from "@/lib/queries/processor-capacity";
import { CrushUtilizationGauge } from "@/components/dashboard/crush-utilization-gauge";
import { getMetricSentiment, getUserMetricVotes } from "@/lib/queries/metric-sentiment";
import { getRecentPrices } from "@/lib/queries/grain-prices";
import { PriceSparkline } from "@/components/dashboard/price-sparkline";
import { DeliveryGapChart } from "@/components/dashboard/delivery-gap-chart";
import { fmtKt } from "@/lib/utils/format";

import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR, cropYearLabel, getCurrentGrainWeek, getPriorCropYear, grainWeekEndDate } from "@/lib/utils/crop-year";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { safeQuery } from "@/lib/utils/safe-query";
import { getWeeklyTerminalFlow } from "@/lib/queries/logistics";
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
    wowResult,
    storageResult,
    roleResult,
    cotResult,
    logisticsResult,
    gradeDistResult,
    deliveryChannelResult,
    metricSentimentResult,
    userMetricVotesResult,
    priorYearPipelineResult,
    fiveYrAvgPipelineResult,
    capacityResult,
    pricesResult,
    processorInventoryResult,
    terminalFlowResult,
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
    safeQuery("Week-over-week comparison", () => getWeekOverWeekComparison(grain.name)),
    safeQuery("Storage breakdown", () => getStorageBreakdown(grain.name)),
    safeQuery("User role", () => getUserRole()),
    safeQuery("COT positioning", () => getCotPositioning(grain.name, CURRENT_CROP_YEAR)),
    safeQuery("Logistics snapshot", () => getLogisticsSnapshot(CURRENT_CROP_YEAR, shippingWeek)),
    safeQuery("Grade distribution", () => getGradeDistribution(grain.name)),
    safeQuery("Delivery channels", () => getDeliveryChannelBreakdown(grain.name)),
    safeQuery("Metric sentiment", () => getMetricSentiment(grain.name, shippingWeek)),
    safeQuery("User metric votes", () => getUserMetricVotes(grain.name, shippingWeek)),
    safeQuery("Prior year pipeline", () =>
      getCumulativeTimeSeries(grain.name, getPriorCropYear())
    ),
    safeQuery("5yr avg pipeline", () =>
      getHistoricalPipelineAvg(grain.name)
    ),
    safeQuery("Processor capacity", () => getProcessorCapacity(grain.name)),
    safeQuery("Recent prices", () => getRecentPrices(grain.name)),
    safeQuery("Processor inventory", () => getProcessorInventory(grain.name)),
    safeQuery("Terminal flow", () => getWeeklyTerminalFlow(grain.name)),
  ]);

  const marketCore = marketCoreResult.error ? null : marketCoreResult.data;
  const intelligence = marketCore?.intelligence ?? null;
  const marketAnalysis = marketCore?.marketAnalysis ?? null;
  const latestGrainWeek = getLatestGrainWeek(
    deliverySeriesResult.error ? [] : deliverySeriesResult.data ?? [],
    intelligence?.grain_week ?? null
  );
  // Authenticated users (who passed the crop plan check above) default to "farmer"
  const role = roleResult.error ? "farmer" : (roleResult.data ?? "farmer");

  const userDeliveries: DeliveryEntry[] = userPlan.deliveries ?? [];

  // Build metric sentiment lookup maps
  const metricSentimentAggs = metricSentimentResult.error ? [] : metricSentimentResult.data ?? [];
  const metricAggregatesMap: Record<string, { bullish_count: number; bearish_count: number; total_votes: number }> = {};
  for (const agg of metricSentimentAggs) {
    metricAggregatesMap[agg.metric] = {
      bullish_count: agg.bullish_count,
      bearish_count: agg.bearish_count,
      total_votes: agg.total_votes,
    };
  }
  const userMetricVotesList = userMetricVotesResult.error ? [] : userMetricVotesResult.data ?? [];
  const userMetricVotesMap: Record<string, "bullish" | "bearish" | null> = {};
  for (const vote of userMetricVotesList) {
    userMetricVotesMap[vote.metric] = vote.sentiment as "bullish" | "bearish";
  }

  // Get latest processor inventory (weeks of supply)
  const processorInventory = processorInventoryResult.error
    ? null
    : (processorInventoryResult.data ?? []).find(
        (r) => r.grain_week === shippingWeek
      ) ?? (processorInventoryResult.data ?? []).at(-1) ?? null;

  // Build key metrics from WoW data
  const keyMetrics = buildKeyMetrics(
    wowResult.error ? null : wowResult.data ?? null,
    marketCore?.grainOverview ?? null,
    processorInventory
  );

  // Hoist pipeline data once — reused by net balance and delivery gap
  const currentYearDeliveries = pipelineVelocityResult.error ? [] : pipelineVelocityResult.data ?? [];
  const netBalanceData = buildNetBalanceData(currentYearDeliveries);

  // Delivery gap pills (Canola only, server-side computation)
  const priorYearDeliveries = priorYearPipelineResult.error ? [] : priorYearPipelineResult.data ?? [];
  const hasGapData = currentYearDeliveries.length > 0 && priorYearDeliveries.length > 0;

  let yoyDeliveryPct = 0;
  let gapKt = 0;
  if (hasGapData) {
    const latestWeek = currentYearDeliveries[currentYearDeliveries.length - 1];
    const currentLatest = latestWeek.producer_deliveries_kt;
    const priorLatest = priorYearDeliveries.find(
      (r) => r.grain_week === latestWeek.grain_week
    )?.producer_deliveries_kt ?? 0;
    if (priorLatest > 0) {
      yoyDeliveryPct = ((currentLatest - priorLatest) / priorLatest) * 100;
    }
    gapKt = priorLatest > 0 ? priorLatest - currentLatest : 0;
  }

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
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                  Data: Week {shippingWeek}
                  <span className="text-muted-foreground/60">
                    (ended {grainWeekEndDate(shippingWeek).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})
                  </span>
                </span>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>Current: Week {getCurrentGrainWeek()}</span>
                {!pricesResult.error && (pricesResult.data ?? []).length > 0 && (
                  <>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <PriceSparkline prices={pricesResult.data!} />
                  </>
                )}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* ========== KEY METRICS (full-width row) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Key Metrics"
            subtitle="This week at a glance"
          />
          {keyMetrics.length > 0 ? (
            <SectionBoundary
              title="Key metrics unavailable"
              message="The metric cards are temporarily unavailable."
            >
              <KeyMetricsWithVoting
                metrics={keyMetrics}
                grain={grain.name}
                grainWeek={shippingWeek}
                role={role}
                userVotes={userMetricVotesMap}
                aggregates={metricAggregatesMap}
              />
            </SectionBoundary>
          ) : (
            <SectionStateCard
              title="Metrics loading"
              message="Key metrics will appear after the next data update."
            />
          )}
        </section>

        {/* ========== DELIVERY PACE (Canola only) ========== */}
        {grain.slug === "canola" && hasGapData && (
          <section className="space-y-6">
            <SectionHeader
              title="Delivery Pace"
              subtitle="Cumulative deliveries vs prior year"
            >
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                yoyDeliveryPct < 0
                  ? "border border-red-500/30 text-red-600 dark:text-red-400"
                  : "border border-prairie/30 text-prairie"
              }`}>
                {yoyDeliveryPct > 0 ? "+" : ""}{yoyDeliveryPct.toFixed(1)}% YoY
              </span>
              {gapKt !== 0 && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  gapKt > 0
                    ? "border border-prairie/30 text-prairie"
                    : "border border-amber-500/30 text-amber-600 dark:text-amber-400"
                }`}>
                  {gapKt > 0 ? `${fmtKt(gapKt, 0)} withheld` : `${fmtKt(Math.abs(gapKt), 0)} ahead`}
                </span>
              )}
            </SectionHeader>
            <SectionBoundary
              title="Delivery pace unavailable"
              message="The delivery gap chart is temporarily unavailable."
            >
              <GlassCard hover={false} elevation={2} className="p-4">
                <DeliveryGapChart
                  currentYearData={currentYearDeliveries}
                  priorYearData={priorYearDeliveries}
                />
              </GlassCard>
            </SectionBoundary>
          </section>
        )}

        {/* ========== NET BALANCE (full-width) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Net Balance"
            subtitle="Weekly surplus or draw on supply"
          />
          {netBalanceData.length > 0 ? (
            <SectionBoundary
              title="Net balance unavailable"
              message="The net balance chart is temporarily unavailable."
            >
              <NetBalanceChart data={netBalanceData} grainName={grain.name} />
            </SectionBoundary>
          ) : (
            <SectionStateCard
              title="Net balance loading"
              message="Net balance data will appear after the next data update."
            />
          )}
        </section>

        {/* ========== DELIVERY BREAKDOWN (full-width) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Delivery Breakdown"
            subtitle="How grain reaches the market each week"
          />
          {deliveryChannelResult.error ? (
            <SectionStateCard
              title="Delivery breakdown unavailable"
              message="The delivery channel chart is temporarily unavailable."
            />
          ) : (deliveryChannelResult.data ?? []).length > 0 ? (
            <SectionBoundary
              title="Delivery breakdown unavailable"
              message="The delivery channel chart is temporarily unavailable."
            >
              <DeliveryBreakdownChart
                data={deliveryChannelResult.data ?? []}
                grainName={grain.name}
              />
            </SectionBoundary>
          ) : (
            <SectionStateCard
              title="No delivery channel data"
              message="Delivery breakdown data is not yet available."
            />
          )}
        </section>

        {/* ========== TERMINAL NET FLOW (full-width) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Terminal Net Flow"
            subtitle="Weekly receipts vs exports at terminal elevators"
          />
          {terminalFlowResult.error ? (
            <SectionStateCard
              title="Terminal flow unavailable"
              message="The terminal net flow chart is temporarily unavailable."
            />
          ) : terminalFlowResult.data && terminalFlowResult.data.length > 0 ? (
            <SectionBoundary
              title="Terminal flow unavailable"
              message="The terminal net flow chart is temporarily unavailable."
            >
              <TerminalFlowChart
                flowData={terminalFlowResult.data}
                logistics={null}
                grainName={grain.name}
              />
            </SectionBoundary>
          ) : null}
        </section>

        {/* ========== PROVINCIAL DELIVERIES + GRAIN STORAGE (2-col grid) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Storage & Distribution"
            subtitle="Where grain sits and where it was delivered"
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
                    Primary Deliveries by Province (CY Total)
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    This map shows Primary worksheet deliveries by province. CGC reports direct-to-processor deliveries nationally, so it will not sum to total producer deliveries.
                  </p>
                  <ProvinceMap
                    provinces={(provincialResult.data ?? []).map((province) => ({
                      region: province.region,
                      ktonnes: province.ktonnes,
                    }))}
                  />
                </div>
              </SectionBoundary>
            )}

            {/* Right: Grain Storage */}
            {storageResult.error ? (
              <SectionStateCard
                title="Storage data unavailable"
                message="The grain storage breakdown is temporarily unavailable."
              />
            ) : storageResult.data ? (
              <SectionBoundary
                title="Storage data unavailable"
                message="The grain storage breakdown is temporarily unavailable."
              >
                <StorageBreakdown data={storageResult.data} grainName={grain.name} />
              </SectionBoundary>
            ) : null}
          </div>
        </section>

        {/* ========== LOGISTICS (full-width) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Logistics"
            subtitle="Port capacity and rail movement"
          />
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
                grainWeek={shippingWeek}
              />
            </SectionBoundary>
          ) : null}
        </section>

        {/* ========== PIPELINE VELOCITY (full-width) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Pipeline Velocity"
            subtitle="Cumulative grain movement through the season"
          />
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
              <GamifiedGrainChart
                weeklyData={pipelineVelocityResult.data ?? []}
                userDeliveries={userDeliveries}
                priorYearData={priorYearPipelineResult.error ? undefined : priorYearPipelineResult.data ?? undefined}
                fiveYrAvgData={fiveYrAvgPipelineResult.error ? undefined : fiveYrAvgPipelineResult.data ?? undefined}
              />
            </SectionBoundary>
          )}
        </section>

        {/* ========== GRAIN QUALITY + COT POSITIONING (2-col grid) ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Quality & Market Positioning"
            subtitle="Grade mix, futures crowding, and processing pull"
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-12">
            {/* Left: Grain Quality Donut */}
            {gradeDistResult.error ? (
              <div className="xl:col-span-4">
                <SectionStateCard
                  title="Grade data unavailable"
                  message="Terminal Receipts grade distribution is temporarily unavailable."
                />
              </div>
            ) : (gradeDistResult.data ?? []).length > 0 ? (
              <div className="xl:col-span-4">
                <SectionBoundary
                  title="Grade data unavailable"
                  message="Terminal Receipts grade distribution is temporarily unavailable."
                >
                  <GrainQualityDonut
                    grades={gradeDistResult.data ?? []}
                    grainName={grain.name}
                  />
                </SectionBoundary>
              </div>
            ) : (
              <div className="xl:col-span-4">
                <SectionStateCard
                  title="No grade data"
                  message="Grade distribution data is not yet available for this grain."
                />
              </div>
            )}

            {/* Center: Fund Sentiment (COT) */}
            {cotResult.error ? (
              <div className="lg:col-span-2 xl:col-span-8">
                <SectionStateCard
                  title="Market positioning unavailable"
                  message="CFTC COT data is temporarily unavailable."
                />
              </div>
            ) : cotResult.data ? (
              <div className="lg:col-span-2 xl:col-span-8">
                <SectionBoundary
                  title="Market positioning unavailable"
                  message="CFTC COT data is temporarily unavailable."
                >
                  <FarmerCotCard data={cotResult.data} />
                </SectionBoundary>
              </div>
            ) : null}

            {/* Right: Crush Utilization Gauge */}
            {!capacityResult.error && capacityResult.data && (
              <div className="xl:col-span-4">
                <SectionBoundary
                  title="Crush data unavailable"
                  message="Processor utilization data is temporarily unavailable."
                >
                  <CrushUtilizationGauge
                    grainName={grain.name}
                    weeklyProcessingKt={
                      wowResult.error ? 0 :
                      (wowResult.data?.metrics.find(m => m.metric === "Processing")?.thisWeek ?? 0)
                    }
                    annualCapacityKt={capacityResult.data.annual_capacity_kt}
                    isApproximate={capacityResult.data.is_approximate}
                    source={capacityResult.data.source}
                  />
                </SectionBoundary>
              </div>
            )}
          </div>
        </section>

        {/* ========== BULL & BEAR CASES (visible, full-width) ========== */}
        {marketAnalysis && (
          <section className="space-y-6">
            <SectionHeader
              title="Bull & Bear Cases"
              subtitle="AI-generated analysis from market data and X signals"
            />
            <SectionBoundary
              title="Bull/Bear cases unavailable"
              message="The bull/bear analysis is temporarily unavailable."
            >
              <BullBearCards
                bullCase={marketAnalysis.bull_case}
                bearCase={marketAnalysis.bear_case}
                confidence={marketAnalysis.data_confidence}
                confidenceScore={marketAnalysis.confidence_score ?? undefined}
                finalAssessment={marketAnalysis.final_assessment ?? undefined}
              />
            </SectionBoundary>
          </section>
        )}

        {/* ========== WOW DETAIL (collapsed) ========== */}
        {!wowResult.error && wowResult.data && (
          <section className="space-y-4">
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
          </section>
        )}
      </div>
    </GrainPageTransition>
  );
}

function buildKeyMetrics(
  wow: WoWComparison | null,
  grainOverview: Awaited<ReturnType<typeof getGrainOverviewBySlug>>,
  processorInv: ProcessorInventory | null = null
): KeyMetric[] {
  if (!wow) return [];
  const findMetric = (name: string) => wow.metrics.find((m) => m.metric === name);

  const deliveries = findMetric("Deliveries");
  const processing = findMetric("Processing");
  const exports = findMetric("Exports");
  const stocks = findMetric("Stocks");

  const metrics: KeyMetric[] = [];

  if (deliveries) {
    metrics.push({
      label: "Deliveries",
      metricKey: "deliveries",
      currentWeekKt: deliveries.thisWeek,
      cropYearKt: Number(grainOverview?.cy_deliveries_kt ?? 0),
      wowChangePct: deliveries.changePct,
      insight: deliveries.changePct > 5
        ? "Accelerating pace — farmers are moving grain"
        : deliveries.changePct < -5
          ? "Delivery pace slowing this week"
          : "Steady delivery pace",
      color: "#2e6b9e",
    });
  }

  if (processing) {
    // Enrich processing insight with weeks of supply when available
    let processingInsight = processing.changePct > 5
      ? "Crush demand picking up"
      : processing.changePct < -5
        ? "Processing volume declining"
        : "Processing at typical levels";

    if (processorInv?.weeks_of_supply != null) {
      const wos = processorInv.weeks_of_supply;
      const supplyNote = wos < 2
        ? `Processors have ${wos} weeks of supply — running tight`
        : wos > 6
          ? `Processors sitting on ${wos} weeks of supply — comfortable`
          : `Processors hold ${wos} weeks of supply`;
      processingInsight = supplyNote;
    }

    metrics.push({
      label: "Processing",
      metricKey: "processing",
      currentWeekKt: processing.thisWeek,
      cropYearKt: 0,
      wowChangePct: processing.changePct,
      insight: processingInsight,
      color: "#437a22",
    });
  }

  if (exports) {
    metrics.push({
      label: "Exports",
      metricKey: "exports",
      currentWeekKt: exports.thisWeek,
      cropYearKt: 0,
      wowChangePct: exports.changePct,
      insight: exports.changePct > 10
        ? "Export surge — international demand strengthening"
        : exports.changePct < -10
          ? "Export drawback this week"
          : "Export flow at normal pace",
      color: "#c17f24",
    });
  }

  if (stocks) {
    metrics.push({
      label: "Stocks",
      metricKey: "stocks",
      currentWeekKt: stocks.thisWeek,
      cropYearKt: 0,
      wowChangePct: stocks.changePct,
      insight: stocks.changePct > 0
        ? "Inventory building — more coming in than going out"
        : stocks.changePct < -3
          ? "Stock drawdown — tightening supply pipeline"
          : "Stocks stable",
      color: "#8b7355",
    });
  }

  return metrics;
}

function buildNetBalanceData(pipelineData: CumulativeWeekRow[]): NetBalanceWeek[] {
  if (pipelineData.length === 0) return [];

  // Pipeline velocity is cumulative — compute per-week deltas
  const result: NetBalanceWeek[] = [];
  let cumulative = 0;

  for (let i = 0; i < pipelineData.length; i++) {
    const curr = pipelineData[i];
    const prev = i > 0 ? pipelineData[i - 1] : null;

    const deliveries = prev
      ? curr.producer_deliveries_kt - prev.producer_deliveries_kt
      : curr.producer_deliveries_kt;
    const exports = prev
      ? curr.exports_kt - prev.exports_kt
      : curr.exports_kt;
    const processing = prev
      ? curr.processing_kt - prev.processing_kt
      : curr.processing_kt;

    const net = deliveries - exports - processing;
    cumulative += net;

    result.push({
      grain_week: curr.grain_week,
      deliveries_kt: Math.max(0, deliveries),
      exports_kt: Math.max(0, exports),
      processing_kt: Math.max(0, processing),
      net_balance_kt: net,
      cumulative_kt: cumulative,
    });
  }

  return result;
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
