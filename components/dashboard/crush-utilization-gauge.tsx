"use client";

import { GlassCard } from "@/components/ui/glass-card";

interface CrushUtilizationGaugeProps {
  grainName: string;
  weeklyProcessingKt: number;
  annualCapacityKt: number;
  isApproximate?: boolean;
  source?: string;
}

function getArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy - r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy - r * Math.sin(endAngle);
  const largeArc = Math.abs(startAngle - endAngle) > Math.PI ? 1 : 0;
  // Sweep flag 0 = clockwise in SVG (since Y is flipped)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
}

function getColor(pct: number): string {
  if (pct >= 85) return "var(--color-prairie)";
  if (pct >= 65) return "hsl(var(--primary))";
  return "hsl(var(--muted-foreground))";
}

function getSignalText(pct: number): string {
  if (pct >= 85) return "High crush demand \u2014 bullish for basis";
  if (pct >= 65) return "Moderate crush pace";
  return "Below-average processing activity";
}

export function CrushUtilizationGauge({
  grainName,
  weeklyProcessingKt,
  annualCapacityKt,
  isApproximate = false,
  source,
}: CrushUtilizationGaugeProps) {
  const annualizedKt = weeklyProcessingKt * 52;
  const utilizationPct = Math.min(100, (annualizedKt / annualCapacityKt) * 100);
  const color = getColor(utilizationPct);
  const signalText = getSignalText(utilizationPct);

  const cx = 100;
  const cy = 90;
  const r = 70;

  // Background arc: full semicircle from PI (left) to 0 (right)
  const bgPath = getArcPath(cx, cy, r, Math.PI, 0);

  // Filled arc: from PI (left) toward 0 (right) based on percentage
  const fillEndAngle = Math.PI - (utilizationPct / 100) * Math.PI;
  const fillPath =
    utilizationPct > 0
      ? getArcPath(cx, cy, r, Math.PI, fillEndAngle)
      : "";

  return (
    <GlassCard className="p-5">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        Crush Utilization
      </h3>

      {/* SVG Gauge */}
      <div className="flex justify-center">
        <svg viewBox="0 0 200 110" className="w-full max-w-[240px]">
          {/* Background arc */}
          <path
            d={bgPath}
            fill="none"
            stroke="hsl(var(--muted) / 0.5)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {utilizationPct > 0 && (
            <path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
            />
          )}
          {/* Center percentage */}
          <text
            x={cx}
            y={cy - 12}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: "28px", fontWeight: 700, fontFamily: "var(--font-display, inherit)" }}
          >
            {Math.round(utilizationPct)}%
          </text>
          <text
            x={cx}
            y={cy + 6}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: "10px" }}
          >
            of capacity
          </text>
        </svg>
      </div>

      {/* Signal text */}
      <p
        className="text-center text-sm font-medium mt-1"
        style={{ color }}
      >
        {signalText}
      </p>

      {/* Details */}
      <div className="mt-4 space-y-1.5 text-xs text-muted-foreground border-t border-border/50 pt-3">
        <div className="flex justify-between">
          <span>Weekly rate</span>
          <span className="font-medium text-foreground">
            {weeklyProcessingKt.toFixed(1)} Kt
          </span>
        </div>
        <div className="flex justify-between">
          <span>Annualized</span>
          <span className="font-medium text-foreground">
            {annualizedKt.toFixed(0)} Kt
          </span>
        </div>
        <div className="flex justify-between">
          <span>Capacity{isApproximate ? " (est.)" : ""}</span>
          <span className="font-medium text-foreground">
            {annualCapacityKt.toLocaleString()} Kt
          </span>
        </div>
        {source && (
          <p className="text-[10px] text-muted-foreground/60 pt-1">
            Source: {source}
          </p>
        )}
      </div>
    </GlassCard>
  );
}
