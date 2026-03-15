"use client"

import * as React from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { useReducedMotion } from "framer-motion"
import { TrendingUp, TrendingDown, Info } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { GlassTooltip } from "@/components/ui/glass-tooltip"
import type { CotPosition } from "@/lib/queries/cot"
import { cn } from "@/lib/utils"

interface FarmerCotCardProps {
  positions: CotPosition[]
  latest: CotPosition | null
  className?: string
}

const fmt = new Intl.NumberFormat("en-CA")

/**
 * Generates a plain-English insight for farmers based on COT data.
 * Focuses on what fund positioning means for local elevator cash bids.
 */
function generateInsight(latest: CotPosition): string {
  const isBullish = latest.managed_money_net >= 0
  const isGettingMoreBullish = latest.wow_net_change > 0
  const bigShift = Math.abs(latest.wow_net_change) > 5000

  if (isBullish && isGettingMoreBullish) {
    return bigShift
      ? "Investment funds are aggressively adding bullish bets. This typically lifts futures prices and strengthens cash bids at your elevator."
      : "Funds remain bullish and adding to positions. Cash bids should stay supported."
  }
  if (isBullish && !isGettingMoreBullish) {
    return "Funds are still net bullish but trimming positions this week. Watch for softening cash bids if this trend continues."
  }
  if (!isBullish && !isGettingMoreBullish) {
    return bigShift
      ? "Funds are heavily bearish and selling more. This puts downward pressure on futures and cash bids. Consider pricing grain if you have targets."
      : "Funds remain bearish. Cash bids may stay under pressure until sentiment shifts."
  }
  // !isBullish && isGettingMoreBullish
  return "Funds are still net short but covering positions. This could signal a sentiment shift — cash bids may start firming."
}

export function FarmerCotCard({
  positions,
  latest,
  className,
}: FarmerCotCardProps) {
  const prefersReducedMotion = useReducedMotion()

  if (!latest) {
    return (
      <GlassCard className={cn("p-6", className)}>
        <h3 className="text-base font-display font-semibold text-foreground mb-2">
          Fund Sentiment
        </h3>
        <p className="text-sm text-muted-foreground">
          COT data not available for this grain.
        </p>
      </GlassCard>
    )
  }

  const chartData = [...positions].reverse().map((p) => ({
    week: `Wk ${p.grain_week}`,
    fundsNet: p.managed_money_net,
  }))

  const isBullish = latest.managed_money_net >= 0
  const isTrendingMoreBullish = latest.wow_net_change >= 0

  // Mood score: normalize managed_money_net_pct to a 0-100 scale
  // managed_money_net_pct ranges roughly -50% to +50% of open interest
  const moodScore = Math.max(0, Math.min(100, (latest.managed_money_net_pct + 50)))
  const moodLabel = moodScore > 65 ? "Bullish" : moodScore < 35 ? "Bearish" : "Neutral"
  const moodColor = moodScore > 65 ? "#437a22" : moodScore < 35 ? "#d97706" : "#8b7355"

  return (
    <GlassCard className={cn("p-6 flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <h3 className="text-base font-display font-semibold text-foreground">
              Fund Sentiment
            </h3>
            <div className="group relative">
              <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden w-60 p-3 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg group-hover:block z-50 border border-border">
                Large investment funds bet on grain prices through futures.
                When they&apos;re &ldquo;bullish&rdquo; (buying), it tends to push cash
                prices up at your elevator. When &ldquo;bearish&rdquo; (selling), it
                pushes prices down.
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            How big money is betting on this grain
          </p>
        </div>

        {/* Mood badge */}
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border",
            isBullish
              ? "bg-prairie/10 text-prairie border-prairie/20"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
          )}
        >
          {isBullish ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {moodLabel}
        </span>
      </div>

      {/* Mood gauge bar */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-muted-foreground/60 mb-1">
          <span>Bearish</span>
          <span>Neutral</span>
          <span>Bullish</span>
        </div>
        <div className="relative h-2.5 bg-muted/40 rounded-full overflow-hidden">
          {/* Gradient background */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(to right, #d97706, #8b7355, #437a22)",
              opacity: 0.2,
            }}
          />
          {/* Position indicator */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full -top-0.5 shadow-sm border-2 border-white dark:border-wheat-900 transition-all duration-500"
            style={{
              left: `calc(${moodScore}% - 7px)`,
              backgroundColor: moodColor,
            }}
          />
        </div>
      </div>

      {/* WoW shift */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className="text-muted-foreground">This week:</span>
        <span
          className={cn(
            "font-medium flex items-center gap-1",
            isTrendingMoreBullish
              ? "text-prairie"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {isTrendingMoreBullish ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {fmt.format(Math.abs(latest.wow_net_change))}{" "}
          {isTrendingMoreBullish ? "more bullish" : "more bearish"}
        </span>
      </div>

      {/* Trend area chart */}
      {chartData.length >= 2 && (
        <div className="h-28 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="cotFundGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={isBullish ? "#437a22" : "#d97706"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={isBullish ? "#437a22" : "#d97706"}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" hide />
              <YAxis hide />
              <Tooltip
                content={
                  <GlassTooltip
                    formatter={(value) => {
                      const v = Number(value)
                      const side = v >= 0 ? "bullish" : "bearish"
                      return `${fmt.format(Math.abs(v))} contracts net ${side}`
                    }}
                  />
                }
              />
              <ReferenceLine
                y={0}
                stroke="#8b7355"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="fundsNet"
                stroke={isBullish ? "#437a22" : "#d97706"}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cotFundGradient)"
                animationDuration={prefersReducedMotion ? 0 : 800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* What This Means callout */}
      <div className="mt-3 pt-3 border-t border-border/40">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">
          What this means for you
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {generateInsight(latest)}
        </p>
      </div>
    </GlassCard>
  )
}
