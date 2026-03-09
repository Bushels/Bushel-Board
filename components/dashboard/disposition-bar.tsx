"use client";

import { useMemo } from "react";
import { fmtKt } from "@/lib/utils/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

const DESTINATION_COLORS: Record<string, string> = {
  Pacific: "var(--color-province-ab)",
  "Thunder Bay": "var(--color-prairie)",
  Churchill: "var(--color-province-sk)",
  "Eastern Terminals": "var(--color-terminal-brown)",
  "Canadian Domestic": "var(--color-province-mb)",
  "Process Elevators": "var(--color-elevator-gold)",
  "Export Destinations": "var(--color-canola)",
};

export function DispositionBar({
  data,
}: {
  data: { region: string; ktonnes: number }[];
}) {
  const chartData = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.ktonnes, 0);
    return data
      .filter((d) => d.ktonnes > 0)
      .sort((a, b) => b.ktonnes - a.ktonnes)
      .map((d) => ({
        ...d,
        pct: total > 0 ? (d.ktonnes / total) * 100 : 0,
        color: DESTINATION_COLORS[d.region] || "var(--color-terminal-brown)",
      }));
  }, [data]);

  const total = chartData.reduce((sum, d) => sum + d.ktonnes, 0);

  if (total === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
        No shipment distribution data available.
      </div>
    );
  }

  // Calculate height dynamically based on number of items so the bars aren't squished
  const height = Math.max(250, chartData.length * 45 + 40);

  return (
    <div className="w-full rounded-xl border border-border/40 bg-card p-4 shadow-sm" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 60, left: 10, bottom: 5 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="region"
            axisLine={false}
            tickLine={false}
            fontSize={12}
            width={130}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            cursor={{ fill: "transparent" }}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              borderColor: "hsl(var(--border))",
              borderRadius: "8px",
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any, props: any) => [
              `${fmtKt(value as number)} (${props.payload.pct.toFixed(1)}%)`,
              "Volume",
            ]}
          />
          <Bar dataKey="ktonnes" radius={[0, 4, 4, 0]} barSize={24}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="ktonnes"
              position="right"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => fmtKt(value as number)}
              fill="hsl(var(--muted-foreground))"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
