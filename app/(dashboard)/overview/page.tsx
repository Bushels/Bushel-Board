import Link from "next/link";
import { getGrainOverview } from "@/lib/queries/grains";
import { getSupplyDispositionForGrains } from "@/lib/queries/supply-disposition";
import { getGrainIntelligence } from "@/lib/queries/intelligence";
import { getSentimentOverview } from "@/lib/queries/sentiment";
import { getLatestXSignals } from "@/lib/queries/x-signals";
import { getUserRole } from "@/lib/auth/role-guard";
import type { GrainIntelligence } from "@/lib/queries/intelligence";
import type { SupplyDisposition } from "@/lib/queries/supply-disposition";
import { CropSummaryCard } from "@/components/dashboard/crop-summary-card";
import { SentimentBanner } from "@/components/dashboard/sentiment-banner";
import { SignalTape } from "@/components/dashboard/signal-tape";
import { AnimatedCard } from "@/components/motion/animated-card";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { CURRENT_CROP_YEAR, getCurrentGrainWeek } from "@/lib/utils/crop-year";
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

  const grainWeek = getCurrentGrainWeek();

  // Fetch all data in parallel
  const [grainOverview, supplyData, sentimentData, xSignals, role, ...intelResults] = await Promise.all([
    getGrainOverview(),
    getSupplyDispositionForGrains(activeGrains),
    getSentimentOverview(CURRENT_CROP_YEAR, grainWeek),
    getLatestXSignals(20),
    getUserRole(),
    // Intelligence for each grain (for Market Pulse cards)
    ...activeGrains.map((slug) =>
      getGrainIntelligence(GRAIN_NAMES[slug] ?? slug)
    ),
  ]);

  // Build supply lookup by slug
  const supplyBySlug: Record<string, SupplyDisposition> = {};
  for (const row of supplyData) {
    supplyBySlug[row.grain_slug] = row;
  }

  // Build intelligence data lookup
  const intelBySlug: Record<string, GrainIntelligence | null> = {};
  activeGrains.forEach((slug, i) => {
    intelBySlug[slug] = intelResults[i] as GrainIntelligence | null;
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
            <CropSummaryCard key={card.slug} {...card} />
          ))}
        </div>
      </section>

      {/* Cross-grain farmer sentiment banner */}
      <SentimentBanner sentimentData={sentimentData} grainWeek={grainWeek} />

      {/* Cross-grain X signal tape — scrolling ticker of latest market signals */}
      {xSignals.length > 0 && (
        <SignalTape
          signals={xSignals.map((s) => ({
            sentiment: s.sentiment,
            category: s.category,
            post_summary: s.post_summary,
            grain: s.grain ?? "",
          }))}
        />
      )}

      {/* Market Pulse — condensed intelligence cards */}
      <MarketPulseSection intelBySlug={intelBySlug} grainNames={GRAIN_NAMES} activeGrains={activeGrains} />

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

// --- Market Pulse Section ---

const SENTIMENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  bullish: { bg: "bg-prairie/10", text: "text-prairie", label: "Bullish" },
  bearish: { bg: "bg-amber-500/10", text: "text-amber-600", label: "Bearish" },
  neutral: { bg: "bg-muted", text: "text-muted-foreground", label: "Neutral" },
};

function MarketPulseSection({
  intelBySlug,
  grainNames,
  activeGrains,
}: {
  intelBySlug: Record<string, GrainIntelligence | null>;
  grainNames: Record<string, string>;
  activeGrains: string[];
}) {
  const grainsWithIntel = activeGrains.filter(
    (slug) => intelBySlug[slug]?.thesis_title
  );

  const hasAny = grainsWithIntel.length > 0;

  return (
    <section>
      <h2 className="text-lg font-display font-semibold mb-4">Market Pulse</h2>

      {!hasAny && (
        <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Intelligence generating... Check back after the next Thursday data update.
          </p>
        </div>
      )}

      {hasAny && (
        <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grainsWithIntel.map((slug, i) => {
            const intel = intelBySlug[slug]!;
            const name = grainNames[slug] ?? slug;

            // Derive dominant sentiment from insight signals
            const signals = (intel.insights ?? []).map((i) => i.signal);
            const bullishCount = signals.filter((s) => s === "bullish").length;
            const bearishCount = signals.filter((s) => s === "bearish").length;
            const sentimentKey = bullishCount > bearishCount
              ? "bullish"
              : bearishCount > bullishCount
                ? "bearish"
                : "neutral";
            const style = SENTIMENT_STYLES[sentimentKey] ?? SENTIMENT_STYLES.neutral;

            // Truncate thesis body to ~150 characters
            const preview = intel.thesis_body
              ? intel.thesis_body.length > 150
                ? intel.thesis_body.slice(0, 147) + "..."
                : intel.thesis_body
              : "";

            return (
              <AnimatedCard key={slug} index={i}>
                <Link
                  href={`/grain/${slug}`}
                  className="group flex flex-col gap-2.5 rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-4 transition-colors duration-300 hover:border-canola/30 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-semibold text-sm text-foreground">
                      {name}
                    </h3>
                    <span className={`text-[0.6rem] font-semibold uppercase tracking-[2px] px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>

                  <p className="font-display text-base font-semibold text-foreground leading-snug">
                    {intel.thesis_title}
                  </p>

                  {preview && (
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
                      {preview}
                    </p>
                  )}

                  <span className="text-[0.6rem] font-medium uppercase tracking-[2px] text-canola mt-auto pt-1 group-hover:underline">
                    View Details
                  </span>
                </Link>
              </AnimatedCard>
            );
          })}
        </StaggerGroup>
      )}
    </section>
  );
}
