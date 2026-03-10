"use client";

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
import type { CumulativeWeekRow } from "@/lib/queries/observations";
import type { DeliveryEntry } from "@/lib/queries/crop-plans";
import { fmtKt } from "@/lib/utils/format";

interface GamifiedGrainChartProps {
  weeklyData: CumulativeWeekRow[];
  userDeliveries: DeliveryEntry[];
  cropYearStart?: number;
}

export function GamifiedGrainChart({
  weeklyData,
  userDeliveries,
  cropYearStart = 2025,
}: GamifiedGrainChartProps) {
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

  // Merge CGC weekly data with user deliveries (forward-fill last known value)
  const chartData = weeklyData.reduce<
    { week: number; weekDate: string; deliveries: number; terminalReceipts: number; exports: number; processing: number; userDeliveries: number | undefined }[]
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
    });
    return acc;
  }, []);

  const hasUserData = userDeliveries.length > 0;

  return (
    <Card className="bg-card w-full h-[400px] border-border/40 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
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

          {/* Left axis: macro data */}
          <YAxis
            yAxisId="left"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(val) => fmtKt(val)}
            axisLine={false}
            tickLine={false}
          />

          {/* Right axis: user deliveries */}
          {hasUserData && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--canola))"
              fontSize={12}
              tickFormatter={(val) => fmtKt(val)}
              axisLine={false}
              tickLine={false}
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
            formatter={(value: number, name: string) => [fmtKt(value), name]}
          />

          <Legend wrapperStyle={{ paddingTop: "20px" }} />

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
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
