"use client";

import type { XMarketSignal } from "@/lib/queries/x-signals";
import { EvidenceDrawer } from "./evidence-drawer";

export interface Insight {
  signal: "bullish" | "bearish" | "watch" | "social";
  title: string;
  body: string;
  sources?: ("CGC" | "AAFC" | "X" | "Derived")[];
  confidence?: "high" | "medium" | "low";
}

const signalConfig = {
  bullish: { icon: "\u{1F7E2}", border: "border-t-prairie", bg: "bg-prairie/5" },
  bearish: { icon: "\u{1F534}", border: "border-t-error", bg: "bg-error/5" },
  watch:   { icon: "\u{1F7E1}", border: "border-t-canola", bg: "bg-canola/5" },
  social:  { icon: "\u{1F535}", border: "border-t-blue-500", bg: "bg-blue-50/50 dark:bg-blue-950/20" },
};

const SOURCE_COLORS: Record<string, string> = {
  CGC: "bg-wheat-200 text-wheat-800 dark:bg-wheat-800 dark:text-wheat-200",
  AAFC: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  X: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Derived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function getConfidenceClasses(confidence?: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "border-l-4";
    case "medium":
      return "border-l-[3px] opacity-70";
    case "low":
      return "border-l-2 opacity-40";
    default:
      return "";
  }
}

function getConfidenceBorderColor(signal: string): string {
  switch (signal) {
    case "bullish":
      return "border-l-prairie";
    case "bearish":
      return "border-l-error";
    case "watch":
      return "border-l-canola";
    case "social":
      return "border-l-blue-500";
    default:
      return "border-l-muted-foreground";
  }
}

interface InsightCardsProps {
  insights: Insight[];
  xSignals?: XMarketSignal[];
  grainName?: string;
}

export function InsightCards({ insights, xSignals, grainName }: InsightCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {insights.map((insight, i) => {
        const cfg = signalConfig[insight.signal] ?? signalConfig.watch;
        const confidenceClasses = insight.confidence
          ? `${getConfidenceClasses(insight.confidence)} ${getConfidenceBorderColor(insight.signal)}`
          : "";

        return (
          <div
            key={i}
            className={`rounded-lg border border-border ${cfg.border} border-t-2 ${cfg.bg} p-4 space-y-2 ${confidenceClasses}`}
          >
            <p className="text-lg">{cfg.icon}</p>
            <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>

            {/* Source badges */}
            {insight.sources && insight.sources.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {insight.sources.map((source) => (
                  <span
                    key={source}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      SOURCE_COLORS[source] ?? SOURCE_COLORS.Derived
                    }`}
                  >
                    {source}
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">{insight.body}</p>

            {/* Evidence drawer trigger for social insights */}
            {insight.signal === "social" && xSignals && xSignals.length > 0 && grainName && (
              <EvidenceDrawer signals={xSignals} grainName={grainName} />
            )}
          </div>
        );
      })}
    </div>
  );
}
