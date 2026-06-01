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

function confidenceScaledHalfWidth(item: ThesisBoardItem): number {
  const target = 50 + item.stanceScore / 2;
  const confidence = Math.max(0, Math.min(100, item.confidenceScore)) / 100;
  const scaledPosition = 50 + (target - 50) * confidence;
  return Math.min(50, Math.abs(scaledPosition - 50));
}

function confidenceScaledWidth(item: ThesisBoardItem): string {
  return `${confidenceScaledHalfWidth(item).toFixed(2)}%`;
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

function rowActionCue(row: ThesisComparisonRow): { label: string; detail: string } {
  if (row.status === "mixed") {
    return {
      label: "Open first",
      detail: "Canada and US disagree; read both lead drivers before relying on this row.",
    };
  }
  if (row.status === "aligned_bullish") {
    return {
      label: "Confirmed bull read",
      detail: "Both country packets lean constructive; check freshness and lead evidence.",
    };
  }
  if (row.status === "aligned_bearish") {
    return {
      label: "Confirmed bear read",
      detail: "Both country packets lean defensive; check freshness and lead evidence.",
    };
  }
  if (row.status === "canada_only" || row.status === "us_only") {
    return {
      label: "One-country read",
      detail:
        row.status === "canada_only"
          ? "Use as Canada context only; no matching US packet is modeled in V1."
          : "Use as US context only; no matching Canada packet is modeled in V1.",
    };
  }
  if (row.status === "mapping_needed") {
    return {
      label: "Source gap",
      detail: "Do not infer a thesis until class-safe source mapping is admitted.",
    };
  }
  return {
    label: "Monitor",
    detail: "Balanced read; keep it on the board and wait for a stronger source move.",
  };
}

function actionCueClass(status: ThesisComparisonRow["status"]): string {
  if (status === "mixed") return "border-canola/35 bg-canola/10 text-canola";
  if (status === "aligned_bullish") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (status === "aligned_bearish") {
    return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  if (status === "mapping_needed") return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-border bg-background/70 text-muted-foreground";
}

function missingMarketCopy(row: ThesisComparisonRow, country: "CA" | "US"): string {
  if (row.status === "mapping_needed") return `${country}: class mapping pending`;
  if (row.grain === "Durum" && country === "US") return "US: not modeled in V1";
  if (row.grain === "Canola" && country === "US") return "US: Canada-first lane";
  return `${country}: not modeled in V1`;
}

function shortSourceHealthRead(data: Awaited<ReturnType<typeof getThesisBoardData>>): string {
  const prairieWeekStatus = data.sourceRunContext.canadaCropProgress?.prairieWeekStatus ?? null;
  const prairieWeekStatusLabel = prairieWeekStatus ? prairieWeekStatus.replaceAll("_", " ") : null;
  if (data.totals.uniqueWatchSourceCount === 0) {
    if (prairieWeekStatus?.startsWith("partial_")) {
      return `Rendered public source groups are clean, but Canada crop progress reports ${prairieWeekStatusLabel}.`;
    }
    return "All rendered public source groups are currently clean.";
  }
  return `${data.totals.uniqueWatchSourceCount} source group${data.totals.uniqueWatchSourceCount === 1 ? "" : "s"} need attention across ${data.totals.watchSourceInstanceCount} packet rows.`;
}

function prairieWeekStatusRead(data: Awaited<ReturnType<typeof getThesisBoardData>>): string | null {
  const context = data.sourceRunContext.canadaCropProgress;
  const status = context?.prairieWeekStatus ?? null;
  if (!context || !status?.startsWith("partial_")) return null;
  const label = status.replaceAll("_", " ");
  const loadedLabel = context.loadedProvinces.length
    ? `; loaded ${context.loadedProvinces.join("+")}`
    : "";
  const missingLabel = context.missingProvinces.length
    ? `; missing ${context.missingProvinces.join("+")}`
    : "";
  const sourceLabel = context?.latestSourceLabel ? ` (${context.latestSourceLabel})` : "";
  return `Prairie crop progress: ${label}${loadedLabel}${missingLabel}${sourceLabel}`;
}

function watchSourceCardDetail(data: Awaited<ReturnType<typeof getThesisBoardData>>): string {
  const rowCount = data.totals.watchSourceInstanceCount;
  const rowLabel = rowCount === 1 ? "row" : "rows";
  const base = `${rowCount} stale, empty, lagged, or broken freshness ${rowLabel}.`;
  const prairieWeekStatus = data.sourceRunContext.canadaCropProgress?.prairieWeekStatus ?? null;
  if (prairieWeekStatus?.startsWith("partial_")) {
    return `${base} Prairie completeness is partial and shown below.`;
  }
  return `${base} Optional farmer-local empties excluded from confidence.`;
}

function freshnessClass(status: string): string {
  if (status === "strong") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (status === "empty" || status === "broken") {
    return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-canola/30 bg-canola/10 text-canola";
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  canada_crop_progress: "Prairie crop-progress reports",
  cftc_cot_positions: "CFTC Commitments of Traders",
  cgc_imports: "CGC weekly import run",
  cgc_observations: "CGC weekly grain stats",
  crop_acreage_estimates: "USDA acreage estimates",
  crop_plan_deliveries: "Farm delivery plan",
  crop_plans: "Farm crop plan",
  grain_monitor_snapshots: "Canada Grain Monitor",
  grain_prices: "Grain price feed",
  posted_prices: "Posted cash prices",
  producer_car_allocations: "CGC Producer Cars",
  supply_disposition: "Canada supply-disposition table",
  usda_crop_progress: "USDA Crop Progress",
  usda_export_sales: "USDA Export Sales",
  usda_quarterly_stocks: "USDA Quarterly Grain Stocks",
  usda_wasde_mapped: "USDA WASDE",
  weather_cache: "Weather context",
};

function sourceDisplayName(sourceName: string): string {
  const parts = sourceName.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((part) => SOURCE_DISPLAY_NAMES[part] ?? part.replaceAll("_", " ")).join(" + ");
  }
  return SOURCE_DISPLAY_NAMES[sourceName] ?? sourceName.replaceAll("_", " ");
}

function sourceDisplayNameWithId(sourceName: string): string {
  const displayName = sourceDisplayName(sourceName);
  return displayName === sourceName ? displayName : `${displayName} (${sourceName})`;
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
  missingLabel,
}: {
  item: ThesisBoardItem | null;
  country: "CA" | "US";
  missingLabel: string;
}) {
  if (!item) {
    return (
      <div className="space-y-2">
        <CountryTag country={country} />
        <p className="text-sm font-medium text-muted-foreground">{missingLabel}</p>
      </div>
    );
  }

  const halfWidth = confidenceScaledWidth(item);
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
          aria-label={`${country} confidence-scaled stance score ${item.stanceScore}`}
        >
          <span className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
          <span
            className={cn(
              "absolute top-0 h-full rounded-full",
              stanceFillClass(item.stanceScore),
              positive ? "left-1/2" : "right-1/2",
            )}
            data-confidence-scaled-width={halfWidth}
            style={{ width: halfWidth }}
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
            {point.metricLabel} / {sourceDisplayName(point.sourceName)}
          </p>
        </div>
      ))}
    </div>
  );
}

