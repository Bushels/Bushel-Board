import { getGrainOverview } from "@/lib/queries/grains";
import { getSupplyDispositionForGrains } from "@/lib/queries/supply-disposition";
import { getCumulativeTimeSeries, getStorageBreakdown } from "@/lib/queries/observations";
import type { SupplyDisposition } from "@/lib/queries/supply-disposition";
import type { CumulativeWeekRow, StorageBreakdown } from "@/lib/queries/observations";
import { CropSummaryCard } from "@/components/dashboard/crop-summary-card";
import { OverviewCharts } from "./client";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { createClient } from "@/lib/supabase/server";
import { ALL_GRAINS } from "@/lib/constants/grains";

export const revalidate = 3600; // Revalidate every hour

const FALLBACK_GRAINS = ["wheat", "canola", "barley", "oats", "lentils"];

export default async function OverviewPage() {
  // Fetch user's unlocked grains from crop_plans
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userGrainSlugs: string[] = [];
  if (user) {
    const { data: plans } = await supabase
      .from("crop_plans")
      .select("grain")
      .eq("user_id", user.id)
      .eq("crop_year", CURRENT_CROP_YEAR);
    if (plans && plans.length > 0) {
      userGrainSlugs = plans.map((p) => {
        const def = ALL_GRAINS.find((g) => g.name === p.grain);
        return def?.slug ?? p.grain.toLowerCase().replace(/ /g, "-");
      });
    }
  }

  // Use user's unlocked grains, fall back to defaults if none unlocked
  const activeGrains = userGrainSlugs.length > 0 ? userGrainSlugs : FALLBACK_GRAINS;

  // Build name lookup from ALL_GRAINS
  const GRAIN_NAMES: Record<string, string> = {};
  for (const g of ALL_GRAINS) {
    GRAIN_NAMES[g.slug] = g.name;
  }

  // Fetch all data in parallel
  const [grainOverview, supplyData, ...weeklyAndStorage] = await Promise.all([
    getGrainOverview(),
    getSupplyDispositionForGrains(activeGrains),
    // Cumulative time series and storage for each grain (CGC uses grain names, not slugs)
    ...activeGrains.flatMap((slug) => [
      getCumulativeTimeSeries(GRAIN_NAMES[slug] ?? slug),
      getStorageBreakdown(GRAIN_NAMES[slug] ?? slug),
    ]),
  ]);

  // Build supply lookup by slug
  const supplyBySlug: Record<string, SupplyDisposition> = {};
  for (const row of supplyData) {
    supplyBySlug[row.grain_slug] = row;
  }

  // Build weekly and storage data lookups
  const weeklyBySlug: Record<string, CumulativeWeekRow[]> = {};
  const storageBySlug: Record<string, StorageBreakdown[]> = {};
  activeGrains.forEach((slug, i) => {
    weeklyBySlug[slug] = weeklyAndStorage[i * 2] as CumulativeWeekRow[];
    storageBySlug[slug] = weeklyAndStorage[i * 2 + 1] as StorageBreakdown[];
  });

  // Build summary card data: match overview rows to supply data
  const summaryCards = activeGrains.map((slug, i) => {
    const displayName = GRAIN_NAMES[slug];
    const overview = grainOverview.find((g) => g.slug === slug);
    const supply = supplyBySlug[slug];
    const startingStock = supply
      ? (supply.carry_in_kt ?? 0) + (supply.production_kt ?? 0)
      : 0;

    return {
      grain: displayName,
      slug,
      startingStock,
      cyDeliveries: overview?.cy_deliveries_kt ?? 0,
      cwDeliveries: overview?.cw_deliveries_kt ?? 0,
      wowChange: overview?.wow_pct_change ?? 0,
      isUnlocked: true, // Default grains are always visible
      index: i,
    };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      {/* Hero: Crop Year Summary Cards */}
      <section>
        <h2 className="text-lg font-display font-semibold mb-4">
          {CURRENT_CROP_YEAR} Crop Year — Your Grains
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <div
              key={card.slug}
              className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
              style={{ animationDelay: `${card.index * 40}ms` }}
            >
              <CropSummaryCard {...card} />
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Charts Section */}
      <section>
        <OverviewCharts
          supplyData={supplyBySlug}
          weeklyData={weeklyBySlug}
          storageData={storageBySlug}
          grainNames={GRAIN_NAMES}
          defaultGrains={activeGrains}
        />
      </section>

      {/* No data fallback */}
      {grainOverview.length === 0 && (
        <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          <p className="font-medium">No grain data available</p>
          <p className="text-sm mt-1">
            Run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
              npm run backfill
            </code>{" "}
            to load CGC data into Supabase.
          </p>
        </div>
      )}
    </div>
  );
}
