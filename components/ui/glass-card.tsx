"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  elevation?: 1 | 2 | 3
  glow?: "canola" | "prairie" | "none"
  index?: number
}

const elevationClasses = {
  1: "shadow-elevation-1",
  2: "shadow-elevation-2",
  3: "shadow-elevation-3",
} as const

const glowClasses = {
  canola: "shadow-canola-glow",
  prairie: "shadow-prairie-glow",
  none: "",
} as const

export function GlassCard({
  children,
  className,
  hover = true,
  elevation = 2,
  glow = "none",
  index = 0,
}: GlassCardProps) {
  const prefersReducedMotion = useReducedMotion()

  const baseClasses = cn(
    "relative bg-white/60 dark:bg-wheat-900/50 backdrop-blur-lg backdrop-saturate-150",
    "border border-white/20 dark:border-wheat-700/20 rounded-2xl",
    "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu",
    elevationClasses[elevation],
    glow !== "none" && glowClasses[glow],
    hover && "hover:-translate-y-1 hover:border-canola/30 hover:shadow-elevation-hover",
    className,
  )

  if (prefersReducedMotion) {
    return <div className={baseClasses}>{children}</div>
  }

  return (
    <motion.div
      className={baseClasses}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        delay: index * 0.04,
      }}
    >
      {children}
    </motion.div>
  )
}
