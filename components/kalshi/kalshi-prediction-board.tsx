import { Activity, ExternalLink, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { KalshiCalibrationRow } from "@/lib/kalshi/commodity-markets";
import type { KalshiCommodityCalibrationData } from "@/lib/queries/kalshi-commodities";
import { cn } from "@/lib/utils";

function formatDateTime(value: string | null): string {
  if (!value) return "Not stamped";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function confidenceClass(confidence: string): string {
  if (confidence === "high") return "border-prairie/30 bg-prairie/10 text-prairie";
  if (confidence === "medium") return "border-canola/35 bg-canola/10 text-canola";
  return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function kalshiAlignmentClass(alignment: KalshiCalibrationRow["alignment"]): string {
  if (alignment === "aligned") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (alignment === "divergent") return "border-canola/30 bg-canola/10 text-canola";
  if (alignment === "no_market" || alignment === "no_thesis") {
    return "border-border bg-muted/50 text-muted-foreground";
  }
  return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

function probabilityClass(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 55) return "text-prairie";
  if (value <= 45) return "text-amber-700 dark:text-amber-300";
  return "text-muted-foreground";
}

function formatPercent(value: number | null): string {
  if (value === null) return "--";
  return `${value.toFixed(0)}%`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(0)} pts`;
}

function formatOptionalNumber(value: number | null): string {
  if (value === null) return "--";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatShortDateTime(value: string | null): string {
  if (!value) return "Unknown close";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function deltaClass(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  const gap = Math.abs(value);
  if (gap <= 8) return "text-prairie";
  if (gap >= 15) return "text-canola";
  return "text-amber-700 dark:text-amber-300";
}

function LineReasonList({
  label,
  reasons,
  emptyLabel,
}: {
  label: string;
  reasons: KalshiCalibrationRow["bushelBoardLine"]["topBullReasons"];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {reasons.length > 0 ? (
        reasons.slice(0, 1).map((reason) => (
          <div key={`${reason.tone}-${reason.sourceName}-${reason.title}`} className="space-y-1">
            <p className="text-sm font-semibold leading-5 text-foreground">{reason.title}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {reason.metricLabel} / {reason.sourceName}
            </p>
            <Badge variant="outline" className={confidenceClass(reason.confidence)}>
              {reason.confidence}
            </Badge>
          </div>
        ))
      ) : (
        <p className="text-sm leading-5 text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function KalshiMarketDetails({
  market,
  mode,
}: {
  market: NonNullable<KalshiCalibrationRow["featuredMarket"]>;
  mode: "active" | "latest";
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              mode === "active"
                ? "border-prairie/25 bg-prairie/10 text-prairie"
                : "border-border bg-muted/40 text-muted-foreground"
            }
          >
            {mode === "active" ? "Active API market" : `Latest API market - ${market.status}`}
          </Badge>
          {mode === "latest" && (
            <Badge variant="outline" className="border-amber-600/25 bg-amber-500/10 text-amber-800">
              Not used for line
            </Badge>
          )}
        </div>
        <p className="text-sm font-semibold leading-6 text-foreground">{market.title}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div>
          <p className="font-semibold text-foreground">Spread</p>
          <p>{formatPercent(market.spreadPct)}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Volume</p>
          <p>{formatOptionalNumber(market.volume)}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Closes</p>
          <p>{formatShortDateTime(market.closeTime)}</p>
        </div>
      </div>
      <a
        href={market.apiUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-canola hover:text-canola/80"
      >
        Market API payload
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

function KalshiCalibrationCard({ row }: { row: KalshiCalibrationRow }) {
  const market = row.featuredMarket;
  const latestMarket = row.latestMarket;
  const line = row.bushelBoardLine;

  return (
    <Card className="rounded-lg py-5 shadow-sm">
      <CardHeader className="gap-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                Kalshi
              </Badge>
              <Badge variant="outline" className={kalshiAlignmentClass(row.alignment)}>
                {row.alignmentLabel}
              </Badge>
            </div>
            <CardTitle className="font-display text-xl">{row.grain}</CardTitle>
            <CardDescription>
              {market
                ? `${market.horizon} above-threshold contract`
                : latestMarket
                  ? "No active market; latest API market shown"
                  : "Watched series, no market returned"}
            </CardDescription>
          </div>
          <Scale className="h-5 w-5 shrink-0 text-canola" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kalshi YES
            </p>
            <p
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                probabilityClass(market?.impliedYesPct ?? null),
              )}
            >
              {formatPercent(market?.impliedYesPct ?? null)}
            </p>
            <p className="text-sm text-muted-foreground">
              {market?.strikeLabel
                ? `Above ${market.strikeLabel}`
                : latestMarket
                  ? "No active price; API data below"
                  : "No active price"}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bushel Board Implied Line
            </p>
            <p
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                probabilityClass(line.probabilityPct),
              )}
            >
              {formatPercent(line.probabilityPct)}
            </p>
            <p className="text-sm text-muted-foreground">
              {line.status === "available"
                ? `${line.country ?? "NA"} thesis / ${line.confidenceScore ?? "--"}% confidence`
                : line.statusLabel}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gap
            </p>
            <p className={cn("mt-2 text-2xl font-semibold tabular-nums", deltaClass(line.deltaPct))}>
              {formatSignedPercent(line.deltaPct)}
            </p>
            <p className="text-sm text-muted-foreground">Bushel Board minus Kalshi YES</p>
          </div>
        </div>

        {market ? (
          <KalshiMarketDetails market={market} mode="active" />
        ) : latestMarket ? (
          <KalshiMarketDetails market={latestMarket} mode="latest" />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <LineReasonList
            label="Top bull point"
            reasons={line.topBullReasons}
            emptyLabel="No bullish driver in the current packet."
          />
          <LineReasonList
            label="Top bear point"
            reasons={line.topBearReasons}
            emptyLabel="No bearish driver in the current packet."
          />
        </div>

        <p className="text-sm leading-6 text-muted-foreground">{row.explanation}</p>
        <details className="rounded-lg border border-border bg-background px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
            Calibration guardrails
          </summary>
          <div className="mt-2 space-y-1.5">
            {row.warnings.slice(0, 4).map((warning) => (
              <p key={warning} className="text-xs leading-5 text-muted-foreground">
                {warning}
              </p>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function KalshiPredictionBoard({ data }: { data: KalshiCommodityCalibrationData }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Kalshi Prediction Board</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Kalshi market YES beside the Bushel Board Implied Line. This is read-only
            commodity calibration, not a trading recommendation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit border-border bg-white/60">
            {data.marketCount} open markets
          </Badge>
          <Badge variant="outline" className="w-fit border-border bg-white/60">
            {data.latestMarketCount} latest API markets
          </Badge>
          <Badge variant="outline" className="w-fit border-canola/30 bg-canola/8 text-canola">
            {data.watchedSeriesCount} series watched
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-canola" aria-hidden="true" />
            <p className="text-sm font-semibold">
              {data.sourceStatus === "live"
                ? "Live Kalshi commodity markets returned"
                : data.sourceStatus === "no_active_markets"
                  ? data.latestMarketCount > 0
                    ? "Kalshi API connected; no open grain markets right now"
                    : "No active Kalshi grain markets returned right now"
                  : "Kalshi fetch returned warnings"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Snapshot {formatDateTime(data.capturedAt)}
          </p>
        </div>
        {data.warnings.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.warnings.slice(0, 3).map((warning) => (
              <p key={warning} className="text-xs leading-5 text-muted-foreground">
                {warning}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.rows.map((row) => (
          <KalshiCalibrationCard key={row.grain} row={row} />
        ))}
      </div>
    </section>
  );
}
