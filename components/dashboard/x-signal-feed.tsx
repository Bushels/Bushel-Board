"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, Globe, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { voteSignalRelevance } from "@/app/(dashboard)/grain/[slug]/signal-actions";
import { useCelebration, MicroCelebration } from "@/components/motion/micro-celebration";
import { buildXPostHref } from "@/lib/utils/x-post";
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

function formatTimeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

/** Simple inline X logo for source indicator */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="X">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.035,
      duration: 0.32,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  }),
};

const springTap = { scale: 0.97 };
const springHover = { scale: 1.01 };

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
  const [error, setError] = useState<string | null>(null);
  const celebration = useCelebration("firstSignalVote");

  const isObserver = role === "observer";
  const votedCount = localSignals.filter((s) => s.user_voted).length;
  const relevantCount = localSignals.filter(
    (s) => s.user_voted && s.user_relevant === true
  ).length;
  const newCount = localSignals.filter((s) => s.is_new).length;
  const latestSearchedAt = localSignals.reduce<string | null>((latest, s) => {
    if (!s.searched_at) return latest;
    if (!latest) return s.searched_at;
    return s.searched_at > latest ? s.searched_at : latest;
  }, null);

  function handleVote(signalId: string, relevant: boolean) {
    const previousSignal = localSignals.find((signal) => signal.id === signalId);
    setError(null);

    setLocalSignals((prev) =>
      prev.map((s) =>
        s.id === signalId
          ? { ...s, user_voted: true, user_relevant: relevant }
          : s
      )
    );

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
        setLocalSignals((prev) =>
          prev.map((s) =>
            s.id === signalId
              ? {
                  ...s,
                  user_voted: previousSignal?.user_voted ?? false,
                  user_relevant: previousSignal?.user_relevant ?? null,
                }
              : s
          )
        );
        setError(result.error);
        return;
      }

      setError(null);
    });
  }

  if (localSignals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-5 text-center">
        <Radio className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No X signals scored for {grain} this week. Check back after Thursday.
        </p>
      </div>
    );
  }

  return (
    <MicroCelebration isActive={celebration.isActive}>
      <section className="space-y-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex items-center gap-2 text-base font-display font-semibold sm:text-lg">
                <Radio className="h-4 w-4 text-canola" />
                Market Signals from X
              </h2>
              <span className="inline-flex rounded-full border border-canola/15 bg-canola/8 px-2.5 py-1 text-[11px] font-medium text-canola">
                Week {grainWeek} · {localSignals.length} post
                {localSignals.length !== 1 ? "s" : ""}
                {newCount > 0 ? ` · ${newCount} new` : ""}
              </span>
              {latestSearchedAt && (
                <span className="text-[11px] text-muted-foreground">
                  Updated {formatTimeAgo(latestSearchedAt)}
                </span>
              )}
              {isObserver && (
                <span className="inline-flex rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                  Farmer accounts can rate these posts
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Compact source checks for the week, kept lightweight so the market data stays primary.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div
          className="flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-hide"
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

        {!isObserver && (
          <AnimatePresence mode="wait">
            {votedCount > 0 ? (
              <motion.div
                key="rated"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <CompactPill icon={<Check className="h-3.5 w-3.5" />}>
                  You rated {votedCount}/{localSignals.length}
                </CompactPill>
                {relevantCount > 0 && (
                  <CompactPill>{relevantCount} relevant to your farm</CompactPill>
                )}
                <CompactPill>Your feed is getting smarter</CompactPill>
              </motion.div>
            ) : (
              <motion.p
                key="nudge"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="text-xs text-muted-foreground"
              >
                Rate a couple of posts to sharpen this feed for your farm.
              </motion.p>
            )}
          </AnimatePresence>
        )}
      </section>
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
  const postHref = buildXPostHref(
    signal.post_url,
    signal.post_author,
    signal.post_summary
  );

  return (
    <motion.article
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        "flex w-[228px] shrink-0 snap-start flex-col justify-between rounded-[1.15rem] border p-3.5 transition-colors duration-300 backdrop-blur-sm sm:w-[240px]",
        isVoted
          ? "border-canola/25 bg-muted/45"
          : "border-border/60 bg-background/84 hover:border-canola/18 hover:shadow-[0_14px_28px_-24px_rgba(42,38,30,0.48)]"
      )}
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {signal.is_new && (
            <span className="inline-flex items-center rounded-full bg-canola px-2 py-0.5 text-[10px] font-bold text-white">
              NEW
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
              sentimentColors[signal.sentiment] ?? sentimentColors.neutral
            )}
          >
            {signal.sentiment}
          </span>
          <span className="inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {categoryLabels[signal.category] ?? signal.category}
          </span>
          {signal.source === "web" ? (
            <Globe className="h-3 w-3 text-muted-foreground" aria-label="Web source" />
          ) : (
            <XLogo className="h-3 w-3 text-muted-foreground" aria-label="X source" />
          )}
        </div>

        <p className="line-clamp-2 text-[0.95rem] leading-relaxed text-foreground">
          {signal.post_summary}
        </p>
      </div>

      <div className="mt-3 space-y-2 border-t border-border/35 pt-2.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate font-medium">
            {signal.post_author
              ? `@${signal.post_author.replace(/^@/, "")}`
              : "Prairie X"}
          </span>
          {signal.post_date && <span className="shrink-0">{formatDate(signal.post_date)}</span>}
          {postHref && (
            <a
              href={postHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-canola transition-colors hover:text-canola-dark"
            >
              Open
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {isObserver ? null : isVoted ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium",
                signal.user_relevant
                  ? "bg-prairie/10 text-prairie"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {signal.user_relevant ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
              {signal.user_relevant ? "Relevant" : "Dismissed"}
            </span>
            <button
              type="button"
              onClick={() => onVote(signal.id, !signal.user_relevant)}
              disabled={isPending}
              className="ml-auto text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <motion.button
              type="button"
              onClick={() => onVote(signal.id, true)}
              disabled={isPending}
              whileTap={springTap}
              whileHover={springHover}
              className={cn(
                "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                "border-prairie/25 text-prairie hover:border-prairie/45 hover:bg-prairie/10",
                isPending && "cursor-wait opacity-60"
              )}
            >
              <Check className="h-3 w-3" />
              Relevant
            </motion.button>
            <motion.button
              type="button"
              onClick={() => onVote(signal.id, false)}
              disabled={isPending}
              whileTap={springTap}
              whileHover={springHover}
              className={cn(
                "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                "border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted",
                isPending && "cursor-wait opacity-60"
              )}
            >
              <X className="h-3 w-3" />
              Dismiss
            </motion.button>
          </div>
        )}
      </div>
    </motion.article>
  );
}

function CompactPill({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-canola/15 bg-canola/6 px-2.5 py-1 text-muted-foreground">
      {icon ? <span className="text-canola">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}
