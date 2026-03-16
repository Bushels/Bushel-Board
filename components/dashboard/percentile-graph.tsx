"use client"

import { cn } from "@/lib/utils"

interface PercentileGraphProps {
  /** Farmer's delivery pace percentile (0-100) */
  userPercentile: number
  /** 25th percentile value */
  p25: number
  /** 50th (median) percentile value */
  p50: number
  /** 75th percentile value */
  p75: number
  /** Total farmers in the cohort */
  farmerCount: number
  /** Grain name for label */
  grain: string
  className?: string
}

/**
 * Bell curve SVG showing farmer's delivery pace relative to peers.
 * Zones: <25th = amber (behind), 25-75th = muted (average), >75th = prairie (ahead)
 */
export function PercentileGraph({
  userPercentile,
  p25,
  p50,
  p75,
  farmerCount,
  grain,
  className,
}: PercentileGraphProps) {
  // Clamp percentile
  const pct = Math.max(0, Math.min(100, userPercentile))

  // Bell curve points (approximated as a smooth curve)
  // x: 0-300, y: 0 at top, 120 at bottom
  const curvePoints = "M0,120 C30,120 50,115 75,80 C90,55 100,25 120,10 C135,2 145,0 150,0 C155,0 165,2 180,10 C200,25 210,55 225,80 C250,115 270,120 300,120"

  // Position marker x coordinate (0-300)
  const markerX = (pct / 100) * 300

  // Zone boundaries
  const p25x = 75  // 25% of 300
  const p75x = 225 // 75% of 300

  const paceLabel =
    pct >= 75 ? "Ahead of pace" : pct >= 25 ? "On pace" : "Behind pace"
  const paceColor =
    pct >= 75 ? "text-prairie" : pct >= 25 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Your Delivery Pace — {grain}
        </span>
        <span className={cn("text-xs font-semibold", paceColor)}>
          {paceLabel} (P{Math.round(pct)})
        </span>
      </div>

      <svg viewBox="0 0 300 140" className="w-full h-auto" aria-label={`Delivery percentile: ${Math.round(pct)}th percentile`}>
        {/* Zone fills */}
        <defs>
          <clipPath id="bellClip">
            <path d={curvePoints} />
          </clipPath>
        </defs>

        {/* Amber zone: 0-25th */}
        <rect x="0" y="0" width={p25x} height="120" fill="#d97706" opacity="0.12" clipPath="url(#bellClip)" />
        {/* Muted zone: 25th-75th */}
        <rect x={p25x} y="0" width={p75x - p25x} height="120" fill="currentColor" opacity="0.06" clipPath="url(#bellClip)" />
        {/* Prairie zone: 75th+ */}
        <rect x={p75x} y="0" width={300 - p75x} height="120" fill="#437a22" opacity="0.12" clipPath="url(#bellClip)" />

        {/* Bell curve outline */}
        <path d={curvePoints} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />

        {/* Median marker */}
        <line x1="150" y1="0" x2="150" y2="125" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
        <text x="150" y="135" textAnchor="middle" className="fill-muted-foreground text-[9px]">
          Median
        </text>

        {/* User position marker */}
        <line x1={markerX} y1="0" x2={markerX} y2="120" stroke="#c17f24" strokeWidth="2.5" />
        <circle cx={markerX} cy="0" r="5" fill="#c17f24" />
        <text
          x={markerX}
          y={-8}
          textAnchor="middle"
          className="fill-canola text-[10px] font-semibold"
        >
          You
        </text>
      </svg>

      <p className="text-[11px] text-muted-foreground/60 text-center">
        Based on {farmerCount} {grain} farmers this crop year
      </p>
    </div>
  )
}
