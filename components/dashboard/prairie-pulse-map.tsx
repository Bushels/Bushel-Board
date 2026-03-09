"use client";

import { motion } from "framer-motion";
import { fmtKt } from "@/lib/utils/format";

interface PrairiePulseMapProps {
  provinces: Array<{
    region: string; // "Alberta", "Saskatchewan", "Manitoba"
    ktonnes: number;
    wow_change_pct?: number;
  }>;
}

const provinceConfig: Record<
  string,
  {
    abbr: string;
    color: string;
    /** Center X in SVG viewBox coordinates */
    cx: number;
    /** Center Y in SVG viewBox coordinates */
    cy: number;
    /** Simplified polygon outline points */
    points: string;
  }
> = {
  Alberta: {
    abbr: "AB",
    color: "var(--color-province-ab)",
    cx: 120,
    cy: 145,
    // Simplified AB outline — tall rectangle with angled SW corner (Rockies)
    points: "70,50 170,50 170,260 70,260 85,210",
  },
  Saskatchewan: {
    abbr: "SK",
    color: "var(--color-province-sk)",
    cx: 280,
    cy: 145,
    // Simplified SK outline — near-rectangle
    points: "200,50 360,50 360,260 200,260",
  },
  Manitoba: {
    abbr: "MB",
    color: "var(--color-province-mb)",
    cx: 435,
    cy: 145,
    // Simplified MB outline — irregular eastern border (Hudson Bay notch)
    points: "390,50 500,50 500,120 475,160 500,200 490,260 390,260",
  },
};

/** Map wow_change_pct to pulse animation duration in seconds */
function pulseDuration(wowChangePct?: number): number {
  if (wowChangePct == null) return 3;
  const abs = Math.abs(wowChangePct);
  if (abs > 10) return 1;
  if (abs >= 5) return 2;
  return 3;
}

export function PrairiePulseMap({ provinces }: PrairiePulseMapProps) {
  const maxKt = Math.max(...provinces.map((p) => p.ktonnes), 1);
  const MIN_RADIUS = 16;
  const MAX_RADIUS = 40;

  return (
    <svg
      viewBox="0 0 570 310"
      className="w-full h-auto"
      role="img"
      aria-label="Prairie provinces delivery map"
    >
      {/* Province outlines */}
      {provinces.map((p) => {
        const config = provinceConfig[p.region];
        if (!config) return null;

        const normalizedRadius =
          MIN_RADIUS + ((p.ktonnes / maxKt) * (MAX_RADIUS - MIN_RADIUS));
        const duration = pulseDuration(p.wow_change_pct);

        return (
          <g key={p.region}>
            {/* Province shape */}
            <polygon
              points={config.points}
              fill={config.color}
              fillOpacity={0.12}
              stroke={config.color}
              strokeWidth={1.5}
              strokeOpacity={0.4}
            />

            {/* Pulsing circle */}
            <motion.circle
              cx={config.cx}
              cy={config.cy}
              r={normalizedRadius}
              fill={config.color}
              fillOpacity={0.35}
              stroke={config.color}
              strokeWidth={2}
              strokeOpacity={0.6}
              animate={{ scale: [1.0, 1.15] }}
              transition={{
                duration: duration,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
              style={{ transformOrigin: `${config.cx}px ${config.cy}px` }}
            />

            {/* Inner solid dot */}
            <circle
              cx={config.cx}
              cy={config.cy}
              r={6}
              fill={config.color}
            />

            {/* Label: abbreviation + value */}
            <text
              x={config.cx}
              y={280}
              textAnchor="middle"
              className="fill-foreground font-body"
              fontSize={13}
              fontWeight={600}
            >
              {config.abbr}
            </text>
            <text
              x={config.cx}
              y={298}
              textAnchor="middle"
              className="fill-muted-foreground font-body"
              fontSize={11}
            >
              {fmtKt(p.ktonnes, 0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
