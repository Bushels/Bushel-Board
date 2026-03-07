"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface WeeklyDataPoint {
  week: number;
  weekDate: string;
  Alberta: number;
  Saskatchewan: number;
  Manitoba: number;
  total: number;
}

interface GrainChartProps {
  deliveries: WeeklyDataPoint[];
  title: string;
}

export function GrainChart({ deliveries, title }: GrainChartProps) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 bg-card text-center text-muted-foreground">
        <p>No delivery data available for {title}.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4 bg-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">
        {title} — Weekly Deliveries (kt)
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={deliveries}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 12 }}
            label={{
              value: "Week",
              position: "insideBottom",
              offset: -5,
              fontSize: 12,
            }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{
              value: "kt",
              angle: -90,
              position: "insideLeft",
              fontSize: 12,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
            }}
            formatter={(value: number | undefined) =>
              value !== undefined ? `${value.toFixed(1)} kt` : ""
            }
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="#c17f24"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Alberta"
            stroke="#2e6b9e"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
          />
          <Line
            type="monotone"
            dataKey="Saskatchewan"
            stroke="#6d9e3a"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
          />
          <Line
            type="monotone"
            dataKey="Manitoba"
            stroke="#b37d24"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
