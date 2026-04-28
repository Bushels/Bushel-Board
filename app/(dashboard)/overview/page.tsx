import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { UnifiedMarketStanceChart } from "@/components/dashboard/unified-market-stance-chart";
import { GlassCard } from "@/components/ui/glass-card";
import { getLatestImportedWeek } from "@/lib/queries/data-freshness";
import { getMarketStances } from "@/lib/queries/market-stance";
import { getUsMarketStancesForOverview } from "@/lib/queries/us-market-stance";
import { CURRENT_US_MARKET_YEAR } from "@/lib/queries/us-intelligence";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const grainWeek = await getLatestImportedWeek();

  const [caResult, usResult] = await Promise.all([
    safeQuery("CA market stances", () => getMarketStances(grainWeek)),
    safeQuery("US market stances", () => getUsMarketStancesForOverview(CURRENT_US_MARKET_YEAR)),
  ]);

  const caRows = caResult.data ?? [];
  const usRows = usResult.data ?? [];
  const hasAny = caRows.length > 0 || usRows.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6">
      <section>
        <SectionHeader
          title="AI Market Stance"
          subtitle="Where each market is heading this week, in plain terms."
        />
        <div className="mt-4">
          <GlassCard elevation={2} hover={false}>
            <div className="p-5">
              {hasAny ? (
                <UnifiedMarketStanceChart
                  caRows={caRows}
                  caGrainWeek={grainWeek}
                  usRows={usRows}
                  usMarketYear={CURRENT_US_MARKET_YEAR}
                  updatedAt={new Date().toISOString()}
                />
              ) : (
                <SectionStateCard
                  title="Market stance temporarily unavailable"
                  message="Canadian and US stance data are both unavailable right now. Please refresh shortly."
                />
              )}
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
