import Link from "next/link";
import { Lock } from "lucide-react";
import { CropSummaryCard } from "@/components/dashboard/crop-summary-card";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { SentimentBanner } from "@/components/dashboard/sentiment-banner";
import { SignalTape } from "@/components/dashboard/signal-tape";
import { AnimatedCard } from "@/components/motion/animated-card";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { ALL_GRAINS } from "@/lib/constants/grains";
import { getGrainOverview } from "@/lib/queries/grains";
import { getGrainIntelligence, type GrainIntelligence } from "@/lib/queries/intelligence";
import { getSentimentOverview } from "@/lib/queries/sentiment";
import {
  getSupplyDispositionForGrains,
  type SupplyDisposition,
} from "@/lib/queries/supply-disposition";
import { getLatestXSignals } from "@/lib/queries/x-signals";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR, getCurrentGrainWeek } from "@/lib/utils/crop-year";
import { cn } from "@/lib/utils";
import { rethrowFrameworkError, safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

const FALLBACK_GRAINS = ["wheat", "canola", "barley", "oats", "lentils"];
const GRAIN_NAMES = Object.fromEntries(ALL_GRAINS.map((grain) => [grain.slug, grain.name]));

interface ActiveGrainContext {
  activeGrains: string[];
  unlockedSlugs: string[];
  isPersonalized: boolean;
}

interface SummaryCardData {
  grain: string;
  slug: string;
  startingStock: number;
  cyDeliveries: number;
  cwDeliveries: number;
  wowChange: number;
  isUnlocked: boolean;
  index: number;
}

interface SummarySectionData {
  summaryCards: SummaryCardData[];
  hasOverviewData: boolean;
  isPersonalized: boolean;
}

interface MarketPulseCard {
  slug: string;
  name: string;
  thesisTitle: string;
  thesisBody: string;
  sentimentKey: "bullish" | "bearish" | "neutral";
  isUnlocked: boolean;
}

interface MarketPulseData {
  cards: MarketPulseCard[];
  unavailable: boolean;
}

export default async function OverviewPage() {
  const grainContext = await getActiveGrainContext();
  const grainWeek = getCurrentGrainWeek();

  const [summaryResult, sentimentResult, signalsResult, marketPulseResult] =
    await Promise.all([
      safeQuery("Overview cards", () => buildSummarySection(grainContext)),
      safeQuery("Farmer sentiment", () => getSentimentOverview(CURRENT_CROP_YEAR, grainWeek)),
      safeQuery("Market signal tape", () => getLatestXSignals(20)),
      buildMarketPulse(grainContext),
    ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      {summaryResult.data ? (
        <SectionBoundary
          title="Overview cards unavailable"
          message="Crop summary cards are temporarily unavailable. The rest of the dashboard is still live."
        >
          <section className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-display font-semibold">
                  {summaryResult.data.isPersonalized
                    ? `${CURRENT_CROP_YEAR} Crop Year - Your Grains`
                    : `${CURRENT_CROP_YEAR} Prairie Grain Snapshot`}
                </h2>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {summaryResult.data.isPersonalized
                    ? "Your unlocked grains stay front and center here."
                    : "These are live prairie market snapshots. Add crops on My Farm to unlock grain-specific AI, pacing, and farm-level context."}
                </p>
              </div>
              {!summaryResult.data.isPersonalized && (
                <Link
                  href="/my-farm"
                  className="inline-flex items-center gap-2 rounded-full border border-canola/20 bg-canola/8 px-4 py-2 text-sm font-medium text-canola transition-colors hover:bg-canola/12"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Set up My Farm
                </Link>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {summaryResult.data.summaryCards.map((card) => (
                <CropSummaryCard key={card.slug} {...card} />
              ))}
            </div>
          </section>
        </SectionBoundary>
      ) : (
        <SectionStateCard
          title="Overview cards unavailable"
          message="Crop summary cards are temporarily unavailable. The rest of the dashboard is still live."
        />
      )}

      {sentimentResult.data ? (
        <SectionBoundary
          title="Farmer sentiment unavailable"
          message="Farmer sentiment is temporarily unavailable. Grain summaries and intelligence are still available."
        >
          <SentimentBanner
            sentimentData={sentimentResult.data}
            grainWeek={grainWeek}
            unlockedSlugs={grainContext.unlockedSlugs}
          />
        </SectionBoundary>
      ) : (
        <SectionStateCard
          title="Farmer sentiment unavailable"
          message="Farmer sentiment is temporarily unavailable. Grain summaries and intelligence are still available."
        />
      )}

      {signalsResult.data ? (
        signalsResult.data.length > 0 ? (
          <SectionBoundary
            title="Market signal tape unavailable"
            message="Live market signals are temporarily unavailable. Core CGC and supply data are still available."
          >
            <SignalTape
              signals={signalsResult.data.map((signal) => ({
                sentiment: signal.sentiment,
                category: signal.category,
                post_summary: signal.post_summary,
                post_url: signal.post_url ?? null,
                post_author: signal.post_author,
                grain: signal.grain ?? "",
                searched_at: signal.searched_at ?? null,
              }))}
            />
          </SectionBoundary>
        ) : null
      ) : (
        <SectionStateCard
          title="Market signal tape unavailable"
          message="Live market signals are temporarily unavailable. Core CGC and supply data are still available."
        />
      )}

      {marketPulseResult.unavailable ? (
        <SectionStateCard
          title="Market Pulse unavailable"
          message="Intelligence cards are temporarily unavailable. The rest of the dashboard is still live."
        />
      ) : (
        <SectionBoundary
          title="Market Pulse unavailable"
          message="Intelligence cards are temporarily unavailable. The rest of the dashboard is still live."
        >
          <MarketPulseSection cards={marketPulseResult.cards} />
        </SectionBoundary>
      )}

      {summaryResult.data && !summaryResult.data.hasOverviewData && (
        <SectionStateCard
          title="No grain data available yet"
          message='Run "npm run backfill" to load CGC data into Supabase.'
        />
      )}
    </div>
  );
}

async function getActiveGrainContext(): Promise<ActiveGrainContext> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        activeGrains: FALLBACK_GRAINS,
        unlockedSlugs: [],
        isPersonalized: false,
      };
    }

    const { data: plans } = await supabase
      .from("crop_plans")
      .select("grain")
      .eq("user_id", user.id)
      .eq("crop_year", CURRENT_CROP_YEAR);

    if (!plans || plans.length === 0) {
      return {
        activeGrains: FALLBACK_GRAINS,
        unlockedSlugs: [],
        isPersonalized: false,
      };
    }

    const slugs = plans.map((plan) => {
      const grain = ALL_GRAINS.find((item) => item.name === plan.grain);
      return grain?.slug ?? plan.grain.toLowerCase().replace(/ /g, "-");
    });

    return {
      activeGrains: slugs.length > 0 ? slugs : FALLBACK_GRAINS,
      unlockedSlugs: slugs,
      isPersonalized: slugs.length > 0,
    };
  } catch (error) {
    rethrowFrameworkError(error);
    console.error("getActiveGrainContext failed:", error);
    return {
      activeGrains: FALLBACK_GRAINS,
      unlockedSlugs: [],
      isPersonalized: false,
    };
  }
}

