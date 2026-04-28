import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { GlassCard } from "@/components/ui/glass-card";
import { SeedingMap } from "@/components/dashboard/seeding-map";
import { SeedingCanadaPlaceholder } from "@/components/dashboard/seeding-canada-placeholder";
import { SeedingTableFallback } from "@/components/dashboard/seeding-table-fallback";
import { getSeedingSeismograph } from "@/lib/queries/seeding-progress";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

const COMMODITIES = ["CORN", "SOYBEANS", "WHEAT", "BARLEY", "OATS"] as const;

interface PageProps {
  searchParams: Promise<{ crop?: string }>;
}

export default async function SeedingPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Validate ?crop= against allowed commodities, default to CORN
  const rawCrop = (params.crop ?? "").toUpperCase();
  const commodity: string =
    (COMMODITIES as readonly string[]).includes(rawCrop) ? rawCrop : "CORN";

  const marketYear = new Date().getFullYear();

  const result = await safeQuery("seeding seismograph", () =>
    getSeedingSeismograph(commodity, marketYear)
  );
  const rows = result.data ?? [];

  // Latest week_ending from the last row (rows come back chronologically)
  const latestWeek =
    rows.length > 0 ? rows[rows.length - 1].week_ending : "";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <SectionBoundary
        title="Seeding data unavailable"
        message="The seeding progress map encountered an error. Please refresh to try again."
      >
        <SectionHeader
          title="Weekly Seeding Progress"
          subtitle={
            latestWeek
              ? `USDA NASS week ending ${latestWeek}. State data only for the US grain belt.`
              : "USDA NASS data not available for this market year."
          }
        >
          <CropSelect current={commodity} />
        </SectionHeader>
        <SeedingCanadaPlaceholder />
        <GlassCard elevation={2} hover={false}>
          <div className="p-5">
            {rows.length === 0 ? (
              <SectionStateCard
                title="No seeding data yet"
                message="USDA NASS releases new state-level data Mondays in season."
              />
            ) : (
              <>
                <SeedingMap rows={rows} commodity={titleCase(commodity)} />
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    View as table (accessible / reduced-motion)
                  </summary>
                  <div className="mt-3">
                    <SeedingTableFallback
                      rows={rows}
                      commodity={titleCase(commodity)}
                      weekEnding={latestWeek}
                    />
                  </div>
                </details>
              </>
            )}
          </div>
        </GlassCard>
      </SectionBoundary>
    </div>
  );
}

function CropSelect({ current }: { current: string }) {
  return (
    <form method="get" className="flex items-center gap-2">
      <label
        htmlFor="crop"
        className="text-xs font-medium text-muted-foreground"
      >
        Showing
      </label>
      <select
        id="crop"
        name="crop"
        defaultValue={current}
        className="rounded-full border border-border/40 bg-card px-3 py-1.5 text-sm font-medium"
      >
        {COMMODITIES.map((c) => (
          <option key={c} value={c}>
            {titleCase(c)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-full border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Update
      </button>
    </form>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
