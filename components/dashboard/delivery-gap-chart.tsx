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
} from "recharts";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import { fmtKt } from "@/lib/utils/format";
import { computeDeliveryGap } from "@/lib/utils/delivery-gap";
import type { DeliveryGapPoint } from "@/lib/utils/delivery-gap";
import type { CumulativeWeekRow } from "@/lib/queries/observations";

const COLOR_BEHIND = "#437a22"; // prairie green — bullish/holding
const COLOR_AHEAD = "#d97706"; // amber — bearish pressure
const COLOR_CURRENT = "#c17f24"; // canola
const COLOR_PRIOR = "hsl(var(--muted-foreground))";

interface DeliveryGapChartProps {
  currentYearData: CumulativeWeekRow[];
  priorYearData: CumulativeWeekRow[];
  grainName: string;
}

type ChartPoint = DeliveryGapPoint & { week_label: string };

interface TooltipPayloadItem {
  color?: string;
  name?: string;
  value?: number | string;
  dataKey?: string;
  payload?: ChartPoint;
}

function GapTooltip({
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
  let gapColor: string;
  if (row.gap > 0) {
    gapText = `${fmtKt(row.gap)} behind`;
    gapColor = COLOR_BEHIND;
  } else if (row.gap < 0) {
    gapText = `${fmtKt(Math.abs(row.gap))} ahead`;
    gapColor = COLOR_AHEAD;
  } else {
    gapText = "On pace";
    gapColor = "hsl(var(--muted-foreground))";
  }

  items.push({ name: "Gap", value: gapText, color: gapColor });

  return <GlassTooltip active={active} label={`Week ${row.week}`} payload={items} />;
}

export function DeliveryGapChart({
  currentYearData,
  priorYearData,
  grainName,
}: DeliveryGapChartProps) {
  const gapData = computeDeliveryGap(currentYearData, priorYearData);
  if (gapData.length === 0) return null;

  const chartData: ChartPoint[] = gapData.map((d) => ({
    ...d,
    week_label: `W${d.week}`,
  }));

  return (
    <div>
      {/* Inline legend */}
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
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: COLOR_BEHIND }}
          />
          Behind (bullish)
        </span>
{/* Ahead (pressure) legend swatch deferred to Task 4 when two-color gap fill is implemented */}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
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
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => fmtKt(v, 0).replace(" kt", "")}
            className="text-muted-foreground"
            label={{
              value: "Cumulative Deliveries (Kt)",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "currentColor" },
            }}
          />
          <Tooltip content={<GapTooltip />} />

          {/* Gap fill area — approximation using prior line as baseline */}
          <Area
            type="monotone"
            dataKey="prior"
            stroke="none"
            fill={COLOR_BEHIND}
            fillOpacity={0.08}
            connectNulls
            animationDuration={800}
          />

          {/* Prior year — dashed line */}
          <Line
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

          {/* Current year — solid line */}
          <Line
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
