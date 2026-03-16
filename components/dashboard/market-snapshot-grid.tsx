import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type {
  MarketOverviewSnapshot,
  MarketSnapshotMetric,
} from "@/lib/queries/market-overview";
import { fmtKt, fmtPct, fmtWeekDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface MarketSnapshotGridProps {
  snapshot: MarketOverviewSnapshot;
}

interface CardDefinition {
  key: string;
  label: string;
  helper: string;
  metric: MarketSnapshotMetric;
  accentClass: string;
}

export function MarketSnapshotGrid({ snapshot }: MarketSnapshotGridProps) {
  const cards: CardDefinition[] = [
    {
      key: "deliveries",
      label: "Producer Deliveries",
      helper: "All grains and oilseeds combined",
      metric: snapshot.producerDeliveries,
      accentClass: "text-canola",
    },
    {
      key: "receipts",
      label: "Terminal Receipts",
      helper: "Latest licensed handling activity",
      metric: snapshot.terminalReceipts,
      accentClass: "text-[#2e6b9e]",
    },
    {
      key: "exports",
      label: "Exports",
      helper: "Terminal exports plus direct export destinations",
      metric: snapshot.exports,
      accentClass: "text-prairie",
    },
    {
      key: "stocks",
      label: "Commercial Stocks",
      helper: "Primary, process, and terminal elevators",
      metric: snapshot.commercialStocks,
      accentClass: "text-amber-600",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/20 bg-white/60 p-4 shadow-elevation-1 backdrop-blur-lg backdrop-saturate-150 dark:border-wheat-700/20 dark:bg-wheat-900/50">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Week {snapshot.grainWeek}
            {snapshot.weekEndingDate ? ` - ended ${fmtWeekDate(snapshot.weekEndingDate)}` : ""}
          </p>
          <p>{snapshot.cropYear} CGC market totals rebuilt from canonical dashboard formulas</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <GlassCard key={card.key} index={index} className="p-4" hover={false}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{card.helper}</p>
              </div>
              <ChangeBadge metric={card.metric} />
            </div>

            <p className={cn("mt-5 font-display text-3xl font-bold", card.accentClass)}>
              {fmtKt(card.metric.currentWeekKt)}
            </p>

            <div className="mt-4 space-y-2 border-t border-border/40 pt-3 text-sm">
              <DataRow label="Week Ago" value={fmtKt(card.metric.previousWeekKt)} />
              <DataRow
                label={card.metric.cropYearKt === null ? "WoW Change" : "Crop Year To Date"}
                value={
                  card.metric.cropYearKt === null
                    ? formatKtDelta(card.metric.wowChangeKt)
                    : fmtKt(card.metric.cropYearKt)
                }
                emphasized={card.metric.cropYearKt === null}
              />
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function ChangeBadge({ metric }: { metric: MarketSnapshotMetric }) {
  if (metric.wowChangePct === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
        <Minus className="h-3 w-3" />
        N/A
      </span>
    );
  }

  if (metric.wowChangePct > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-prairie/10 px-2 py-1 text-xs font-medium text-prairie">
        <TrendingUp className="h-3 w-3" />
        {fmtPct(metric.wowChangePct)}
      </span>
    );
  }

  if (metric.wowChangePct < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-1 text-xs font-medium text-error">
        <TrendingDown className="h-3 w-3" />
        {fmtPct(metric.wowChangePct)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
      <Minus className="h-3 w-3" />
      {fmtPct(metric.wowChangePct)}
    </span>
  );
}

function DataRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", emphasized && "font-semibold text-foreground")}>{value}</span>
    </div>
  );
}

function formatKtDelta(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmtKt(value)}`;
}
