"use client"

import * as React from "react"
import { Truck, Lock, DollarSign, Eye } from "lucide-react"
import { cn } from "@/lib/utils"

interface ActionBadgeProps {
  action: "haul" | "hold" | "price" | "watch"
  size?: "sm" | "lg"
}

const actionConfig = {
  haul: {
    icon: Truck,
    label: "HAUL",
    classes: "bg-amber-500/15 text-amber-600 border border-amber-500/30 shadow-[0_8px_24px_-4px_rgba(217,119,6,0.30)]",
  },
  hold: {
    icon: Lock,
    label: "HOLD",
    classes: "bg-prairie/15 text-prairie border border-prairie/30 shadow-underglow-prairie",
  },
  price: {
    icon: DollarSign,
    label: "PRICE",
    classes: "bg-canola/15 text-canola border border-canola/30 shadow-underglow-canola",
  },
  watch: {
    icon: Eye,
    label: "WATCH",
    classes: "bg-wheat-400/15 text-wheat-600 dark:text-wheat-400 border border-wheat-400/30",
  },
} as const

const sizeStyles = {
  lg: "text-lg font-bold uppercase tracking-widest px-4 py-2 rounded-full",
  sm: "text-xs font-semibold uppercase tracking-[2px] px-2.5 py-1 rounded-full",
} as const

export function ActionBadge({ action, size = "lg" }: ActionBadgeProps) {
  const config = actionConfig[action]
  const Icon = config.icon
  const iconSize = size === "lg" ? 20 : 14

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        config.classes,
        sizeStyles[size],
      )}
    >
      <Icon size={iconSize} />
      {config.label}
    </span>
  )
}
