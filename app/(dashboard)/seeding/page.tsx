import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { SeedingDashboard } from "@/components/dashboard/seeding-dashboard";
import { SeedingCanadaPlaceholder } from "@/components/dashboard/seeding-canada-placeholder";
import { getSeedingDashboard } from "@/lib/queries/seeding-progress";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

export default async function SeedingPage() {
  const marketYear = new Date().getFullYear();

  const result = await safeQuery("seeding dashboard", () =>
    getSeedingDashboard(marketYear),
  );
  const dashboards = result.data ?? [];

  // Latest week across all commodities — used in the section subtitle
  const latestWeek = dashboards
    .flatMap((d) => d.rows.map((r) => r.week_ending))
    .sort()
    .at(-1);

  const hasAnyData = dashboards.some((d) => d.rows.length > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <SectionBoundary
        title="Seeding data unavailable"
        message="The seeding progress dashboard encountered an error. Please refresh to try again."
      >
        <SectionHeader
          title="Weekly Seeding Progress"
          subtitle={
            latestWeek
              ? `Same state-level crop pulse, shown across all five US grain markets — week ending ${latestWeek}.`
              : "USDA NASS data not available for this market year yet."
          }
        />
        <SeedingCanadaPlaceholder />
        {!hasAnyData ? (
          <SectionStateCard
            title="No seeding data yet"
            message="USDA NASS releases new state-level data Mondays in season."
          />
        ) : (
          <SeedingDashboard dashboards={dashboards} />
        )}
      </SectionBoundary>
    </div>
  );
}
