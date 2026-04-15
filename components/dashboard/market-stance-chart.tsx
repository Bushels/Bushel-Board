"use client";

import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GrainStanceData {
  grain: string;
  slug: string;
  score: number; // -100 to +100
  priorScore: number | null;
  confidence: "high" | "medium" | "low";
  cashPrice?: string | null; // e.g. "$276.25"
  priceChange?: string | null; // e.g. "+$6.36" or "-$6.60"
  thesisSummary?: string | null; // one-line explainer from market_analysis.thesis_title
}

interface MarketStanceChartProps {
  stances: GrainStanceData[];
  grainWeek: number;
  updatedAt?: string | null;
}

function getStanceLabel(score: number): string {
  if (score >= 60) return "Bullish";
  if (score >= 20) return "Mildly Bullish";
  if (score > -20) return "Neutral";
  if (score > -60) return "Mildly Bearish";
  return "Bearish";
}

function getStanceColor(score: number): string {
  if (score >= 20) return "text-prairie";
  if (score > -20) return "text-muted-foreground";
  return "text-amber-600";
}

function getDeltaIcon(delta: number) {
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-prairie">
        <TrendingUp className="h-3 w-3" />
        <span className="text-[11px] font-semibold tabular-nums">+{delta}</span>
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-amber-600">
        <TrendingDown className="h-3 w-3" />
        <span className="text-[11px] font-semibold tabular-nums">{delta}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      <Minus className="h-3 w-3" />
      <span className="text-[11px] font-semibold tabular-nums">0</span>
    </span>
  );
}

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-prairie",
    medium: "bg-canola",
    low: "bg-muted-foreground/40",
  };
  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 rounded-full", colors[level])}
      title={`${level} confidence`}
    />
  );
}

export function MarketStanceChart({
  stances,
  grainWeek,
  updatedAt,
}: MarketStanceChartProps) {
  const prefersReducedMotion = useReducedMotion();

  // Sort most bullish → most bearish
  const sorted = [...stances].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-canola" />
          <span className="text-xs font-medium text-muted-foreground">
            AI Stance · Week {grainWeek}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm bg-amber-600/80" />
            Bearish
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm bg-prairie" />
            Bullish
          </span>
        </div>
      </div>

      {/* Analyzed by badge */}
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <Brain className="h-3 w-3" />
        Analyzed by 16 Agriculture Trained AI Agents · Week {grainWeek}
      </p>

      {/* Grain rows */}
      <div className="space-y-1.5">
        {sorted.map((grain, i) => {
          const delta =
            grain.priorScore !== null ? grain.score - grain.priorScore : 0;
          const absScore = Math.abs(grain.score);
          const isBullish = grain.score > 0;
          const isBearish = grain.score < 0;

          const row = (
            <div key={grain.slug}>
              <div
                className="group grid items-center gap-2"
                style={{
                  gridTemplateColumns: "100px 28px 1fr 56px 52px",
                }}
              >
                {/* Grain name + confidence dot */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <ConfidenceDot level={grain.confidence} />
                  <span className="text-sm font-medium truncate">
                    {grain.grain}
                  </span>
                </div>

                {/* Score number */}
                <span
                  className={cn(
                    "text-xs font-bold tabular-nums text-right",
                    getStanceColor(grain.score)
                  )}
                >
                  {grain.score > 0 ? "+" : ""}
                  {grain.score}
                </span>

                {/* Diverging bar */}
                <div className="relative flex h-5 items-center rounded-sm bg-muted/20 overflow-hidden">
                  {/* Zero line */}
                  <div className="absolute left-1/2 top-0 z-10 h-full w-px -translate-x-1/2 bg-border/60" />

                  {/* Bearish half (fills right-to-left from center) */}
                  <div className="flex h-full w-1/2 justify-end">
                    {isBearish && (
                      <div
                        className="h-full rounded-l-sm bg-amber-600/75 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                        style={{ width: `${absScore}%` }}
                      />
                    )}
                  </div>

                  {/* Bullish half (fills left-to-right from center) */}
                  <div className="flex h-full w-1/2 justify-start">
                    {isBullish && (
                      <div
                        className="h-full rounded-r-sm bg-prairie/85 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                        style={{ width: `${absScore}%` }}
                      />
                    )}
                  </div>

                  {/* Prior score marker (thin line) */}
                  {grain.priorScore !== null && grain.priorScore !== grain.score && (
                    <div
                      className="absolute top-0 z-20 h-full w-0.5 bg-foreground/25 rounded-full"
                      style={{
                        left: `${50 + grain.priorScore / 2}%`,
                      }}
                      title={`Prior: ${grain.priorScore > 0 ? "+" : ""}${grain.priorScore}`}
                    />
                  )}
                </div>

                {/* Cash price */}
                <div className="text-right min-w-0">
                  {grain.cashPrice ? (
                    <span className="text-[11px] text-muted-foreground tabular-nums truncate">
                      {grain.cashPrice}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/40">—</span>
                  )}
                </div>

                {/* Delta from prior */}
                <div className="flex justify-end">{getDeltaIcon(delta)}</div>
              </div>
              {/* Thesis explainer (one-line below the bar) */}
              {grain.thesisSummary && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground/70 pl-[18px]">
                  {grain.thesisSummary}
                </p>
              )}
            </div>
          );

          if (prefersReducedMotion) return row;

          return (
            <motion.div
              key={grain.slug}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
                delay: i * 0.04,
              }}
            >
              {row}
            </motion.div>
          );
        })}
      </div>

      {/* Footer: updated timestamp */}
      {updatedAt && (
        <p className="text-[10px] text-muted-foreground/60 text-right">
          Updated {new Date(updatedAt).toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}