type RowMarketRead = {
  kind: "row";
  row: ThesisComparisonRow;
  score: number;
  confidence: number;
  coverageLabel: "CA+US" | "CA only" | "US only";
  oneCountry: boolean;
  convictionScore: number;
};

type CountryMarketRead = {
  kind: "country";
  row: ThesisComparisonRow;
  country: "CA" | "US";
  score: number;
  confidence: number;
  convictionScore: number;
};

type TakeawayMarketRead = RowMarketRead | CountryMarketRead;

function rowMarketRead(row: ThesisComparisonRow): RowMarketRead | null {
  const entries = [
    row.canada ? { country: "CA" as const, item: row.canada } : null,
    row.us ? { country: "US" as const, item: row.us } : null,
  ].filter((entry): entry is { country: "CA" | "US"; item: ThesisBoardItem } => Boolean(entry));

  if (entries.length === 0) return null;

  const weightSum = entries.reduce((sum, entry) => sum + Math.max(1, entry.item.confidenceScore), 0);
  const score = Math.round(
    entries.reduce(
      (sum, entry) => sum + entry.item.stanceScore * Math.max(1, entry.item.confidenceScore),
      0,
    ) / weightSum,
  );
  const confidence = Math.round(weightSum / entries.length);
  const oneCountry = entries.length === 1;
  const coverageLabel: RowMarketRead["coverageLabel"] =
    entries.length === 2 ? "CA+US" : entries[0].country === "CA" ? "CA only" : "US only";
  const coverageFactor = oneCountry ? 0.75 : 1;

  return {
    kind: "row",
    row,
    score,
    confidence,
    coverageLabel,
    oneCountry,
    convictionScore: Math.round(Math.abs(score) * (confidence / 100) * coverageFactor),
  };
}

