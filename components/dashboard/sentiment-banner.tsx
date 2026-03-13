"use client";

import { AnimatedCard } from "@/components/motion/animated-card";
import type { SentimentOverviewRow } from "@/lib/queries/sentiment";
import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SentimentBannerProps {
  sentimentData: SentimentOverviewRow[];
  grainWeek: number;
  unlockedSlugs?: string[];
}

/**
 * Overview dashboard banner showing cross-grain farmer sentiment.
 * Shows dominant direction ("78% holding this week") with per-grain mini gauges.
 */
export function SentimentBanner({
  sentimentData,
  grainWeek,
  unlockedSlugs = [],
}: SentimentBannerProps) {
  // Only show if we have meaningful data (>= 5 total voters across all grains)
  const totalVoters = sentimentData.reduce((s, r) => s + r.vote_count, 0);
  if (sentimentData.length === 0 || totalVoters < 5) {
    return (
      <AnimatedCard index={0}>
        <div className="rounded-xl border border-dashed border-canola/20 bg-canola/5 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Share your weekly outlook on any grain page to see community sentiment here.
          </p>
        </div>
      </AnimatedCard>
    );
  }

  // Calculate overall sentiment (weighted by vote count)
  const weightedHolding = sentimentData.reduce((s, r) => s + r.pct_holding * r.vote_count, 0) / totalVoters;
  const weightedHauling = sentimentData.reduce((s, r) => s + r.pct_hauling * r.vote_count, 0) / totalVoters;

  const dominantDirection = weightedHolding > weightedHauling ? "holding" : "hauling";
  const dominantPct = Math.round(dominantDirection === "holding" ? weightedHolding : weightedHauling);
  const unlockedSet = new Set(unlockedSlugs);

  return (
    <AnimatedCard index={0}>
      <div className="rounded-xl border border-canola/20 bg-gradient-to-r from-canola/5 to-background p-4 space-y-3">
        {/* Headline */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-display font-semibold">
              Week {grainWeek} Farmer Sentiment
            </h3>
            <p className="text-lg font-display font-bold mt-0.5">
              <span className={dominantDirection === "holding" ? "text-amber-600" : "text-prairie"}>
                {dominantPct}% of farmers are {dominantDirection}
              </span>
              <span className="text-muted-foreground font-normal text-sm ml-2">
                ({totalVoters} vote{totalVoters !== 1 ? "s" : ""})
              </span>
            </p>
          </div>
        </div>

        {/* Per-grain mini gauges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
          {sentimentData.map((row) => {
            const slug = row.grain.toLowerCase().replace(/ /g, "-");
            const isUnlocked = unlockedSet.has(slug);

            return (
              <Link
                key={row.grain}
                href={isUnlocked ? `/grain/${slug}` : "/my-farm"}
                className={cn(
                  "group flex flex-col gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-background/65",
                  !isUnlocked && "bg-background/35"
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium truncate">{row.grain}</span>
                  <div className="flex items-center gap-1 text-muted-foreground tabular-nums">
                    {!isUnlocked && <Lock className="h-3 w-3" />}
                    <span>{row.vote_count}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-muted flex">
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${row.pct_holding}%` }}
                  />
                  <div
                    className="h-full bg-muted-foreground/30 transition-all duration-500"
                    style={{ width: `${row.pct_neutral}%` }}
                  />
                  <div
                    className="h-full bg-prairie transition-all duration-500"
                    style={{ width: `${row.pct_hauling}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AnimatedCard>
  );
}