async function buildSummarySection(
  grainContext: ActiveGrainContext
): Promise<SummarySectionData> {
  const [grainOverview, supplyData] = await Promise.all([
    getGrainOverview(),
    getSupplyDispositionForGrains(grainContext.activeGrains),
  ]);

  const supplyBySlug: Record<string, SupplyDisposition> = {};
  for (const row of supplyData) {
    supplyBySlug[row.grain_slug] = row;
  }

  const unlockedSet = new Set(grainContext.unlockedSlugs);

  return {
    summaryCards: grainContext.activeGrains.map((slug, index) => {
      const overview = grainOverview.find((grain) => grain.slug === slug);
      const supply = supplyBySlug[slug];
      const startingStock = supply
        ? (supply.carry_in_kt ?? 0) + (supply.production_kt ?? 0)
        : 0;

      return {
        grain: GRAIN_NAMES[slug] ?? slug,
        slug,
        startingStock,
        cyDeliveries: overview?.cy_deliveries_kt ?? 0,
        cwDeliveries: overview?.cw_deliveries_kt ?? 0,
        wowChange: overview?.wow_pct_change ?? 0,
        isUnlocked: unlockedSet.has(slug),
        index,
      };
    }),
    hasOverviewData: grainOverview.length > 0,
    isPersonalized: grainContext.isPersonalized,
  };
}

