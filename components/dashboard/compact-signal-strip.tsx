"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Radio,
  Sparkles,
} from "lucide-react";
import { AnimatedCard } from "@/components/motion/animated-card";
import { ALL_GRAINS } from "@/lib/constants/grains";
import { buildXPostHref } from "@/lib/utils/x-post";
import { cn } from "@/lib/utils";

interface CompactSignal {
  sentiment: string;
  category: string;
  post_summary: string;
  post_url?: string | null;
  post_author?: string | null;
  grain: string;
  searched_at?: string | null;
}

interface CompactSignalStripProps {
  signals: CompactSignal[];
  /** Slugs of user's unlocked grains — pre-selected in the filter. Empty = default to "All". */
  unlockedSlugs?: string[];
}

interface ScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  hasOverflow: boolean;
  progress: number;
  thumbRatio: number;
}

const sentimentMeta: Record<
  string,
  { label: string; dotClass: string; pillClass: string }
> = {
  bullish: {
    label: "Bullish",
    dotClass: "bg-prairie",
    pillClass:
      "border-prairie/20 bg-prairie/10 text-prairie dark:border-prairie/30 dark:bg-prairie/16",
  },
  bearish: {
    label: "Bearish",
    dotClass: "bg-amber-500",
    pillClass:
      "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/16 dark:text-amber-200",
  },
  neutral: {
    label: "Neutral",
    dotClass: "bg-muted-foreground/55",
    pillClass:
      "border-border/70 bg-background/70 text-muted-foreground dark:bg-white/6",
  },
};

const categoryLabels: Record<string, string> = {
  farmer_report: "Farmer report",
  analyst_commentary: "Analyst view",
  elevator_bid: "Elevator bid",
  export_news: "Export news",
  weather: "Weather",
  policy: "Policy",
  other: "Market note",
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.04,
      duration: 0.32,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  }),
};