function splitMarketRead(row: ThesisComparisonRow, tone: "bull" | "bear"): CountryMarketRead | null {
  if (!row.canada || !row.us) return null;
  if (row.canada.stanceScore * row.us.stanceScore >= 0) return null;

  const target = tone === "bull"
    ? (item: ThesisBoardItem) => item.stanceScore > 0
    : (item: ThesisBoardItem) => item.stanceScore < 0;
  const entries = [
    { country: "CA" as const, item: row.canada },
    { country: "US" as const, item: row.us },
  ].filter((entry) => target(entry.item));
  const entry = entries[0];
  if (!entry) return null;

  return {
    kind: "country",
    row,
    country: entry.country,
    score: entry.item.stanceScore,
    confidence: entry.item.confidenceScore,
    convictionScore: Math.round(Math.abs(entry.item.stanceScore) * (entry.item.confidenceScore / 100)),
  };
}

function strongestSplitMarketRead(
  rows: ThesisComparisonRow[],
  tone: "bull" | "bear",
): CountryMarketRead | null {
  return rows.reduce<CountryMarketRead | null>((best, row) => {
    const entry = splitMarketRead(row, tone);
    if (!entry) return best;
    if (!best) return entry;
    if (entry.convictionScore > best.convictionScore) return entry;
    if (entry.convictionScore < best.convictionScore) return best;
    return tone === "bull"
      ? entry.score > best.score ? entry : best
      : entry.score < best.score ? entry : best;
  }, null);
}

function strongestDirectionalRead(
  aggregateRead: RowMarketRead | null,
  splitRead: CountryMarketRead | null,
): TakeawayMarketRead | null {
  if (!aggregateRead) return splitRead;
  if (!splitRead) return aggregateRead;
  if (splitRead.convictionScore > aggregateRead.convictionScore) return splitRead;
  return aggregateRead;
}

function signedMarketRead(read: Pick<TakeawayMarketRead, "score">): string {
  return read.score > 0 ? `+${read.score}` : String(read.score);
}

function confidenceCopy(read: RowMarketRead): string {
  return read.oneCountry ? `${read.confidence}% confidence` : `${read.confidence}% avg confidence`;
}

function marketReadLine(read: TakeawayMarketRead, tone: "bull" | "bear"): string {
  if (read.kind === "country") {
    return `The strongest split-market ${tone} pressure is ${read.row.grain} at ${signedMarketRead(read)} (${read.country}, ${read.confidence}% confidence).`;
  }

  const directionCopy = read.oneCountry ? `one-country ${tone}` : `confidence-weighted ${tone}`;
  return `The strongest ${directionCopy} read is ${read.row.grain} at ${signedMarketRead(read)} (${read.coverageLabel}, ${confidenceCopy(read)}).`;
}

function marketEvidenceLine(read: TakeawayMarketRead, tone: "bull" | "bear"): string | null {
  const points = tone === "bull" ? read.row.strongestBullPoints : read.row.strongestBearPoints;
  const point = points[0];
  if (!point) return null;
  return `Lead evidence: ${point.country} ${point.title} (${point.metricLabel} / ${sourceDisplayName(point.sourceName)}).`;
}

function rowInspectionPriority(row: ThesisComparisonRow): number {
  if (row.status === "mixed") return 0;
  if (row.status === "mapping_needed" || (!row.canada && !row.us)) return 1;
  if (row.status === "canada_only" || row.status === "us_only") return 2;
  if (row.status === "aligned_bullish" || row.status === "aligned_bearish") return 3;
  return 4;
}

