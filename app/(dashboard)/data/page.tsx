import type { Metadata } from "next";

import { CropStressMap } from "@/components/dashboard/crop-stress-map";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { getLatestCropStress } from "@/lib/queries/gee-crop-stress";
import { safeQuery } from "@/lib/utils/safe-query";

export const metadata: Metadata = {
  title: "Wheat Data — Bushel Board",
  description:
    "Satellite crop-stress across the world's wheat belts — NDVI + soil moisture vs the last five years.",
};

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const result = await safeQuery("crop stress map", () => getLatestCropStress());
  const data = result.data;
  const hasData = Boolean(data && data.latestWeek && data.rows.length > 0);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Wheat-first · data
        </p>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Global wheat crop-stress</h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          Satellite vegetation vigor (NDVI) and root-zone soil moisture over the world&rsquo;s big
          winter- and spring-wheat belts, compared to the last five years. Redder belts are more
          stressed than normal — which usually means a tighter crop and firmer prices. Greener
          belts look healthy.{" "}
          <span className="font-medium text-foreground">
            Watch-only for now: this view doesn&rsquo;t move any market score yet.
          </span>
        </p>
        {hasData && data ? (
          <p className="max-w-3xl text-base font-medium leading-7 text-foreground">{data.takeaway}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Market intelligence from public satellite data (Google Earth Engine — MODIS &amp; NASA
          SMAP). Not an instruction to price, hedge, or market grain.
        </p>
      </div>

      <SectionBoundary
        title="Crop-stress map unavailable"
        message="The crop-stress map hit an error. Refresh to try again."
      >
        {!hasData || !data ? (
          <SectionStateCard
            title="No satellite crop-stress yet"
            message="The weekly Google Earth Engine run publishes Friday mornings. Check back soon."
          />
        ) : (
          <CropStressMap data={data} />
        )}
      </SectionBoundary>

      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <h2 className="font-display text-lg font-semibold">How to read this</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Red = stressed.</span> The crop is doing
            worse than its 5-year normal for this week (low vegetation vigor and/or dry soil). A
            stressed major exporter usually means a tighter world crop — a firmer-price signal.
          </li>
          <li>
            <span className="font-medium text-foreground">Green = healthy.</span> Better than normal
            — a comfortable crop that tends to weigh on prices.
          </li>
          <li>
            <span className="font-medium text-foreground">What you&rsquo;re seeing.</span> US
            Hard-Red-Winter belt by state, plus Russia&rsquo;s winter and spring belts — together
            most of the world&rsquo;s exportable wheat. More belts (Canada, EU, Australia) get added
            as they&rsquo;re validated.
          </li>
          <li>
            <span className="font-medium text-foreground">Watch-only.</span> We&rsquo;re still
            checking this satellite signal against ground-truth crop reports across a full season
            before it&rsquo;s allowed to move the Bull/Bear read.
          </li>
        </ul>
      </div>
    </div>
  );
}
