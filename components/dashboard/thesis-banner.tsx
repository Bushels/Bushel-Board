import { History } from "lucide-react";

interface HistoricalContext {
  deliveries_vs_5yr_avg_pct?: number | null;
  exports_vs_5yr_avg_pct?: number | null;
  seasonal_observation?: string;
  notable_patterns?: string[];
}

interface ThesisBannerProps {
  title: string;
  body: string;
  historicalContext?: HistoricalContext | null;
}

export function ThesisBanner({ title, body, historicalContext }: ThesisBannerProps) {
  const hasContext = historicalContext && (
    historicalContext.seasonal_observation ||
    (historicalContext.notable_patterns && historicalContext.notable_patterns.length > 0) ||
    historicalContext.deliveries_vs_5yr_avg_pct != null ||
    historicalContext.exports_vs_5yr_avg_pct != null
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-canola/20 bg-gradient-to-r from-canola/5 to-transparent p-4 sm:p-5 pl-6 sm:pl-7">
      {/* Gold left accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-canola" />

      <p className="text-[0.65rem] font-semibold uppercase tracking-[3px] text-canola mb-1.5">
        Active Thesis
      </p>
      <h3 className="font-display text-lg font-semibold text-foreground mb-1">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>

      {hasContext && (
        <details className="mt-3 group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-canola/80 hover:text-canola transition-colors select-none list-none [&::-webkit-details-marker]:hidden">
            <History className="h-3.5 w-3.5" />
            <span>Historical Context</span>
            <span className="ml-1 text-[0.6rem] text-muted-foreground/60 group-open:hidden">▸</span>
            <span className="ml-1 text-[0.6rem] text-muted-foreground/60 hidden group-open:inline">▾</span>
          </summary>
          <div className="mt-2 space-y-2 border-t border-canola/10 pt-2">
            {(historicalContext.deliveries_vs_5yr_avg_pct != null || historicalContext.exports_vs_5yr_avg_pct != null) && (
              <div className="flex flex-wrap gap-3">
                {historicalContext.deliveries_vs_5yr_avg_pct != null && (
                  <HistoricalBadge
                    label="Deliveries vs 5yr"
                    value={historicalContext.deliveries_vs_5yr_avg_pct}
                  />
                )}
                {historicalContext.exports_vs_5yr_avg_pct != null && (
                  <HistoricalBadge
                    label="Exports vs 5yr"
                    value={historicalContext.exports_vs_5yr_avg_pct}
                  />
                )}
              </div>
            )}
            {historicalContext.seasonal_observation && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {historicalContext.seasonal_observation}
              </p>
            )}
            {historicalContext.notable_patterns && historicalContext.notable_patterns.length > 0 && (
              <ul className="space-y-0.5">
                {historicalContext.notable_patterns.map((pattern, i) => (
                  <li key={`pattern-${i}`} className="text-xs text-muted-foreground leading-snug">
                    • {pattern}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function HistoricalBadge({ label, value }: { label: string; value: number }) {
  const isPositive = value > 0;
  const colorClass = isPositive ? "text-prairie" : "text-red-500";
  const bgClass = isPositive ? "bg-prairie/10" : "bg-red-500/10";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${bgClass} ${colorClass}`}>
      {label}: {isPositive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
