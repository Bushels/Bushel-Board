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

export function StorageBreakdown({ data, grainName }: StorageBreakdownProps) {
  const total = data.reduce((sum, d) => sum + d.ktonnes, 0);

  const chartData = data.map((d) => ({
    name: d.storage_type.replace(" Elevators", "").replace(" Elevator", ""),
    value: d.ktonnes,
    pct: total > 0 ? ((d.ktonnes / total) * 100).toFixed(1) : "0",
    fullName: d.storage_type,
  }));

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-1">
        {grainName} Storage — {fmtKt(total)} Total
      </h3>
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
      {/* Inline percentage labels */}
      <div className="flex gap-3 mt-1">
        {chartData.map((d) => (
          <span key={d.name} className="text-xs text-muted-foreground">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: STORAGE_COLORS[d.fullName] ?? "#8b7355" }}
            />
            {d.name}: {d.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}
