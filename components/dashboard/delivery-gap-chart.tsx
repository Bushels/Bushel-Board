"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import { fmtKt } from "@/lib/utils/format";
import { computeDeliveryGap } from "@/lib/utils/delivery-gap";
import type { DeliveryGapPoint } from "@/lib/utils/delivery-gap";
import type { CumulativeWeekRow } from "@/lib/queries/observations";

const COLOR_GAP = "#437a22"; // prairie green — gap line + fill
const COLOR_CURRENT = "#c17f24"; // canola
const COLOR_PRIOR = "hsl(var(--muted-foreground))";

const formatAxis = (v: number) => fmtKt(v, 0).replace(" kt", "");

interface DeliveryGapChartProps {
  currentYearData: CumulativeWeekRow[];
  priorYearData: CumulativeWeekRow[];
}

interface TooltipPayloadItem {
  color?: string;
  name?: string;
  value?: number | string;
  dataKey?: string;
  payload?: DeliveryGapPoint & { week_label: string };
}

function GapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  const items: { name: string; value: string; color: string }[] = [
    { name: "This Year", value: fmtKt(row.current), color: COLOR_CURRENT },
  ];

  if (row.prior !== null) {
    items.push({
      name: "Last Year",
      value: fmtKt(row.prior),
      color: COLOR_PRIOR,
    });
  }

  let gapText: string;
  if (row.gap > 0) {
    gapText = `+${fmtKt(row.gap)} behind`;
  } else if (row.gap < 0) {
    gapText = `${fmtKt(row.gap)} ahead`;
  } else {
    gapText = "On pace";
  }

  items.push({ name: "YoY Gap", value: gapText, color: COLOR_GAP });

  return <GlassTooltip active={active} label={`Week ${row.week}`} payload={items} />;
}

export function DeliveryGapChart({
  currentYearData,
  priorYearData,
}: DeliveryGapChartProps) {
  const chartData = useMemo(() => {
    const gapData = computeDeliveryGap(currentYearData, priorYearData);
    return gapData.map((d) => ({ ...d, week_label: `W${d.week}` }));
  }, [currentYearData, priorYearData]);

  if (chartData.length === 0) return null;

  return (
    <div>
      {/* Inline legend — 3 items matching the 3 datasets */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" className="shrink-0">
            <line
              x1="0"
              y1="1"
              x2="16"
              y2="1"
              stroke={COLOR_CURRENT}
              strokeWidth="2.5"
            />
          </svg>
          This Year
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" className="shrink-0">
            <line
              x1="0"
              y1="1"
              x2="16"
              y2="1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </svg>
          Last Year
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="4" className="shrink-0">
            <rect width="16" height="4" rx="1" fill={COLOR_GAP} fillOpacity="0.3" />
            <line
              x1="0"
              y1="2"
              x2="16"
              y2="2"
              stroke={COLOR_GAP}
              strokeWidth="1.5"
            />
          </svg>
          YoY Gap (bullish)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="currentColor"
            opacity={0.15}
          />
          <XAxis
            dataKey="week_label"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />

          {/* Left Y-axis: cumulative deliveries (Kt) */}
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            tickFormatter={formatAxis}
            className="text-muted-foreground"
            label={{
              value: "Cumulative Deliveries (Kt)",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "currentColor" },
            }}
          />

          {/* Right Y-axis: YoY gap (Kt) — separate scale for gap line */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: COLOR_GAP }}
            tickFormatter={formatAxis}
            className="text-muted-foreground"
            label={{
              value: "YoY Gap (Kt)",
              angle: 90,
              position: "insideRight",
              style: { fontSize: 11, fill: COLOR_GAP },
            }}
          />

          <Tooltip content={<GapTooltip />} />

          {/* Gap fill area on right Y-axis — shaded region under gap line */}
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="gap"
            stroke="none"
            fill={COLOR_GAP}
            fillOpacity={0.15}
            animationDuration={800}
            name="_gap_fill"
            legendType="none"
          />

          {/* Gap line on right Y-axis */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="gap"
            name="YoY Gap"
            stroke={COLOR_GAP}
            strokeWidth={2}
            dot={false}
            animationDuration={800}
          />

          {/* Prior year — dashed line on left Y-axis */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="prior"
            name="Last Year"
            stroke={COLOR_PRIOR}
            strokeWidth={1.5}
            strokeDasharray="8 4"
            dot={false}
            connectNulls
            animationDuration={800}
          />

          {/* Current year — solid line on left Y-axis */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="current"
            name="This Year"
            stroke={COLOR_CURRENT}
            strokeWidth={2.5}
            dot={false}
            animationDuration={800}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
