"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  Line,
  ComposedChart,
} from "recharts";
import type { CumulativeWeekRow, HistoricalPipelineAvg } from "@/lib/queries/observations";
import type { DeliveryEntry } from "@/lib/queries/crop-plans";
import { fmtKt } from "@/lib/utils/format";

/** Format small farmer-scale deliveries: show tonnes if <1 kt, otherwise kt */
function fmtFarmDelivery(value: number): string {
  if (value < 1) {
    const tonnes = value * 1000;
    return `${tonnes.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} t`;
  }
  return fmtKt(value);
}

interface GamifiedGrainChartProps {
  weeklyData: CumulativeWeekRow[];
  userDeliveries: DeliveryEntry[];
  cropYearStart?: number;
  priorYearData?: CumulativeWeekRow[];
  fiveYrAvgData?: HistoricalPipelineAvg[];
}

export function GamifiedGrainChart({
  weeklyData,
  userDeliveries,
  cropYearStart = 2025,
  priorYearData,
  fiveYrAvgData,
}: GamifiedGrainChartProps) {
  const [showPriorYear, setShowPriorYear] = useState(false);
  const [showFiveYrAvg, setShowFiveYrAvg] = useState(false);

  if (weeklyData.length === 0) return null;

  // Build user delivery cumulative by grain week
  const weekStart = new Date(cropYearStart, 7, 1); // Aug 1
  const userByWeek = new Map<number, number>();
  let cumulative = 0;
  const sorted = [...userDeliveries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  for (const d of sorted) {
    cumulative += d.amount_kt;
    const deliveryDate = new Date(d.date);
    const weekNum = Math.max(
      1,
      Math.ceil(
        (deliveryDate.getTime() - weekStart.getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      )
    );
    userByWeek.set(weekNum, cumulative);
  }

  // Build lookup maps for overlay data
  const priorByWeek = new Map<number, number>();
  if (priorYearData) {
    for (const row of priorYearData) {
      priorByWeek.set(row.grain_week, row.producer_deliveries_kt);
    }
  }
  const avgByWeek = new Map<number, number>();
  if (fiveYrAvgData) {
    for (const row of fiveYrAvgData) {
      avgByWeek.set(row.grain_week, row.avg_deliveries_kt);
    }
  }

  // Merge CGC weekly data with user deliveries (forward-fill last known value)
  const chartData = weeklyData.reduce<
    { week: number; weekDate: string; deliveries: number; terminalReceipts: number; exports: number; processing: number; userDeliveries: number | undefined; priorYearDeliveries: number | undefined; fiveYrAvgDeliveries: number | undefined }[]
  >((acc, row) => {
    const userVal = userByWeek.get(row.grain_week);
    const prev = acc.length > 0 ? acc[acc.length - 1].userDeliveries ?? 0 : 0;
    const currentVal = userVal !== undefined ? userVal : prev;
    acc.push({
      week: row.grain_week,
      weekDate: row.week_ending_date,
      deliveries: row.producer_deliveries_kt,
      terminalReceipts: row.terminal_receipts_kt,
      exports: row.exports_kt,
      processing: row.processing_kt,
      userDeliveries: currentVal > 0 ? currentVal : undefined,
      priorYearDeliveries: priorByWeek.get(row.grain_week) ?? undefined,
      fiveYrAvgDeliveries: avgByWeek.get(row.grain_week) ?? undefined,
    });
    return acc;
  }, []);

  const hasUserData = userDeliveries.length > 0;

  const hasPrior = priorYearData && priorYearData.length > 0;
  const hasAvg = fiveYrAvgData && fiveYrAvgData.length > 0;

  return (
    <Card className="bg-card w-full border-border/40 p-4">
      {/* YoY toggle buttons */}
      {(hasPrior || hasAvg) && (
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-muted-foreground font-medium">Compare:</span>
          {hasPrior && (
            <button
              type="button"
              onClick={() => setShowPriorYear((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
                showPriorYear
                  ? "bg-muted-foreground/20 text-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
              }`}
            >
              <svg width="16" height="8" className="shrink-0"><line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="8 4" /></svg>
              Last Year
            </button>
          )}
          {hasAvg && (
            <button
              type="button"
              onClick={() => setShowFiveYrAvg((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
                showFiveYrAvg
                  ? "bg-muted-foreground/20 text-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
              }`}
            >
              <svg width="16" height="8" className="shrink-0"><line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
              5yr Avg
            </button>
          )}
        </div>
      )}
      <div className="h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: hasUserData ? 50 : 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--muted-foreground))"
            opacity={0.2}
            vertical={false}
          />

          <XAxis
            dataKey="week"
            tickFormatter={(val) => `Wk ${val}`}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickMargin={10}
          />

          {/* Left axis: pipeline-scale (kt) */}
          <YAxis
            yAxisId="left"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(val) => fmtKt(val)}
            axisLine={false}
            tickLine={false}
            label={{
              value: "Pipeline (kt)",
              angle: -90,
              position: "insideLeft",
              offset: -5,
              style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
            }}
          />

          {/* Right axis: farmer-scale deliveries */}
          {hasUserData && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--color-canola)"
              fontSize={12}
              tickFormatter={fmtFarmDelivery}
              axisLine={false}
              tickLine={false}
              label={{
                value: "Your Farm",
                angle: 90,
                position: "insideRight",
                offset: -5,
                style: { fontSize: 11, fill: "var(--color-canola)" },
              }}
            />
          )}

          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
              borderRadius: "8px",
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelFormatter={(val) => `Week ${val}`}
            formatter={(value, name) => {
              const v = Number(value ?? 0);
              const label = String(name ?? "");
              if (label === "Your Deliveries") {
                return [fmtFarmDelivery(v), label];
              }
              return [fmtKt(v), label];
            }}
          />

          <Legend
            wrapperStyle={{ paddingTop: "20px" }}
            formatter={(value) => (
              <span className="text-xs">
                {value}{value === "Your Deliveries" ? " (right axis)" : ""}
              </span>
            )}
          />

          {/* Producer deliveries area */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="deliveries"
            name="Producer Deliveries"
            fill="hsl(var(--primary))"
            fillOpacity={0.2}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
          />

          {/* Terminal Receipts - solid line (grain reaching terminals) */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="terminalReceipts"
            name="Terminal Receipts"
            stroke="var(--color-province-sk)"
            strokeWidth={2}
            dot={false}
          />

          {/* Exports - dashed line */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="exports"
            name="Exports"
            stroke="var(--color-prairie)"
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
          />

          {/* Processing / Crush - dotted line */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="processing"
            name="Processing"
            stroke="var(--color-province-mb)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
          />

          {/* User's cumulative deliveries */}
          {hasUserData && (
            <Line
              yAxisId="right"
              type="stepAfter"
              dataKey="userDeliveries"
              name="Your Deliveries"
              stroke="var(--color-canola)"
              strokeWidth={3}
              dot={{ r: 4, fill: "var(--color-canola)" }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          )}

          {/* Prior Year overlay (dashed) */}
          {showPriorYear && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="priorYearDeliveries"
              name="Last Year Deliveries"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="8 4"
              dot={false}
              connectNulls
            />
          )}

          {/* 5-Year Average overlay (dotted) */}
          {showFiveYrAvg && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="fiveYrAvgDeliveries"
              name="5yr Avg Deliveries"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              opacity={0.6}
              dot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </Card>
  );
}
