"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ActionBadge } from "@/components/ui/action-badge"
import { MarketStanceBadge } from "@/components/ui/market-stance-badge"
import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"
import type { Recommendation, RecommendationResult } from "@/lib/utils/recommendations"

interface RecommendationCardProps {
  grainName: string
  grainSlug: string
  recommendation: RecommendationResult
  deliveredPct: number
  className?: string
}

const glowMap: Record<
  RecommendationResult["action"],
  "canola" | "prairie" | "none"
> = {
  haul: "none",
  hold: "prairie",
  price: "canola",
  watch: "none",
}

const summaryToneMap: Record<Recommendation, string> = {
  haul: "border-amber-500/20 bg-gradient-to-br from-amber-500/12 via-amber-500/6 to-transparent",
  hold: "border-prairie/20 bg-gradient-to-br from-prairie/12 via-prairie/6 to-transparent",
  price: "border-canola/20 bg-gradient-to-br from-canola/12 via-canola/6 to-transparent",
  watch: "border-wheat-400/20 bg-gradient-to-br from-wheat-400/12 via-wheat-400/6 to-transparent",
}

const railToneMap: Record<
  Recommendation,
  { band: string; marker: string; halo: string }
> = {
  haul: {
    band: "bg-amber-500/20",
    marker: "bg-amber-500",
    halo: "shadow-[0_0_0_6px_rgba(217,119,6,0.14)]",
  },
  hold: {
    band: "bg-prairie/20",
    marker: "bg-prairie",
    halo: "shadow-[0_0_0_6px_rgba(67,122,34,0.14)]",
  },
  price: {
    band: "bg-canola/20",
    marker: "bg-canola",
    halo: "shadow-[0_0_0_6px_rgba(193,127,36,0.14)]",
  },
  watch: {
    band: "bg-wheat-400/20",
    marker: "bg-wheat-500",
    halo: "shadow-[0_0_0_6px_rgba(139,115,85,0.14)]",
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatPace(pct: number): string {
  if (pct > 60) return `Top ${100 - Math.round(pct)}%`
  if (pct >= 40) return "Avg pace"
  return "Behind peers"
}

function getPaceClass(pct: number): string {
  if (pct > 60) return "text-prairie"
  if (pct >= 40) return "text-canola"
  return "text-amber-600"
}

function getActionHeadline(action: Recommendation): string {
  switch (action) {
    case "haul":
      return "Haul this week"
    case "hold":
      return "Hold this week"
    case "price":
      return "Work price offers"
    case "watch":
      return "Wait for a cleaner read"
  }
}

function getDecisionTarget(
  action: Recommendation,
  marketStance: RecommendationResult["marketStance"]
): number {
  switch (action) {
    case "haul":
      return marketStance === "bearish" ? 14 : 22
    case "hold":
      return marketStance === "bullish" ? 86 : 78
    case "price":
      return marketStance === "bullish" ? 60 : marketStance === "bearish" ? 40 : 50
    case "watch":
      return 50
  }
}

function getDecisionPosition(
  action: Recommendation,
  marketStance: RecommendationResult["marketStance"],
  confidenceScore: number
): number {
  const target = getDecisionTarget(action, marketStance)
  // Interpolate between center (50) and target based on confidence.
  // At 100 confidence → full target position. At 0 → dead center.
  const t = clamp(confidenceScore, 0, 100) / 100
  return Math.round(50 + (target - 50) * t)
}

function getConvictionLabel(score: number): string {
  if (score >= 75) return "High conviction"
  if (score >= 50) return "Moderate conviction"
  return "Low conviction"
}

function getConvictionBandWidth(score: number): number {
  const clamped = clamp(score, 0, 100)
  return Math.round(36 - clamped * 0.22)
}

function DecisionRail({
  action,
  marketStance,
  confidenceScore,
}: {
  action: Recommendation
  marketStance: RecommendationResult["marketStance"]
  confidenceScore: number
}) {
  const tone = railToneMap[action]
  const position = getDecisionPosition(action, marketStance, confidenceScore)
  const bandWidth = getConvictionBandWidth(confidenceScore)
  const bandLeft = clamp(position - bandWidth / 2, 2, 98 - bandWidth)

  return (
    <div className="rounded-2xl border border-white/10 bg-black/[0.05] px-4 py-4 dark:border-white/5 dark:bg-black/15">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em]">
        <span className="text-amber-600">Haul</span>
        <span className="text-prairie">Hold</span>
      </div>

      <div className="relative mt-4 h-10">
        <div className="absolute inset-x-0 top-3 h-3 rounded-full bg-gradient-to-r from-amber-500 via-wheat-500/65 to-prairie" />
        <div
          className={cn("absolute top-1 h-7 rounded-full", tone.band)}
          style={{
            left: `${bandLeft}%`,
            width: `${bandWidth}%`,
          }}
        />
        <div
          className="absolute top-2 h-5 w-px bg-background/80"
          style={{ left: "50%" }}
        />
        <div
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `${position}%` }}
        >
          <div
            className={cn(
              "h-9 w-9 rounded-full border-2 border-background/90",
              tone.marker,
              tone.halo
            )}
          />
        </div>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3 text-[11px]">
        <span className="max-w-24 text-muted-foreground">
          Move grain into weakness
        </span>
        <span className="shrink-0 font-semibold text-foreground">
          {getConvictionLabel(confidenceScore)} - {confidenceScore}/100
        </span>
        <span className="max-w-24 text-right text-muted-foreground">
          Wait for stronger pricing
        </span>
      </div>
    </div>
  )
}

