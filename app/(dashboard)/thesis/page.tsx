import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  DatabaseZap,
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
import { getThesisBoardData, type ThesisBoardItem, type ThesisDriver } from "@/lib/queries/thesis-board";
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
  if (score >= 20) return "text-prairie";
  if (score <= -20) return "text-amber-700 dark:text-amber-300";
  return "text-muted-foreground";
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
          label="Markets"
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

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Canada Grains</h2>
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
