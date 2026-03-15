"use client";

import { useState, useTransition } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { voteMetricSentiment } from "@/app/(dashboard)/grain/[slug]/metric-actions";
import type { UserRole } from "@/lib/auth/role-guard";
import type { MetricSentimentAggregate } from "@/lib/queries/metric-sentiment";

interface MetricVoteButtonProps {
  grain: string;
  grainWeek: number;
  metric: string;
  initialVote: string | null;
  aggregate: MetricSentimentAggregate | null;
  role?: UserRole;
}

export function MetricVoteButton({
  grain,
  grainWeek,
  metric,
  initialVote,
  aggregate,
  role = "farmer",
}: MetricVoteButtonProps) {
  const [userVote, setUserVote] = useState<string | null>(initialVote);
  const [currentAggregate, setCurrentAggregate] =
    useState<MetricSentimentAggregate | null>(aggregate);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const isObserver = role === "observer";
  const showAggregate =
    currentAggregate && currentAggregate.total_votes >= 3;

  function handleVote(sentiment: "bullish" | "bearish") {
    if (isObserver || isPending) return;

    const previousVote = userVote;
    const previousAggregate = currentAggregate;

    // Optimistic update
    setError(null);
    setUserVote(sentiment);

    // Optimistically adjust aggregate counts
    if (currentAggregate) {
      const agg = { ...currentAggregate };
      // Remove previous vote
      if (previousVote === "bullish") {
        agg.bullish_count = Math.max(0, agg.bullish_count - 1);
        agg.total_votes = Math.max(0, agg.total_votes - 1);
      } else if (previousVote === "bearish") {
        agg.bearish_count = Math.max(0, agg.bearish_count - 1);
        agg.total_votes = Math.max(0, agg.total_votes - 1);
      }
      // Add new vote
      if (sentiment === "bullish") {
        agg.bullish_count += 1;
      } else {
        agg.bearish_count += 1;
      }
      agg.total_votes += 1;
      agg.bullish_pct =
        agg.total_votes > 0
          ? Math.round((agg.bullish_count / agg.total_votes) * 100)
          : 0;
      setCurrentAggregate(agg);
    } else {
      // First vote, create aggregate
      setCurrentAggregate({
        metric,
        bullish_count: sentiment === "bullish" ? 1 : 0,
        bearish_count: sentiment === "bearish" ? 1 : 0,
        total_votes: 1,
        bullish_pct: sentiment === "bullish" ? 100 : 0,
      });
    }

    startTransition(async () => {
      const result = await voteMetricSentiment(
        grain,
        grainWeek,
        metric,
        sentiment
      );

      if (!result.success) {
        // Revert optimistic update
        setUserVote(previousVote);
        setCurrentAggregate(previousAggregate);
        setError(result.error ?? "Vote failed. Please try again.");
      }
    });
  }

  const motionProps = prefersReducedMotion
    ? {}
    : { whileTap: { scale: 0.9 } };

  return (
    <div className="flex items-center gap-1">
      {/* Bullish button */}
      {!isObserver && (
        <motion.button
          onClick={() => handleVote("bullish")}
          disabled={isPending}
          aria-label={`Vote bullish on ${metric}`}
          title={error ?? `Vote bullish on ${metric}`}
          className={cn(
            "inline-flex items-center justify-center rounded-md p-1.5 transition-colors",
            userVote === "bullish"
              ? "bg-prairie/15 text-prairie"
              : "text-muted-foreground/40 hover:text-prairie hover:bg-prairie/10",
            isPending && "opacity-60 cursor-wait"
          )}
          {...motionProps}
        >
          <TrendingUp className="h-3.5 w-3.5" />
        </motion.button>
      )}

      {/* Aggregate text */}
      {showAggregate && (
        <span
          className={cn(
            "text-xs tabular-nums",
            currentAggregate.bullish_pct >= 50
              ? "text-prairie"
              : "text-red-500"
          )}
        >
          {currentAggregate.bullish_pct}%
          {currentAggregate.bullish_pct >= 50 ? "\u2191" : "\u2193"}
        </span>
      )}

      {/* Bearish button */}
      {!isObserver && (
        <motion.button
          onClick={() => handleVote("bearish")}
          disabled={isPending}
          aria-label={`Vote bearish on ${metric}`}
          title={error ?? `Vote bearish on ${metric}`}
          className={cn(
            "inline-flex items-center justify-center rounded-md p-1.5 transition-colors",
            userVote === "bearish"
              ? "bg-red-500/15 text-red-500"
              : "text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10",
            isPending && "opacity-60 cursor-wait"
          )}
          {...motionProps}
        >
          <TrendingDown className="h-3.5 w-3.5" />
        </motion.button>
      )}
    </div>
  );
}