function ProgressTile({
  label,
  value,
  fillClassName,
}: {
  label: string
  value: number
  fillClassName: string
}) {
  const clampedValue = clamp(value, 0, 100)

  return (
    <div className="rounded-2xl border border-white/10 bg-black/[0.04] p-3 dark:border-white/5 dark:bg-black/10">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {Math.round(value)}%
        </span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-wheat-200/70 dark:bg-wheat-700/50">
        <div
          className={cn("h-2 rounded-full transition-all duration-500", fillClassName)}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  )
}

export function RecommendationCard({
  grainName,
  grainSlug,
  recommendation,
  deliveredPct,
  className,
}: RecommendationCardProps) {
  const { action, reason, confidenceScore, marketStance, deliveryPacePct, contractedPct } =
    recommendation

  return (
    <Link href={`/grain/${grainSlug}`} className={cn("block", className)}>
      <GlassCard glow={glowMap[action]} hover>
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-wheat-600 dark:text-wheat-400">
                {grainName}
              </h3>
              <p className="text-xs text-muted-foreground">
                Weekly marketing read
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {confidenceScore}/100
            </span>
          </div>

          <div className={cn("rounded-2xl border p-4", summaryToneMap[action])}>
            <div className="flex flex-wrap items-center gap-2">
              <MarketStanceBadge stance={marketStance} size="sm" />
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <ActionBadge action={action} size="sm" />
            </div>
            <p className="mt-3 text-lg font-display font-semibold text-foreground">
              {getActionHeadline(action)}
            </p>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">
              {reason}
            </p>
          </div>

          <DecisionRail
            action={action}
            marketStance={marketStance}
            confidenceScore={confidenceScore}
          />

          <div className="grid grid-cols-2 gap-3">
            <ProgressTile
              label="Delivered"
              value={deliveredPct}
              fillClassName="bg-canola"
            />
            <ProgressTile
              label="Contracted"
              value={contractedPct}
              fillClassName="bg-prairie"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-black/[0.04] px-3 py-2 text-xs text-muted-foreground dark:border-white/5 dark:bg-black/10">
            Pace:{" "}
            <span className={cn("font-semibold", getPaceClass(deliveryPacePct))}>
              {formatPace(deliveryPacePct)}
            </span>
          </div>
        </div>
      </GlassCard>
    </Link>
  )
}
