"use client";

import { buildXPostHref } from "@/lib/utils/x-post";

interface SignalTapeProps {
  signals: Array<{
    sentiment: string;
    category: string;
    post_summary: string;
    post_url?: string | null;
    post_author?: string | null;
    grain: string;
  }>;
}

const sentimentDotColor: Record<string, string> = {
  bullish: "bg-prairie",
  bearish: "bg-error",
  neutral: "bg-warning",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

export function SignalTape({ signals }: SignalTapeProps) {
  if (!signals || signals.length === 0) return null;

  const doubled = [...signals, ...signals];

  return (
    <div className="space-y-3" aria-label="Market signal ticker">
      <div className="sm:hidden">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {signals.map((signal, index) => {
            const href = buildXPostHref(
              signal.post_url,
              signal.post_author,
              `${signal.grain} ${signal.post_summary}`
            );

            return (
              <a
                key={`${signal.grain}-${index}`}
                href={href ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-[17rem] flex-shrink-0 rounded-2xl border border-wheat-200 bg-card/80 px-4 py-3 shadow-[0_12px_30px_-26px_rgba(42,38,30,0.55)] backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${sentimentDotColor[signal.sentiment] ?? "bg-warning"}`}
                  />
                  <span>{signal.grain}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {truncate(signal.post_summary, 120)}
                </p>
                <span className="mt-3 inline-block text-xs font-medium text-canola">
                  Open on X
                </span>
              </a>
            );
          })}
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-y border-wheat-700/40 bg-wheat-900 py-2 dark:bg-wheat-950 sm:block">
        <div className="animate-scroll-tape flex whitespace-nowrap gap-8 font-mono text-sm text-wheat-200">
          {doubled.map((signal, index) => {
            const href = buildXPostHref(
              signal.post_url,
              signal.post_author,
              `${signal.grain} ${signal.post_summary}`
            );

            return (
              <a
                key={`${signal.grain}-${signal.sentiment}-${index}`}
                href={href ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-full px-2 py-0.5 transition-opacity hover:opacity-80"
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${sentimentDotColor[signal.sentiment] ?? "bg-warning"}`}
                />
                <span className="font-bold">{signal.grain}</span>
                <span className="opacity-80">
                  {truncate(signal.post_summary, 88)}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
