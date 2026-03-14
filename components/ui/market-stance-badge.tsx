"use client"

import * as React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface MarketStanceBadgeProps {
  stance: "bullish" | "bearish" | "neutral"
  size?: "sm" | "lg"
}

const stanceStyles = {
  bullish: "bg-prairie/15 text-prairie border border-prairie/30 shadow-[0_0_20px_rgba(67,122,34,0.2)]",
  bearish: "bg-amber-500/15 text-amber-600 border border-amber-500/30 shadow-[0_0_20px_rgba(217,119,6,0.2)]",
  neutral: "bg-wheat-200/50 text-wheat-700 border border-wheat-300/30",
} as const

const sizeStyles = {
  lg: "text-lg font-bold uppercase tracking-widest px-4 py-2 rounded-full",
  sm: "text-xs font-semibold uppercase tracking-[2px] px-2.5 py-1 rounded-full",
} as const

const stanceIcons = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
} as const

export function MarketStanceBadge({
  stance,
  size = "lg",
}: MarketStanceBadgeProps) {
  const Icon = stanceIcons[stance]
  const iconSize = size === "lg" ? 20 : 14

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        stanceStyles[stance],
        sizeStyles[size],
      )}
    >
      <Icon size={iconSize} />
      {stance}
    </span>
  )
}