function rowInspectionReason(row: ThesisComparisonRow): string {
  if (row.status === "mixed") return "country split";
  if (row.status === "mapping_needed" || (!row.canada && !row.us)) return "source gap";
  if (row.status === "canada_only") return "Canada-only read";
  if (row.status === "us_only") return "US-only read";
  if (row.status === "aligned_bullish") return "confirmed bull read";
  if (row.status === "aligned_bearish") return "confirmed bear read";
  return "monitor";
}

function inspectionQueueLine(rows: ThesisComparisonRow[]): string {
  const queue = rows
    .map((row) => ({ row, priority: rowInspectionPriority(row) }))
    .filter((entry) => entry.priority < 4)
    .sort((a, b) => a.priority - b.priority || a.row.grain.localeCompare(b.row.grain))
    .slice(0, 3);

  if (queue.length === 0) {
    return "No priority rows right now; monitor for a stronger source move before relying on the board.";
  }

  return `Start with: ${queue.map((entry) => `${entry.row.grain} (${rowInspectionReason(entry.row)})`).join(", ")}.`;
}

function TopTakeawayCard({ rows }: { rows: ThesisComparisonRow[] }) {
  const scoredRows = rows
    .map(rowMarketRead)
    .filter((entry): entry is RowMarketRead => entry !== null);
  const strongestAggregateBull = scoredRows.reduce<RowMarketRead | null>(
    (best, entry) =>
      entry.score > 0 &&
      (!best ||
        entry.convictionScore > best.convictionScore ||
        (entry.convictionScore === best.convictionScore && entry.score > best.score))
        ? entry
        : best,
    null,
  );
  const strongestAggregateBear = scoredRows.reduce<RowMarketRead | null>(
    (best, entry) =>
      entry.score < 0 &&
      (!best ||
        entry.convictionScore > best.convictionScore ||
        (entry.convictionScore === best.convictionScore && entry.score < best.score))
        ? entry
        : best,
    null,
  );
  const strongestBull = strongestDirectionalRead(
    strongestAggregateBull,
    strongestSplitMarketRead(rows, "bull"),
  );
  const strongestBear = strongestDirectionalRead(
    strongestAggregateBear,
    strongestSplitMarketRead(rows, "bear"),
  );
  const countrySplits = rows.filter((row) => row.status === "mixed" && (row.canada || row.us)).length;
  const sourceMappingGaps = rows.filter((row) => !row.canada && !row.us).length;

  const leadLine = strongestBull
    ? marketReadLine(strongestBull, "bull")
    : "No grain has a confidence-backed bull lean in the current packets.";
  const riskLine = strongestBear
    ? marketReadLine(strongestBear, "bear")
    : "No grain has a confidence-backed bear lean in the current packets.";
  const leadEvidence = strongestBull ? marketEvidenceLine(strongestBull, "bull") : null;
  const riskEvidence = strongestBear ? marketEvidenceLine(strongestBear, "bear") : null;
  const inspectionQueue = inspectionQueueLine(rows);

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
            {sourceMappingGaps > 0 ? (
              <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                {sourceMappingGaps} source gap{sourceMappingGaps === 1 ? "" : "s"}
              </Badge>
            ) : null}
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
          {leadEvidence && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{leadEvidence}</p>
          )}
        </div>
        <div className="rounded-lg border border-amber-600/20 bg-background/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <TrendingDown className="h-4 w-4" aria-hidden="true" />
            Most cautious
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{riskLine}</p>
          {riskEvidence && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{riskEvidence}</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-background/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Flag className="h-4 w-4 text-canola" aria-hidden="true" />
            How to use it
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {inspectionQueue} Use it to choose what to inspect next, not to make a sale by itself.
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
            completeness and freshness, not a sell recommendation.
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
              {rows.map((row) => {
                const action = rowActionCue(row);
                return (
                  <tr key={row.grain} className="border-b border-border/70 align-top last:border-b-0">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-foreground">{row.grain}</p>
                    </td>
                    <td className="px-4 py-4">
                      <MarketIndicator item={row.canada} country="CA" missingLabel={missingMarketCopy(row, "CA")} />
                    </td>
                    <td className="px-4 py-4">
                      <MarketIndicator item={row.us} country="US" missingLabel={missingMarketCopy(row, "US")} />
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
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={actionCueClass(row.status)}>
                            {action.label}
                          </Badge>
                          <Badge variant="outline" className={comparisonClass(row.status)}>
                            {row.statusLabel}
                          </Badge>
                          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                            {row.readinessLabel}
                          </Badge>
                        </div>
                        <p className="text-sm leading-6 text-foreground">{action.detail}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{row.explanation}</p>
                        <p className="text-xs leading-5 text-muted-foreground">{row.readinessDetail}</p>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
                {driver.metricLabel} / {sourceDisplayName(driver.sourceName)}
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


function VikingL2ContextPanel({ item }: { item: ThesisBoardItem }) {
  if (item.lane !== "us" || item.vikingL2Chunks.length === 0) return null;

  return (
    <details className="rounded-lg border border-canola/20 bg-canola/5 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Viking L2 interpretation support ({item.vikingL2Chunks.length})
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Local-only distilled book context used as interpretation support. Current source packets still
          control the stance score.
        </p>
        {item.vikingL2Chunks.map((chunk) => (
          <div key={`${item.id}-${chunk.source}-${chunk.id}`} className="rounded-md border border-border bg-background p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-canola/30 bg-canola/10 text-canola">
                {chunk.topic.replaceAll("_", " ")}
              </Badge>
              <p className="text-xs font-medium text-muted-foreground">
                {chunk.source}{chunk.pageHint ? ` · ${chunk.pageHint}` : ""}
              </p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{chunk.text}</p>
          </div>
        ))}
      </div>
    </details>
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
          {sourceDisplayName(row.sourceName)}: {row.freshnessStatus}
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

function ScorecardAuditPanel({ item }: { item: ThesisBoardItem }) {
  const scorecard = item.ratingScorecard;
  const missingSources = scorecard.missing_required_sources;
  const blockedClaims = [
    ...scorecard.llm_blocked_claims,
    ...scorecard.domains.flatMap((domain) => domain.blocked_claims),
  ].filter((claim, index, claims) => claim && claims.indexOf(claim) === index);

  return (
    <div className="rounded-lg border border-canola/30 bg-canola/5 p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Scorecard audit</p>
          <p className="text-xs text-muted-foreground">
            {scorecard.lane} / {scorecard.period_anchor} / watermark {scorecard.source_watermark ?? "none"}
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-canola/35 bg-background/70 text-canola">
          Quality adjustments: {scorecard.quality_adjustments.length}
        </Badge>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p className="rounded-md border border-border bg-background px-3 py-2 text-muted-foreground">
          Overall rating: {scorecard.overall_score} / {scorecard.overall_label}
        </p>
        <p className="rounded-md border border-border bg-background px-3 py-2 text-muted-foreground">
          Confidence: {scorecard.confidence_score}% / {scorecard.confidence_label}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {scorecard.domains.map((domain) => (
          <Badge
            key={`${item.id}-scorecard-${domain.domain}`}
            variant="outline"
            className="border-border bg-background/80 text-muted-foreground"
          >
            {domain.domain}: {domain.score} × {domain.weight}
          </Badge>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
        <p>
          Missing required sources: {missingSources.length > 0 ? missingSources.join(", ") : "none"}
        </p>
        <p>Blocked claims: {blockedClaims.length > 0 ? blockedClaims.join(", ") : "none"}</p>
      </div>
    </div>
  );
}

function ThesisCard({ item, auditMode }: { item: ThesisBoardItem; auditMode: boolean }) {
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

        <VikingL2ContextPanel item={item} />

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
                    {sourceDisplayNameWithId(warning.sourceName)} is {warning.status}
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

        {auditMode && <ScorecardAuditPanel item={item} />}

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
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {sourceDisplayNameWithId(row.sourceName)}
                    </td>
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
  missingLabel,
}: {
  item: ThesisBoardItem | null;
  country: "CA" | "US";
  missingLabel: string;
}) {
  if (!item) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {missingLabel}
      </div>
    );
  }

  const halfWidth = confidenceScaledWidth(item);
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
      <div className="relative h-2 rounded-full bg-muted" aria-label={`${country} confidence-scaled stance score ${item.stanceScore}`}>
        <span className="absolute left-1/2 top-0 h-full w-px bg-border" aria-hidden="true" />
        <span
          className={cn(
            "absolute top-0 h-full rounded-full",
            stanceFillClass(item.stanceScore),
            positive ? "left-1/2" : "right-1/2",
          )}
          data-confidence-scaled-width={halfWidth}
          style={{ width: halfWidth }}
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

function quickGlanceLegendItems(rows: ThesisComparisonRow[]) {
  const statuses = new Set(rows.map((row) => row.status));
  const hasOneCountry = statuses.has("canada_only") || statuses.has("us_only");
  return [
    statuses.has("aligned_bullish")
      ? {
          key: "aligned_bullish",
          label: "Confirmed bull = CA and US both constructive",
          className: "border-prairie/25 bg-prairie/10 text-prairie",
        }
      : null,
    statuses.has("aligned_bearish")
      ? {
          key: "aligned_bearish",
          label: "Confirmed bear = CA and US both defensive",
          className: "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        }
      : null,
    statuses.has("mixed")
      ? {
          key: "mixed",
          label: "Country split = evidence disagrees",
          className: "border-canola/30 bg-canola/10 text-canola",
        }
      : null,
    hasOneCountry
      ? {
          key: "one_country",
          label: "One-country = V1 has only CA or US modeled",
          className: "border-border bg-background/70 text-muted-foreground",
        }
      : null,
    statuses.has("aligned_balanced")
      ? {
          key: "aligned_balanced",
          label: "Balanced = no strong current lean",
          className: "border-border bg-background/70 text-muted-foreground",
        }
      : null,
    statuses.has("mapping_needed")
      ? {
          key: "mapping_needed",
          label: "Source gap = class-safe mapping not admitted",
          className: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
        }
      : null,
  ].filter((item): item is { key: string; label: string; className: string } => item !== null);
}

function ThesisQuickGlanceBoard({ rows }: { rows: ThesisComparisonRow[] }) {
  if (rows.length === 0) return null;
  const legendItems = quickGlanceLegendItems(rows);

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

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {legendItems.map((item) => (
          <Badge key={item.key} variant="outline" className={item.className}>
            {item.label}
          </Badge>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid grid-cols-1 border-b border-border bg-muted/35 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_220px] md:gap-4">
          <span>Grain</span>
          <span className="hidden md:block">Canada</span>
          <span className="hidden md:block">US</span>
          <span className="hidden md:block">Read</span>
        </div>
        <div className="divide-y divide-border/70">
          {rows.map((row) => {
            const action = rowActionCue(row);
            return (
              <div
                key={`quick-${row.grain}`}
                className="grid gap-3 px-4 py-4 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_220px] md:items-center md:gap-4"
              >
                <div>
                  <p className="font-semibold text-foreground">{row.grain}</p>
                  <div className="mt-2 flex flex-wrap gap-2 md:hidden">
                    <Badge variant="outline" className={actionCueClass(row.status)}>
                      {action.label}
                    </Badge>
                    <Badge variant="outline" className={comparisonClass(row.status)}>
                      {row.statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground md:hidden">{action.detail}</p>
                </div>
                <CompactMarketSignal item={row.canada} country="CA" missingLabel={missingMarketCopy(row, "CA")} />
                <CompactMarketSignal item={row.us} country="US" missingLabel={missingMarketCopy(row, "US")} />
                <div className="hidden space-y-2 md:block">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={actionCueClass(row.status)}>
                      {action.label}
                    </Badge>
                    <Badge variant="outline" className={comparisonClass(row.status)}>
                      {row.statusLabel}
                    </Badge>
                    <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                      {row.readinessLabel}
                    </Badge>
                  </div>
                  <p className="text-xs leading-5 text-foreground">{action.detail}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{row.explanation}</p>
                  <p className="text-[11px] leading-5 text-muted-foreground">{row.readinessDetail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DataQualityBanner({ data }: { data: Awaited<ReturnType<typeof getThesisBoardData>> }) {
  const hasWatchSources = data.totals.uniqueWatchSourceCount > 0;
  const prairieWeekRead = prairieWeekStatusRead(data);
  const hasPartialPrairieWeek = prairieWeekRead !== null;
  const isStaleCache = data.packetMode === "cached" && data.cacheStatus !== "fresh";
  const borderClass = isStaleCache
    ? "border-red-500/30 bg-red-500/8"
    : hasWatchSources || hasPartialPrairieWeek
      ? "border-canola/35 bg-canola/8"
      : "border-prairie/25 bg-prairie/8";
  const title = isStaleCache
    ? "Board freshness needs a refresh before use"
    : hasWatchSources
      ? "Use this as a provisional market read"
      : hasPartialPrairieWeek
        ? "Source health clean; Prairie crop-progress package is partial"
      : "Source health is clean for this board";

  return (
    <Card className={cn("rounded-lg py-4 shadow-none", borderClass)}>
      <CardContent className="flex flex-col gap-3 px-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {shortSourceHealthRead(data)} Confidence is source-completeness, not a sell recommendation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Badge variant="outline" className={freshnessClass(isStaleCache ? "stale" : hasWatchSources || hasPartialPrairieWeek ? "lagged" : "strong")}>
            {data.packetMode === "cached" ? `Cached board: ${data.cacheStatus}` : "Live packet fallback"}
          </Badge>
          {prairieWeekRead ? (
            <Badge variant="outline" className="border-canola/35 bg-canola/10 text-canola">
              {prairieWeekRead}
            </Badge>
          ) : null}
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            Last source run {formatDateTime(data.latestAvailableSourceRunAt)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function CurrentSnapshotCard({ data }: { data: Awaited<ReturnType<typeof getThesisBoardData>> }) {
  return (
    <Card className="rounded-lg border-canola/25 bg-canola/8 py-4 shadow-none">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock3 className="h-4 w-4 text-canola" />
          Current snapshot
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            Generated {formatDateTime(data.generatedAt)}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
            {data.packetMode === "cached" ? "Cached board" : "Live RPC fallback"}
          </Badge>
          {data.packetMode === "cached" && (
            <Badge
              variant="outline"
              className={freshnessClass(data.cacheStatus === "fresh" ? "strong" : "stale")}
            >
              Cache {data.cacheStatus}
            </Badge>
          )}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Source watermark {formatDateTime(data.sourceRunWatermark)}; latest live run{" "}
          {formatDateTime(data.latestAvailableSourceRunAt)}. Direct packet data; no archive
          fallback.
        </p>
      </CardContent>
    </Card>
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

type ThesisPageSearchParams = {
  audit?: string;
};

export default async function ThesisPage({
  searchParams,
}: {
  searchParams?: Promise<ThesisPageSearchParams>;
} = {}) {
  const data = await getThesisBoardData();
  const params = await searchParams;
  const auditMode = params?.audit === "1";

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12 pt-8">
      <section className="max-w-4xl">
        <Badge variant="outline" className="mb-4 border-canola/35 bg-canola/8 text-canola">
          Live source packets
        </Badge>
        <h1 className="font-display text-3xl font-semibold tracking-normal text-foreground md:text-5xl">
          Bull/Bear Thesis Board
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          Source-backed Canada and US grain calls from the live thesis packet spine. V1 stays
          hard-gated to major grains, with smaller CGC labels and US rice/cotton kept off the
          public board.
        </p>
      </section>

      <DataQualityBanner data={data} />

      <TopTakeawayCard rows={data.comparisonRows} />

      <CurrentSnapshotCard data={data} />

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
          label="Watch Source Groups"
          value={String(data.totals.uniqueWatchSourceCount)}
          detail={watchSourceCardDetail(data)}
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Packet Spine"
          value={data.packetMode === "cached" ? "Cached" : "Live"}
          detail={
            data.packetMode === "cached"
              ? `${data.cacheItemCount} cached packets; ${data.cacheStatus} against live source-run watermark.`
              : "Fallback mode: reading Canada and US packet RPCs directly."
          }
          icon={DatabaseZap}
        />
      </section>

      <ThesisQuickGlanceBoard rows={data.comparisonRows} />

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
              <ThesisCard key={item.id} item={item} auditMode={auditMode} />
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
              <ThesisCard key={item.id} item={item} auditMode={auditMode} />
            ))}
          </div>
        ) : (
          <EmptyLaneState label="US market" />
        )}
      </section>
    </div>
  );
}
