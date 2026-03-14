"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { voteSentimentFromFarm } from "@/app/(dashboard)/my-farm/sentiment-actions";
import type { UserRole } from "@/lib/auth/role-guard";
import type { SentimentOverviewRow } from "@/lib/queries/sentiment";

const SENTIMENT_OPTIONS = [
  { value: 1, label: "Strongly Holding", short: "Strong Hold", icon: "\u{1F512}" },
  { value: 2, label: "Holding", short: "Hold", icon: "\u{1F4E6}" },
  { value: 3, label: "Neutral", short: "Neutral", icon: "\u2696\uFE0F" },
  { value: 4, label: "Hauling", short: "Haul", icon: "\u{1F69C}" },
  { value: 5, label: "Strongly Hauling", short: "Strong Haul", icon: "\u{1F69B}" },
] as const;

const springTransition = { type: "spring" as const, damping: 20, stiffness: 300 };

interface GrainInfo {
  name: string;
  slug: string;
}

interface MultiGrainSentimentProps {
  grains: GrainInfo[];
  grainWeek: number;
  cropYear: string;
  role: string;
  initialVotes?: Record<string, number | null>;
  sentimentOverview?: SentimentOverviewRow[];
}

export function MultiGrainSentiment({
  grains,
  grainWeek,
  cropYear,
  role,
  initialVotes = {},
  sentimentOverview = [],
}: MultiGrainSentimentProps) {
  const isObserver = role === "observer";

  if (grains.length === 0) {
    return null;
  }

  return (
    <GlassCard hover={false}>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold">
            How are you feeling?
          </h3>
          <span className="text-xs font-medium text-muted-foreground">
            Week {grainWeek}
          </span>
        </div>
        {isObserver && (
          <p className="text-sm text-muted-foreground">
            Sign up as a farmer to share your market outlook and see how others feel.
          </p>
        )}
        <div className="space-y-3">
          {grains.map((grain, i) => (
            <GrainSentimentRow
              key={grain.slug}
              grain={grain}
              grainWeek={grainWeek}
              cropYear={cropYear}
              isObserver={isObserver}
              initialVote={initialVotes[grain.name] ?? null}
              aggregate={sentimentOverview.find((r) => r.grain === grain.name) ?? null}
              index={i}
            />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

interface GrainSentimentRowProps {
  grain: GrainInfo;
  grainWeek: number;
  cropYear: string;
  isObserver: boolean;
  initialVote: number | null;
  aggregate: SentimentOverviewRow | null;
  index: number;
}

function GrainSentimentRow({
  grain,
  grainWeek,
  cropYear,
  isObserver,
  initialVote,
  aggregate,
  index,
}: GrainSentimentRowProps) {
  const [userVote, setUserVote] = useState<number | null>(initialVote);
  const [hasVoted, setHasVoted] = useState(initialVote !== null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleVote(sentiment: number) {
    const previousVote = userVote;
    const previousHasVoted = hasVoted;
    setError(null);
    setUserVote(sentiment);

    startTransition(async () => {
      const result = await voteSentimentFromFarm(
        grain.name,
        grainWeek,
        cropYear,
        sentiment
      );
      if (result.success) {
        setHasVoted(true);
        return;
      }
      setUserVote(previousVote);
      setHasVoted(previousHasVoted);
      setError(result.error ?? "Sentiment voting is temporarily unavailable.");
    });
  }

  return (
    <motion.div
      className="space-y-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springTransition, delay: index * 0.04 }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold min-w-[80px] text-foreground">
          {grain.name}
        </span>

        {!isObserver && (
          <div className="flex gap-1.5">
            {SENTIMENT_OPTIONS.map((option) => (
              <motion.button
                key={option.value}
                onClick={() => handleVote(option.value)}
                disabled={isPending}
                whileTap={{ scale: 0.92 }}
                whileHover={{ scale: 1.08 }}
                transition={springTransition}
                className={cn(
                  "flex items-center justify-center rounded-md border px-2 py-1.5 text-base transition-colors",
                  "hover:border-canola/50 hover:bg-canola/5",
                  userVote === option.value
                    ? "border-canola bg-canola/10 ring-1 ring-canola/30"
                    : "border-border/50 bg-background",
                  isPending && "opacity-60 cursor-wait"
                )}
                title={option.label}
              >
                <span>{option.icon}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive ml-[92px]">
          {error}
        </div>
      )}

      <AnimatePresence>
        {hasVoted && aggregate && (
          <motion.div
            className="ml-[92px]"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ ...springTransition, delay: 0.05 }}
          >
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="text-amber-600">{aggregate.pct_holding}% holding</span>
              <span>{aggregate.pct_neutral}% neutral</span>
              <span className="text-prairie">{aggregate.pct_hauling}% hauling</span>
              <span className="text-muted-foreground/60">({aggregate.vote_count})</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full overflow-hidden bg-muted flex">
              <div
                className="h-full bg-amber-500 transition-all duration-500"
                style={{ width: `${aggregate.pct_holding}%` }}
              />
              <div
                className="h-full bg-muted-foreground/30 transition-all duration-500"
                style={{ width: `${aggregate.pct_neutral}%` }}
              />
              <div
                className="h-full bg-prairie transition-all duration-500"
                style={{ width: `${aggregate.pct_hauling}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
