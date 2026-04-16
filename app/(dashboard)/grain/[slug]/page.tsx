import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { BullBearCards } from "@/components/dashboard/bull-bear-cards";
import { GlassCard } from "@/components/ui/glass-card";
import { MarketStanceBadge } from "@/components/ui/market-stance-badge";
import { Button } from "@/components/ui/button";
import { PriceSparkline } from "@/components/dashboard/price-sparkline";
import { getGrainBySlug, getGrainOverviewBySlug } from "@/lib/queries/grains";
import { getGrainIntelligence, getMarketAnalysis } from "@/lib/queries/intelligence";
import { getRecentPrices } from "@/lib/queries/grain-prices";
import { GrainBushyChat } from "@/components/bushy/grain-bushy-chat";
import { GrainFarmProgress } from "@/components/dashboard/grain-farm-progress";
import { getDisplayWeek } from "@/lib/queries/data-freshness";
import { deriveRecommendation } from "@/lib/utils/recommendations";

import { createClient } from "@/lib/supabase/server";
import { CURRENT_CROP_YEAR, cropYearLabel, getCurrentGrainWeek, grainWeekEndDate } from "@/lib/utils/crop-year";
import { safeQuery } from "@/lib/utils/safe-query";
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

  const displayWeek = await getDisplayWeek();

  const [
    marketCoreResult,
    pricesResult,
  ] = await Promise.all([
    safeQuery("Market intelligence", async () => {
      const [intelligence, grainOverview, marketAnalysis] = await Promise.all([
        getGrainIntelligence(grain.name),
        getGrainOverviewBySlug(grain.slug),
        getMarketAnalysis(grain.name),
      ]);
      return { intelligence, grainOverview, marketAnalysis };
    }),
    safeQuery("Recent prices", () => getRecentPrices(grain.name)),
  ]);

  const marketCore = marketCoreResult.error ? null : marketCoreResult.data;
  const intelligence = marketCore?.intelligence ?? null;
  const marketAnalysis = marketCore?.marketAnalysis ?? null;
  // Compute recommendation from crop plan data
  const totalKt = Number(userPlan.planned_kt ?? 0);
  const deliveredKt = Number(userPlan.delivered_kt ?? 0);
  const contractedKt = Number(userPlan.contracted_kt ?? 0);
  const openKt = Math.max(0, totalKt - deliveredKt - contractedKt);
  const deliveredPct = totalKt > 0 ? (deliveredKt / totalKt) * 100 : 0;

  const marketStance: "bullish" | "bearish" | "neutral" = marketAnalysis?.stance_score != null
    ? marketAnalysis.stance_score >= 20 ? "bullish"
      : marketAnalysis.stance_score <= -20 ? "bearish" : "neutral"
    : "neutral";

  const recommendation = deriveRecommendation({
    marketStance,
    stanceScore: marketAnalysis?.stance_score,
    deliveryPacePct: deliveredPct,
    contractedPct: totalKt > 0 ? (contractedKt / totalKt) * 100 : 0,
    uncontractedKt: openKt,
    totalPlannedKt: totalKt,
  });

  return (
    <GrainPageTransition>
      <div className="space-y-10">
        {/* ========== HERO SECTION ========== */}
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
                {(intelligence || marketAnalysis) && (
                  <MarketStanceBadge
                    stance={
                      marketAnalysis?.stance_score != null
                        ? marketAnalysis.stance_score >= 20
                          ? "bullish"
                          : marketAnalysis.stance_score <= -20
                            ? "bearish"
                            : "neutral"
                        : deriveStanceFromThesis(intelligence?.thesis_title ?? "")
                    }
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
                  Week {displayWeek}
                  <span className="text-muted-foreground/60">
                    (ended {grainWeekEndDate(displayWeek).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})
                  </span>
                </span>
                {displayWeek < getCurrentGrainWeek() && (
                  <>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Data lag
                    </span>
                  </>
                )}
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

        {/* ========== MARKET THESIS ========== */}
        {marketAnalysis && (
          <section className="space-y-6">
            <SectionHeader
              title="Market Thesis"
              subtitle="AI analysis with US and Canadian market data"
            />
            <SectionBoundary
              title="Market thesis unavailable"
              message="The market analysis is temporarily unavailable."
            >
              <BullBearCards
                bullCase={marketAnalysis.bull_case}
                bearCase={marketAnalysis.bear_case}
                confidence={marketAnalysis.data_confidence}
                confidenceScore={marketAnalysis.confidence_score ?? undefined}
                stanceScore={marketAnalysis.stance_score}
                finalAssessment={marketAnalysis.final_assessment ?? undefined}
                bullReasoning={marketAnalysis.bull_reasoning}
                bearReasoning={marketAnalysis.bear_reasoning}
              />
            </SectionBoundary>
          </section>
        )}

        {/* ========== ASK BUSHY ========== */}
        <section className="space-y-6">
          <SectionHeader
            title="Ask Bushy"
            subtitle={`Ask anything about ${grain.name} this week`}
          />
          <GrainBushyChat grainName={grain.name} grainWeek={displayWeek} />
        </section>

        {/* ========== MY FARM ========== */}
        <section className="space-y-6">
          <SectionHeader
            title={`My Farm \u00b7 ${grain.name}`}
            subtitle="Your delivery and contract progress"
          />
          <GrainFarmProgress
            grainName={grain.name}
            deliveredKt={deliveredKt}
            contractedKt={contractedKt}
            openKt={openKt}
            totalKt={totalKt}
            recommendation={recommendation}
            deliveredPct={deliveredPct}
          />
        </section>
      </div>
    </GrainPageTransition>
  );
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
