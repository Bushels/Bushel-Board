import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CloudRain, ExternalLink, Satellite, ShieldAlert } from "lucide-react";

import { FloodWatchFeedback } from "@/components/dashboard/flood-watch-feedback";
import { FloodWatchMap } from "@/components/dashboard/flood-watch-map";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { getFloodWatchV0 } from "@/lib/queries/flood-watch";
import { formatAcres, formatDate } from "@/lib/queries/flood-watch-utils";
import { getLatestSourceRunSummaries } from "@/lib/queries/source-runs";
import { safeQuery } from "@/lib/utils/safe-query";

export const metadata: Metadata = {
  title: "Flood Watch - Bushel Board",
  description:
    "Watch-only satellite and forecast acres at risk from flood and excess moisture across Western Canada and the contiguous US.",
};

export const dynamic = "force-dynamic";

function sourceFreshnessValue(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value
      .replace("+00:00", " UTC")
      .replace("JRC/GSW1_4", "JRC GSW1_4")
      .replace("MERIT/Hydro", "MERIT Hydro");
    return /^\d{4}-\d{2}-\d{2}T/.test(normalized)
      ? normalized.replace("T", " ")
      : normalized;
  }
  if (value && typeof value === "object" && "latest_creation_time" in value) {
    const time = (value as { latest_creation_time?: unknown }).latest_creation_time;
    return typeof time === "string" ? time.replace("T", " ").replace("+00:00", " UTC") : "available";
  }
  return "available";
}

export default async function FloodWatchPage() {
  const [watchResult, runResult] = await Promise.all([
    safeQuery("flood watch", () => getFloodWatchV0()),
    safeQuery("flood watch source run", () =>
      getLatestSourceRunSummaries(["gee_flood_excess_moisture_watch"]),
    ),
  ]);
  const data = watchResult.data;
  const sourceRun = runResult.data?.[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/environmental"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Environmental
        </Link>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Flood / excess moisture watch
          </p>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            Western Canada + contiguous U.S. cropland water-risk watch
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            Google Earth Engine blends Sentinel-1 surface-water reads, recent IMERG rain,
            SMAP wetness, GFS forecast rain, crop masks, permanent-water removal, and lowland
            terrain context. The map now uses official AAFC and Crop-CASMA soil-moisture
            anomaly layers as visual context underneath Bushel Board acreage hotspots.{" "}
            <span className="font-medium text-foreground">
              This is a watch layer: acres at risk, not confirmed damaged acres.
            </span>
          </p>
        </div>
      </div>

      {!data ? (
        <SectionStateCard
          title="Flood watch unavailable"
          message="The v0 flood-watch artifact could not be loaded."
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card/80 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Satellite className="h-4 w-4 text-[#2f6f91]" />
                Observed
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">
                {formatAcres(data.acreTotals.observedInundationAcres)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Sentinel-1 surface-water watch acres; not a crop-loss claim.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/80 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CloudRain className="h-4 w-4 text-[#2f7f72]" />
                Excess moisture
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">
                {formatAcres(data.acreTotals.excessMoistureAcres)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Recent rain plus SMAP wetness or lowland exposure.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/80 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CloudRain className="h-4 w-4 text-[#b7791f]" />
                Forecast risk
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">
                {formatAcres(data.acreTotals.forecastAtRiskAcres)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                3/7-day GFS rain risk over already vulnerable cropland.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/80 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-[#9b8754]" />
                Watch
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">
                {formatAcres(data.acreTotals.watchAcres)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Lower-confidence acres worth keeping on the board.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Watch map"
              subtitle={`${formatDate(data.eventStart)} to ${formatDate(data.eventEnd)}. Official moisture anomaly context underneath; GEE acreage hotspots on top.`}
            />
            <SectionBoundary
              title="Flood watch map unavailable"
              message="The flood watch map hit an error. Refresh to try again."
            >
              <FloodWatchMap data={data} />
            </SectionBoundary>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Public moisture reports"
              subtitle="Wet and dry ground checks help show where the moisture watch is right, wrong, or too broad."
            />
            <FloodWatchFeedback
              eventLabel={data.eventLabel}
              eventStart={data.eventStart}
              eventEnd={data.eventEnd}
            />
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Official moisture context"
              subtitle="These underlays improve regional read quality, but they do not prove field-level damage."
            />
            <div className="grid gap-3 md:grid-cols-2">
              {data.officialMoistureLayers.map((layer) => (
                <div key={layer.id} className="rounded-lg border border-border bg-card/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{layer.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {layer.provider} - {layer.coverage}
                      </p>
                    </div>
                    <a
                      href={layer.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Source
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{layer.description}</p>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>
                      <span className="font-medium text-foreground">Latest: </span>
                      {layer.latestAt ? formatDate(layer.latestAt) : "available"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Resolution: </span>
                      {layer.resolution || "source native"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Freshness"
              subtitle="Source clocks are shown separately from the acreage estimate."
            />
            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-4 text-sm md:grid-cols-2">
              <div>
                <p className="font-semibold">Source run</p>
                <p className="mt-1 text-muted-foreground">
                  {sourceRun
                    ? `${sourceRun.status} - ${sourceRun.latestSourceLabel ?? sourceRun.sourcePeriodEnd ?? "latest run"}`
                    : "No source_runs row found for this artifact."}
                </p>
              </div>
              <div>
                <p className="font-semibold">Claim boundary</p>
                <p className="mt-1 text-muted-foreground">{data.claimBoundary}</p>
              </div>
              {Object.entries(data.sourceFreshness).map(([key, value]) => (
                <div key={key}>
                  <p className="font-semibold">{key.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-muted-foreground">{sourceFreshnessValue(value)}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
