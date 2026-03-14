"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { fmtKt, fmtPct } from "@/lib/utils/format"

export interface KeyMetric {
  label: string
  currentWeekKt: number
  cropYearKt: number
  wowChangePct: number
  insight: string
  color: string
}

interface KeyMetricsCardsProps {
  metrics: KeyMetric[]
}

function WowBadge({ pct }: { pct: number }) {
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#437a22]/10 px-1.5 py-0.5 text-xs font-medium text-[#437a22]">
        <TrendingUp className="h-3 w-3" />
        {fmtPct(pct)}
      </span>
    )
  }
  if (pct < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#d91c1c]/10 px-1.5 py-0.5 text-xs font-medium text-[#d91c1c]">
        <TrendingDown className="h-3 w-3" />
        {fmtPct(pct)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Minus className="h-3 w-3" />
      {fmtPct(pct)}
    </span>
  )
}

export function KeyMetricsCards({ metrics }: KeyMetricsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m, i) => (
        <GlassCard key={m.label} index={i} className="p-4">
          {/* Row 1: Label + WoW badge */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {m.label}
            </span>
            <WowBadge pct={m.wowChangePct} />
          </div>

          {/* Row 2: Current week value */}
          <p
            className="mt-1 font-display font-bold text-xl"
            style={{ color: m.color }}
          >
            {fmtKt(m.currentWeekKt)}
          </p>

          {/* Row 3: CY total */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            CY: {fmtKt(m.cropYearKt)}
          </p>

          {/* Row 4: Insight */}
          <p className="mt-2 border-t border-border/40 pt-2 text-xs text-muted-foreground/80">
            {m.insight}
          </p>
        </GlassCard>
      ))}
    </div>
  )
}
