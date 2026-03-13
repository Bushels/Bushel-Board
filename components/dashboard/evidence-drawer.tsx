"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { XMarketSignal } from "@/lib/queries/x-signals";

interface EvidenceDrawerProps {
  signals: XMarketSignal[];
  grainName: string;
}

const sentimentColors: Record<string, string> = {
  bullish: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  bearish: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  neutral: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
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
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80
      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
      : value >= 50
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      {label}: {value}
    </span>
  );
}

export function EvidenceDrawer({ signals, grainName }: EvidenceDrawerProps) {
  const [open, setOpen] = useState(false);

  if (signals.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 transition-colors"
        >
          View X sources ({signals.length})
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">
            X Market Signals — {grainName}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Scored social posts from X/Twitter relevant to {grainName} markets.
          </p>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-3">
          {signals.map((signal) => (
            <div
              key={signal.id}
              className="rounded-lg border border-border bg-background p-3 space-y-2"
            >
              {/* Top row: sentiment + category */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                    sentimentColors[signal.sentiment] ?? sentimentColors.neutral
                  }`}
                >
                  {signal.sentiment}
                </span>
                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {categoryLabels[signal.category] ?? signal.category}
                </span>
              </div>

              {/* Post summary */}
              <p className="text-sm leading-relaxed text-foreground">
                {signal.post_summary}
              </p>

              {/* Author + date row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {signal.post_author && (
                  <span className="font-medium">
                    @{signal.post_author.replace(/^@/, "")}
                  </span>
                )}
                {signal.post_date && (
                  <span>{formatDate(signal.post_date)}</span>
                )}
              </div>

              {/* Score pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <ScorePill label="Relevance" value={signal.relevance_score} />
                <ScorePill label="Confidence" value={signal.confidence_score} />
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
