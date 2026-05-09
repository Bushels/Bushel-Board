import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileText,
  Gauge,
  MapPinned,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { SpringWheatPulseMap } from "@/components/dashboard/spring-wheat-pulse-map";
import type {
  SeedingGrainOption,
  SpringWheatPulsePayload,
  SpringWheatPulseRegion,
} from "@/lib/queries/spring-wheat-pulse";
import { cn } from "@/lib/utils";

interface Props {
  pulse: SpringWheatPulsePayload;
}

function fmtPct(value: number | null): string {
  return value === null ? "--" : `${Math.round(value)}%`;
}

function fmtSigned(value: number | null): string {
  if (value === null) return "--";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function dateLabel(value: string | null): string {
  if (!value) return "Pending";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shortRunId(value: string | null): string {
  return value ? value.slice(0, 8) : "pending";
}

export function SpringWheatPulsePage({ pulse }: Props) {
  const usRegions = pulse.regions.filter(
    (region) => region.countryCode === "US" && region.status === "reported",
  );
  const canadaRegions = pulse.regions.filter((region) => region.countryCode === "CA");
  const laggards = usRegions
    .filter((region) => region.paceDeltaPct !== null)
    .sort((a, b) => (a.paceDeltaPct ?? 0) - (b.paceDeltaPct ?? 0))
    .slice(0, 3);
  const leaders = usRegions
    .filter((region) => region.paceDeltaPct !== null)
    .sort((a, b) => (b.paceDeltaPct ?? 0) - (a.paceDeltaPct ?? 0))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-border/50 bg-card/85 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <Link
              href="/seeding"
              className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to seeding dashboard
            </Link>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-canola/35 bg-canola/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-canola">
                Premium draft
              </span>
              <span className="rounded-full border border-border/50 bg-wheat-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Grain lane v1
              </span>
            </div>
            <GrainMenu
              activeSlug={pulse.grainSlug}
              options={pulse.availableGrains}
            />
            <h1 className="font-display text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
              {pulse.grainLabel} Seeding Pulse
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {pulse.pulseCall}
            </p>
          </div>

          <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:w-[430px] lg:grid-cols-1">
            <HeaderFact
              icon={<CalendarDays className="h-4 w-4" />}
              label="US week"
              value={dateLabel(pulse.latestUsWeek)}
            />
            <HeaderFact
              icon={<FileText className="h-4 w-4" />}
              label="Canada latest"
              value={dateLabel(pulse.latestCanadaReportDate)}
            />
            <HeaderFact
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Latest source run"
              value={shortRunId(pulse.sourceRunId)}
            />
          </div>
        </div>
      </header>

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_380px]">
        <SpringWheatPulseMap
          grainLabel={pulse.grainLabel}
          regions={pulse.regions}
          latestUsWeek={pulse.latestUsWeek}
          usTotal={pulse.usTotal}
        />

        <aside className="space-y-4">
          <div className="rounded-xl border border-border/50 bg-card/85 p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-canola" />
              <h2 className="font-display text-lg font-semibold">
                Pulse board
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricTile
                label="US planted"
                value={fmtPct(pulse.usTotal?.plantedPct ?? null)}
                detail={`${fmtPct(pulse.usTotal?.emergedPct ?? null)} emerged`}
              />
              <MetricTile
                label="vs 5-year pace"
                value={fmtSigned(pulse.usTotal?.plantedPctVsAvg ?? null)}
                detail={`US ${pulse.usDisplayName}`}
                tone={
                  (pulse.usTotal?.plantedPctVsAvg ?? 0) < -4
                    ? "risk"
                    : "neutral"
                }
              />
              <MetricTile
                label="US states"
                value={String(usRegions.length)}
                detail={`${pulse.usDisplayName} reporters`}
              />
              <MetricTile
                label="Canada"
                value={String(
                  canadaRegions.filter((region) => region.status === "reported")
                    .length,
                )}
                detail="province loaded"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/85 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Sprout className="h-4 w-4 text-prairie" />
              <h2 className="font-display text-lg font-semibold">
                Pace pressure
              </h2>
            </div>
            <RegionRankList title="Slow side" regions={laggards} />
            <div className="my-3 h-px bg-border/60" />
            <RegionRankList title="Fast side" regions={leaders} positive />
          </div>

          <div className="rounded-xl border border-border/50 bg-card/85 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-canola" />
              <h2 className="font-display text-lg font-semibold">
                Canada status
              </h2>
            </div>
            <div className="space-y-2">
              {canadaRegions.map((region) => (
                <SourceRow key={region.id} region={region} />
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-xl border border-border/50 bg-card/85 p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Region board
              </p>
              <h2 className="font-display text-xl font-semibold">
                State and province readings
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Source resolution: state/province, not field-level.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pulse.regions.map((region) => (
              <RegionCard key={region.id} region={region} />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card/85 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-canola" />
            <h2 className="font-display text-lg font-semibold">
              Source contract
            </h2>
          </div>
          <div className="space-y-3">
            {pulse.sourceContract.map((item, index) => (
              <div
                key={item}
                className="rounded-lg border border-border/40 bg-wheat-50/60 px-3 py-2"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-canola">
                  Rule {index + 1}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function GrainMenu({
  activeSlug,
  options,
}: {
  activeSlug: string;
  options: SeedingGrainOption[];
}) {
  return (
    <nav
      aria-label="Select seeding grain"
      className="mb-3 flex flex-wrap gap-1.5 rounded-2xl border border-border/50 bg-wheat-50/70 p-1"
    >
      {options.map((option) => {
        const active = option.slug === activeSlug;
        return (
          <Link
            key={option.slug}
            href={option.href}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
              active
                ? "bg-canola text-white shadow-sm"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

function HeaderFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/45 bg-wheat-50/65 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span className="text-canola">{icon}</span>
        {label}
      </div>
      <p className="mt-1 font-display text-base font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "risk";
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-wheat-50/70 px-3 py-2.5">
      <p
        className={cn(
          "font-display text-2xl font-semibold leading-none tabular-nums",
          tone === "risk" && "text-error",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function RegionRankList({
  title,
  regions,
  positive = false,
}: {
  title: string;
  regions: SpringWheatPulseRegion[];
  positive?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">
        {regions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/50 px-3 py-2 text-sm text-muted-foreground">
            No reported state in this group.
          </p>
        ) : (
          regions.map((region) => (
            <div
              key={region.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-wheat-50/60 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold">{region.regionName}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtPct(region.plantedPct)} planted
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-xs font-bold tabular-nums",
                  positive
                    ? "bg-prairie/10 text-prairie"
                    : "bg-error/10 text-error",
                )}
              >
                {fmtSigned(region.paceDeltaPct)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SourceRow({ region }: { region: SpringWheatPulseRegion }) {
  return (
    <a
      href={region.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-wheat-50/65 px-3 py-2 transition-colors hover:border-canola/55"
    >
      <span>
        <span className="text-sm font-semibold">{region.regionName}</span>
        <span className="block text-xs text-muted-foreground">
          {region.status === "reported" ? region.metricLabel : "release watch"}
        </span>
      </span>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}

function RegionCard({ region }: { region: SpringWheatPulseRegion }) {
  const isUs = region.countryCode === "US";
  return (
    <article className="rounded-lg border border-border/45 bg-wheat-50/65 p-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-md px-2 py-1 text-xs font-bold",
                isUs
                  ? "bg-canola/10 text-canola"
                  : "bg-province-mb/10 text-province-mb",
              )}
            >
              {region.regionCode}
            </span>
            <h3 className="font-display text-base font-semibold">
              {region.regionName}
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {dateLabel(region.reportDate)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
            region.status === "reported"
              ? "border-canola/45 bg-canola/10 text-canola"
              : "border-border/60 bg-muted/60 text-muted-foreground",
          )}
        >
          {region.status}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniMetric
          label={isUs ? "planted" : "seeded"}
          value={isUs ? fmtPct(region.plantedPct) : fmtPct(region.seededPct)}
        />
        <MiniMetric label="emerged" value={fmtPct(region.emergedPct)} />
        <MiniMetric label="pace" value={fmtSigned(region.paceDeltaPct)} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {region.summary}
      </p>
      {region.notes.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/85">
          {region.notes[0]}
        </p>
      )}
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/35 bg-card/75 px-2 py-1.5 text-center">
      <p className="font-display text-sm font-semibold leading-tight tabular-nums">
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
