"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { voteSentiment } from "@/app/(dashboard)/grain/[slug]/actions";
import { YourImpact } from "./your-impact";
import { MicroCelebration, useCelebration } from "@/components/motion/micro-celebration";
import type { UserRole } from "@/lib/auth/role-guard";

const SENTIMENT_OPTIONS = [
  { value: 1, label: "Strongly Holding", short: "Strong Hold", icon: "🔒" },
  { value: 2, label: "Holding", short: "Hold", icon: "📦" },
  { value: 3, label: "Neutral", short: "Neutral", icon: "⚖️" },
  { value: 4, label: "Hauling", short: "Haul", icon: "🚜" },
  { value: 5, label: "Strongly Hauling", short: "Strong Haul", icon: "🚛" },
] as const;

const springTransition = { type: "spring" as const, damping: 20, stiffness: 300 };

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
  role?: UserRole;
}

export function SentimentPoll({
  grain,
  grainWeek,
  initialVote,
  initialAggregate,
  role = "farmer",
}: SentimentPollProps) {
  const [userVote, setUserVote] = useState<number | null>(initialVote);
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [isPending, startTransition] = useTransition();
  const [hasVoted, setHasVoted] = useState(initialVote !== null);
  const [error, setError] = useState<string | null>(null);
  const celebration = useCelebration("firstVote");

  const isObserver = role === "observer";

  function handleVote(sentiment: number) {
    const previousVote = userVote;
    const previousHasVoted = hasVoted;
    setError(null);
    setUserVote(sentiment);

    startTransition(async () => {
      const result = await voteSentiment(grain, sentiment, grainWeek);
      if (result.success) {
        setHasVoted(true);
        celebration.trigger();
        if (aggregate) {
          setAggregate({ ...aggregate });
        }
        return;
      }

      setUserVote(previousVote);
      setHasVoted(previousHasVoted);
      setError(result.error ?? "Sentiment voting is temporarily unavailable.");
    });
  }

  return (
    <MicroCelebration isActive={celebration.isActive}>
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
            {isObserver
              ? "Sign up as a farmer to share your market outlook and see how others feel."
              : `Are you holding or hauling ${grain.toLowerCase()} this week?`}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Vote buttons — hidden for observers */}
          {!isObserver && (
            <div className="space-y-3">
              <div className="flex gap-2">
              {SENTIMENT_OPTIONS.map((option, i) => (
                <motion.button
                  key={option.value}
                  onClick={() => handleVote(option.value)}
                  disabled={isPending}
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.03 }}
                  animate={
                    userVote === option.value
                      ? { scale: 1.0 }
                      : { scale: 1 }
                  }
                  transition={
                    userVote === option.value
                      ? { type: "spring" as const, damping: 8, stiffness: 400 }
                      : springTransition
                  }
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors",
                    "hover:border-canola/50 hover:bg-canola/5",
                    userVote === option.value
                      ? "border-canola bg-canola/10 ring-1 ring-canola/30 font-semibold"
                      : "border-border/50 bg-background",
                    isPending && "opacity-60 cursor-wait"
                  )}
                  style={{ transitionDelay: `${i * 40}ms` }}
                >
                  <span className="text-lg">{option.icon}</span>
                  <span className="hidden sm:inline">{option.short}</span>
                </motion.button>
              ))}
              </div>
              {error && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Results gauge (shown after voting or for observers with data) */}
          <AnimatePresence>
            {hasVoted && aggregate && (
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springTransition, delay: 0.1 }}
              >
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
                <div className="h-3 rounded-full overflow-hidden bg-muted flex">
                  <motion.div
                    className="bg-amber-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${aggregate.pct_holding}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <motion.div
                    className="bg-muted-foreground/30"
                    initial={{ width: 0 }}
                    animate={{ width: `${aggregate.pct_neutral}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
                  />
                  <motion.div
                    className="bg-prairie"
                    initial={{ width: 0 }}
                    animate={{ width: `${aggregate.pct_hauling}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Your impact indicator */}
          {hasVoted && !isObserver && (
            <YourImpact message="Your vote shapes the weekly sentiment gauge for all prairie farmers." />
          )}
        </CardContent>
      </Card>
    </MicroCelebration>
  );
}
