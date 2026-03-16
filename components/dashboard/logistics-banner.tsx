"use client";

import {
  Bar,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
  Cell,
} from "recharts";
import { LogisticsStatPill } from "./logistics-stat-pill";
import {
  generateLogisticsHeadline,
  vesselSentiment,
  octSentiment,
  shipmentYoySentiment,
} from "@/lib/queries/logistics-utils";
import type {
  LogisticsSnapshot,
  WeeklyTerminalFlow,
} from "@/lib/queries/logistics-utils";

interface LogisticsBannerProps {
  logistics: LogisticsSnapshot;
  aggregateFlow: WeeklyTerminalFlow[];
}

export function LogisticsBanner({
  logistics,
  aggregateFlow,
}: LogisticsBannerProps) {
  if (!logistics.grain_monitor) return null;

  const monitor = logistics.grain_monitor;

  const vessels = Number(monitor.vessels_vancouver);
  const vesselAvg = Number(monitor.vessel_avg_one_year_vancouver);
  const oct = Number(monitor.out_of_car_time_pct);
  const ytdShipments = Number(monitor.ytd_shipments_total_kt);
  const ytdYoy = Number(monitor.ytd_shipments_yoy_pct);
  const grainWeek = Number(monitor.grain_week);

  const { headline, subtext } = generateLogisticsHeadline({
    vessels_vancouver: vessels,
    vessel_avg_one_year_vancouver: vesselAvg,
    out_of_car_time_pct: oct,
    ytd_shipments_yoy_pct: ytdYoy,
    grain_week: grainWeek,
  });

  const sparkData = aggregateFlow.map((row) => ({
    grain_week: Number(row.grain_week),
    net_flow_kt: Number(row.net_flow_kt),
  }));

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-5 backdrop-blur-sm">
      {/* Headline section */}
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-[1.5px] text-canola">
          Grain Monitor &middot; Wk{grainWeek}
        </p>
        <h3 className="mt-1 font-display text-xl font-bold sm:text-2xl">
          {headline}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtext}</p>
      </div>

      {/* Stat pills row */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <LogisticsStatPill
          label="Vessels at Vancouver"
          value={vessels}
          sentiment={vesselSentiment(vessels, vesselAvg)}
          sublabel={`Avg: ${vesselAvg}`}
        />
        <LogisticsStatPill
          label="Out-of-Car Time"
          value={`${oct.toFixed(1)}%`}
          sentiment={octSentiment(oct)}
        />
        <LogisticsStatPill
          label="YTD Shipments"
          value={`${ytdShipments.toLocaleString()} kt`}
          sentiment={shipmentYoySentiment(ytdYoy)}
          sublabel={`${ytdYoy >= 0 ? "+" : ""}${ytdYoy.toFixed(0)}% YoY`}
        />
      </div>

      {/* Compact sparkline */}
      {sparkData.length > 0 && (
        <div className="h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sparkData}>
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              <Bar dataKey="net_flow_kt" maxBarSize={8} radius={[2, 2, 0, 0]}>
                {sparkData.map((entry, idx) => (
                  <Cell
                    key={`bar-${idx}`}
                    fill={
                      entry.net_flow_kt >= 0
                        ? "color-mix(in srgb, var(--color-prairie) 60%, transparent)"
                        : "color-mix(in srgb, var(--destructive) 60%, transparent)"
                    }
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
