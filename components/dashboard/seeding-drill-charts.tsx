"use client";

import type { JSX } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import type { SeasonRow, FiveYearAvgRow, FuturesPoint, ConditionSegment } from "@/lib/queries/seeding-drill-utils";

// ─── TrajectoryChart ──────────────────────────────────────────────────────────
// Planted % over the season vs 5-year average

interface TrajectoryChartProps {
  season: SeasonRow[];
  fiveYearAvg: FiveYearAvgRow[];
}

function fmtWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}

export function TrajectoryChart({ season, fiveYearAvg }: TrajectoryChartProps): JSX.Element {
  // Merge season planted_pct with 5-year avg keyed by MM-DD
  const avgMap = new Map<string, number | null>(
    fiveYearAvg.map((r) => [r.week_ending.slice(5), r.avg_planted_pct]),
  );

  const data = season.map((r) => ({
    label: fmtWeek(r.week_ending),
    planted: r.planted_pct,
    avg: avgMap.get(r.week_ending.slice(5)) ?? null,
  }));

  if (data.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No planting progress data this season.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={130}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="drillPlanted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#c17f24" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#c17f24" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(90,79,54,0.15)" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7a6e58" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: "#7a6e58" }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          formatter={(value: unknown, name?: string) => {
            const n = typeof value === "number" ? value : null;
            return n !== null
              ? [`${Math.round(n)}%`, name === "planted" ? "Planted" : "5-yr avg"]
              : ["—", ""];
          }}
          contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid rgba(90,79,54,0.2)", background: "rgba(245,243,238,0.95)" }}
        />
        <Area type="monotone" dataKey="avg" stroke="#a89060" strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} name="5-yr avg" connectNulls />
        <Area type="monotone" dataKey="planted" stroke="#c17f24" strokeWidth={2} fill="url(#drillPlanted)" dot={false} name="planted" connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── ConditionBar ─────────────────────────────────────────────────────────────
// Horizontal stacked bar for VP/P/F/G/E condition segments

interface ConditionBarProps {
  segments: ConditionSegment[];
}

export function ConditionBar({ segments }: ConditionBarProps): JSX.Element {
  const total = segments.reduce((sum, s) => sum + (s.pct ?? 0), 0);
  if (total === 0) {
    return (
      <p className="py-2 text-center text-xs text-muted-foreground">
        No condition data available.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        {segments.map((seg) => {
          const width = total > 0 ? (seg.pct / total) * 100 : 0;
          return width > 0 ? (
            <div
              key={seg.label}
              style={{ width: `${width}%`, background: seg.color }}
              title={`${seg.label}: ${Math.round(seg.pct)}%`}
            />
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: seg.color }} />
            {seg.label} {Math.round(seg.pct)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── FuturesSparkline ─────────────────────────────────────────────────────────
// 90-day settlement price sparkline

interface FuturesSparklineProps {
  points: FuturesPoint[];
  contractLabel: string;
}

export function FuturesSparkline({ points, contractLabel }: FuturesSparklineProps): JSX.Element {
  if (points.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No futures data available.
      </p>
    );
  }

  const data = points.map((p) => ({
    date: fmtWeek(p.date),
    settle: p.settle,
  }));

  const prices = points.map((p) => p.settle).filter(Number.isFinite);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pad = (maxPrice - minPrice) * 0.08 || 1;

  return (
    <ResponsiveContainer width="100%" height={90}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#7a6e58" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: "#7a6e58" }} tickLine={false} axisLine={false} domain={[minPrice - pad, maxPrice + pad]} tickFormatter={(v) => `$${v.toFixed(0)}`} />
        <Tooltip
          formatter={(value: unknown) => {
            const n = typeof value === "number" ? value : Number(value);
            return [`$${n.toFixed(2)}`, contractLabel];
          }}
          contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid rgba(90,79,54,0.2)", background: "rgba(245,243,238,0.95)" }}
          labelStyle={{ color: "#7a6e58" }}
        />
        <Line type="monotone" dataKey="settle" stroke="#437a22" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
