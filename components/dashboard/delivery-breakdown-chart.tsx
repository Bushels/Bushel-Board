"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { GlassCard } from "@/components/ui/glass-card"
import { GlassTooltip } from "@/components/ui/glass-tooltip"
import { fmtKt } from "@/lib/utils/format"
import type { DeliveryChannelWeek } from "@/lib/queries/observations"

interface DeliveryBreakdownChartProps {
  data: DeliveryChannelWeek[]
  grainName: string
}

const CHANNELS = [
  { key: "primary_elevators_kt", label: "Primary Elevators", color: "#2e6b9e" },
  { key: "processors_kt", label: "Processors", color: "#437a22" },
  { key: "producer_cars_kt", label: "Producer Cars", color: "#c17f24" },
] as const

export function DeliveryBreakdownChart({
  data,
  grainName,
}: DeliveryBreakdownChartProps) {
  if (!data || data.length === 0) return null

  return (
    <GlassCard hover={false}>
      <div className="p-6">
        <h3 className="text-lg font-display font-semibold mb-0.5">
          Delivery Breakdown
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Where {grainName} deliveries are going each week
        </p>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
          {CHANNELS.map((ch) => (
            <div key={ch.key} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: ch.color }}
              />
              <span className="text-muted-foreground">{ch.label}</span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis
              dataKey="grain_week"
              tickFormatter={(w: number) => `W${w}`}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null

                const elevators = Number(payload.find((p) => p.dataKey === "primary_elevators_kt")?.value ?? 0)
                const processors = Number(payload.find((p) => p.dataKey === "processors_kt")?.value ?? 0)
                const cars = Number(payload.find((p) => p.dataKey === "producer_cars_kt")?.value ?? 0)
                const totalKt = elevators + processors

                return (
                  <GlassTooltip
                    active
                    label={`Week ${label}`}
                    payload={[
                      { name: "Elevators", value: fmtKt(elevators), color: "#2e6b9e" },
                      { name: "Processors", value: fmtKt(processors), color: "#437a22" },
                      { name: "Cars", value: `${cars} cars`, color: "#c17f24" },
                      { name: "Total", value: fmtKt(totalKt), color: "#64748b" },
                    ]}
                  />
                )
              }}
            />
            {CHANNELS.map((ch) => (
              <Area
                key={ch.key}
                type="monotone"
                dataKey={ch.key}
                stackId="1"
                stroke={ch.color}
                fill={ch.color}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  )
}
