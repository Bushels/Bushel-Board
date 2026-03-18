import { SentimentBanner } from "@/components/dashboard/sentiment-banner";
import { MarketSnapshotGrid } from "@/components/dashboard/market-snapshot-grid";
import { MarketStanceChart } from "@/components/dashboard/market-stance-chart";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { LogisticsBanner } from "@/components/dashboard/logistics-banner";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { GlassCard } from "@/components/ui/glass-card";
import { getUserRole } from "@/lib/auth/role-guard";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { getMarketOverviewSnapshot } from "@/lib/queries/market-overview";
import { getMarketStances } from "@/lib/queries/market-stance";
import { getSentimentOverview } from "@/lib/queries/sentiment";
import { getLogisticsSnapshotRaw, getAggregateTerminalFlow } from "@/lib/queries/logistics";
import { getLatestXSignals } from "@/lib/queries/x-signals";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { rethrowFrameworkError, safeQuery } from "@/lib/utils/safe-query";
import { SignalStripWithVoting } from "./signal-strip-with-voting";

export const dynamic = "force-dynamic";

interface UnlockedGrainContext {
  unlockedSlugs: string[];
}

export default async function OverviewPage() {
  const grainContext = await getUnlockedGrainContext();
  const grainWeek = await getLatestImportedWeek();

  const [marketResult, sentimentResult, signalsResult, userRole, logisticsResult, aggregateFlowResult, stancesResult] = await Promise.all([
    safeQuery("Market overview snapshot", () => getMarketOverviewSnapshot()),
    safeQuery("Farmer sentiment", () => getSentimentOverview(CURRENT_CROP_YEAR, grainWeek)),
    safeQuery("Market signal tape", () => getLatestXSignals(20)),
    getUserRole(),
    safeQuery("Logistics snapshot", () => getLogisticsSnapshotRaw(CURRENT_CROP_YEAR, grainWeek)),
    safeQuery("Aggregate terminal flow", () => getAggregateTerminalFlow()),
    safeQuery("AI market stances", () => getMarketStances(grainWeek)),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6">
      {/* AI Market Stance — top of page, most actionable at-a-glance view */}
      {stancesResult.data && stancesResult.data.length > 0 && (
        <section>
          <SectionHeader
            title="AI Market Stance"
            subtitle="Weekly bullish/bearish scoring across prairie grains with price context"
          />
          <div className="mt-4">
            <GlassCard elevation={2} hover={false}>
              <div className="p-5">
                <MarketStanceChart
                  stances={stancesResult.data}
                  grainWeek={grainWeek}
                  updatedAt={stancesResult.data[0]?.cashPrice ? new Date().toISOString() : null}
                />
              </div>
            </GlassCard>
          </div>
        </section>
      )}

      <SectionBoundary
        title="Market snapshot unavailable"
        message="The market totals snapshot is temporarily unavailable. Community data is still live."
      >
        <section className="space-y-4">
          <SectionHeader
            title={`${CURRENT_CROP_YEAR} Canadian Grain Market Snapshot`}
            subtitle="CGC total-style market view across all grains and oilseeds. Grain drill-down remains on the individual grain pages."
          />
          {marketResult.data ? (
            <MarketSnapshotGrid snapshot={marketResult.data} />
          ) : (
            <SectionStateCard
              title="Market snapshot unavailable"
              message="The overview page could not load the combined market totals right now."
            />
          )}
          {logisticsResult.data && !logisticsResult.error && (
            <LogisticsBanner
              logistics={logisticsResult.data}
              aggregateFlow={aggregateFlowResult.error ? [] : (aggregateFlowResult.data ?? [])}
            />
          )}
        </section>
      </SectionBoundary>

      <SectionBoundary
        title="Community Pulse unavailable"
        message="Community data is temporarily unavailable. Core CGC market totals are still available."
      >
        <section className="space-y-4">
          <SectionHeader
            title="Community Pulse"
            subtitle="Cross-grain farmer sentiment and live market chatter"
          />
          {sentimentResult.data ? (
            <SentimentBanner
              sentimentData={sentimentResult.data}
              grainWeek={grainWeek}
              unlockedSlugs={grainContext.unlockedSlugs}
            />
          ) : (
            <SectionStateCard
              title="Farmer sentiment unavailable"
              message="Farmer sentiment is temporarily unavailable. The market totals snapshot is still available."
            />
          )}
          {signalsResult.data ? (
            <SignalStripWithVoting
              signals={signalsResult.data.map((signal) => ({
                signal_id: signal.id,
                sentiment: signal.sentiment,
                category: signal.category,
                post_summary: signal.post_summary,
                post_url: signal.post_url ?? null,
                post_author: signal.post_author,
                grain: signal.grain ?? "",
                searched_at: signal.searched_at ?? null,
              }))}
              unlockedSlugs={grainContext.unlockedSlugs}
              role={userRole}
            />
          ) : (
            <SectionStateCard
              title="Market signals unavailable"
              message="Live market signals are temporarily unavailable. The market totals snapshot is still available."
            />
          )}
        </section>
      </SectionBoundary>
    </div>
  );
}

async function getUnlockedGrainContext(): Promise<UnlockedGrainContext> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { unlockedSlugs: [] };
    }

    const { data: plans } = await supabase
      .from("crop_plans")
      .select("grain")
      .eq("user_id", user.id)
      .eq("crop_year", CURRENT_CROP_YEAR);

    if (!plans || plans.length === 0) {
      return { unlockedSlugs: [] };
    }

    return {
      unlockedSlugs: plans.map((plan) => plan.grain.toLowerCase().replace(/ /g, "-")),
    };
  } catch (error) {
    rethrowFrameworkError(error);
    console.error("getUnlockedGrainContext failed:", error);
    return { unlockedSlugs: [] };
  }
}
