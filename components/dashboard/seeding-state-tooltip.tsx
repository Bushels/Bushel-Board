"use client";

import { motion } from "framer-motion";
import type { JSX } from "react";
import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const EDGE_PAD = 12;
const GLYPH_HALF_WIDTH = 32;
const GAP = 16;
const TOOLTIP_WIDTH = 280;
const TOOLTIP_HEIGHT = 190;

export interface SeedingStateTooltipProps {
  row: SeismographRow;
  commodity: string;
  anchor: { x: number; y: number };
  containerSize: { width: number; height: number };
  reducedMotion?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatPct(value: number | null): string {
  return value === null ? "No data" : `${Math.round(value)}%`;
}

function signedParts(value: number | null, harshDrop = false) {
  if (value === null) {
    return {
      text: "No data",
      className: "text-muted-foreground",
    };
  }

  const rounded = Math.round(value);
  const prefix = rounded > 0 ? "+" : "";
  const arrow = rounded > 0 ? "↑ " : rounded < 0 ? "↓ " : "";
  const className =
    rounded > 0
      ? "text-prairie"
      : harshDrop && rounded <= -15
        ? "text-error"
        : rounded < 0
          ? "text-warning"
          : "text-muted-foreground";

  return {
    text: `${arrow}${prefix}${rounded} pts`,
    className,
  };
}

function MetricCell({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-border/35 bg-wheat-50/70 px-2.5 py-2 dark:bg-wheat-800/60">
      <p className="tabular-nums text-sm font-bold leading-tight text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function SeedingStateTooltip({
  row,
  commodity,
  anchor,
  containerSize,
  reducedMotion = false,
}: SeedingStateTooltipProps): JSX.Element {
  const width = Math.min(
    TOOLTIP_WIDTH,
    Math.max(220, containerSize.width - EDGE_PAD * 2),
  );
  const fitsRight =
    anchor.x + GLYPH_HALF_WIDTH + GAP + width <=
    containerSize.width - EDGE_PAD;
  const side = fitsRight ? "right" : "left";
  const rawX = fitsRight
    ? anchor.x + GLYPH_HALF_WIDTH + GAP
    : anchor.x - GLYPH_HALF_WIDTH - GAP - width;
  const x = clamp(rawX, EDGE_PAD, containerSize.width - width - EDGE_PAD);
  const y = clamp(
    anchor.y - TOOLTIP_HEIGHT / 2,
    EDGE_PAD,
    containerSize.height - TOOLTIP_HEIGHT - EDGE_PAD,
  );
  const pace = signedParts(row.planted_pct_vs_avg);
  const condition = signedParts(row.ge_pct_yoy_change, true);

  return (
    <motion.div
      role="tooltip"
      className="pointer-events-none absolute z-30 rounded-2xl border border-border/40 bg-card/80 p-4 shadow-md backdrop-blur-lg backdrop-saturate-150"
      style={{ left: x, top: y, width }}
      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
      transition={{
        duration: reducedMotion ? 0 : 0.12,
        ease: EASE,
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-border/40 bg-card/80",
          side === "right"
            ? "-left-[7px] border-b border-l"
            : "-right-[7px] border-r border-t",
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold leading-tight text-foreground">
            {row.state_name}
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {titleCase(commodity)} · Week {row.week_ending}
          </p>
        </div>
        <div className="rounded-full border border-canola/35 bg-canola/10 px-2 py-1 text-[10px] font-bold text-canola">
          {row.state_code}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricCell label="Planted" value={formatPct(row.planted_pct)} />
        <MetricCell label="Emerged" value={formatPct(row.emerged_pct)} />
        <MetricCell label="Harvested" value={formatPct(row.harvested_pct)} />
      </div>

      <div className="mt-3 space-y-2 border-t border-border/35 pt-3">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">Pace vs 5-yr avg</span>
          <span className={cn("tabular-nums font-bold", pace.className)}>
            {pace.text}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">Good/Excellent</span>
          <span className="tabular-nums font-bold text-foreground">
            {formatPct(row.good_excellent_pct)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">G/E vs last year</span>
          <span className={cn("tabular-nums font-bold", condition.className)}>
            {condition.text}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
