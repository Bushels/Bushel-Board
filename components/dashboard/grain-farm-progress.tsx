"use client";

import { ArrowRight } from "lucide-react";
import { MarketStanceBadge } from "@/components/ui/market-stance-badge";
import { ActionBadge } from "@/components/ui/action-badge";
import type { RecommendationResult } from "@/lib/utils/recommendations";

interface GrainFarmProgressProps {
  grainName: string;
  deliveredKt: number;
  contractedKt: number;
  openKt: number;
  totalKt: number;
  recommendation: RecommendationResult;
  deliveredPct: number;
  pacePercentile?: number; // 0-100
}

export function GrainFarmProgress({
  grainName,
  deliveredKt,
  contractedKt,
  openKt,
  totalKt,
  recommendation,
  deliveredPct,
  pacePercentile,
}: GrainFarmProgressProps) {
  const contractedPct = totalKt > 0 ? (contractedKt / totalKt) * 100 : 0;
  const openPct = totalKt > 0 ? (openKt / totalKt) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* 3 Progress Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Delivered */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Delivered
          </span>
          <p className="text-2xl font-display font-bold text-foreground">
            {Math.round(deliveredPct)}%
          </p>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${deliveredPct}%`, backgroundColor: "#437a22" }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {deliveredKt.toFixed(0)} kt
          </span>
        </div>

        {/* Contracted */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contracted
          </span>
          <p className="text-2xl font-display font-bold text-foreground">
            {Math.round(contractedPct)}%
          </p>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${contractedPct}%`,
                backgroundColor: "#c17f24",
              }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {contractedKt.toFixed(0)} kt
          </span>
        </div>

        {/* Open */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Open
          </span>
          <p className="text-2xl font-display font-bold text-foreground">
            {Math.round(openPct)}%
          </p>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${openPct}%`, backgroundColor: "#d97706" }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {openKt.toFixed(0)} kt
          </span>
        </div>
      </div>

      {/* Simplified Recommendation */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
        {/* Action header */}
        <div className="flex items-center gap-2 flex-wrap">
          <MarketStanceBadge stance={recommendation.marketStance} size="sm" />
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <ActionBadge action={recommendation.action} size="sm" />
          <span className="ml-auto text-xs font-semibold text-muted-foreground">
            {recommendation.confidenceScore}/100
          </span>
        </div>

        {/* Conviction rail */}
        <div className="space-y-1">
          <div
            className="h-2.5 rounded-full overflow-hidden"
            style={{
              background:
                "linear-gradient(to right, #d97706, #8b7355 50%, #437a22)",
            }}
          >
            <div className="relative h-full">
              <div
                className="absolute top-0 h-full w-1 rounded-full bg-foreground shadow-md"
                style={{
                  left: `${recommendation.confidenceScore}%`,
                  transform: "translateX(-50%)",
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {recommendation.confidence === "high"
              ? "High"
              : recommendation.confidence === "medium"
                ? "Moderate"
                : "Low"}{" "}
            conviction — {recommendation.confidenceScore}/100
          </p>
        </div>

        {/* Reason */}
        <p className="text-sm text-foreground leading-snug">
          {recommendation.reason}
        </p>
      </div>

      {/* Pace Badge */}
      {pacePercentile != null && (
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              pacePercentile >= 75
                ? "border border-prairie/30 bg-prairie/10 text-prairie"
                : pacePercentile >= 40
                  ? "border border-canola/30 bg-canola/10 text-canola"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-600"
            }`}
          >
            {pacePercentile >= 75
              ? `Top ${100 - pacePercentile}% pace`
              : pacePercentile >= 40
                ? "Avg pace"
                : "Behind peers"}
          </span>
          <span className="text-xs text-muted-foreground">
            vs other prairie {grainName.toLowerCase()} farmers
          </span>
        </div>
      )}
    </div>
  );
}
