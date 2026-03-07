"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { SupplyDisposition } from "@/lib/queries/supply-disposition";
import { fmtKt } from "@/lib/utils/format";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";

interface WaterfallBar {
  name: string;
  base: number;
  value: number;
  color: string;
  index: number;
  totalSupply: number;
}

interface TooltipPayloadEntry {
  payload?: WaterfallBar;
}

function WaterfallTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.[1]?.payload) return null;
  const item = payload[1].payload;
  const pct =
    item.totalSupply > 0
      ? ((item.value / item.totalSupply) * 100).toFixed(1)
      : "0";
  return (
    <div className="rounded-lg border bg-card/95 backdrop-blur-sm p-3 shadow-lg">
      <p className="font-semibold text-sm">{item.name}</p>
      <p className="text-sm text-muted-foreground">
        {fmtKt(item.value)} ({pct}% of supply)
      </p>
    </div>
  );
}

interface WaterfallChartProps {
  data: SupplyDisposition;
  grainName: string;
}

export function WaterfallChart({ data, grainName }: WaterfallChartProps) {
  // Build waterfall bars: each has an invisible base + visible value
  const carryIn = data.carry_in_kt ?? 0;
  const production = data.production_kt ?? 0;
  const totalSupply = carryIn + production + (data.imports_kt ?? 0);
  const exports = data.exports_kt ?? 0;
  const foodIndustrial = data.food_industrial_kt ?? 0;
  const feedWaste = data.feed_waste_kt ?? 0;
  const carryOut = data.carry_out_kt ?? 0;

  const bars = [
    {
      name: "Carry-in",
      base: 0,
      value: carryIn,
      color: "#437a22", // prairie green
    },
    {
      name: "Production",
      base: carryIn,
      value: production,
      color: "#5a9e2e",
    },
    {
      name: "Exports",
      base: totalSupply - exports,
      value: exports,
      color: "#b33a3a",
    },
    {
      name: "Food/Industrial",
      base: totalSupply - exports - foodIndustrial,
      value: foodIndustrial,
      color: "#c17f24", // canola
    },
    {
      name: "Feed/Waste",
      base: totalSupply - exports - foodIndustrial - feedWaste,
      value: feedWaste,
      color: "#d4a855",
    },
    {
      name: "Carry-out",
      base: 0,
      value: carryOut,
      color: "#2e6b9e", // AB blue
    },
  ];

  const chartData = bars.map((b, i) => ({
    name: b.name,
    base: b.base,
    value: b.value,
    color: b.color,
    index: i,
    totalSupply,
  }));

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Where Does {grainName} Go? — {CURRENT_CROP_YEAR} Supply Balance
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}M`}
            className="text-muted-foreground"
          />
          <Tooltip content={<WaterfallTooltip />} />
          <ReferenceLine y={totalSupply} stroke="#888" strokeDasharray="3 3" />
          {/* Invisible base */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          {/* Visible value */}
          <Bar
            dataKey="value"
            stackId="waterfall"
            animationDuration={1000}
            radius={[4, 4, 0, 0]}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
