"use client";

import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { LogisticsStatPill } from "./logistics-stat-pill";
import {
  vesselSentiment,
  octSentiment,
  shipmentYoySentiment,
} from "@/lib/queries/logistics";
import type {
  WeeklyTerminalFlow,
  LogisticsSnapshot,
} from "@/lib/queries/logistics";
import { fmtKt } from "@/lib/utils/format";

interface TerminalFlowChartProps {
  flowData: WeeklyTerminalFlow[];
  logistics: LogisticsSnapshot | null;
  grainName: string;
}

export function TerminalFlowChart({
  flowData,
  logistics,
  grainName,
}: TerminalFlowChartProps) {
  if (flowData.length === 0) return null;

  // PostgREST returns numeric as strings — always wrap in Number()
  const chartData = flowData.map((row) => ({
    week: `Wk${row.grain_week}`,
    receipts: Number(row.terminal_receipts_kt),
    exports: Number(row.exports_kt),
    netFlow: Number(row.net_flow_kt),
  }));

  const monitor = logistics?.grain_monitor ?? null;

  return (
    <Card className="bg-card w-full border-border/40 p-4">
      {/* Header */}
      <div className="mb-3">
        <h3 className="font-display text-base font-semibold">
          Terminal Net Flow
        </h3>
        <p className="text-xs text-muted-foreground">
          Weekly receipts vs. exports at terminal elevators
        </p>
      </div>

      {/* System-wide logistics stat pills */}
      {monitor && (
        <div className="mb-4">
          <p className="mb-2 text-[0.6rem] font-medium uppercase tracking-[1.5px] text-muted-foreground">
            System-wide logistics
          </p>
          <div className="grid grid-cols-3 gap-2">
            <LogisticsStatPill
              label="Vessels (Van)"
              value={Number(monitor.vessels_vancouver)}
              sentiment={vesselSentiment(
                Number(monitor.vessels_vancouver),
                Number(monitor.vessel_avg_one_year_vancouver)
              )}
              sublabel={`Avg ${Number(monitor.vessel_avg_one_year_vancouver)}`}
            />
            <LogisticsStatPill
              label="Out-of-Car Time"
              value={`${Number(monitor.out_of_car_time_pct).toFixed(1)}%`}
              sentiment={octSentiment(Number(monitor.out_of_car_time_pct))}
            />
            <LogisticsStatPill
              label="Shipments YoY"
              value={`${Number(monitor.ytd_shipments_yoy_pct) > 0 ? "+" : ""}${Number(monitor.ytd_shipments_yoy_pct).toFixed(0)}%`}
              sentiment={shipmentYoySentiment(Number(monitor.ytd_shipments_yoy_pct))}
            />
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--muted-foreground))"
              opacity={0.2}
              vertical={false}
            />

            <XAxis
              dataKey="week"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickMargin={8}
            />

            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(val) => fmtKt(val)}
              axisLine={false}
              tickLine={false}
              label={{
                value: "000's Tonnes",
                angle: -90,
                position: "insideLeft",
                offset: -5,
                style: {
                  fontSize: 11,
                  fill: "hsl(var(--muted-foreground))",
                },
              }}
            />

            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.5}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "8px",
              }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value, name) => {
                const v = Number(value ?? 0);
                const label = String(name ?? "");
                if (label === "Net Flow") {
                  const tag =
                    v >= 0 ? `Building +${fmtKt(v)}` : `Drawing ${fmtKt(v)}`;
                  return [tag, label];
                }
                return [fmtKt(v), label];
              }}
            />

            <Legend
              wrapperStyle={{ paddingTop: "12px" }}
              formatter={(value) => (
                <span className="text-xs">{value}</span>
              )}
            />

            {/* Net flow diverging bars — green when positive, red when negative */}
            <Bar dataKey="netFlow" name="Net Flow" barSize={16}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`nf-${index}`}
                  fill={
                    entry.netFlow >= 0
                      ? "color-mix(in srgb, var(--color-prairie) 65%, transparent)"
                      : "color-mix(in srgb, var(--destructive) 65%, transparent)"
                  }
                />
              ))}
            </Bar>

            {/* Receipts — solid line, province-sk color */}
            <Line
              type="monotone"
              dataKey="receipts"
              name="Receipts"
              stroke="var(--color-province-sk)"
              strokeWidth={2}
              dot={false}
            />

            {/* Exports — dashed line, canola color */}
            <Line
              type="monotone"
              dataKey="exports"
              name="Exports"
              stroke="var(--color-canola)"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footnote */}
      <p className="mt-2 text-[0.65rem] text-muted-foreground">
        Green bars = {grainName} building at terminals (receipts &gt; exports).
        Red bars = drawing down (exports &gt; receipts).
      </p>
    </Card>
  );
}
