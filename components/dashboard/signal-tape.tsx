"use client";

import { ExternalLink, Radio } from "lucide-react";
import { buildXPostHref } from "@/lib/utils/x-post";
import { cn } from "@/lib/utils";

interface SignalTapeProps {
  signals: Array<{
    sentiment: string;
    category: string;
    post_summary: string;
    post_url?: string | null;
    post_author?: string | null;
    grain: string;
    searched_at?: string | null;
  }>;
}

const sentimentBadgeClasses: Record<string, string> = {
  bullish:
    "border-prairie/20 bg-prairie/10 text-prairie dark:border-prairie/30 dark:bg-prairie/15",
  bearish:
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-300",
  neutral:
    "border-border bg-muted/70 text-muted-foreground dark:bg-muted/20",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

function formatTimeAgo(isoStr: string): string {
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

export function SignalTape({ signals }: SignalTapeProps) {
  if (!signals || signals.length === 0) return null;

  const visibleSignals = signals.slice(0, 6);
  const latestSearchedAt = visibleSignals.reduce<string | null>((latest, s) => {
    if (!s.searched_at) return latest;
    if (!latest) return s.searched_at;
    return s.searched_at > latest ? s.searched_at : latest;
  }, null);
  const freshness = latestSearchedAt ? formatTimeAgo(latestSearchedAt) : null;

  return (
    <section className="space-y-4" aria-label="Latest X market posts">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-display font-semibold">
            <Radio className="h-4 w-4 text-canola" />
            What farmers are seeing on X
          </h2>
          <p className="text-sm text-muted-foreground">
            Recent grain posts scored for prairie relevance. Open any post to verify the source.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {visibleSignals.length} recent post{visibleSignals.length !== 1 ? "s" : ""}
          {freshness ? ` · Updated ${freshness}` : ""}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
        {visibleSignals.map((signal, index) => {
          const href = buildXPostHref(
            signal.post_url,
            signal.post_author,
            `${signal.grain} ${signal.post_summary}`
          );

          return (
            <a
              key={`${signal.grain}-${signal.post_author ?? "signal"}-${index}`}
              href={href ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-[18rem] shrink-0 flex-col justify-between rounded-[1.4rem] border border-border/65 bg-background/88 p-4 shadow-[0_18px_36px_-28px_rgba(42,38,30,0.45)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-canola/25 hover:shadow-[0_24px_44px_-28px_rgba(42,38,30,0.58)] md:min-w-0"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <span className="inline-flex rounded-full border border-canola/20 bg-canola/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-canola">
                      {signal.grain}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {signal.post_author ? (
                        <span className="font-medium text-foreground/80">
                          @{signal.post_author.replace(/^@/, "")}
                        </span>
                      ) : (
                        <span className="font-medium text-foreground/70">Prairie X</span>
                      )}
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                          sentimentBadgeClasses[signal.sentiment] ??
                            sentimentBadgeClasses.neutral
                        )}
                      >
                        {signal.sentiment}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-canola" />
                </div>

                <p className="text-sm leading-relaxed text-foreground">
                  {truncate(signal.post_summary, 170)}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
                <span className="truncate">{signal.category.replace(/_/g, " ")}</span>
                <span className="font-medium text-canola">Open post</span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
