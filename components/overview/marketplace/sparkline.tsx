// components/overview/marketplace/sparkline.tsx
// Pure SVG sparkline for Kalshi YES-probability candlesticks.
// Server-renderable (no hooks, no client state) — the stroke-draw
// animation happens via CSS `@keyframes` injected inline below.
//
// ── INTEGRATION POINT ───────────────────────────────────────────────────
// Belongs to the Kalshi marketplace surface only — see isolation fence
// in lib/kalshi/types.ts.
// ────────────────────────────────────────────────────────────────────────

import { candleMidPrice } from "@/lib/kalshi/client";
import type { KalshiCandle } from "@/lib/kalshi/types";

interface SparklineProps {
  candles: KalshiCandle[];
  width: number;
  height: number;
  /** Stroke color. */
  color: string;
  /** Optional area fill below the stroke. */
  fillColor?: string | null;
  /** Animation duration in ms (set to 0 to disable stroke-draw). */
  animateMs?: number;
  /** Stable id used for the gradient + animation keyframes. */
  id?: string;
}

/**
 * Build a smooth path from a series of [x, y] points using a simple
 * Catmull-Rom-style mid-point smoothing. We don't need true curves
 * for a 24-point sparkline — slight smoothing is enough to read as
 * "movement" rather than a jagged step chart.
 */
function buildPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  const segs: string[] = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev[0] + curr[0]) / 2;
    segs.push(`Q ${prev[0]} ${prev[1]} ${midX} ${(prev[1] + curr[1]) / 2}`);
    if (i === points.length - 1) {
      segs.push(`T ${curr[0]} ${curr[1]}`);
    }
  }
  return segs.join(" ");
}

export function Sparkline({
  candles,
  width,
  height,
  color,
  fillColor,
  animateMs = 1200,
  id = "spark",
}: SparklineProps) {
  // Reduce to the mid-of-bid-ask series; ignore candles with no quote.
  const series = candles
    .map((c) => ({ ts: c.endTs, v: candleMidPrice(c) }))
    .filter((p): p is { ts: number; v: number } => p.v != null);

  if (series.length < 2) {
    // Render a flat ghost line so the layout doesn't jump.
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        style={{ display: "block", overflow: "visible" }}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2 4"
          opacity={0.4}
        />
      </svg>
    );
  }

  const minV = Math.min(...series.map((p) => p.v));
  const maxV = Math.max(...series.map((p) => p.v));
  const range = Math.max(0.02, maxV - minV); // floor avoids div-by-zero on flat lines
  const minTs = series[0].ts;
  const maxTs = series[series.length - 1].ts;
  const tsRange = Math.max(1, maxTs - minTs);

  // Padding inside the viewBox so the stroke doesn't clip.
  const PAD = 2;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;

  const points: Array<[number, number]> = series.map((p) => {
    const x = PAD + ((p.ts - minTs) / tsRange) * innerW;
    const y = PAD + (1 - (p.v - minV) / range) * innerH;
    return [x, y];
  });

  const linePath = buildPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  const areaPath = fillColor
    ? `${linePath} L ${lastPoint[0]} ${height - PAD} L ${firstPoint[0]} ${height - PAD} Z`
    : null;

  const lastValue = series[series.length - 1].v;
  const firstValue = series[0].v;
  const direction = lastValue > firstValue ? "up" : lastValue < firstValue ? "down" : "flat";

  const gradientId = `${id}-area-gradient`;
  const dashId = `${id}-dash`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible" }}
      role="img"
      aria-label={`Sparkline trending ${direction}`}
    >
      <defs>
        {fillColor && (
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity={0.45} />
            <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
          </linearGradient>
        )}
        {animateMs > 0 && (
          <style>{`
            @keyframes ${dashId} {
              from { stroke-dashoffset: 1000; }
              to { stroke-dashoffset: 0; }
            }
          `}</style>
        )}
      </defs>

      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}

      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          animateMs > 0
            ? {
                strokeDasharray: 1000,
                strokeDashoffset: 0,
                animation: `${dashId} ${animateMs}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
              }
            : undefined
        }
      />

      {/* Terminal dot */}
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2.5} fill={color} />
    </svg>
  );
}
