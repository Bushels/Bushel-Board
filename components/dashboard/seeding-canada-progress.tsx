import { CalendarDays, ExternalLink, Leaf, Sprout, TrendingUp } from "lucide-react";
import type { CanadaSeedingProgress } from "@/lib/queries/canada-seeding-progress";

interface Props {
  reports: CanadaSeedingProgress[];
}

const WATCHLIST = [
  {
    code: "AB",
    name: "Alberta",
    href: "https://www.alberta.ca/alberta-crop-reports",
    label: "Crop report page",
  },
  {
    code: "SK",
    name: "Saskatchewan",
    href: "https://www.saskatchewan.ca/business/agriculture-natural-resources-and-industry/agribusiness-farmers-and-ranchers/market-and-trade-statistics/crops-statistics/crop-report",
    label: "Crop report page",
  },
];

function fmtPct(value: number | null): string {
  return value === null ? "Not released" : `${Math.round(value)}%`;
}

function fmtSigned(value: number | null): string {
  if (value === null) return "Not available";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function reportDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SeedingCanadaProgress({ reports }: Props) {
  return (
    <section className="rounded-2xl border border-border/50 bg-card/80 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 border-b border-border/40 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Leaf className="h-4 w-4 text-canola" />
            Canadian Seeding Pulse
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Prairie provincial reports
          </h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manitoba is now live. Alberta and Saskatchewan are queued against
          their official crop-report pages as the first weekly releases land.
        </p>
      </div>

      {reports.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            {reports.map((report) => (
              <ProvinceReportCard key={`${report.province_code}-${report.report_date}`} report={report} />
            ))}
          </div>
          <WatchlistCard reportedProvinceCodes={new Set(reports.map((r) => r.province_code))} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-dashed border-border/50 bg-wheat-50/50 p-5">
            <p className="font-medium text-foreground">No Canadian reports loaded yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Provincial reports will appear here once their first 2026 seeding
              progress numbers are admitted.
            </p>
          </div>
          <WatchlistCard reportedProvinceCodes={new Set()} />
        </div>
      )}
    </section>
  );
}

function ProvinceReportCard({ report }: { report: CanadaSeedingProgress }) {
  const pct = report.seeded_pct ?? 0;

  return (
    <article className="flex min-h-[360px] flex-col rounded-xl border border-border/40 bg-wheat-50/60 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-canola/10 px-2 py-1 text-xs font-bold text-canola">
              {report.province_code}
            </span>
            <h3 className="font-display text-lg font-semibold">{report.province_name}</h3>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {reportDateLabel(report.report_date)}
          </p>
        </div>
        <a
          href={report.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Open ${report.source_name}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </header>

      <div className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-4xl font-semibold leading-none">
              {fmtPct(report.seeded_pct)}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              seeded
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">
              {fmtSigned(report.seeded_pct_vs_5yr_avg)}
            </p>
            <p className="text-xs text-muted-foreground">vs 5-year avg</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/40">
          <div
            className="h-full rounded-full bg-canola"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MetricTile value={fmtPct(report.seeded_pct_5yr_avg)} label="5-year avg" />
        <MetricTile value={fmtPct(report.seeded_pct_previous_year)} label="last year" />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {report.summary}
      </p>

      {report.regional_notes.length > 0 && (
        <div className="mt-4 space-y-2">
          {report.regional_notes.map((item) => (
            <div key={item.region} className="rounded-lg border border-border/35 bg-background/70 px-3 py-2">
              <p className="text-xs font-semibold text-foreground">{item.region}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {item.note}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function MetricTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border/35 bg-background/70 px-3 py-2">
      <p className="font-display text-lg font-semibold leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function WatchlistCard({
  reportedProvinceCodes,
}: {
  reportedProvinceCodes: Set<string>;
}) {
  return (
    <aside className="rounded-xl border border-border/40 bg-background/75 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sprout className="h-4 w-4 text-canola" />
        <h3 className="font-display text-base font-semibold">Next reports</h3>
      </div>
      <div className="space-y-3">
        {WATCHLIST.map((item) => {
          const isReported = reportedProvinceCodes.has(item.code);
          return (
            <a
              key={item.code}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg border border-border/35 bg-card/70 px-3 py-2 text-sm transition-colors hover:border-canola/50"
            >
              <span>
                <span className="font-semibold text-foreground">{item.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {isReported ? "Loaded" : item.label}
                </span>
              </span>
              {isReported ? (
                <TrendingUp className="h-4 w-4 text-canola" />
              ) : (
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              )}
            </a>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Canada uses provincial crop reports, not one national USDA-style table.
        This layer will stay province-source-led as reports arrive.
      </p>
    </aside>
  );
}
