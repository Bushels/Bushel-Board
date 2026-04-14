"use client";

import { useState } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import type { TrustFooterData, ConfidenceLevel } from "../types";

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  "Early read": "bg-amber-500/12 text-amber-600",
  "Solid read": "bg-canola/12 text-canola",
  "Strong read": "bg-prairie/12 text-prairie",
};

const CONFIDENCE_DOT: Record<ConfidenceLevel, string> = {
  "Early read": "bg-amber-500",
  "Solid read": "bg-canola",
  "Strong read": "bg-prairie",
};

interface TrustFooterProps {
  data: TrustFooterData;
}

export function TrustFooter({ data }: TrustFooterProps) {
  const [expanded, setExpanded] = useState(false);

  const parts: string[] = [];
  parts.push(`CGC: ${data.cgcFreshness}`);
  parts.push(`Futures: ${data.futuresFreshness}`);
  if (data.localReportCount > 0) {
    parts.push(
      `Local: ${data.localReportCount} reports${data.localReportFreshness ? `, ${data.localReportFreshness}` : ""}`
    );
  }
  const freshnessLine = parts.join(" · ");

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="mt-2 w-full rounded-lg bg-wheat-100/50 p-2.5 text-left transition-colors hover:bg-wheat-100/80 dark:bg-wheat-800/30 dark:hover:bg-wheat-800/50"
    >
      {/* Freshness line */}
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <BarChart3 className="h-3 w-3" />
        <span>{freshnessLine}</span>
      </div>

      {/* Confidence + "Why this read?" */}
      <div className="mt-1 flex items-center justify-between">
        <ConfidenceBadge level={data.confidence} />
        <div className="flex items-center gap-0.5 text-[11px] font-medium text-canola">
          <span>Why this read?</span>
          <ChevronDown
            className={`h-2.5 w-2.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-border/30 pt-2 text-[11px] text-muted-foreground">
          <p>
            <strong>CGC data:</strong> {data.cgcFreshness}
          </p>
          <p>
            <strong>Futures:</strong> {data.futuresFreshness}
          </p>
          {data.localReportCount > 0 && (
            <p>
              <strong>Local intel:</strong> {data.localReportCount} reports
              {data.localReportFreshness
                ? ` (${data.localReportFreshness})`
                : ""}
            </p>
          )}
          {data.elevatorPricing && (
            <p>
              <strong>Elevator pricing:</strong> {data.elevatorPricing}
            </p>
          )}
          <p className="italic">
            {data.confidence === "Early read" &&
              "Limited data sources — take this as directional, not definitive."}
            {data.confidence === "Solid read" &&
              "Multiple data sources confirm this picture."}
            {data.confidence === "Strong read" &&
              "High-confidence read backed by fresh CGC data, local intel, and CFTC/USDA context."}
          </p>
        </div>
      )}
    </button>
  );
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_STYLES[level]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT[level]}`} />
      {level}
    </span>
  );
}
