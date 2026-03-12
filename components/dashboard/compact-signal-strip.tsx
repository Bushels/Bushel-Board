"use client";

import { ExternalLink } from "lucide-react";
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
}

const sentimentDot: Record<string, string> = {
  bullish: "bg-prairie",
  bearish: "bg-amber-500",
  neutral: "bg-muted-foreground/50",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}\u2026`;
}

export function CompactSignalStrip({ signals }: CompactSignalStripProps) {
  if (!signals || signals.length === 0) return null;

  const visible = signals.slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
        {visible.map((signal, i) => {
          const href = buildXPostHref(
            signal.post_url,
            signal.post_author,
            `${signal.grain} ${signal.post_summary}`
          );

          return (
            <a
              key={`${signal.grain}-${i}`}
              href={href ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex shrink-0 snap-start items-center gap-2.5 rounded-xl border border-border/50 bg-background/70 px-3 py-2 backdrop-blur-sm transition-colors hover:border-canola/25"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  sentimentDot[signal.sentiment] ?? sentimentDot.neutral
                )}
              />
              <span className="text-xs font-semibold text-canola">
                {signal.grain}
              </span>
              <span className="text-xs text-muted-foreground">
                {truncate(signal.post_summary, 60)}
              </span>
              {signal.post_author && (
                <span className="text-[10px] text-muted-foreground/70">
                  @{signal.post_author.replace(/^@/, "")}
                </span>
              )}
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50 group-hover:text-canola" />
            </a>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {visible.length} post{visible.length !== 1 ? "s" : ""} this week
      </p>
    </div>
  );
}
