"use client"

import { useState, useCallback } from "react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Sector,
  Label,
} from "recharts"
import { useReducedMotion } from "framer-motion"
import { GlassCard } from "@/components/ui/glass-card"
import type { FlowSegment } from "@/lib/queries/flow-breakdown"

interface FlowDonutChartProps {
  segments: FlowSegment[]
  totalFlow: number
  grainWeek: number
  grainName: string
  className?: string
}

const fmtValue = (value: number) =>
  new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(value)

export function FlowDonutChart({
  segments,
  totalFlow,
  grainWeek,
  grainName,
  className,
}: FlowDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const prefersReducedMotion = useReducedMotion()

  const onPieEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index)
  }, [])

  const onPieLeave = useCallback(() => {
    setActiveIndex(-1)
  }, [])

  if (!segments || segments.length === 0 || totalFlow <= 0) {
    return (
      <GlassCard className={className} hover={false}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-display font-semibold">
              Where {grainName} Went
            </h3>
            <span className="text-xs text-muted-foreground">
              Week {grainWeek}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-6">
            This week&apos;s disappearance
          </p>
          <div className="flex items-center justify-center h-[240px]">
            <p className="text-sm text-muted-foreground">
              Flow data not available for this week
            </p>
          </div>
        </div>
      </GlassCard>
    )
  }

  const centerValue =
    activeIndex >= 0 && activeIndex < segments.length
      ? fmtValue(segments[activeIndex].value)
      : fmtValue(totalFlow)

  const centerLabel =
    activeIndex >= 0 && activeIndex < segments.length
      ? segments[activeIndex].name
      : "Total Flow"

  // Recharts v3 shape renderer — replaces deprecated activeIndex/activeShape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderShape = (props: any) => {
    const {
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle,
      endAngle,
      fill,
      index,
    } = props
    const isActive = index === activeIndex

    if (isActive) {
      return (
        <g>
          <Sector
            cx={cx}
            cy={cy}
            innerRadius={innerRadius}
            outerRadius={outerRadius + 8}
            startAngle={startAngle}
            endAngle={endAngle}
            fill={fill}
          />
          <Sector
            cx={cx}
            cy={cy}
            startAngle={startAngle}
            endAngle={endAngle}
            innerRadius={outerRadius + 12}
            outerRadius={outerRadius + 16}
            fill={fill}
            opacity={0.3}
          />
        </g>
      )
    }

    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    )
  }

  // Custom center label render function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCenterLabel = (props: any) => {
    const { viewBox } = props
    const { cx, cy } = viewBox
    return (
      <g>
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-2xl font-bold font-display"
          style={{ fontSize: "1.5rem", fontWeight: 700 }}
        >
          {centerValue}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground"
          style={{ fontSize: "0.7rem" }}
        >
          {centerLabel}
        </text>
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground"
          style={{ fontSize: "0.65rem" }}
        >
          Kt
        </text>
      </g>
    )
  }

  return (
    <GlassCard className={className} hover={false}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-display font-semibold">
            Where {grainName} Went
          </h3>
          <span className="text-xs text-muted-foreground">
            Week {grainWeek}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          This week&apos;s disappearance
        </p>

        <ResponsiveContainer width="100%" height={240}>
          <PieChart onMouseLeave={onPieLeave}>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              shape={renderShape}
              onMouseEnter={onPieEnter}
              animationDuration={prefersReducedMotion ? 0 : 800}
              animationEasing="ease-out"
              isAnimationActive={!prefersReducedMotion}
              cursor="pointer"
            >
              {segments.map((segment, index) => (
                <Cell key={`cell-${index}`} fill={segment.color} />
              ))}
              <Label content={renderCenterLabel} position="center" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
          {segments.map((segment, index) => (
            <div
              key={`legend-${index}`}
              className="flex items-center gap-1.5 text-xs"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-muted-foreground">{segment.name}</span>
              <span className="font-semibold text-foreground">
                {segment.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
