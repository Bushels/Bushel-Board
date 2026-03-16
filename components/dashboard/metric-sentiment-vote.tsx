"use client";

import { useState, useTransition } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/auth/role-guard";

export type MetricType = "deliveries" | "processing" | "exports" | "stocks";

export interface MetricSentimentAggregates {
  bullish_count: number;
  bearish_count: number;
  total_votes: number;
}

interface MetricSentimentVoteProps {
  metric: MetricType;
  grain: string;
  userVote: "bullish" | "bearish" | null;
  aggregates: MetricSentimentAggregates | null;
  role: UserRole;
  onVote: (
    metric: string,
    sentiment: "bullish" | "bearish"
  ) => Promise<{ error?: string }>;
}

export function MetricSentimentVote({
  metric,
  grain,
  userVote: initialVote,
  aggregates: initialAggregates,
  role,
  onVote,
}: MetricSentimentVoteProps) {
  const [userVote, setUserVote] = useState<"bullish" | "bearish" | null>(
    initialVote
  );
  const [aggregates, setAggregates] =
    useState<MetricSentimentAggregates | null>(initialAggregates);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isObserver = role === "observer";

  const bullishPct =
    aggregates && aggregates.total_votes > 0
      ? Math.round((aggregates.bullish_count / aggregates.total_votes) * 100)
      : null;

  function handleVote(sentiment: "bullish" | "bearish") {
    const previousVote = userVote;
    const previousAggregates = aggregates;
    setError(null);

    // Optimistic update
    setUserVote(sentiment);
    if (aggregates) {
      const wasVoted = previousVote !== null;
      const newAgg = { ...aggregates };
      if (wasVoted && previousVote !== sentiment) {
        // Switching vote
        newAgg[`${previousVote}_count` as keyof MetricSentimentAggregates] -= 1;
        newAgg[`${sentiment}_count` as keyof MetricSentimentAggregates] += 1;
      } else if (!wasVoted) {
        // New vote
        newAgg[`${sentiment}_count` as keyof MetricSentimentAggregates] += 1;
        newAgg.total_votes += 1;
      }
      setAggregates(newAgg);
    } else {
      // First vote ever
      setAggregates({
        bullish_count: sentiment === "bullish" ? 1 : 0,
        bearish_count: sentiment === "bearish" ? 1 : 0,
        total_votes: 1,
      });
    }

    startTransition(async () => {
      const result = await onVote(metric, sentiment);
      if (result.error) {
        // Rollback
        setUserVote(previousVote);
        setAggregates(previousAggregates);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Vote buttons — hidden for observers */}
      {!isObserver && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleVote("bullish")}
            disabled={isPending}
            aria-label={`Vote bullish on ${metric}`}
            className={cn(
              "inline-flex items-center justify-center rounded-md p-1 transition-colors",
              "hover:bg-prairie/10",
              userVote === "bullish"
                ? "bg-prairie/15 text-prairie ring-1 ring-prairie/30"
                : "text-muted-foreground hover:text-prairie",
              isPending && "opacity-60 cursor-wait"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleVote("bearish")}
            disabled={isPending}
            aria-label={`Vote bearish on ${metric}`}
            className={cn(
              "inline-flex items-center justify-center rounded-md p-1 transition-colors",
              "hover:bg-amber-500/10",
              userVote === "bearish"
                ? "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30"
                : "text-muted-foreground hover:text-amber-600",
              isPending && "opacity-60 cursor-wait"
            )}
          >
            <TrendingDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Aggregate display */}
      {aggregates && aggregates.total_votes > 0 && bullishPct !== null && (
        <span
          className={cn(
            "text-xs tabular-nums",
            bullishPct >= 50 ? "text-prairie" : "text-amber-600"
          )}
        >
          {bullishPct}% bullish
        </span>
      )}

      {/* Error tooltip */}
      {error && (
        <span className="text-xs text-destructive truncate max-w-[120px]">
          {error}
        </span>
      )}
    </div>
  );
}
