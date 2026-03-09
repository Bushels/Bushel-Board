"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { voteSentiment } from "@/app/(dashboard)/grain/[slug]/actions";

const SENTIMENT_OPTIONS = [
  { value: 1, label: "Strongly Holding", short: "Strong Hold", icon: "🔒" },
  { value: 2, label: "Holding", short: "Hold", icon: "📦" },
  { value: 3, label: "Neutral", short: "Neutral", icon: "⚖️" },
  { value: 4, label: "Hauling", short: "Haul", icon: "🚜" },
  { value: 5, label: "Strongly Hauling", short: "Strong Haul", icon: "🚛" },
] as const;

interface SentimentPollProps {
  grain: string;
  grainWeek: number;
  initialVote: number | null;
  initialAggregate: {
    vote_count: number;
    avg_sentiment: number;
    pct_hauling: number;
    pct_holding: number;
    pct_neutral: number;
  } | null;
}

export function SentimentPoll({
  grain,
  grainWeek,
  initialVote,
  initialAggregate,
}: SentimentPollProps) {
  const [userVote, setUserVote] = useState<number | null>(initialVote);
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [isPending, startTransition] = useTransition();
  const [hasVoted, setHasVoted] = useState(initialVote !== null);

  function handleVote(sentiment: number) {
    setUserVote(sentiment);

    startTransition(async () => {
      const result = await voteSentiment(grain, sentiment, grainWeek);
      if (result.success) {
        setHasVoted(true);
        // Optimistically update aggregate (will be corrected on next page load)
        if (aggregate) {
          setAggregate({ ...aggregate });
        }
      }
    });
  }

  return (
    <Card className="border-canola/20 bg-gradient-to-br from-background to-canola/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center justify-between">
          <span>Week {grainWeek} Farmer Sentiment</span>
          {hasVoted && aggregate && (
            <span className="text-xs font-sans font-normal text-muted-foreground">
              {aggregate.vote_count} farmer{aggregate.vote_count !== 1 ? "s" : ""} voted
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Are you holding or hauling {grain.toLowerCase()} this week?
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vote buttons */}
        <div className="flex gap-2">
          {SENTIMENT_OPTIONS.map((option, i) => (
            <button
              key={option.value}
              onClick={() => handleVote(option.value)}
              disabled={isPending}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-all",
                "hover:border-canola/50 hover:bg-canola/5",
                "animate-in fade-in slide-in-from-bottom-2",
                userVote === option.value
                  ? "border-canola bg-canola/10 ring-1 ring-canola/30 font-semibold"
                  : "border-border/50 bg-background",
                isPending && "opacity-60 cursor-wait"
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="text-lg">{option.icon}</span>
              <span className="hidden sm:inline">{option.short}</span>
            </button>
          ))}
        </div>

        {/* Results gauge (shown after voting) */}
        {hasVoted && aggregate && (
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Labels */}
            <div className="flex justify-between text-xs font-medium">
              <span className="text-amber-600">
                Holding {aggregate.pct_holding}%
              </span>
              <span className="text-muted-foreground">
                {aggregate.pct_neutral}% neutral
              </span>
              <span className="text-prairie">
                Hauling {aggregate.pct_hauling}%
              </span>
            </div>
            {/* Gauge bar */}
            <div className="h-3 rounded-full overflow-hidden bg-muted flex">
              <div
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${aggregate.pct_holding}%` }}
              />
              <div
                className="bg-muted-foreground/30 transition-all duration-500"
                style={{ width: `${aggregate.pct_neutral}%` }}
              />
              <div
                className="bg-prairie transition-all duration-500"
                style={{ width: `${aggregate.pct_hauling}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
