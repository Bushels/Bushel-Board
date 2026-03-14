"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"
import { ActionBadge } from "@/components/ui/action-badge"
import type { RecommendationResult } from "@/lib/utils/recommendations"

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

const confidenceColors: Record<RecommendationResult["confidence"], string> = {
  high: "bg-prairie/15 text-prairie border-prairie/30",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  low: "bg-wheat-400/15 text-wheat-600 dark:text-wheat-400 border-wheat-400/30",
}

function formatPace(pct: number): string {
  if (pct > 60) return `Top ${100 - Math.round(pct)}%`
  if (pct >= 40) return "Avg pace"
  return "Behind peers"
}

export function RecommendationCard({
  grainName,
  grainSlug,
  recommendation,
  deliveredPct,
  className,
}: RecommendationCardProps) {
  const { action, reason, confidence, deliveryPacePct, contractedPct } =
    recommendation

  return (
    <Link href={`/grain/${grainSlug}`} className={cn("block", className)}>
      <GlassCard glow={glowMap[action]} hover>
        <div className="p-5 space-y-4">
          {/* Grain name */}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-wheat-600 dark:text-wheat-400">
            {grainName}
          </h3>

          {/* Action badge */}
          <div className="flex justify-center">
            <ActionBadge action={action} size="lg" />
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

          {/* Pace + Confidence */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Pace: {formatPace(deliveryPacePct)}
            </span>
            <span
              className={cn(
                "inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                confidenceColors[confidence],
              )}
            >
              {confidence}
            </span>
          </div>
        </div>
      </GlassCard>
    </Link>
  )
}
