interface SupplyPipelineProps {
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
  cy_deliveries_kt: number;
  grain: string;
}

export function SupplyPipeline({
  carry_in_kt, production_kt, total_supply_kt, cy_deliveries_kt, grain,
}: SupplyPipelineProps) {
  const onFarm = total_supply_kt - cy_deliveries_kt;
  const deliveredPct = ((cy_deliveries_kt / total_supply_kt) * 100).toFixed(1);
  const onFarmPct = ((onFarm / total_supply_kt) * 100).toFixed(1);
  const max = total_supply_kt * 1.05; // 5% padding

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-display text-base font-semibold">
          {grain} Supply Pipeline
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          AAFC balance sheet: {formatMmt(production_kt)} production, {formatMmt(carry_in_kt)} carry-in, {formatMmt(total_supply_kt)} total supply
        </p>
      </div>

      <div className="space-y-2.5">
        <WaterfallRow label="Carry-in" value={carry_in_kt} max={max} color="bg-orange-400" />
        <WaterfallRow label="Production" value={production_kt} max={max} color="bg-prairie" />

        <div className="border-t border-dashed border-canola/25 my-1" />

        <WaterfallRow label="= Total Supply" value={total_supply_kt} max={max} color="bg-canola/60 border border-canola" bold />

        <div className="border-t border-dashed border-border my-1" />

        <WaterfallRow label="Delivered to Date" value={cy_deliveries_kt} max={max} color="bg-blue-400" />
        <WaterfallRow
          label="Remaining On-Farm"
          value={onFarm}
          max={max}
          color="bg-red-400/60 border border-red-400"
          offset={cy_deliveries_kt / max}
        />
      </div>

      {/* Summary callouts */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Callout value={`${deliveredPct}%`} label="of supply delivered" color="text-blue-400 border-blue-400/20 bg-blue-400/5" />
        <Callout value={`${onFarmPct}%`} label="still on-farm" color="text-red-400 border-red-400/20 bg-red-400/5" />
      </div>
    </div>
  );
}

function WaterfallRow({
  label, value, max, color, bold, offset,
}: {
  label: string; value: number; max: number; color: string; bold?: boolean; offset?: number;
}) {
  const widthPct = (value / max) * 100;
  const leftPct = offset ? offset * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className={`w-24 sm:w-36 text-right text-xs shrink-0 ${bold ? "font-semibold text-canola" : "text-muted-foreground"}`}>
        {label}
      </span>
      <div className="flex-1 h-7 relative rounded bg-muted/30">
        <div
          className={`absolute top-0 h-full rounded ${color} transition-all duration-1000`}
          style={{ width: `${widthPct}%`, left: `${leftPct}%` }}
        />
      </div>
      <span className={`min-w-[70px] text-xs font-semibold ${bold ? "text-canola text-sm" : "text-foreground"}`}>
        {formatMmt(value)}
      </span>
    </div>
  );
}

function Callout({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className={`px-3 py-2 rounded-lg border ${color}`}>
      <p className="font-display text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[0.6rem] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function formatMmt(kt: number): string {
  if (kt >= 1000) return `${(kt / 1000).toFixed(1)} MMT`;
  return `${kt.toFixed(0)} Kt`;
}
