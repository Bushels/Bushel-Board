"use client"

import * as React from "react"
import {
  BarChart,
  Bar,
  ReferenceLine,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import { useReducedMotion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import { GlassTooltip } from "@/components/ui/glass-tooltip"
import type { CotPosition } from "@/lib/queries/cot"
import { cn } from "@/lib/utils"

interface CotPositioningCardProps {
  positions: CotPosition[]
  latest: CotPosition | null
  hasDivergence: boolean
  className?: string
}

const fmt = new Intl.NumberFormat("en-CA")

function fmtContracts(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${fmt.format(value)}`
}

/** Small inline sparkline for net position trend */
function NetSparkline({
  data,
  dataKey,
  color,
}: {
  data: { value: number }[]
  dataKey: string
  color: string
}) {
  if (data.length < 2) return null
  return (
    <div className="inline-block align-middle ml-2">
      <ResponsiveContainer width={100} height={28}>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CotPositioningCard({
  positions,
  latest,
  hasDivergence,
  className,
}: CotPositioningCardProps) {
  const prefersReducedMotion = useReducedMotion()

  // Empty state
  if (!latest) {
    return (
      <GlassCard className={cn("p-6", className)}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-display font-semibold text-foreground">
            COT Positioning
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          COT data not available for this grain
        </p>
      </GlassCard>
    )
  }

  // Prepare chart data — each row is a report week
  // Recharts horizontal bar: we show managed_money_net and commercial_net side by side
  const chartData = [...positions].reverse().map((p) => ({
    week: `Wk ${p.grain_week}`,
    managed_money_net: p.managed_money_net,
    commercial_net: p.commercial_net,
  }))

  // Sparkline data
  const mmSparkline = [...positions]
    .reverse()
    .map((p) => ({ value: p.managed_money_net }))
  const commSparkline = [...positions]
    .reverse()
    .map((p) => ({ value: p.commercial_net }))

  // 52-week range for managed money net
  const allMmNet = positions.map((p) => p.managed_money_net)
  const mmMin = Math.min(...allMmNet)
  const mmMax = Math.max(...allMmNet)
  const mmRange = mmMax - mmMin
  const mmRangePct =
    mmRange > 0 ? ((latest.managed_money_net - mmMin) / mmRange) * 100 : 50

  // WoW change
  const wowChange = latest.wow_net_change

  // Colors
  const managedColor = latest.managed_money_net >= 0 ? "#437a22" : "#d97706"
  const commercialColor = latest.commercial_net >= 0 ? "#437a22" : "#d97706"

  return (
    <GlassCard className={cn("p-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-base font-display font-semibold text-foreground">
            COT Positioning
          </h3>
          <p className="text-xs text-muted-foreground">
            Managed Money vs Commercial
          </p>
        </div>
        {hasDivergence && (
          <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 text-xs font-semibold px-2 py-0.5 rounded-full">
            {"\u26A0\uFE0F"} Divergence
          </span>
        )}
      </div>

      {/* Butterfly Bar Chart */}
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="week"
              width={48}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              className="text-muted-foreground"
            />
            <Tooltip
              content={
                <GlassTooltip
                  formatter={(value, name) => {
                    const label =
                      name === "managed_money_net"
                        ? "Managed Money"
                        : "Commercial"
                    return `${fmtContracts(Number(value))} contracts`
                  }}
                />
              }
            />
            <ReferenceLine x={0} stroke="#8b7355" strokeDasharray="3 3" />
            <Bar
              dataKey="managed_money_net"
              name="Managed Money"
              animationDuration={prefersReducedMotion ? 0 : 800}
              animationEasing="ease-out"
              radius={[0, 4, 4, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`mm-${index}`}
                  fill={entry.managed_money_net >= 0 ? "#437a22" : "#d97706"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
            <Bar
              dataKey="commercial_net"
              name="Commercial"
              animationDuration={prefersReducedMotion ? 0 : 800}
              animationEasing="ease-out"
              radius={[0, 4, 4, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cm-${index}`}
                  fill={entry.commercial_net >= 0 ? "#437a22" : "#d97706"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Net Position Summary with Sparklines */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm text-muted-foreground">
              Managed Money:
            </span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums ml-1.5",
                latest.managed_money_net >= 0
                  ? "text-prairie"
                  : "text-amber-600 dark:text-amber-400"
              )}
            >
              {fmtContracts(latest.managed_money_net)} net
            </span>
          </div>
          <NetSparkline
            data={mmSparkline}
            dataKey="value"
            color={managedColor}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm text-muted-foreground">Commercial:</span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums ml-1.5",
                latest.commercial_net >= 0
                  ? "text-prairie"
                  : "text-amber-600 dark:text-amber-400"
              )}
            >
              {fmtContracts(latest.commercial_net)} net
            </span>
          </div>
          <NetSparkline
            data={commSparkline}
            dataKey="value"
            color={commercialColor}
          />
        </div>
      </div>

      {/* 52-Week Range Indicator */}
      <div className="mt-4">
        <p className="text-xs text-muted-foreground mb-1.5">
          Range (available weeks)
        </p>
        <div className="relative h-2 bg-wheat-200 dark:bg-wheat-700 rounded-full">
          <div
            className="absolute w-3 h-3 bg-canola rounded-full -top-0.5 shadow-sm"
            style={{ left: `calc(${mmRangePct}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1 tabular-nums">
          <span>{fmt.format(mmMin)}</span>
          <span>{fmt.format(mmMax)}</span>
        </div>
      </div>

      {/* WoW Change */}
      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">WoW Change:</span>
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            wowChange >= 0
              ? "text-prairie"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {wowChange >= 0 ? "\u25B2" : "\u25BC"} {fmtContracts(wowChange)}{" "}
          contracts
        </span>
      </div>
    </GlassCard>
  )
}
