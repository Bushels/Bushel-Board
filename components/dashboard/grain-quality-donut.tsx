"use client"

import { useState, useCallback } from "react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { useReducedMotion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import { GlassTooltip } from "@/components/ui/glass-tooltip"
import { fmtKt } from "@/lib/utils/format"
import type { GradeDistribution } from "@/lib/queries/observations"

interface GrainQualityDonutProps {
  grades: GradeDistribution[]
  grainName: string
}

const COLORS = [
  "#2e6b9e",
  "#437a22",
  "#c17f24",
  "#b37d24",
  "#6d9e3a",
  "#8b7355",
  "#d97706",
  "#5a7d9e",
  "#9e6b3a",
  "#7a8b55",
]

const MAX_LEGEND_ITEMS = 8

export function GrainQualityDonut({ grades, grainName }: GrainQualityDonutProps) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const prefersReducedMotion = useReducedMotion()

  const onPieEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index)
  }, [])

  const onPieLeave = useCallback(() => {
    setActiveIndex(-1)
  }, [])

  if (!grades || grades.length === 0) return null

  const legendGrades = grades.slice(0, MAX_LEGEND_ITEMS)
  const extraCount = grades.length - MAX_LEGEND_ITEMS

  // Custom tooltip content renderer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = (props: any) => {
    const { active, payload } = props
    if (!active || !payload?.length) return null

    const item = payload[0]
    const data = item.payload as GradeDistribution
    return (
      <GlassTooltip
        active
        payload={[
          {
            color: item.payload.fill ?? COLORS[0],
            name: data.grade,
            value: `${fmtKt(data.ktonnes)} (${data.percentage.toFixed(1)}%)`,
          },
        ]}
      />
    )
  }

  return (
    <GlassCard hover={false}>
      <div className="p-6">
        <h3 className="text-lg font-display font-semibold mb-0.5">
          Grain Quality
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Terminal Receipts grade distribution (CYTD)
        </p>

        <div className="flex flex-row items-center gap-6">
          {/* Donut chart */}
          <div className="shrink-0" style={{ width: 180, height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart onMouseLeave={onPieLeave}>
                <Pie
                  data={grades}
                  dataKey="ktonnes"
                  nameKey="grade"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={1}
                  onMouseEnter={onPieEnter}
                  animationDuration={prefersReducedMotion ? 0 : 800}
                  animationEasing="ease-out"
                  isAnimationActive={!prefersReducedMotion}
                  cursor="pointer"
                >
                  {grades.map((g, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      opacity={
                        activeIndex === -1
                          ? 1
                          : index === activeIndex
                            ? 1
                            : 0.4
                      }
                    />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1.5 min-w-0">
            {legendGrades.map((g, index) => (
              <div
                key={`legend-${index}`}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-muted-foreground truncate">
                  {g.grade}
                </span>
                <span className="font-semibold text-foreground ml-auto tabular-nums whitespace-nowrap">
                  {g.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
            {extraCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                +{extraCount} more grade{extraCount > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
