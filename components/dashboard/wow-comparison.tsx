import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { WoWComparison } from "@/lib/queries/observations";

interface WoWComparisonCardProps {
  data: WoWComparison;
}

function formatKt(kt: number): string {
  if (kt >= 1000) return `${(kt / 1000).toFixed(1)}M`;
  return kt.toFixed(1);
}

export function WoWComparisonCard({ data }: WoWComparisonCardProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Week-over-Week Activity
        </h2>
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          W{data.lastWeekNum} → W{data.thisWeekNum}
        </span>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-5 gap-2 text-[0.6rem] uppercase tracking-[2px] text-muted-foreground font-medium pb-2 border-b border-border/30">
        <span>Metric</span>
        <span className="text-right">This Wk</span>
        <span className="text-right">Last Wk</span>
        <span className="text-right">Change</span>
        <span className="text-right">%</span>
      </div>

      {/* Data rows */}
      <div className="divide-y divide-border/20">
        {data.metrics.map((m) => {
          const isPositive = m.changeKt > 0;
          const isNegative = m.changeKt < 0;
          const isNeutral = m.changeKt === 0;

          const colorClass = isPositive
            ? "text-prairie"
            : isNegative
              ? "text-amber-500"
              : "text-muted-foreground";

          return (
            <div
              key={m.metric}
              className="grid grid-cols-5 gap-2 py-2.5 items-center text-sm"
            >
              <span className="font-medium text-foreground">{m.metric}</span>
              <span className="text-right font-mono tabular-nums text-foreground">
                {formatKt(m.thisWeek)}
              </span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                {formatKt(m.lastWeek)}
              </span>
              <span className={`text-right font-mono tabular-nums flex items-center justify-end gap-1 ${colorClass}`}>
                {isPositive && <TrendingUp className="h-3.5 w-3.5 shrink-0" />}
                {isNegative && <TrendingDown className="h-3.5 w-3.5 shrink-0" />}
                {isNeutral && <Minus className="h-3.5 w-3.5 shrink-0" />}
                {isPositive ? "+" : ""}{formatKt(m.changeKt)}
              </span>
              <span className={`text-right font-mono tabular-nums text-xs ${colorClass}`}>
                {isPositive ? "+" : ""}{m.changePct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
