"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { StorageBreakdown as StorageData } from "@/lib/queries/observations";
import { fmtKt } from "@/lib/utils/format";

interface StorageBreakdownProps {
  data: StorageData[];
  grainName: string;
}

const STORAGE_COLORS: Record<string, string> = {
  "Primary Elevators": "#8b7355",   // wheat-600
  "Process Elevators": "#437a22",   // prairie green
  "Terminal Elevators": "#c17f24",  // canola gold
};

function DeltaBadge({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === 0) return null;
  const delta = current - previous;
  const pct = (delta / previous) * 100;
  if (Math.abs(delta) < 0.05) return null;

  const isPositive = delta > 0;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full ${
        isPositive
          ? "bg-prairie/10 text-prairie"
          : "bg-amber-500/10 text-amber-500"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {isPositive ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

export function StorageBreakdown({ data, grainName }: StorageBreakdownProps) {
  const total = data.reduce((sum, d) => sum + d.ktonnes, 0);
  const prevTotal = data.some(d => d.prevKtonnes !== undefined)
    ? data.reduce((sum, d) => sum + (d.prevKtonnes ?? 0), 0)
    : undefined;

  const totalDelta = prevTotal !== undefined && prevTotal > 0
    ? total - prevTotal
    : undefined;
  const totalDeltaPct = prevTotal !== undefined && prevTotal > 0
    ? ((total - prevTotal) / prevTotal) * 100
    : undefined;

  const chartData = data.map((d) => ({
    name: d.storage_type.replace(" Elevators", "").replace(" Elevator", ""),
    value: d.ktonnes,
    pct: total > 0 ? ((d.ktonnes / total) * 100).toFixed(1) : "0",
    fullName: d.storage_type,
    prevKtonnes: d.prevKtonnes,
  }));

  return (
    <div className="w-full">
      {/* Total summary with WoW */}
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {grainName} Storage
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-lg font-display font-semibold text-foreground tabular-nums">
            {fmtKt(total)}
          </span>
          {totalDelta !== undefined && totalDeltaPct !== undefined && Math.abs(totalDelta) >= 0.05 && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-mono tabular-nums px-1.5 py-0.5 rounded-full ${
                totalDelta > 0
                  ? "bg-prairie/10 text-prairie"
                  : "bg-amber-500/10 text-amber-500"
              }`}
            >
              {totalDelta > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : totalDelta < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {totalDelta > 0 ? "+" : ""}
              {totalDeltaPct.toFixed(1)}% WoW
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} layout="vertical" barSize={24}>
          <XAxis
            type="number"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => fmtKt(v)}
            className="text-muted-foreground"
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            width={80}
            className="text-muted-foreground"
          />
          <Tooltip
            formatter={(value) => [fmtKt(value as number), "Stocks"]}
            contentStyle={{
              borderRadius: "8px",
              backdropFilter: "blur(8px)",
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={800}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={STORAGE_COLORS[entry.fullName] ?? "#8b7355"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Inline percentage labels with WoW badges */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {chartData.map((d) => (
          <span key={d.name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: STORAGE_COLORS[d.fullName] ?? "#8b7355" }}
            />
            {d.name}: {d.pct}%
            <DeltaBadge current={d.value} previous={d.prevKtonnes} />
          </span>
        ))}
      </div>
    </div>
  );
}
