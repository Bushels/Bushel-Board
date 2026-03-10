"use client";

import { useState, useTransition, useRef } from "react";
import { Check, X, Radio, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { voteSignalRelevance } from "@/app/(dashboard)/grain/[slug]/signal-actions";
import type { XSignalWithFeedback } from "@/lib/queries/x-signals";

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

interface XSignalFeedProps {
  signals: XSignalWithFeedback[];
  grain: string;
  grainWeek: number;
  cropYear: string;
}

export function XSignalFeed({
  signals,
  grain,
  grainWeek,
  cropYear,
}: XSignalFeedProps) {
  const [localSignals, setLocalSignals] = useState(signals);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

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
          No market signals from X this week.
        </p>
      </div>
    );
  }

  return (
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
            />
          ))}
        </div>
      </div>

      {/* Your impact summary bar */}
      {votedCount > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg border border-canola/20 bg-gradient-to-r from-canola/5 to-transparent p-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
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
        </div>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  index,
  isPending,
  onVote,
}: {
  signal: XSignalWithFeedback;
  index: number;
  isPending: boolean;
  onVote: (signalId: string, relevant: boolean) => void;
}) {
  const isVoted = signal.user_voted;

  return (
    <div
      className={cn(
        "flex-shrink-0 w-[280px] sm:w-[300px] snap-start rounded-lg border p-4 space-y-3 transition-all duration-300",
        "animate-in fade-in slide-in-from-bottom-2",
        isVoted
          ? "border-canola/30 bg-muted/50 opacity-80"
          : "border-border bg-background hover:border-canola/20 hover:shadow-sm"
      )}
      style={{
        animationDelay: `${index * 40}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
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

      {/* Vote buttons / vote state */}
      {isVoted ? (
        <div className="flex items-center gap-2 pt-1">
          {signal.user_relevant ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-prairie">
              <Check className="h-3.5 w-3.5" />
              Marked relevant
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              Not for you
            </span>
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
          <button
            type="button"
            onClick={() => onVote(signal.id, true)}
            disabled={isPending}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
              "border-prairie/30 text-prairie hover:bg-prairie/10 hover:border-prairie/50",
              isPending && "opacity-60 cursor-wait"
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Relevant
          </button>
          <button
            type="button"
            onClick={() => onVote(signal.id, false)}
            disabled={isPending}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
              "border-border text-muted-foreground hover:bg-muted hover:border-muted-foreground/30",
              isPending && "opacity-60 cursor-wait"
            )}
          >
            <X className="h-3.5 w-3.5" />
            Not for me
          </button>
        </div>
      )}
    </div>
  );
}
