"use client";

import { useState, useTransition, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Radio, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { voteSignalRelevance } from "@/app/(dashboard)/grain/[slug]/signal-actions";
import { useCelebration, MicroCelebration } from "@/components/motion/micro-celebration";
import { YourImpact } from "@/components/dashboard/your-impact";
import type { XSignalWithFeedback } from "@/lib/queries/x-signals";
import type { UserRole } from "@/lib/auth/role-guard";

const sentimentColors: Record<string, string> = {
  bullish: "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
  bearish: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  neutral: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
};

const categoryLabels: Record<string, string> = {
  farmer_report: "Farmer Report",
  analyst_commentary: "Analyst",
  elevator_bid: "Elevator Bid",
  export_news: "Export News",
  weather: "Weather",
  policy: "Policy",
  other: "Other",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.04,
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  }),
};

const springTap = { scale: 0.95 };
const springHover = { scale: 1.02 };

interface XSignalFeedProps {
  signals: XSignalWithFeedback[];
  grain: string;
  grainWeek: number;
  cropYear: string;
  role?: UserRole;
}

export function XSignalFeed({
  signals,
  grain,
  grainWeek,
  cropYear,
  role = "farmer",
}: XSignalFeedProps) {
  const [localSignals, setLocalSignals] = useState(signals);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const celebration = useCelebration("firstSignalVote");

  const isObserver = role === "observer";
  const votedCount = localSignals.filter((s) => s.user_voted).length;
  const relevantCount = localSignals.filter(
    (s) => s.user_voted && s.user_relevant === true
  ).length;

  function handleVote(signalId: string, relevant: boolean) {
    // Optimistic update
    setLocalSignals((prev) =>
      prev.map((s) =>
        s.id === signalId
          ? { ...s, user_voted: true, user_relevant: relevant }
          : s
      )
    );

    // Trigger micro-celebration on first vote
    celebration.trigger();

    startTransition(async () => {
      const result = await voteSignalRelevance(
        signalId,
        relevant,
        grain,
        cropYear,
        grainWeek
      );
      if (result.error) {
        // Revert on error
        setLocalSignals((prev) =>
          prev.map((s) =>
            s.id === signalId
              ? { ...s, user_voted: false, user_relevant: null }
              : s
          )
        );
      }
    });
  }

  function scrollBy(direction: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  if (localSignals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-6 text-center">
        <Radio className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No X signals scored for {grain} this week. Check back after Thursday.
        </p>
      </div>
    );
  }

  return (
    <MicroCelebration isActive={celebration.isActive}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-canola" />
            Market Signals from X
          </h2>
          <span className="text-xs text-muted-foreground">
            Week {grainWeek} &middot; {localSignals.length} post
            {localSignals.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Observer nudge */}
        {isObserver && (
          <p className="text-xs text-muted-foreground bg-canola/5 border border-canola/10 rounded-lg px-3 py-2">
            Farmer accounts can rate signals to improve feed quality for the community.
          </p>
        )}

        {/* Scrollable card strip */}
        <div className="relative group">
          {/* Scroll arrows */}
          <button
            type="button"
            onClick={() => scrollBy("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 hidden sm:group-hover:flex h-8 w-8 items-center justify-center rounded-full bg-background/90 border border-border shadow-sm hover:bg-muted transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 hidden sm:group-hover:flex h-8 w-8 items-center justify-center rounded-full bg-background/90 border border-border shadow-sm hover:bg-muted transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide"
            style={{ scrollbarWidth: "none" }}
          >
            {localSignals.map((signal, i) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                index={i}
                isPending={isPending}
                onVote={handleVote}
                isObserver={isObserver}
              />
            ))}
          </div>
        </div>

        {/* Your impact summary bar */}
        <AnimatePresence>
          {votedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-lg border border-canola/20 bg-gradient-to-r from-canola/5 to-transparent p-3"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-canola/10">
                <Check className="h-4 w-4 text-canola" />
              </div>
              <div className="text-sm">
                <span className="font-medium">
                  You rated {votedCount}/{localSignals.length} posts
                </span>
                {relevantCount > 0 && (
                  <span className="text-muted-foreground">
                    {" "}&middot; {relevantCount} relevant to your farm
                  </span>
                )}
                <span className="text-muted-foreground">
                  {" "}&middot; Your feed is getting smarter
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Your impact indicator */}
        {votedCount > 0 && (
          <YourImpact variant="signal" />
        )}
      </div>
    </MicroCelebration>
  );
}

function SignalCard({
  signal,
  index,
  isPending,
  onVote,
  isObserver,
}: {
  signal: XSignalWithFeedback;
  index: number;
  isPending: boolean;
  onVote: (signalId: string, relevant: boolean) => void;
  isObserver: boolean;
}) {
  const isVoted = signal.user_voted;

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex-shrink-0 w-[280px] sm:w-[300px] snap-start rounded-lg border p-4 space-y-3 transition-colors duration-300",
        isVoted
          ? "border-canola/30 bg-muted/50 opacity-80"
          : "border-border bg-background hover:border-canola/20 hover:shadow-sm"
      )}
    >
      {/* Top row: sentiment + category */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
            sentimentColors[signal.sentiment] ?? sentimentColors.neutral
          )}
        >
          {signal.sentiment}
        </span>
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {categoryLabels[signal.category] ?? signal.category}
        </span>
      </div>

      {/* Post summary */}
      <p className="text-sm leading-relaxed text-foreground line-clamp-3">
        {signal.post_summary}
      </p>

      {/* Author + date */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {signal.post_author && (
          <span className="font-medium">
            @{signal.post_author.replace(/^@/, "")}
          </span>
        )}
        {signal.post_date && <span>{formatDate(signal.post_date)}</span>}
      </div>

      {/* Vote buttons / vote state — hidden for observers */}
      {isObserver ? null : isVoted ? (
        <div className="flex items-center gap-2 pt-1">
          {signal.user_relevant ? (
            <motion.span
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-prairie"
            >
              <Check className="h-3.5 w-3.5" />
              Marked relevant
            </motion.span>
          ) : (
            <motion.span
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Not for you
            </motion.span>
          )}
          <button
            type="button"
            onClick={() => onVote(signal.id, !signal.user_relevant)}
            disabled={isPending}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex gap-2 pt-1">
          <motion.button
            type="button"
            onClick={() => onVote(signal.id, true)}
            disabled={isPending}
            whileTap={springTap}
            whileHover={springHover}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              "border-prairie/30 text-prairie hover:bg-prairie/10 hover:border-prairie/50",
              isPending && "opacity-60 cursor-wait"
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Relevant
          </motion.button>
          <motion.button
            type="button"
            onClick={() => onVote(signal.id, false)}
            disabled={isPending}
            whileTap={springTap}
            whileHover={springHover}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              "border-border text-muted-foreground hover:bg-muted hover:border-muted-foreground/30",
              isPending && "opacity-60 cursor-wait"
            )}
          >
            <X className="h-3.5 w-3.5" />
            Not for me
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
