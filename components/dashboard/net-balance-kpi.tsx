"use client";

import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import type { WoWComparison } from "@/lib/queries/observations";

interface NetBalanceKpiProps {
  data: WoWComparison;
}

function formatKt(kt: number): string {
  if (Math.abs(kt) >= 1000) return `${(kt / 1000).toFixed(1)}M`;
  return kt.toFixed(1);
}

/**
 * Net Producer Deliveries vs Domestic Disappearance — top-of-page stat.
 *
 * Domestic Disappearance = Exports + Processing (a residual calculation,
 * not a separate CGC metric). When disappearance > deliveries the market
 * is drawing down stocks to meet demand (bullish). When deliveries >
 * disappearance, supply is outpacing demand (bearish).
 */
export function NetBalanceKpi({ data }: NetBalanceKpiProps) {
  const deliveries = data.metrics.find((m) => m.metric === "Deliveries");
  const exports = data.metrics.find((m) => m.metric === "Exports");
  const processing = data.metrics.find((m) => m.metric === "Processing");

  // Need at least deliveries and one disappearance component
  if (!deliveries || (!exports && !processing)) return null;

  const deliveriesCw = deliveries.thisWeek;
  const exportsCw = exports?.thisWeek ?? 0;
  const processingCw = processing?.thisWeek ?? 0;
  const disappearanceCw = exportsCw + processingCw;

  // Net = disappearance - deliveries. Positive = market absorbing more than
  // farmers deliver (bullish/drawing down stocks). Negative = supply exceeds
  // demand (bearish/building stocks).
  const net = disappearanceCw - deliveriesCw;
  const isBullish = net > 0;
  const isBearish = net < 0;

  const signalColor = isBullish
    ? "text-prairie"
    : isBearish
      ? "text-amber-500"
      : "text-muted-foreground";

  const signalBg = isBullish
    ? "border-prairie/30 bg-prairie/5"
    : isBearish
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-border bg-card";

  const signalLabel = isBullish
    ? "Bullish — market drawing down stocks"
    : isBearish
      ? "Bearish — supply outpacing demand"
      : "Neutral — supply meets demand";

  const TrendIcon = isBullish ? TrendingUp : isBearish ? TrendingDown : Minus;

  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${signalBg}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[0.6rem] font-medium uppercase tracking-[2px] text-muted-foreground">
          Deliveries vs Disappearance
        </p>
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          W{data.thisWeekNum}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
        {/* Deliveries */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">
            Producer Deliveries
          </p>
          <p className="font-display text-xl font-bold tabular-nums text-foreground">
            <CountUp target={deliveriesCw} format={formatKt} />
            <span className="text-sm font-normal text-muted-foreground ml-1">Kt</span>
          </p>
        </div>

        <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground/50 shrink-0 mb-1" />

        {/* Domestic Disappearance */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">
            Domestic Disappearance
          </p>
          <p className="font-display text-xl font-bold tabular-nums text-foreground">
            <CountUp target={disappearanceCw} format={formatKt} />
            <span className="text-sm font-normal text-muted-foreground ml-1">Kt</span>
          </p>
          <p className="text-[0.6rem] text-muted-foreground mt-0.5">
            Exports {formatKt(exportsCw)} + Processing {formatKt(processingCw)}
          </p>
        </div>

        {/* Net signal */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">
            Net Balance
          </p>
          <div className={`flex items-center gap-1.5 ${signalColor}`}>
            <TrendIcon className="h-5 w-5 shrink-0" />
            <p className="font-display text-xl font-bold tabular-nums">
              {net > 0 ? "+" : ""}{formatKt(net)}
              <span className="text-sm font-normal ml-1">Kt</span>
            </p>
          </div>
          <p className={`text-[0.6rem] font-medium mt-0.5 ${signalColor}`}>
            {signalLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
