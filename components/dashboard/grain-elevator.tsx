"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { fmtKt } from "@/lib/utils/format";

interface GrainElevatorProps {
  storageData: Array<{
    storage_type: string; // "Primary Elevators", "Terminal Elevators", "Process Elevators"
    ktonnes: number;
  }>;
}

/** Map storage type to short label + fill color CSS variable */
const BIN_CONFIG: Record<string, { label: string; fill: string }> = {
  "Primary Elevators": { label: "Primary", fill: "var(--color-prairie)" },
  "Terminal Elevators": { label: "Terminal", fill: "var(--color-province-ab)" },
  "Process Elevators": { label: "Process", fill: "var(--color-canola)" },
};

// SVG dimensions for a single bin within the viewBox
const BIN_WIDTH = 80;
const BIN_HEIGHT = 130;
const BIN_SPACING = 20;
const CAP_RADIUS = 40; // half of BIN_WIDTH for the dome
const BODY_TOP = 40; // where the rectangular body starts (below the dome)
const BODY_HEIGHT = BIN_HEIGHT - BODY_TOP; // 90px of fillable body

export function GrainElevator({ storageData }: GrainElevatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-40px" });

  // Determine max value for proportional scaling
  const maxKt = Math.max(...storageData.map((d) => d.ktonnes), 1);

  // Order bins consistently: Primary, Terminal, Process
  const orderedTypes = [
    "Primary Elevators",
    "Terminal Elevators",
    "Process Elevators",
  ];
  const bins = orderedTypes
    .map((type) => {
      const entry = storageData.find((d) => d.storage_type === type);
      if (!entry) return null;
      const config = BIN_CONFIG[type];
      return {
        type,
        label: config?.label ?? type.replace(" Elevators", ""),
        fill: config?.fill ?? "var(--color-canola)",
        ktonnes: entry.ktonnes,
        pct: entry.ktonnes / maxKt, // 0..1, largest = 1.0
      };
    })
    .filter(Boolean) as Array<{
    type: string;
    label: string;
    fill: string;
    ktonnes: number;
    pct: number;
  }>;

  // Total SVG viewBox width based on number of bins
  const totalWidth =
    bins.length * BIN_WIDTH + (bins.length - 1) * BIN_SPACING;
  const viewBoxHeight = BIN_HEIGHT + 50; // extra space for labels below

  return (
    <div ref={containerRef} className="w-full">
      <svg
        viewBox={`0 0 ${totalWidth} ${viewBoxHeight}`}
        className="w-full h-auto"
        role="img"
        aria-label="Grain elevator storage levels"
      >
        {bins.map((bin, i) => {
          const x = i * (BIN_WIDTH + BIN_SPACING);
          const fillHeight = bin.pct * BODY_HEIGHT;
          const fillY = BODY_TOP + BODY_HEIGHT - fillHeight;

          return (
            <g key={bin.type}>
              {/* --- Bin outline --- */}
              {/* Dome cap (semicircle) */}
              <path
                d={`
                  M ${x} ${BODY_TOP}
                  A ${CAP_RADIUS} ${CAP_RADIUS} 0 0 1 ${x + BIN_WIDTH} ${BODY_TOP}
                `}
                fill="none"
                stroke="var(--color-wheat-400)"
                strokeWidth={1.5}
              />
              {/* Body rectangle outline */}
              <rect
                x={x}
                y={BODY_TOP}
                width={BIN_WIDTH}
                height={BODY_HEIGHT}
                rx={2}
                fill="none"
                stroke="var(--color-wheat-400)"
                strokeWidth={1.5}
              />

              {/* --- Clip path for fill --- */}
              <defs>
                <clipPath id={`bin-clip-${i}`}>
                  {/* Dome region */}
                  <path
                    d={`
                      M ${x} ${BODY_TOP}
                      A ${CAP_RADIUS} ${CAP_RADIUS} 0 0 1 ${x + BIN_WIDTH} ${BODY_TOP}
                      L ${x + BIN_WIDTH} ${BODY_TOP}
                      L ${x} ${BODY_TOP}
                      Z
                    `}
                  />
                  {/* Body region */}
                  <rect
                    x={x}
                    y={BODY_TOP}
                    width={BIN_WIDTH}
                    height={BODY_HEIGHT}
                  />
                </clipPath>
              </defs>

              {/* --- Animated fill rect (clipped to bin shape) --- */}
              <motion.rect
                x={x}
                y={BODY_TOP + BODY_HEIGHT} // start from bottom
                width={BIN_WIDTH}
                height={0}
                fill={bin.fill}
                fillOpacity={0.7}
                clipPath={`url(#bin-clip-${i})`}
                animate={
                  isInView
                    ? {
                        y: fillY,
                        height: fillHeight,
                      }
                    : { y: BODY_TOP + BODY_HEIGHT, height: 0 }
                }
                transition={{
                  type: "spring",
                  duration: 1,
                  bounce: 0.15,
                  delay: i * 0.12,
                }}
              />

              {/* --- Horizontal grain lines for texture --- */}
              {isInView &&
                Array.from({ length: Math.floor(fillHeight / 12) }).map(
                  (_, li) => {
                    const lineY = BODY_TOP + BODY_HEIGHT - (li + 1) * 12;
                    return (
                      <motion.line
                        key={li}
                        x1={x + 6}
                        y1={lineY}
                        x2={x + BIN_WIDTH - 6}
                        y2={lineY}
                        stroke={bin.fill}
                        strokeOpacity={0.3}
                        strokeWidth={0.5}
                        clipPath={`url(#bin-clip-${i})`}
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{
                          duration: 0.6,
                          delay: i * 0.12 + 0.5,
                        }}
                      />
                    );
                  }
                )}

              {/* --- Label below bin --- */}
              <text
                x={x + BIN_WIDTH / 2}
                y={BODY_TOP + BODY_HEIGHT + 16}
                textAnchor="middle"
                className="fill-foreground text-[10px] font-medium"
              >
                {bin.label}
              </text>
              <text
                x={x + BIN_WIDTH / 2}
                y={BODY_TOP + BODY_HEIGHT + 30}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {fmtKt(bin.ktonnes)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
