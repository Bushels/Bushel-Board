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

export function IntelligenceKpis({ data }: { data: Partial<KpiData> }) {
  const d = {
    cy_deliveries_kt: data.cy_deliveries_kt ?? 0,
    cw_deliveries_kt: data.cw_deliveries_kt ?? 0,
    wow_deliveries_pct: data.wow_deliveries_pct ?? null,
    cy_exports_kt: data.cy_exports_kt ?? 0,
    yoy_exports_pct: data.yoy_exports_pct ?? null,
    cy_crush_kt: data.cy_crush_kt ?? 0,
    yoy_crush_pct: data.yoy_crush_pct ?? null,
    commercial_stocks_kt: data.commercial_stocks_kt ?? 0,
    wow_stocks_change_kt: data.wow_stocks_change_kt ?? 0,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Producer Deliveries"
        value={`${d.cw_deliveries_kt.toFixed(1)}`}
        unit="Kt this week"
        change={d.wow_deliveries_pct}
        changeLabel="WoW"
        subtext={`CY: ${formatKt(d.cy_deliveries_kt)}`}
        highlight
      />
      <KpiCard
        label="Commercial Stocks"
        value={`${formatKt(d.commercial_stocks_kt)}`}
        unit="Kt total"
        changeKt={d.wow_stocks_change_kt}
        changeLabel="from last week"
      />
      <KpiCard
        label="CY Exports"
        value={`${formatKt(d.cy_exports_kt)}`}
        unit="Kt to date"
        change={d.yoy_exports_pct}
        changeLabel="YoY"
      />
      <KpiCard
        label="CY Crush"
        value={`${formatKt(d.cy_crush_kt)}`}
        unit="Kt to date"
        change={d.yoy_crush_pct}
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
