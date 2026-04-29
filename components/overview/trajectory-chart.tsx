"use client";
// components/overview/trajectory-chart.tsx
// Friday-reset weekly trajectory chart — pure SVG, no Recharts.
// Direction B-inspired chart shape, Direction A warm wheat palette.
// CA = solid line (#437a22 prairie), US = dashed line (#b8702a amber).

import { useReducedMotion } from "framer-motion";
import type { TrajectoryPoint } from "@/lib/queries/overview-data";

const PRAIRIE = "#437a22";
const AMBER = "#b8702a";
const WHEAT_100 = "#ebe7dc";
const WHEAT_200 = "#d7cfba";
const WHEAT_400 = "#af9f76";
const INK_MUTED = "#7c6c43";

interface TrajectoryChartProps {
  caPoints: TrajectoryPoint[];
  usPoints?: TrajectoryPoint[];
  /** Width of the SVG viewBox */
  w?: number;
  /** Height of the SVG viewBox */
  h?: number;
  showLabels?: boolean;
}

function scoreToY(score: number, h: number, padding = 8): number {
  // score range -100..+100, center = h/2
  // padding ensures line doesn't clip the edge
  return h / 2 - (score / 100) * (h / 2 - padding);
}

function buildPath(
  points: TrajectoryPoint[],
  w: number,
  h: number,
  leftPad: number,
  rightPad: number,
): string {
  if (!points.length) return "";
  const n = points.length;
  const xFor = (i: number) => leftPad + (i / (n - 1)) * (w - leftPad - rightPad);
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${scoreToY(p.stanceScore, h).toFixed(1)}`)
    .join(" ");
}

function buildFillPath(
  points: TrajectoryPoint[],
  w: number,
  h: number,
  leftPad: number,
  rightPad: number,
): string {
  const linePath = buildPath(points, w, h, leftPad, rightPad);
  if (!linePath) return "";
  const n = points.length;
  const xFor = (i: number) => leftPad + (i / (n - 1)) * (w - leftPad - rightPad);
  const baseline = h / 2;
  const lastX = xFor(n - 1).toFixed(1);
  const firstX = xFor(0).toFixed(1);
  return `${linePath} L${lastX},${baseline} L${firstX},${baseline} Z`;
}

// Derive day labels from ISO timestamps (Mon, Tue, ... or Fri)
function getDayLabel(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-CA", { weekday: "short" });
  } catch {
    return "";
  }
}

export function TrajectoryChart({
  caPoints,
  usPoints,
  w = 320,
  h = 90,
  showLabels = true,
}: TrajectoryChartProps) {
  const prefersReduced = useReducedMotion();
  const leftPad = showLabels ? 36 : 8;
  const rightPad = 8;
  const baseline = h / 2;

  const caPath = buildPath(caPoints, w, h, leftPad, rightPad);
  const caFill = buildFillPath(caPoints, w, h, leftPad, rightPad);
  const usPath = usPoints?.length ? buildPath(usPoints, w, h, leftPad, rightPad) : "";

  const n = Math.max(caPoints.length, usPoints?.length ?? 0, 2);
  const xFor = (i: number) => leftPad + (i / (n - 1)) * (w - leftPad - rightPad);

  const dayLabels = caPoints.map((p, i) => ({
    label: getDayLabel(p.recordedAt),
    x: xFor(i),
  }));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: "block", overflow: "visible" }}
      role="img"
      aria-label="Weekly stance trajectory chart"
    >
      {/* Zero baseline */}
      <line
        x1={leftPad}
        x2={w - rightPad}
        y1={baseline}
        y2={baseline}
        stroke={WHEAT_200}
        strokeWidth={1}
        strokeDasharray="2 3"
      />

      {/* Y-axis labels */}
      {showLabels && (
        <>
          <text
            x={4}
            y={12}
            fontSize={9}
            fill={PRAIRIE}
            fontFamily="var(--font-dm-sans)"
            fontWeight="600"
          >
            +100
          </text>
          <text
            x={4}
            y={baseline + 3}
            fontSize={9}
            fill={INK_MUTED}
            fontFamily="var(--font-dm-sans)"
          >
            0
          </text>
          <text
            x={4}
            y={h - 2}
            fontSize={9}
            fill={AMBER}
            fontFamily="var(--font-dm-sans)"
            fontWeight="600"
          >
            −100
          </text>
        </>
      )}

      {/* CA area fill */}
      {caFill && !prefersReduced && (
        <>
          <defs>
            <linearGradient id="ca-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={PRAIRIE} stopOpacity="0.15" />
              <stop offset="100%" stopColor={PRAIRIE} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={caFill} fill="url(#ca-area-fill)" />
        </>
      )}

      {/* CA line */}
      {caPath && (
        <path
          d={caPath}
          fill="none"
          stroke={PRAIRIE}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* CA dots */}
      {caPoints.map((p, i) => (
        <circle
          key={`ca-${i}`}
          cx={xFor(i)}
          cy={scoreToY(p.stanceScore, h)}
          r={2.5}
          fill={PRAIRIE}
        />
      ))}

      {/* US dashed line */}
      {usPath && (
        <path
          d={usPath}
          fill="none"
          stroke={AMBER}
          strokeWidth={1.6}
          strokeDasharray="3 3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {usPoints?.map((p, i) => (
        <circle
          key={`us-${i}`}
          cx={xFor(i)}
          cy={scoreToY(p.stanceScore, h)}
          r={2.5}
          fill={AMBER}
        />
      ))}

      {/* Day labels + tick marks */}
      {showLabels &&
        dayLabels.map((d, i) => (
          <g key={`day-${i}`}>
            <line
              x1={d.x}
              x2={d.x}
              y1={baseline - 3}
              y2={baseline + 3}
              stroke={WHEAT_400}
              strokeWidth={1}
            />
            <text
              x={d.x}
              y={h}
              fontSize={9}
              textAnchor="middle"
              fill={INK_MUTED}
              fontFamily="var(--font-dm-sans)"
            >
              {d.label}
            </text>
          </g>
        ))}
    </svg>
  );
}
