"use client";

import * as React from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import {
  Info,
  Minus,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassTooltip } from "@/components/ui/glass-tooltip";
import type { CotPosition, CotPositioningResult } from "@/lib/queries/cot";
import { cn } from "@/lib/utils";

interface FarmerCotCardProps {
  data: CotPositioningResult;
  className?: string;
}

const fmt = new Intl.NumberFormat("en-CA");

function formatContracts(value: number): string {
  return fmt.format(Math.abs(Math.round(value)));
}

function formatSignedContracts(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatContracts(value)}`;
}

function formatPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSide(value: number): string {
  if (value > 0) return "long";
  if (value < 0) return "short";
  return "flat";
}

function getRiskClasses(risk: CotPosition["reversal_risk"]): string {
  if (risk === "high") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
  }
  if (risk === "medium") {
    return "bg-canola/10 text-canola border-canola/20";
  }
  return "bg-prairie/10 text-prairie border-prairie/20";
}

function getBiasClasses(value: number): string {
  if (value > 0) return "text-prairie";
  if (value < 0) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function getPillClasses(bias: "bullish" | "bearish" | "neutral"): string {
  if (bias === "bullish") {
    return "bg-prairie/10 text-prairie border-prairie/20";
  }
  if (bias === "bearish") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
  }
  return "bg-wheat-200/50 text-muted-foreground border-border/40";
}

function buildBottomLine(latest: CotPosition): string {
  if (
    latest.spec_commercial_divergence &&
    latest.crowding_label === "crowded long"
  ) {
    return "Funds are crowded long while commercials stay on the other side. That usually supports the rally until momentum breaks, then reversal risk rises fast.";
  }

  if (
    latest.spec_commercial_divergence &&
    latest.crowding_label === "crowded short"
  ) {
    return "Funds are crowded short while commercials lean the other way. That creates short-covering rally risk if fundamentals improve.";
  }

  if (latest.spec_commercial_divergence) {
    return "Funds and commercials are leaning opposite ways. Treat this as a timing signal, not a clean directional call.";
  }

  if (latest.crowding_label === "crowded long") {
    return "Funds are pressing the long side of the market. Upside can still extend, but the trade is getting crowded.";
  }

  if (latest.crowding_label === "crowded short") {
    return "Funds are pressing the short side of the market. That keeps pressure on prices, but squeeze risk is building.";
  }

  return "Positioning is active but not stretched. Use it as context around timing, not as the main thesis by itself.";
}

function buildAiUseText(latest: CotPosition, weeksTracked: number): string {
  return `Bushel Board uses COT as a timing input. The AI checks whether funds are ${latest.crowding_label}, whether commercials are on the other side, and whether this week's move came from ${latest.change_driver}. With ${weeksTracked} tracked weeks loaded, this is recent-range context rather than a multi-year extreme signal.`;
}

function PositionMeter({
  label,
  netValue,
  pctValue,
  sublabel,
}: {
  label: string;
  netValue: number;
  pctValue: number;
  sublabel: string;
}) {
  const width = Math.min(48, Math.max(4, Math.abs(pctValue) * 1.6));
  const isPositive = netValue >= 0;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{sublabel}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-sm font-semibold tabular-nums", getBiasClasses(netValue))}>
            {formatSignedContracts(netValue)} {formatSide(netValue)}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {formatPercent(pctValue)} of OI
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground/60">
          <span>Short</span>
          <span>Long</span>
        </div>
        <div className="relative h-3 rounded-full bg-muted/35 overflow-hidden">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
          <div
            className={cn(
              "absolute inset-y-0 rounded-full",
              isPositive ? "bg-prairie/90" : "bg-amber-500/90"
            )}
            style={
              isPositive
                ? { left: "50%", width: `${width}%` }
                : { left: `calc(50% - ${width}%)`, width: `${width}%` }
            }
          />
        </div>
      </div>
    </div>
  );
}

function InsightMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "bullish" | "bearish" | "neutral";
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/35 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          tone === "bullish"
            ? "text-prairie"
            : tone === "bearish"
              ? "text-amber-700 dark:text-amber-300"
              : "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

