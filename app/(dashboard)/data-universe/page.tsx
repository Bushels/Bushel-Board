import Link from "next/link";
import type { Metadata } from "next";

import { DataUniverseClient } from "@/components/dashboard/data-universe-client";
import {
  buildDataUniverse,
  buildUniverseReads,
  type DataUniverseComparisonRow,
} from "@/lib/thesis/data-universe";
import { getThesisBoardData } from "@/lib/queries/thesis-board";
import { safeQuery } from "@/lib/utils/safe-query";

export const metadata: Metadata = {
  title: "Data Map - Bushel Board",
  description: "Every data lane behind the Bull/Bear board, as one living system.",
};

export const dynamic = "force-dynamic";

export default async function DataUniversePage() {
  const boardResult = await safeQuery("Thesis board reads", () => getThesisBoardData());
  const comparisonRows: DataUniverseComparisonRow[] = boardResult.error
    ? []
    : (boardResult.data?.comparisonRows ?? []).map((row) => ({
        grain: row.grain,
        canada: row.canada
          ? { score: row.canada.stanceScore, confidence: row.canada.confidenceScore ?? 0 }
          : null,
        us: row.us ? { score: row.us.stanceScore, confidence: row.us.confidenceScore ?? 0 } : null,
      }));

  const model = buildDataUniverse(buildUniverseReads(comparisonRows));
  const { stats } = model;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">The data universe behind your read</h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          Every node below is a real data lane this board pulls week in, week out - government grain stats,
          export sales, fund positioning, crop reports, prices, and watch-only chatter. It all flows inward:
          sources feed pressure lanes, pressure lanes feed each grain, and the grains feed one Bull/Bear board.
          Drag to spin it. Click any node to see its job.
        </p>
        <p className="text-sm text-muted-foreground">
          Market intelligence from public sources only. Not an instruction to price, hedge, or market grain.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="data-universe-stats">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-semibold tabular-nums">{stats.sourceCount}</p>
          <p className="text-sm text-muted-foreground">
            source lanes ({stats.officialSourceCount} official &middot; {stats.priceContextSourceCount} price
            &middot; {stats.watchSourceCount} watch)
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-semibold tabular-nums">{stats.domainCount}</p>
          <p className="text-sm text-muted-foreground">pressure lanes the data is sorted into</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-semibold tabular-nums">{stats.grainCount}</p>
          <p className="text-sm text-muted-foreground">grains with a live source-backed read</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-semibold tabular-nums">{stats.linkCount}</p>
          <p className="text-sm text-muted-foreground">connections feeding the board</p>
        </div>
      </div>

      <DataUniverseClient model={model} />

      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <h2 className="font-display text-lg font-semibold">How to read this</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Outer ring - source lanes.</span> Green lanes are
            official inputs that can move a score. Gold lanes are price context that confirms or caps a read.
            Amber lanes are watch-only leads - they point at what to check, never move the number on their own.
          </li>
          <li>
            <span className="font-medium text-foreground">Middle ring - pressure lanes.</span> Supply, demand,
            logistics, positioning, price, and weather. Every source is sorted into the lanes it can actually
            speak to before it touches a grain.
          </li>
          <li>
            <span className="font-medium text-foreground">Inner ring - your grains.</span> Each grain glows
            green when the current read leans constructive and amber when it leans cautious, weighted by
            confidence.
          </li>
          <li>
            <span className="font-medium text-foreground">Center - the board.</span> One source-backed Bull/Bear
            read per grain, refreshed as data lands through the week and anchored by the Friday desk.
          </li>
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/thesis" className="font-medium text-canola underline underline-offset-2">
            See the current Bull/Bear board
          </Link>
        </p>
      </div>
    </div>
  );
}
