"use client";

import { TrendingUp, TrendingDown, Minus, Warehouse } from "lucide-react";
import type { StorageBreakdown as StorageData } from "@/lib/queries/observations";
import { fmtKt } from "@/lib/utils/format";
import { GlassCard } from "@/components/ui/glass-card";

interface StorageBreakdownProps {
  data: StorageData[];
  grainName: string;
}

const STORAGE_COLORS: Record<string, string> = {
  "Primary Elevators": "#2e6b9e",
  "Process Elevators": "#437a22",
  "Terminal Elevators": "#c17f24",
};

function WowBadge({
  changeKt,
  changePct,
  size = "sm",
}: {
  changeKt: number;
  changePct: number;
  size?: "sm" | "md";
}) {
  if (Math.abs(changeKt) < 0.05) return null;

  const isPositive = changeKt > 0;
  const iconCls = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  const textCls =
    size === "md"
      ? "text-xs px-2 py-0.5"
      : "text-[10px] px-1.5 py-0.5";

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono tabular-nums rounded-full ${textCls} ${
        isPositive
          ? "bg-prairie/10 text-prairie"
          : "bg-amber-500/10 text-amber-500"
      }`}
    >
      {isPositive ? (
        <TrendingUp className={iconCls} />
      ) : (
        <TrendingDown className={iconCls} />
      )}
      {isPositive ? "+" : ""}
      {fmtKt(changeKt)} ({changePct > 0 ? "+" : ""}
      {changePct.toFixed(1)}%)
    </span>
  );
}

export function StorageBreakdown({ data, grainName }: StorageBreakdownProps) {
  const total = data.reduce((sum, d) => sum + d.ktonnes, 0);
  const prevTotal = data.some((d) => d.prevKtonnes !== undefined)
    ? data.reduce((sum, d) => sum + (d.prevKtonnes ?? 0), 0)
    : undefined;

  const totalChangeKt =
    prevTotal !== undefined ? total - prevTotal : 0;
  const totalChangePct =
    prevTotal !== undefined && prevTotal > 0
      ? ((total - prevTotal) / prevTotal) * 100
      : 0;

  const maxKtonnes = Math.max(...data.map((d) => d.ktonnes), 1);

  return (
    <GlassCard className="p-5" hover={false}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-0.5">
        <Warehouse className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Grain Storage
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Stock distribution by elevator type
      </p>

      {/* Total summary */}
      <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-border/50">
        <span className="text-xs text-muted-foreground">Total Stocks</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-display font-semibold text-foreground tabular-nums">
            {fmtKt(total)}
          </span>
          {prevTotal !== undefined && (
            <WowBadge
              changeKt={totalChangeKt}
              changePct={totalChangePct}
              size="md"
            />
          )}
        </div>
      </div>

      {/* Per-type bars */}
      <div className="space-y-3">
        {data.map((d) => {
          const shortName = d.storage_type
            .replace(" Elevators", "")
            .replace(" Elevator", "");
          const color = STORAGE_COLORS[d.storage_type] ?? "#8b7355";
          const barPct = maxKtonnes > 0 ? (d.ktonnes / maxKtonnes) * 100 : 0;
          const changeKt = d.ktonnes - (d.prevKtonnes ?? d.ktonnes);
          const changePct =
            d.prevKtonnes !== undefined && d.prevKtonnes > 0
              ? ((d.ktonnes - d.prevKtonnes) / d.prevKtonnes) * 100
              : 0;

          return (
            <div key={d.storage_type}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-medium text-foreground">
                    {shortName}
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums text-foreground">
                  {fmtKt(d.ktonnes)}
                </span>
              </div>

              {/* Horizontal bar */}
              <div className="h-2.5 w-full rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: color,
                  }}
                />
              </div>

              {/* WoW delta */}
              {d.prevKtonnes !== undefined && (
                <div className="mt-0.5">
                  <WowBadge changeKt={changeKt} changePct={changePct} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