async function buildMarketPulse(
  grainContext: ActiveGrainContext
): Promise<MarketPulseData> {
  const unlockedSet = new Set(grainContext.unlockedSlugs);
  const results = await Promise.all(
    grainContext.activeGrains.map((slug) =>
      safeQuery(`Market pulse for ${slug}`, () => getGrainIntelligence(GRAIN_NAMES[slug] ?? slug))
    )
  );

  return {
    cards: results.flatMap((result, index) => {
      const slug = grainContext.activeGrains[index];
      const intelligence = result.data;

      if (!intelligence?.thesis_title) {
        return [];
      }

      return [
        {
          slug,
          name: GRAIN_NAMES[slug] ?? slug,
          thesisTitle: intelligence.thesis_title,
          thesisBody: intelligence.thesis_body ?? "",
          sentimentKey: deriveSentimentKey(intelligence),
          isUnlocked: unlockedSet.has(slug),
        },
      ];
    }),
    unavailable: results.every((result) => result.error !== null),
  };
}

function deriveSentimentKey(
  intelligence: GrainIntelligence
): "bullish" | "bearish" | "neutral" {
  const signals = (intelligence.insights ?? []).map((insight) => insight.signal);
  const bullishCount = signals.filter((signal) => signal === "bullish").length;
  const bearishCount = signals.filter((signal) => signal === "bearish").length;

  if (bullishCount > bearishCount) {
    return "bullish";
  }

  if (bearishCount > bullishCount) {
    return "bearish";
  }

  return "neutral";
}

const SENTIMENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  bullish: { bg: "bg-prairie/10", text: "text-prairie", label: "Bullish" },
  bearish: { bg: "bg-amber-500/10", text: "text-amber-600", label: "Bearish" },
  neutral: { bg: "bg-muted", text: "text-muted-foreground", label: "Neutral" },
};

function MarketPulseSection({ cards }: { cards: MarketPulseCard[] }) {
  if (cards.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-display font-semibold">Market Pulse</h2>
        <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Intelligence is generating. Check back after the next Thursday data update.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-display font-semibold">Market Pulse</h2>
      <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => {
          const style = SENTIMENT_STYLES[card.sentimentKey] ?? SENTIMENT_STYLES.neutral;
          const preview =
            card.thesisBody.length > 150
              ? `${card.thesisBody.slice(0, 147)}...`
              : card.thesisBody;

          return (
            <AnimatedCard key={card.slug} index={index}>
              <Link
                href={card.isUnlocked ? `/grain/${card.slug}` : "/my-farm"}
                className={cn(
                  "group flex h-full flex-col gap-2.5 rounded-xl border border-border/40 bg-card/40 p-4 backdrop-blur-sm transition-colors duration-300 hover:border-canola/30 hover:shadow-lg",
                  !card.isUnlocked && "border-canola/20 bg-canola/5"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-display font-semibold text-foreground">
                    {card.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[2px] ${style.bg} ${style.text}`}
                    >
                      {style.label}
                    </span>
                    {!card.isUnlocked && (
                      <span className="rounded-full border border-canola/20 bg-canola/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[2px] text-canola">
                        Locked
                      </span>
                    )}
                  </div>
                </div>

                <p className="font-display text-base font-semibold leading-snug text-foreground">
                  {card.thesisTitle}
                </p>

                {preview && (
                  <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {preview}
                  </p>
                )}

                <span className="mt-auto pt-1 text-[0.6rem] font-medium uppercase tracking-[2px] text-canola group-hover:underline">
                  {card.isUnlocked ? "View Details" : "Unlock on My Farm"}
                </span>
              </Link>
            </AnimatedCard>
          );
        })}
      </StaggerGroup>
    </section>
  );
}
