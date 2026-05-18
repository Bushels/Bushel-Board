import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Flag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getThesisBoardData,
  type ThesisBoardItem,
  type ThesisComparisonPoint,
  type ThesisComparisonRow,
  type ThesisDriver,
} from "@/lib/queries/thesis-board";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
  if (confidence === "high") {
    return "border-prairie/30 bg-prairie/10 text-prairie";
  }
  if (confidence === "medium") {
    return "border-canola/35 bg-canola/10 text-canola";
  }
  return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function stanceClass(score: number): string {
  if (score > 0) return "text-prairie";
  if (score < 0) return "text-amber-700 dark:text-amber-300";
  return "text-muted-foreground";
}

function directionalIndicatorLabel(score: number): string {
  if (score >= 20) return "Bull tilt";
  if (score > 0) return "Lean bull";
  if (score <= -20) return "Bear tilt";
  if (score < 0) return "Lean bear";
  return "Balanced";
}

function stanceFillClass(score: number): string {
  if (score > 0) return "bg-prairie";
  if (score < 0) return "bg-amber-600";
  return "bg-muted-foreground";
}

function comparisonClass(status: ThesisComparisonRow["status"]): string {
  if (status === "aligned_bullish") {
    return "border-prairie/25 bg-prairie/10 text-prairie";
  }
  if (status === "aligned_bearish") {
    return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  if (status === "mixed") {
    return "border-canola/30 bg-canola/10 text-canola";
  }
  if (status === "mapping_needed") {
    return "border-border bg-muted/60 text-muted-foreground";
  }
  return "border-border bg-muted/50 text-muted-foreground";
}

function freshnessClass(status: string): string {
  if (status === "strong") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (status === "empty" || status === "broken") {
    return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-canola/30 bg-canola/10 text-canola";
}

function metricLabel(item: ThesisBoardItem): string {
  if (item.lane === "canada") {
    return `Crop year ${item.cropYear ?? "unknown"} / week ${item.grainWeek ?? "latest"}`;
  }
  return `Market year ${item.marketYear ?? "latest"}`;
}

function CountryTag({ country }: { country: "CA" | "US" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
      <Flag className="h-3 w-3" aria-hidden="true" />
      {country}
    </span>
  );
}

function MarketIndicator({
  item,
  country,
}: {
  item: ThesisBoardItem | null;
  country: "CA" | "US";
}) {
  if (!item) {
    return (
      <div className="space-y-2">
        <CountryTag country={country} />
        <p className="text-sm font-medium text-muted-foreground">Not modeled in V1</p>
      </div>
    );
  }

  const halfWidth = Math.min(50, Math.abs(item.stanceScore) / 2);
  const positive = item.stanceScore > 0;

  return (
    <div className="min-w-44 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <CountryTag country={country} />
        <Badge variant="outline" className={confidenceClass(item.confidence)}>
          {item.confidenceScore}% confidence
        </Badge>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={cn("text-2xl font-semibold tabular-nums", stanceClass(item.stanceScore))}>
            {item.stanceScore > 0 ? `+${item.stanceScore}` : item.stanceScore}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {directionalIndicatorLabel(item.stanceScore)}
          </p>
        </div>
        <div
          className="relative mb-1 h-2 w-28 rounded-full bg-muted"
          aria-label={`${country} stance score ${item.stanceScore}`}
        >
          <span className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
          <span
            className={cn(
              "absolute top-0 h-full rounded-full",
              stanceFillClass(item.stanceScore),
              positive ? "left-1/2" : "right-1/2",
            )}
            style={{ width: `${halfWidth}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

function ComparisonPointList({
  points,
  emptyLabel,
}: {
  points: ThesisComparisonPoint[];
  emptyLabel: string;
}) {
  if (points.length === 0) {
    return <p className="text-sm leading-6 text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {points.slice(0, 4).map((point) => (
        <div
          key={`${point.country}-${point.sourceName}-${point.title}-${point.tone}`}
          className="space-y-1 border-l-2 border-border pl-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <CountryTag country={point.country} />
            <p className="text-sm font-semibold text-foreground">{point.title}</p>
            <Badge variant="outline" className={confidenceClass(point.confidence)}>
              {point.confidence}
            </Badge>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {point.metricLabel} / {point.sourceName}
          </p>
        </div>
      ))}
    </div>
  );
}

function rowAverageScore(row: ThesisComparisonRow): number | null {
  const scores = [row.canada?.stanceScore, row.us?.stanceScore].filter(
    (score): score is number => typeof score === "number",
  );
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function signedAverageScore(row: ThesisComparisonRow): string {
  const score = rowAverageScore(row);
  if (score === null) return "no score";
  return score > 0 ? `+${score}` : String(score);
}

function TopTakeawayCard({ rows }: { rows: ThesisComparisonRow[] }) {
  const scoredRows = rows
    .map((row) => ({ row, score: rowAverageScore(row) }))
    .filter((entry): entry is { row: ThesisComparisonRow; score: number } => entry.score !== null);
  const strongestBull = scoredRows.reduce<(typeof scoredRows)[number] | null>(
    (best, entry) => (entry.score > 0 && (!best || entry.score > best.score) ? entry : best),
    null,
  );
  const strongestBear = scoredRows.reduce<(typeof scoredRows)[number] | null>(
    (best, entry) => (entry.score < 0 && (!best || entry.score < best.score) ? entry : best),
    null,
  );
  const countrySplits = rows.filter((row) => row.status === "mixed" && (row.canada || row.us)).length;
  const sourceMappingGaps = rows.filter((row) => !row.canada && !row.us).length;

  const leadLine = strongestBull
    ? `${strongestBull.row.grain} has the cleanest bull lean at ${signedAverageScore(strongestBull.row)}.`
    : "No grain has a clean bull lean in the current packets.";
  const riskLine = strongestBear
    ? `${strongestBear.row.grain} has the clearest bear pressure at ${signedAverageScore(strongestBear.row)}.`
    : "No grain has a clean bear lean in the current packets.";

  return (
    <Card className="rounded-lg border-canola/30 bg-gradient-to-br from-canola/10 via-card to-prairie/8 py-5 shadow-sm">
      <CardHeader className="gap-3 px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 border-canola/35 bg-background/70 text-canola">
              Farmer read first
            </Badge>
            <CardTitle className="font-display text-2xl">Top takeaway</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
              One pass before the big table: what looks most constructive, what needs caution,
              and where Canada/US disagree.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
              {countrySplits} country split{countrySplits === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
              {sourceMappingGaps} mapping gap{sourceMappingGaps === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 lg:grid-cols-3">
        <div className="rounded-lg border border-prairie/20 bg-background/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-prairie">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Most constructive
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{leadLine}</p>
        </div>
        <div className="rounded-lg border border-amber-600/20 bg-background/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <TrendingDown className="h-4 w-4" aria-hidden="true" />
            Most cautious
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{riskLine}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Flag className="h-4 w-4 text-canola" aria-hidden="true" />
            How to use it
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Treat this as a scouting sheet, not a trade signal. Start with split markets, then
            open the row drivers before changing a pricing plan.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MajorThesisMatrix({ rows }: { rows: ThesisComparisonRow[] }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Major Grain Thesis Matrix</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Canada and US major-grain calls in one read. Country markers show where
            the evidence differs; V1 excludes smaller CGC labels plus US rice and cotton.
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Score guide: negative leans bearish, positive leans bullish; confidence reflects source
            completeness and freshness, not price-advice certainty.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border bg-white/60">
          {rows.length} grain rows
        </Badge>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] text-left text-sm">
            <caption className="sr-only">
              Major Canada and US grain thesis matrix with stance, confidence, and strongest
              bull and bear evidence.
            </caption>
            <thead className="border-b border-border bg-muted/35 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-36 px-4 py-3 font-semibold">Grain</th>
                <th className="w-56 px-4 py-3 font-semibold">Canada</th>
                <th className="w-56 px-4 py-3 font-semibold">US</th>
                <th className="w-64 px-4 py-3 font-semibold">Strongest Bull Points</th>
                <th className="w-64 px-4 py-3 font-semibold">Strongest Bear Points</th>
                <th className="w-72 px-4 py-3 font-semibold">Country Read</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.grain} className="border-b border-border/70 align-top last:border-b-0">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-foreground">{row.grain}</p>
                  </td>
                  <td className="px-4 py-4">
                    <MarketIndicator item={row.canada} country="CA" />
                  </td>
                  <td className="px-4 py-4">
                    <MarketIndicator item={row.us} country="US" />
                  </td>
                  <td className="px-4 py-4">
                    <ComparisonPointList
                      points={row.strongestBullPoints}
                      emptyLabel="No bullish driver in the current packets."
                    />
                  </td>
                  <td className="px-4 py-4">
                    <ComparisonPointList
                      points={row.strongestBearPoints}
                      emptyLabel="No bearish driver in the current packets."
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <Badge variant="outline" className={comparisonClass(row.status)}>
                        {row.statusLabel}
                      </Badge>
                      <p className="text-sm leading-6 text-muted-foreground">{row.explanation}</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DriverList({
  title,
  tone,
  drivers,
}: {
  title: string;
  tone: "bull" | "bear";
  drivers: ThesisDriver[];
}) {
  const Icon = tone === "bull" ? TrendingUp : TrendingDown;
  const toneClass =
    tone === "bull"
      ? "border-prairie/20 bg-prairie/6 text-prairie"
      : "border-amber-600/20 bg-amber-500/8 text-amber-700 dark:text-amber-300";

  return (
    <div className={cn("rounded-lg border p-4", toneClass)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
      </div>
      {drivers.length > 0 ? (
        <div className="space-y-3">
          {drivers.slice(0, 4).map((driver) => (
            <div key={`${driver.sourceName}-${driver.title}`} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{driver.title}</p>
                <Badge variant="outline" className={confidenceClass(driver.confidence)}>
                  {driver.confidence}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{driver.body}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {driver.metricLabel} / {driver.sourceName}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          {tone === "bull"
            ? "No strong bullish drivers identified this week."
            : "No strong bearish drivers identified this week."}
        </p>
      )}
    </div>
  );
}

function FreshnessStrip({ item }: { item: ThesisBoardItem }) {
  const visibleRows = item.freshness.slice(0, 6);
  return (
    <div className="flex flex-wrap gap-2">
      {visibleRows.map((row) => (
        <Badge
          key={`${item.id}-${row.sourceName}`}
          variant="outline"
          className={freshnessClass(row.freshnessStatus)}
        >
          {row.sourceName}: {row.freshnessStatus}
        </Badge>
      ))}
      {item.freshness.length > visibleRows.length && (
        <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
          +{item.freshness.length - visibleRows.length} more
        </Badge>
      )}
    </div>
  );
}

function ThesisCard({ item }: { item: ThesisBoardItem }) {
  const href = item.lane === "canada" ? `/grain/${item.slug}` : `/us/${item.slug}`;

  return (
    <Card className="rounded-lg py-5 shadow-sm">
      <CardHeader className="gap-4 px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                {item.lane === "canada" ? "Canada" : "US"}
              </Badge>
              <Badge variant="outline" className={confidenceClass(item.confidence)}>
                {item.confidenceScore ?? "--"}% confidence
              </Badge>
            </div>
            <CardTitle className="font-display text-xl leading-tight">{item.name}</CardTitle>
            <CardDescription className="mt-1">{metricLabel(item)}</CardDescription>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className={cn("text-3xl font-semibold tabular-nums", stanceClass(item.stanceScore))}>
              {item.stanceScore > 0 ? `+${item.stanceScore}` : item.stanceScore}
            </p>
            <p className="text-sm font-medium text-muted-foreground">{item.stanceLabel}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <DriverList title="Bull Case" tone="bull" drivers={item.bullDrivers} />
          <DriverList title="Bear Case" tone="bear" drivers={item.bearDrivers} />
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">Source freshness</p>
            <p className="text-xs text-muted-foreground">
              Packet stamped {formatDateTime(item.packetGeneratedAt)}
            </p>
          </div>
          <FreshnessStrip item={item} />
          {item.warnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {item.warnings.slice(0, 3).map((warning) => (
                <p
                  key={`${item.id}-${warning.sourceName}-${warning.status}`}
                  className="flex gap-2 text-xs leading-5 text-muted-foreground"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-canola" />
                  <span>
                    {warning.sourceName} is {warning.status}
                    {warning.actionHint ? `: ${warning.actionHint}` : ""}
                  </span>
                </p>
              ))}
              {item.warnings.length > 3 && (
                <p className="text-xs font-medium text-muted-foreground">
                  +{item.warnings.length - 3} more warnings hidden
                </p>
              )}
            </div>
          )}
        </div>

        <details className="rounded-lg border border-border bg-background px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Source provenance
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">Source</th>
                  <th className="py-2 pr-4 font-medium">Latest period</th>
                  <th className="py-2 pr-4 font-medium">Cadence</th>
                  <th className="py-2 pr-4 font-medium">Use</th>
                </tr>
              </thead>
              <tbody>
                {item.freshness.map((row) => (
                  <tr key={`${item.id}-detail-${row.sourceName}`} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">{row.sourceName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.latestPeriod ?? "none"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.expectedCadence ?? "unknown"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.thesisUse ?? "context"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <Link
          href={href}
          className="inline-flex items-center gap-2 text-sm font-semibold text-canola transition-colors hover:text-canola/80"
        >
          Open detail page
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="rounded-lg py-5 shadow-none">
      <CardHeader className="px-5">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-canola/20 bg-canola/8 text-canola">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardDescription className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
  );
}

function CompactMarketSignal({
  item,
  country,
}: {
  item: ThesisBoardItem | null;
  country: "CA" | "US";
}) {
  if (!item) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {country}: source mapping needed
      </div>
    );
  }

  const halfWidth = Math.min(50, Math.abs(item.stanceScore) / 2);
  const positive = item.stanceScore > 0;

  return (
    <Link
      href={item.lane === "canada" ? `/grain/${item.slug}` : `/us/${item.slug}`}
      className="block rounded-md border border-border bg-background px-3 py-2 transition-colors hover:border-canola/40 hover:bg-canola/5"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{country}</span>
        <span className={cn("text-lg font-semibold tabular-nums", stanceClass(item.stanceScore))}>
          {item.stanceScore > 0 ? `+${item.stanceScore}` : item.stanceScore}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted" aria-label={`${country} stance score ${item.stanceScore}`}>
        <span className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
        <span
          className={cn(
            "absolute top-0 h-full rounded-full",
            stanceFillClass(item.stanceScore),
            positive ? "left-1/2" : "right-1/2",
          )}
          style={{ width: `${halfWidth}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{item.stanceLabel}</span>
        <span>{item.confidenceScore}%</span>
      </div>
    </Link>
  );
}

function ThesisQuickGlanceBoard({ rows }: { rows: ThesisComparisonRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">All Grains at a Glance</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Quick scan first: every V1 grain, Canada and US side by side, with the current
            bull/bear lean. The reasoning breakdown stays below for the rows worth digging into.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border bg-white/60">
          {rows.length} grain rows
        </Badge>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid grid-cols-1 border-b border-border bg-muted/35 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_220px] md:gap-4">
          <span>Grain</span>
          <span className="hidden md:block">Canada</span>
          <span className="hidden md:block">US</span>
          <span className="hidden md:block">Read</span>
        </div>
        <div className="divide-y divide-border/70">
          {rows.map((row) => (
            <div
              key={`quick-${row.grain}`}
              className="grid gap-3 px-4 py-4 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_220px] md:items-center md:gap-4"
            >
              <div>
                <p className="font-semibold text-foreground">{row.grain}</p>
                <Badge variant="outline" className={cn("mt-2 md:hidden", comparisonClass(row.status))}>
                  {row.statusLabel}
                </Badge>
              </div>
              <CompactMarketSignal item={row.canada} country="CA" />
              <CompactMarketSignal item={row.us} country="US" />
              <div className="hidden space-y-2 md:block">
                <Badge variant="outline" className={comparisonClass(row.status)}>
                  {row.statusLabel}
                </Badge>
                <p className="text-xs leading-5 text-muted-foreground">{row.explanation}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyLaneState({ label }: { label: string }) {
  return (
    <Card className="rounded-lg border-dashed py-6 shadow-none">
      <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
        No {label} thesis packets returned. Check the source freshness table before using this
        lane for a market read.
      </CardContent>
    </Card>
  );
}

export default async function ThesisPage() {
  const data = await getThesisBoardData();

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12 pt-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Badge variant="outline" className="mb-4 border-canola/35 bg-canola/8 text-canola">
            Live source packets
          </Badge>
          <h1 className="max-w-4xl font-display text-3xl font-semibold tracking-normal text-foreground md:text-5xl">
            Bull/Bear Thesis Board
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Structured grain calls from Canada and US thesis packets. The board reads
            facts, freshness, and provenance directly from the data spine, so weekly
            and daily collectors change the read without waiting for legacy narrative rows.
            V1 renders major grains only, excluding smaller CGC labels and US rice/cotton.
          </p>
        </div>

        <Card className="rounded-lg border-canola/25 bg-canola/8 py-5 shadow-none">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4 text-canola" />
              Current snapshot
            </CardTitle>
            <CardDescription>
              Generated {formatDateTime(data.generatedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-5 text-sm leading-6 text-muted-foreground">
            <p>No retired AI archive fallback is used on this page.</p>
            <p>Stale, empty, lagged, and proxy source lanes stay visible.</p>
            <p>
              Packet mode: {data.packetMode === "cached" ? "cached board" : "live RPC fallback"}.
            </p>
            {data.packetMode === "cached" && (
              <p>
                Cache status: {data.cacheStatus === "fresh" ? "fresh" : "stale - refresh job needed"}.
              </p>
            )}
            {data.sourceRunWatermark && (
              <p>Latest source run: {formatDateTime(data.sourceRunWatermark)}</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Source Packets"
          value={String(data.totals.itemCount)}
          detail={`${data.canadaItems.length} Canadian grains and ${data.usItems.length} US markets.`}
          icon={BarChart3}
        />
        <SummaryCard
          label="Strong Sources"
          value={String(data.totals.strongSourceCount)}
          detail="Freshness rows marked strong across rendered packet sources."
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Watch Sources"
          value={String(data.totals.staleSourceCount)}
          detail="Rows that are stale, empty, legacy, lagged, or otherwise not strong."
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Packet Spine"
          value={data.packetMode === "cached" ? "Cached" : "Live"}
          detail={
            data.packetMode === "cached"
              ? `${data.cacheItemCount} cached packets from the current packet RPC spine; ${data.cacheStatus} against source_runs.`
              : "Fallback mode: reading Canada and US packet RPCs directly."
          }
          icon={DatabaseZap}
        />
      </section>

      <ThesisQuickGlanceBoard rows={data.comparisonRows} />

      <TopTakeawayCard rows={data.comparisonRows} />

      <MajorThesisMatrix rows={data.comparisonRows} />

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Canada Major Grains</h2>
            <p className="text-sm text-muted-foreground">
              CGC movement, Grain Monitor logistics, producer cars, prices, COT, and source freshness.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-border bg-white/60">
            {data.canadaItems.length} packets
          </Badge>
        </div>
        {data.canadaItems.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.canadaItems.map((item) => (
              <ThesisCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyLaneState label="Canada grain" />
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">US Markets</h2>
            <p className="text-sm text-muted-foreground">
              USDA crop progress, export sales, WASDE, prices, COT, and source freshness.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-border bg-white/60">
            {data.usItems.length} packets
          </Badge>
        </div>
        {data.usItems.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.usItems.map((item) => (
              <ThesisCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyLaneState label="US market" />
        )}
      </section>
    </div>
  );
}
