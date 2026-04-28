// components/dashboard/seeding-small-multiples.tsx
// Five-card command-center view of US grain-belt seeding progress.
// One card per commodity (Corn / Soybeans / Wheat / Barley / Oats), each
// containing a static grain-belt SVG with state-level mini glyphs absolutely
// positioned at their centroids. A single shared scrubber at the bottom drives
// the scan-line for every glyph in every card.
//
// Why static SVG (not 5 Mapbox instances): glance-able comparison across all
// 5 commodities is the point — geographic precision isn't. 5 Mapbox tiles
// would be wasteful both in network and in CPU/GPU. Static SVG keeps the
// page light and consistent.

"use client";

import { useMemo, useState } from "react";
import { SeedingMiniGlyph } from "@/components/dashboard/seeding-mini-glyph";
import { SeedingScrubber } from "@/components/dashboard/seeding-scrubber";
import {
  SeedingBeltSvg,
  lngLatToPercent,
} from "@/components/dashboard/seeding-belt-svg";
import {
  groupByState,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";
import type {
  CommodityDashboard,
  UsTotalSummary,
} from "@/lib/queries/seeding-progress";

interface Props {
  dashboards: CommodityDashboard[];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function fmtSigned(n: number | null, suffix = "pts"): string {
  if (n === null) return "—";
  const r = Math.round(n);
  return `${r > 0 ? "+" : ""}${r} ${suffix}`;
}

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}%`;
}

/** Decide which two stats to show in the card footer for a given commodity. */
function statsFor(
  commodity: string,
  us: UsTotalSummary | null,
): Array<{ value: string; label: string }> {
  if (!us) {
    return [
      { value: "—", label: "no data yet" },
      { value: "—", label: "" },
    ];
  }
  if (commodity === "WHEAT") {
    return [
      {
        value: fmtSigned(us.planted_pct_vs_avg),
        label: "spring pace vs 5-yr",
      },
      {
        value: fmtSigned(us.ge_pct_yoy_change),
        label: "G/E vs last year",
      },
    ];
  }
  return [
    {
      value: fmtSigned(us.planted_pct_vs_avg),
      label: "vs 5-year avg",
    },
    {
      value: fmtPct(us.emerged_pct),
      label: "emerged",
    },
  ];
}

/** Headline badge text per commodity (right side of card head). */
function badgeFor(commodity: string, us: UsTotalSummary | null): string {
  if (!us) return "no data";
  if (commodity === "WHEAT") {
    return us.good_excellent_pct === null
      ? `${fmtPct(us.planted_pct)} spring planted`
      : `${fmtPct(us.good_excellent_pct)} G/E`;
  }
  return `${fmtPct(us.planted_pct)} planted`;
}

export function SeedingSmallMultiples({ dashboards }: Props) {
  // Single shared week scrubber across all 5 cards
  const allWeeks = useMemo(() => {
    const set = new Set<string>();
    for (const d of dashboards) {
      for (const r of d.rows) set.add(r.week_ending);
    }
    return [...set].sort();
  }, [dashboards]);

  const [currentWeek, setCurrentWeek] = useState<string>(
    allWeeks[allWeeks.length - 1] ?? "",
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {dashboards.map((d) => (
          <CommodityCard
            key={d.commodity}
            dashboard={d}
            currentWeek={currentWeek}
          />
        ))}
      </div>

      {allWeeks.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card/60 p-4">
          <SeedingScrubber
            weeks={allWeeks}
            currentWeek={currentWeek}
            onChange={setCurrentWeek}
          />
        </div>
      )}
    </div>
  );
}

interface CommodityCardProps {
  dashboard: CommodityDashboard;
  currentWeek: string;
}

function CommodityCard({ dashboard, currentWeek }: CommodityCardProps) {
  const { commodity, rows, usTotal } = dashboard;
  const grouped = groupByState(rows);
  const stats = statsFor(commodity, usTotal);
  const badge = badgeFor(commodity, usTotal);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/80 p-4 shadow-sm">
      {/* Crop header */}
      <header className="flex items-start justify-between gap-2 border-b border-border/30 pb-3">
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight">
            {titleCase(commodity)}
          </h2>
          {currentWeek && (
            <p className="text-[11px] text-muted-foreground">
              Week ending {currentWeek}
            </p>
          )}
        </div>
        <span className="rounded-full border border-border/40 bg-muted/30 px-2 py-1 text-[10px] font-bold text-muted-foreground whitespace-nowrap">
          {badge}
        </span>
      </header>

      {/* Mini map with state glyphs */}
      <div className="relative aspect-[3/2] overflow-hidden rounded-xl border border-border/30 bg-wheat-50">
        <SeedingBeltSvg className="absolute inset-0 h-full w-full" />
        {Object.entries(grouped).map(([stateCode, stateRows]) => {
          const first = stateRows[0];
          if (!first) return null;
          const { x, y } = lngLatToPercent(
            first.centroid_lng,
            first.centroid_lat,
          );
          return (
            <div
              key={stateCode}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <SeedingMiniGlyph
                rows={stateRows as SeismographRow[]}
                currentWeek={currentWeek}
              />
            </div>
          );
        })}
        {Object.keys(grouped).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            No state-level data this season
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/30 bg-wheat-50/60 px-3 py-2"
          >
            <p className="font-display text-base font-semibold leading-tight">
              {s.value}
            </p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
