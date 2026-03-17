"use client"

import Link from "next/link"
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

function formatPace(pct: number): string {
  if (pct > 60) return `Top ${100 - Math.round(pct)}%`
  if (pct >= 40) return "Avg pace"
  return "Behind peers"
}

function getArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy - r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy - r * Math.sin(endAngle)
  const largeArc = Math.abs(startAngle - endAngle) > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`
}

const actionColors: Record<Recommendation, string> = {
  hold: "#437a22",
  haul: "#d97706",
  price: "#c17f24",
  watch: "#8b7355",
}

function ConfidenceGauge({ action, confidenceScore }: { action: Recommendation; confidenceScore: number }) {
  const color = actionColors[action]
  const cx = 60, cy = 54, r = 42

  const bgPath = getArcPath(cx, cy, r, Math.PI, 0)
  const fillEnd = Math.PI - (confidenceScore / 100) * Math.PI
  const fillPath = confidenceScore > 0 ? getArcPath(cx, cy, r, Math.PI, fillEnd) : ""

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 65" className="w-full max-w-[140px]">
        <path d={bgPath} fill="none" stroke="var(--muted)" strokeOpacity={0.4} strokeWidth="8" strokeLinecap="round" />
        {confidenceScore > 0 && (
          <path d={fillPath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-foreground"
              style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-display, inherit)" }}>
          {confidenceScore}%
        </text>
      </svg>
      <span className="text-xs font-bold uppercase tracking-widest mt-0.5" style={{ color }}>
        {action}
      </span>
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
  const { action, reason, deliveryPacePct, contractedPct } =
    recommendation

  return (
    <Link href={`/grain/${grainSlug}`} className={cn("block", className)}>
      <GlassCard glow={glowMap[action]} hover>
        <div className="p-5 space-y-4">
          {/* Grain name */}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-wheat-600 dark:text-wheat-400">
            {grainName}
          </h3>

          {/* Confidence gauge */}
          <div className="flex justify-center">
            <ConfidenceGauge action={action} confidenceScore={recommendation.confidenceScore} />
          </div>

          {/* Reason */}
          <p className="text-sm text-muted-foreground italic text-center">
            {reason}
          </p>

          {/* Delivered progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Delivered</span>
              <span>{Math.round(deliveredPct)}%</span>
            </div>
            <div className="h-2 rounded-full bg-wheat-200 dark:bg-wheat-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-canola transition-all duration-500"
                style={{ width: `${Math.min(deliveredPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Contracted progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Contracted</span>
              <span>{Math.round(contractedPct)}%</span>
            </div>
            <div className="h-2 rounded-full bg-wheat-200 dark:bg-wheat-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-prairie transition-all duration-500"
                style={{ width: `${Math.min(contractedPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Pace */}
          <div className="flex items-center justify-center">
            <span className="text-xs text-muted-foreground">
              Pace: {formatPace(deliveryPacePct)}
            </span>
          </div>
        </div>
      </GlassCard>
    </Link>
  )
}
