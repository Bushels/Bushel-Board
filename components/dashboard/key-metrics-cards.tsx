"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { MetricSentimentVote, type MetricType, type MetricSentimentAggregates } from "@/components/dashboard/metric-sentiment-vote"
import { fmtKt, fmtPct } from "@/lib/utils/format"
import type { UserRole } from "@/lib/auth/role-guard"

const POSITIVE_TREND_COLOR = "#437a22"
const NEGATIVE_TREND_COLOR = "#d91c1c"

export interface KeyMetric {
  label: string
  metricKey: MetricType
  currentWeekKt: number
  cropYearKt: number
  wowChangePct: number
  insight: string
  color: string
}

interface KeyMetricsCardsProps {
  metrics: KeyMetric[]
  grain?: string
  role?: UserRole
  userVotes?: Record<string, "bullish" | "bearish" | null>
  aggregates?: Record<string, MetricSentimentAggregates | null>
  onVote?: (metric: string, sentiment: "bullish" | "bearish") => Promise<{ error?: string }>
}

function WowBadge({ pct }: { pct: number }) {
  if (pct > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: `${POSITIVE_TREND_COLOR}1a`,
          color: POSITIVE_TREND_COLOR,
        }}
      >
        <TrendingUp className="h-3 w-3" />
        {fmtPct(pct)}
      </span>
    )
  }
  if (pct < 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: `${NEGATIVE_TREND_COLOR}1a`,
          color: NEGATIVE_TREND_COLOR,
        }}
      >
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

export function KeyMetricsCards({ metrics, grain, role, userVotes, aggregates, onVote }: KeyMetricsCardsProps) {
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

          {/* Row 5: Metric sentiment vote */}
          {grain && role && onVote && (
            <div className="mt-2 border-t border-border/30 pt-2">
              <MetricSentimentVote
                metric={m.metricKey}
                grain={grain}
                userVote={userVotes?.[m.metricKey] ?? null}
                aggregates={aggregates?.[m.metricKey] ?? null}
                role={role}
                onVote={onVote}
              />
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  )
}
