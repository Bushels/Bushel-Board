"use client"

import * as React from "react"
import { motion } from "framer-motion"

interface GlassTooltipPayloadItem {
  color?: string
  name?: string
  value?: number | string
  dataKey?: string
}

interface GlassTooltipProps {
  active?: boolean
  payload?: GlassTooltipPayloadItem[]
  label?: string
  formatter?: (value: number | string, name: string) => string
}

export function GlassTooltip({
  active,
  payload,
  label,
  formatter,
}: GlassTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <motion.div
      className="backdrop-blur-md bg-white/70 dark:bg-wheat-900/70 border border-white/20 dark:border-wheat-700/30 rounded-xl shadow-lg shadow-black/5 px-4 py-3"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {label && (
        <p className="text-sm font-medium text-foreground mb-1.5">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-medium text-foreground ml-auto tabular-nums">
              {formatter && item.value !== undefined && item.name
                ? formatter(item.value, item.name)
                : item.value}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
