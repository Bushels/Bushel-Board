import { SentimentBanner } from "@/components/dashboard/sentiment-banner";
import { MarketSnapshotGrid } from "@/components/dashboard/market-snapshot-grid";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { getUserRole } from "@/lib/auth/role-guard";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { getMarketOverviewSnapshot } from "@/lib/queries/market-overview";
import { getSentimentOverview } from "@/lib/queries/sentiment";
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

  const [marketResult, sentimentResult, signalsResult, userRole] = await Promise.all([
    safeQuery("Market overview snapshot", () => getMarketOverviewSnapshot()),
    safeQuery("Farmer sentiment", () => getSentimentOverview(CURRENT_CROP_YEAR, grainWeek)),
    safeQuery("Market signal tape", () => getLatestXSignals(20)),
    getUserRole(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6">
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
