"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { CumulativeWeekRow } from "@/lib/queries/observations";
import { fmtKt } from "@/lib/utils/format";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

interface TooltipPayloadEntry {
  dataKey: string;
  color: string;
  name: string;
  value: number;
  payload?: {
    exports_kt?: number;
    processing_kt?: number;
    terminal_receipts_kt?: number;
  };
}

function PaceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card/95 backdrop-blur-sm p-3 shadow-lg min-w-[220px]">
      <p className="font-semibold text-sm mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between text-sm gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{fmtKt(p.value)}</span>
        </div>
      ))}
      {payload[0]?.payload && (
        <div className="mt-1 pt-1 border-t text-xs text-muted-foreground space-y-0.5">
          <div className="flex justify-between">
            <span>Terminal Receipts</span>
            <span>{fmtKt(payload[0].payload.terminal_receipts_kt ?? 0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface PaceChartProps {
  weeklyData: CumulativeWeekRow[];
  userDeliveries?: { grain_week: number; cumulative_kt: number }[];
  grainName: string;
}

export function PaceChart({
  weeklyData,
  userDeliveries,
  grainName,
}: PaceChartProps) {
  // Merge user deliveries into weekly data
  const chartData = weeklyData.map((w) => {
    const userRow = userDeliveries?.find(
      (u) => u.grain_week === w.grain_week
    );
    return {
      ...w,
      my_deliveries_kt: userRow?.cumulative_kt ?? null,
      week_label: `W${w.grain_week}`,
    };
  });

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {grainName} — Weekly Pace (Crop Year {CURRENT_CROP_YEAR})
      </h3>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="week_label"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}M`}
            className="text-muted-foreground"
          />
          <Tooltip content={<PaceTooltip />} />
          <Legend />

          {/* Producer Deliveries - filled area */}
          <Area
            type="monotone"
            dataKey="producer_deliveries_kt"
            name="Producer Deliveries"
            fill="var(--color-canola)"
            fillOpacity={0.25}
            stroke="var(--color-canola)"
            strokeWidth={2}
            animationDuration={1000}
          />

          {/* Terminal Receipts - solid line (grain reaching terminals) */}
          <Line
            type="monotone"
            dataKey="terminal_receipts_kt"
            name="Terminal Receipts"
            stroke="var(--color-province-sk)"
            strokeWidth={2}
            dot={false}
            animationDuration={1000}
          />

          {/* Exports - dashed line */}
          <Line
            type="monotone"
            dataKey="exports_kt"
            name="Exports"
            stroke="var(--color-prairie)"
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
            animationDuration={1000}
          />

          {/* Processing / Crush - dotted line */}
          <Line
            type="monotone"
            dataKey="processing_kt"
            name="Processing"
            stroke="var(--color-province-mb)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            animationDuration={1000}
          />

          {/* My Farm Deliveries - dotted line (only if data exists) */}
          {userDeliveries && userDeliveries.length > 0 && (
            <Line
              type="stepAfter"
              dataKey="my_deliveries_kt"
              name="My Farm Deliveries"
              stroke="var(--color-province-ab)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: "var(--color-province-ab)" }}
              connectNulls={false}
              animationDuration={1000}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
