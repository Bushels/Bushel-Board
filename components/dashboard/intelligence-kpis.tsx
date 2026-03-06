interface KpiData {
  cy_deliveries_kt: number;
  cw_deliveries_kt: number;
  wow_deliveries_pct: number | null;
  cy_exports_kt: number;
  yoy_exports_pct: number | null;
  cy_crush_kt: number;
  yoy_crush_pct: number | null;
  commercial_stocks_kt: number;
  wow_stocks_change_kt: number;
}

export function IntelligenceKpis({ data }: { data: KpiData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Producer Deliveries"
        value={`${data.cw_deliveries_kt.toFixed(1)}`}
        unit="Kt this week"
        change={data.wow_deliveries_pct}
        changeLabel="WoW"
        subtext={`CY: ${formatKt(data.cy_deliveries_kt)}`}
        highlight
      />
      <KpiCard
        label="Commercial Stocks"
        value={`${formatKt(data.commercial_stocks_kt)}`}
        unit="Kt total"
        changeKt={data.wow_stocks_change_kt}
        changeLabel="from last week"
      />
      <KpiCard
        label="CY Exports"
        value={`${formatKt(data.cy_exports_kt)}`}
        unit="Kt to date"
        change={data.yoy_exports_pct}
        changeLabel="YoY"
      />
      <KpiCard
        label="CY Crush"
        value={`${formatKt(data.cy_crush_kt)}`}
        unit="Kt to date"
        change={data.yoy_crush_pct}
        changeLabel="YoY"
      />
    </div>
  );
}

function KpiCard({
  label, value, unit, change, changeKt, changeLabel, subtext, highlight,
}: {
  label: string;
  value: string;
  unit: string;
  change?: number | null;
  changeKt?: number;
  changeLabel?: string;
  subtext?: string;
  highlight?: boolean;
}) {
  const changeColor = change != null
    ? change > 0 ? "text-prairie font-semibold" : change < 0 ? "text-error font-semibold" : ""
    : changeKt != null
      ? changeKt > 0 ? "text-prairie font-semibold" : changeKt < 0 ? "text-error font-semibold" : ""
      : "";

  const changeText = change != null
    ? `${change > 0 ? "+" : ""}${change}% ${changeLabel}`
    : changeKt != null
      ? `${changeKt > 0 ? "+" : ""}${changeKt.toFixed(1)} Kt ${changeLabel}`
      : null;

  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-canola/30 bg-canola/5" : "border-border bg-card"}`}>
      <p className="text-[0.6rem] font-medium uppercase tracking-[2px] text-muted-foreground mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${highlight ? "text-canola" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {unit}
        {changeText && (
          <> · <span className={changeColor}>{changeText}</span></>
        )}
      </p>
      {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  );
}

function formatKt(kt: number): string {
  if (kt >= 1000) return `${(kt / 1000).toFixed(1)}M`;
  return kt.toFixed(1);
}