export function FarmerCotCard({ data, className }: FarmerCotCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const { latest, positions } = data;

  if (!latest) {
    return (
      <GlassCard className={cn("p-6", className)}>
        <h3 className="text-base font-display font-semibold text-foreground mb-2">
          Market Positioning
        </h3>
        <p className="text-sm text-muted-foreground">
          COT data not available for this grain.
        </p>
      </GlassCard>
    );
  }

  const chartData = [...positions].reverse().map((position) => ({
    week: `Wk ${position.grain_week}`,
    funds: position.managed_money_net,
    commercials: position.commercial_net,
  }));

  const weeklyMoveTone =
    latest.wow_net_change > 0
      ? "bullish"
      : latest.wow_net_change < 0
        ? "bearish"
        : "neutral";
  const crowdingTone =
    latest.crowding_label.includes("long")
      ? "bullish"
      : latest.crowding_label.includes("short")
        ? "bearish"
        : "neutral";
  const commercialTone =
    latest.commercial_net < 0
      ? "bearish"
      : latest.commercial_net > 0
        ? "bullish"
        : "neutral";

  return (
    <GlassCard className={cn("p-6 flex flex-col gap-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-lg font-display font-semibold text-foreground">
              Market Positioning
            </h3>
            <div className="group relative">
              <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              <div className="absolute left-1/2 bottom-full z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg group-hover:block">
                Speculators are hedge funds trading momentum. Commercials are the grain trade hedging physical grain. The gap between them is often a timing signal.
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Who is crowded, who is on the other side, and how fast it changed
          </p>
          {data.primaryProxyLabel && (
            <p className="text-[11px] text-muted-foreground/80">
              {data.primaryProxyLabel}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border/50 bg-background/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Tuesday snapshot
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              getRiskClasses(latest.reversal_risk)
            )}
          >
            {latest.reversal_risk === "high" ? (
              <ShieldAlert className="h-3.5 w-3.5" />
            ) : latest.reversal_risk === "medium" ? (
              <Minus className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {latest.reversal_risk} reversal risk
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-background/35 px-4 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
          Bottom line
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground">
          {buildBottomLine(latest)}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InsightMetric
          label="Funds crowding"
          value={latest.crowding_label}
          detail={latest.crowding_context}
          tone={crowdingTone}
        />
        <InsightMetric
          label="This week"
          value={`${formatSignedContracts(latest.wow_net_change)} more ${latest.wow_net_change >= 0 ? "bullish" : latest.wow_net_change < 0 ? "bearish" : "flat"}`}
          detail={`Driven by ${latest.change_driver}.`}
          tone={weeklyMoveTone}
        />
        <InsightMetric
          label="Commercials"
          value={`${formatSide(latest.commercial_net)} ${formatContracts(latest.commercial_net)}`}
          detail={`${latest.commercial_label} at ${formatPercent(latest.commercial_net_pct)} of open interest.`}
          tone={commercialTone}
        />
        <InsightMetric
          label="Tracking window"
          value={`${data.weeksTracked} weeks`}
          detail={`${data.coverageLabel}${data.coverageStart ? ` Started ${data.coverageStart}.` : ""}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
          <PositionMeter
            label="Speculators (funds)"
            netValue={latest.managed_money_net}
            pctValue={latest.managed_money_net_pct}
            sublabel="Momentum money in futures"
          />
        </div>
        <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
          <PositionMeter
            label="Commercials"
            netValue={latest.commercial_net}
            pctValue={latest.commercial_net_pct}
            sublabel="Grain trade hedging the physical market"
          />
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                Speculators vs commercials
              </p>
              <p className="text-xs text-muted-foreground">
                Recent tug-of-war in the main futures proxy
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {data.coverageLabel}
            </p>
          </div>

          <div className="h-40 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="week"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis hide />
                <Tooltip
                  content={
                    <GlassTooltip
                      formatter={(value) => {
                        const numeric = Number(value);
                        return `${formatContracts(numeric)} ${formatSide(numeric)}`;
                      }}
                    />
                  }
                />
                <ReferenceLine y={0} stroke="#8b7355" strokeDasharray="3 3" strokeOpacity={0.45} />
                <Line
                  type="monotone"
                  dataKey="funds"
                  name="Funds"
                  stroke="#437a22"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#437a22", strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  animationDuration={prefersReducedMotion ? 0 : 700}
                />
                <Line
                  type="monotone"
                  dataKey="commercials"
                  name="Commercials"
                  stroke="#2e6b9e"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#2e6b9e", strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  animationDuration={prefersReducedMotion ? 0 : 700}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data.relatedContracts.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-background/35 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
            Related futures
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.relatedContracts.slice(0, 3).map((contract) => (
              <span
                key={contract.commodity}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  getPillClasses(contract.funds_bias)
                )}
              >
                {contract.funds_bias === "bullish" ? (
                  <TrendingUp className="h-3 w-3" />
                ) : contract.funds_bias === "bearish" ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {contract.label}: {formatSide(contract.managed_money_net)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border/40 pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
          How AI uses this
        </p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {buildAiUseText(latest, data.weeksTracked)}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          {data.lagLabel} Use it to judge crowding and reversal risk around next week&apos;s thesis.
        </p>
      </div>
    </GlassCard>
  );
}
