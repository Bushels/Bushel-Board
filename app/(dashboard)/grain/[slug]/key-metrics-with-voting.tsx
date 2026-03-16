"use client";

import { KeyMetricsCards, type KeyMetric } from "@/components/dashboard/key-metrics-cards";
import type { MetricSentimentAggregates } from "@/components/dashboard/metric-sentiment-vote";
import type { UserRole } from "@/lib/auth/role-guard";
import { voteMetricSentiment } from "./metric-actions";

interface KeyMetricsWithVotingProps {
  metrics: KeyMetric[];
  grain: string;
  grainWeek: number;
  role: UserRole;
  userVotes: Record<string, "bullish" | "bearish" | null>;
  aggregates: Record<string, MetricSentimentAggregates | null>;
}

export function KeyMetricsWithVoting({
  metrics,
  grain,
  grainWeek,
  role,
  userVotes,
  aggregates,
}: KeyMetricsWithVotingProps) {
  async function handleVote(
    metric: string,
    sentiment: "bullish" | "bearish"
  ): Promise<{ error?: string }> {
    const result = await voteMetricSentiment(grain, grainWeek, metric, sentiment);
    if (result.error) return { error: result.error };
    return {};
  }

  return (
    <KeyMetricsCards
      metrics={metrics}
      grain={grain}
      role={role}
      userVotes={userVotes}
      aggregates={aggregates}
      onVote={handleVote}
    />
  );
}