function formatTimeAgo(value: string | null | undefined): string {
  if (!value) return "Updated recently";

  try {
    const diffMs = Date.now() - new Date(value).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));

    if (hours < 1) return "Updated just now";
    if (hours < 24) return `Updated ${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `Updated ${days}d ago`;

    return new Date(value).toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Updated recently";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Map slug → display name for quick lookup */
const SLUG_TO_NAME = Object.fromEntries(
  ALL_GRAINS.map((g) => [g.slug, g.name])
);

export function CompactSignalStrip({ signals, unlockedSlugs = [] }: CompactSignalStripProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
    progress: 0,
    thumbRatio: 1,
  });
  const [isDragging, setIsDragging] = useState(false);

  // --- Grain filter state ---
  // Derive the set of grain names actually present in signals
  const availableGrains = useMemo(() => {
    const names = new Set(signals.map((s) => s.grain).filter(Boolean));
    // Maintain ALL_GRAINS order, then append any unknown names
    const ordered: string[] = [];
    for (const g of ALL_GRAINS) {
      if (names.has(g.name)) ordered.push(g.name);
    }
    for (const name of names) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered;
  }, [signals]);

  // Default selection: user's unlocked grains (intersected with available), or "all"
  const defaultSelected = useMemo(() => {
    if (unlockedSlugs.length === 0) return new Set<string>(); // empty = show all
    const names = new Set(
      unlockedSlugs.map((s) => SLUG_TO_NAME[s]).filter(Boolean)
    );
    // Only keep grains that actually have signals
    const available = new Set(availableGrains);
    const filtered = new Set([...names].filter((n) => available.has(n)));
    return filtered.size > 0 ? filtered : new Set<string>(); // fall back to all if none match
  }, [unlockedSlugs, availableGrains]);

  const [selectedGrains, setSelectedGrains] = useState<Set<string>>(defaultSelected);
  const showAll = selectedGrains.size === 0;

  function toggleGrain(name: string) {
    setSelectedGrains((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedGrains(new Set<string>());
  }

  // --- Filter signals, then take top 8 ---
  const filtered = useMemo(() => {
    const base = signals ?? [];
    if (showAll) return base.slice(0, 8);
    return base.filter((s) => selectedGrains.has(s.grain)).slice(0, 8);
  }, [signals, selectedGrains, showAll]);

  const visible = filtered;
  const grainCount = new Set(visible.map((signal) => signal.grain)).size;
  const latestSearchedAt = visible.reduce<string | null>((latest, signal) => {
    if (!signal.searched_at) return latest;
    if (!latest) return signal.searched_at;
    return signal.searched_at > latest ? signal.searched_at : latest;
  }, null);

  // Reset scroll position when filtered signals change
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTo({ left: 0, behavior: "auto" });
  }, [showAll, selectedGrains]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateScrollState = () => {
      const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
      const hasOverflow = maxScrollLeft > 12;
      const progress = hasOverflow ? scroller.scrollLeft / maxScrollLeft : 0;
      const thumbRatio = hasOverflow ? scroller.clientWidth / scroller.scrollWidth : 1;

      setScrollState({
        canScrollLeft: scroller.scrollLeft > 8,
        canScrollRight: scroller.scrollLeft < maxScrollLeft - 8,
        hasOverflow,
        progress,
        thumbRatio,
      });
    };

    updateScrollState();

    scroller.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateScrollState)
        : null;
    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [visible.length]);

  function scrollByDirection(direction: "left" | "right") {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const distance = Math.max(scroller.clientWidth * 0.82, 220);
    scroller.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  }

  function syncScrollFromPointer(clientX: number) {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;

    const rect = track.getBoundingClientRect();
    const pointerProgress = clamp((clientX - rect.left) / rect.width, 0, 1);
    const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);

    scroller.scrollTo({
      left: pointerProgress * maxScrollLeft,
      behavior: "auto",
    });
  }

  const rawThumbWidth = scrollState.thumbRatio * 100;
  const thumbWidth = scrollState.hasOverflow
    ? clamp(rawThumbWidth, 18, 72)
    : 100;
  const thumbLeft = scrollState.hasOverflow
    ? (100 - thumbWidth) * scrollState.progress
    : 0;

  // No signals at all — hide the entire component
  if ((signals ?? []).length === 0) return null;

  const hasFilteredResults = visible.length > 0;

  return (
    <AnimatedCard index={1}>
      <section className="relative overflow-hidden rounded-[1.9rem] border border-canola/18 bg-[linear-gradient(145deg,rgba(255,255,255,0.72),rgba(245,243,238,0.92)_45%,rgba(193,127,36,0.08))] p-4 shadow-[0_24px_50px_-34px_rgba(42,38,30,0.52)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(62,54,33,0.9),rgba(42,38,30,0.96)_48%,rgba(212,152,62,0.12))] sm:p-5">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/10" />
        <div className="pointer-events-none absolute right-[-48px] top-[-56px] h-36 w-36 rounded-full bg-canola/10 blur-3xl dark:bg-canola/18" />

        <div className="relative space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-canola/18 bg-white/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-canola shadow-[0_10px_24px_-20px_rgba(42,38,30,0.55)] dark:bg-white/6">
                <Radio className="h-3.5 w-3.5" />
                Live from X
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-display text-xl font-semibold leading-tight text-foreground sm:text-[1.4rem]">
                    Prairie chatter worth a quick scan
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/65 px-2.5 py-1 text-[11px] text-muted-foreground dark:bg-white/5">
                    <Sparkles className="h-3.5 w-3.5 text-canola" />
                    {visible.length} posts across {grainCount} grains
                  </span>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  A cleaner read on the week&apos;s market noise, shaped as a fast preview before you
                  open the deeper grain pages.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              {latestSearchedAt && (
                <span className="hidden rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground dark:bg-white/5 sm:inline-flex">
                  {formatTimeAgo(latestSearchedAt)}
                </span>
              )}
              <RailButton
                label="Scroll left"
                direction="left"
                disabled={!scrollState.canScrollLeft}
                onClick={() => scrollByDirection("left")}
              />
              <RailButton
                label="Scroll right"
                direction="right"
                disabled={!scrollState.canScrollRight}
                onClick={() => scrollByDirection("right")}
              />
            </div>
          </div>

          {/* Grain filter pills */}
          {availableGrains.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter signals by grain">
              <button
                type="button"
                onClick={selectAll}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-150",
                  showAll
                    ? "border-canola/30 bg-canola/12 text-canola shadow-[0_2px_8px_-4px_rgba(193,127,36,0.3)]"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-canola/20 hover:text-foreground dark:bg-white/5"
                )}
              >
                All
              </button>
              {availableGrains.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleGrain(name)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-150",
                    !showAll && selectedGrains.has(name)
                      ? "border-canola/30 bg-canola/12 text-canola shadow-[0_2px_8px_-4px_rgba(193,127,36,0.3)]"
                      : "border-border/60 bg-background/60 text-muted-foreground hover:border-canola/20 hover:text-foreground dark:bg-white/5"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {hasFilteredResults ? (
          <>
          <div className="relative">
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-12 bg-gradient-to-r from-background via-background/70 to-transparent transition-opacity duration-300 dark:from-wheat-900",
                scrollState.canScrollLeft ? "opacity-100" : "opacity-0"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-12 bg-gradient-to-l from-background via-background/70 to-transparent transition-opacity duration-300 dark:from-wheat-900",
                scrollState.canScrollRight ? "opacity-100" : "opacity-0"
              )}
            />

            <div
              ref={scrollerRef}
              className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 pt-1 sm:gap-4"
              aria-label="Community market signals"
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  scrollByDirection("right");
                }

                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  scrollByDirection("left");
                }
              }}
              tabIndex={0}
            >
              {visible.map((signal, index) => {
                const href = buildXPostHref(
                  signal.post_url,
                  signal.post_author,
                  `${signal.grain} ${signal.post_summary}`
                );

                return (
                  <motion.article
                    key={`${signal.grain}-${index}`}
                    custom={index}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    className="group relative flex min-h-[190px] w-[min(84vw,320px)] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[1.6rem] border border-white/55 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(245,243,238,0.86))] p-4 shadow-[0_22px_45px_-34px_rgba(42,38,30,0.48)] transition-all duration-300 hover:-translate-y-0.5 hover:border-canola/30 hover:shadow-[0_26px_50px_-30px_rgba(42,38,30,0.52)] dark:border-white/10 dark:bg-[linear-gradient(160deg,rgba(62,54,33,0.9),rgba(42,38,30,0.96))] sm:w-[300px]"
                  >
                    <div className="pointer-events-none absolute right-[-24px] top-[-18px] h-20 w-20 rounded-full bg-canola/10 blur-2xl dark:bg-canola/14" />

                    <div className="relative space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-canola/16 bg-canola/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-canola">
                              {signal.grain}
                            </span>
                            <SignalSentiment sentiment={signal.sentiment} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{categoryLabels[signal.category] ?? signal.category}</span>
                            {signal.post_author && (
                              <span className="font-medium text-foreground/70 dark:text-foreground/75">
                                @{signal.post_author.replace(/^@/, "")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/55 text-canola shadow-[0_10px_22px_-18px_rgba(42,38,30,0.5)] dark:bg-white/6">
                          <Radio className="h-4 w-4" />
                        </div>
                      </div>

                      <p className="line-clamp-4 text-sm leading-6 text-foreground">
                        {signal.post_summary}
                      </p>
                    </div>

                    <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-border/45 pt-3">
                      <div className="text-[11px] text-muted-foreground">
                        {formatTimeAgo(signal.searched_at)}
                      </div>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-canola/18 bg-canola/8 px-3 py-1.5 text-[11px] font-medium text-canola transition-colors hover:border-canola/28 hover:bg-canola/12"
                        >
                          Open post
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground dark:bg-white/5">
                          Source unavailable
                        </span>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{visible.length} posts this week</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{scrollState.hasOverflow ? "Swipe or use the rail below" : "Everything is in view"}</span>
            </div>

            <div className="flex min-w-0 items-center gap-3">
              {latestSearchedAt && (
                <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground dark:bg-white/5 sm:hidden">
                  {formatTimeAgo(latestSearchedAt)}
                </span>
              )}

              <div
                ref={trackRef}
                role="slider"
                aria-label="Scroll market signals"
                aria-disabled={!scrollState.hasOverflow}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(scrollState.progress * 100)}
                tabIndex={0}
                className={cn(
                  "relative h-3 w-full min-w-[180px] cursor-pointer rounded-full border border-border/60 bg-[linear-gradient(90deg,rgba(215,207,186,0.55),rgba(255,255,255,0.4))] shadow-inner dark:bg-[linear-gradient(90deg,rgba(93,81,50,0.86),rgba(62,54,33,0.96))]",
                  !scrollState.hasOverflow && "cursor-default opacity-70",
                  isDragging && "cursor-grabbing"
                )}
                onPointerDown={(event) => {
                  if (!scrollState.hasOverflow) return;
                  activePointerId.current = event.pointerId;
                  setIsDragging(true);
                  event.currentTarget.setPointerCapture(event.pointerId);
                  syncScrollFromPointer(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (activePointerId.current !== event.pointerId) return;
                  syncScrollFromPointer(event.clientX);
                }}
                onPointerUp={(event) => {
                  if (activePointerId.current !== event.pointerId) return;
                  activePointerId.current = null;
                  setIsDragging(false);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={(event) => {
                  if (activePointerId.current !== event.pointerId) return;
                  activePointerId.current = null;
                  setIsDragging(false);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onKeyDown={(event) => {
                  if (!scrollState.hasOverflow) return;

                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    scrollByDirection("right");
                  }

                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    scrollByDirection("left");
                  }
                }}
              >
                <div
                  className="absolute inset-y-[2px] left-[2px] rounded-full bg-gradient-to-r from-canola/18 via-canola/10 to-transparent"
                  style={{
                    width: `calc(${thumbLeft + thumbWidth}% - 4px)`,
                  }}
                />
                <div
                  className="absolute inset-y-[2px] rounded-full border border-canola/30 bg-[linear-gradient(90deg,#c17f24,#e2b25d)] shadow-[0_10px_18px_-14px_rgba(42,38,30,0.7)] transition-[left,width] duration-150"
                  style={{
                    left: `calc(${thumbLeft}% + 2px)`,
                    width: `calc(${thumbWidth}% - 4px)`,
                  }}
                />
              </div>
            </div>
          </div>
          </>
          ) : (
            <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No signals for the selected grains. Try adding more or tap <button type="button" onClick={selectAll} className="font-medium text-canola hover:underline">All</button> to see everything.
              </p>
            </div>
          )}
        </div>
      </section>
    </AnimatedCard>
  );
}

function RailButton({
  label,
  direction,
  disabled,
  onClick,
}: {
  label: string;
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/55 bg-white/70 text-foreground shadow-[0_16px_28px_-22px_rgba(42,38,30,0.6)] backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-white/6",
        disabled
          ? "cursor-not-allowed opacity-35"
          : "hover:border-canola/26 hover:bg-white/90 hover:text-canola dark:hover:bg-white/10"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function SignalSentiment({ sentiment }: { sentiment: string }) {
  const meta = sentimentMeta[sentiment] ?? sentimentMeta.neutral;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        meta.pillClass
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} />
      {meta.label}
    </span>
  );
}
