"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import { fmtKt } from "@/lib/utils/format";

export interface NetBalanceWeek {
  grain_week: number;
  deliveries_kt: number;
  exports_kt: number;
  processing_kt: number;
  net_balance_kt: number;
  cumulative_kt: number;
}

interface NetBalanceChartProps {
  data: NetBalanceWeek[];
  grainName: string;
}

const COLOR_SURPLUS = "#437a22";
const COLOR_DEFICIT = "#d97706";
const COLOR_CUMULATIVE = "#c17f24";

interface TooltipPayloadItem {
  color?: string;
  name?: string;
  value?: number | string;
  dataKey?: string;
  payload?: NetBalanceWeek & { week_label: string };
}

function NetBalanceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const items = [
    { name: "Deliveries", value: fmtKt(row.deliveries_kt), color: "#6b7280" },
    { name: "Exports", value: fmtKt(row.exports_kt), color: "#6b7280" },
    { name: "Processing", value: fmtKt(row.processing_kt), color: "#6b7280" },
    {
      name: "Net Balance",
      value: fmtKt(row.net_balance_kt),
      color: row.net_balance_kt >= 0 ? COLOR_SURPLUS : COLOR_DEFICIT,
    },
    {
      name: "Cumulative",
      value: fmtKt(row.cumulative_kt),
      color: COLOR_CUMULATIVE,
    },
  ];

  return (
    <GlassTooltip
      active={active}
      label={label}
      payload={items}
    />
  );
}

export function NetBalanceChart({ data, grainName }: NetBalanceChartProps) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    ...d,
    week_label: `W${d.grain_week}`,
  }));

  return (
    <GlassCard className="p-5" hover={false}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          Net Balance
        </h3>
        <p className="text-xs text-muted-foreground">
          Weekly deliveries minus exports &amp; processing
        </p>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.3}
          />
          <XAxis
            dataKey="week_label"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => fmtKt(v, 0).replace(" kt", "")}
            className="text-muted-foreground"
          />
          <Tooltip content={<NetBalanceTooltip />} />

          <Bar dataKey="net_balance_kt" name="Net Balance" opacity={0.8}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.net_balance_kt >= 0 ? COLOR_SURPLUS : COLOR_DEFICIT
                }
              />
            ))}
          </Bar>

          <Line
            type="monotone"
            dataKey="cumulative_kt"
            name="Cumulative"
            stroke={COLOR_CUMULATIVE}
            strokeWidth={2}
            dot={false}
            animationDuration={1000}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </GlassCard>
  );
}
