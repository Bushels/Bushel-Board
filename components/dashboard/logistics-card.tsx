"use client"

import * as React from "react"
import { Ship, TrainFront, Clock, Package } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import type { GrainMonitorData, ProducerCarData } from "@/lib/queries/logistics"
import { cn } from "@/lib/utils"

interface LogisticsCardProps {
  grainMonitor: GrainMonitorData | null
  producerCars: ProducerCarData[]
  grainName: string
  className?: string
}

const fmt = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 })
const fmtOne = new Intl.NumberFormat("en-CA", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

type StatusColor = "green" | "amber" | "red"

function statusColor(
  value: number | null,
  thresholds: { green: (v: number) => boolean; amber: (v: number) => boolean }
): StatusColor {
  if (value === null) return "green"
  if (thresholds.green(value)) return "green"
  if (thresholds.amber(value)) return "amber"
  return "red"
}

const statusBorderClass: Record<StatusColor, string> = {
  green: "border-l-prairie",
  amber: "border-l-amber-500",
  red: "border-l-red-500",
}

const statusTextClass: Record<StatusColor, string> = {
  green: "text-prairie",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
}

interface KpiTileProps {
  icon: React.ReactNode
  value: string
  label: string
  status: StatusColor
  children?: React.ReactNode
}

function KpiTile({ icon, value, label, status, children }: KpiTileProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 p-3 border-l-2",
        statusBorderClass[status]
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("shrink-0", statusTextClass[status])}>{icon}</span>
        <span
          className={cn(
            "text-xl font-display font-bold tabular-nums",
            statusTextClass[status]
          )}
        >
          {value}
        </span>
      </div>
      <p className="text-[0.6rem] uppercase tracking-[2px] text-muted-foreground leading-tight">
        {label}
      </p>
      {children}
    </div>
  )
}

export function LogisticsCard({
  grainMonitor,
  producerCars,
  grainName,
  className,
}: LogisticsCardProps) {
  // Empty state
  if (!grainMonitor) {
    return (
      <GlassCard className={cn("p-6", className)}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-display font-semibold text-foreground">
            Logistics Snapshot
          </h3>
          <div className="flex gap-1.5 text-muted-foreground">
            <Ship className="h-4 w-4" />
            <TrainFront className="h-4 w-4" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Logistics data not available
        </p>
      </GlassCard>
    )
  }

  const vessels = grainMonitor.vessels_vancouver
  const railcarFill = grainMonitor.storage_capacity_pct
  const oct = grainMonitor.out_of_car_time_pct
  const throughput = grainMonitor.port_throughput_kt

  const vesselStatus = statusColor(vessels, {
    green: (v) => v <= 10,
    amber: (v) => v <= 20,
  })

  const railStatus = statusColor(railcarFill, {
    green: (v) => v >= 80,
    amber: (v) => v >= 60,
  })

  const octStatus = statusColor(oct, {
    green: (v) => v <= 3,
    amber: (v) => v <= 5,
  })

  // Find matching grain in producer cars
  const grainCars = producerCars.find(
    (pc) => pc.grain.toLowerCase() === grainName.toLowerCase()
  )

  return (
    <GlassCard className={cn("p-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-base font-display font-semibold text-foreground">
            Logistics Snapshot
          </h3>
          <p className="text-xs text-muted-foreground">
            Port &amp; rail movement
          </p>
        </div>
        <div className="flex gap-1.5 text-muted-foreground">
          <Ship className="h-4 w-4" />
          <TrainFront className="h-4 w-4" />
        </div>
      </div>

      {/* 2x2 KPI Grid */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <KpiTile
          icon={<Ship className="h-4 w-4" />}
          value={vessels !== null ? fmt.format(vessels) : "--"}
          label="Vessels Van."
          status={vesselStatus}
        />
        <KpiTile
          icon={<TrainFront className="h-4 w-4" />}
          value={railcarFill !== null ? `${fmtOne.format(railcarFill)}%` : "--"}
          label="Railcar Fill"
          status={railStatus}
        >
          {railcarFill !== null && (
            <RailcarBar pct={railcarFill} status={railStatus} />
          )}
        </KpiTile>
        <KpiTile
          icon={<Clock className="h-4 w-4" />}
          value={oct !== null ? `${fmtOne.format(oct)} days` : "--"}
          label="Out-of-Car Time"
          status={octStatus}
        />
        <KpiTile
          icon={<Package className="h-4 w-4" />}
          value={throughput !== null ? `${fmtOne.format(throughput)} Kt` : "--"}
          label="Throughput"
          status="green"
        />
      </div>

      {/* Rail Allocations */}
      {grainCars && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-sm text-muted-foreground">
            <TrainFront className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
            Rail Allocations:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {fmt.format(grainCars.cy_cars_total)} cars
            </span>{" "}
            (CY)
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            This week:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {fmt.format(grainCars.week_cars)} cars
            </span>
          </p>
        </div>
      )}
    </GlassCard>
  )
}

/** Tiny inline progress bar for railcar fill */
function RailcarBar({ pct, status }: { pct: number; status: StatusColor }) {
  const bgClass: Record<StatusColor, string> = {
    green: "bg-prairie",
    amber: "bg-amber-500",
    red: "bg-red-500",
  }
  return (
    <div className="h-1.5 w-full bg-wheat-200 dark:bg-wheat-700 rounded-full mt-1">
      <div
        className={cn("h-full rounded-full", bgClass[status])}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}
