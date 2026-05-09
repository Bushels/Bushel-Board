import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { SeedingDashboard } from "@/components/dashboard/seeding-dashboard";
import { SeedingCanadaProgress } from "@/components/dashboard/seeding-canada-progress";
import { getCanadaSeedingProgress } from "@/lib/queries/canada-seeding-progress";
import { getSeedingDashboard } from "@/lib/queries/seeding-progress";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

export default async function SeedingPage() {
  const marketYear = new Date().getFullYear();

  const [usResult, canadaResult] = await Promise.all([
    safeQuery("seeding dashboard", () => getSeedingDashboard(marketYear)),
    safeQuery("Canada seeding progress", () =>
      getCanadaSeedingProgress(marketYear),
    ),
  ]);
  const dashboards = usResult.data ?? [];
  const canadaReports = canadaResult.data ?? [];

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
              ? `Same state-level crop pulse, shown across all six US grain markets — week ending ${latestWeek}.`
              : "USDA NASS data not available for this market year yet."
          }
        >
          <Link
            href="/seeding/spring-wheat"
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-canola/35 bg-canola/10 px-3 py-1.5 text-xs font-bold text-canola transition-colors hover:border-canola/65 hover:bg-canola/15"
          >
            Spring Wheat Pulse
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SectionHeader>
        <SeedingCanadaProgress reports={canadaReports} />
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
