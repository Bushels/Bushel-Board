// components/dashboard/seeding-small-multiples.tsx
// Five-card command-center view of US grain-belt seeding progress.
// One card per commodity (Corn / Soybeans / Wheat / Barley / Oats), each
// containing a static grain-belt SVG with state-level mini glyphs absolutely
// positioned at their centroids.
//
// This is a *controlled* component: currentWeek and selectedCommodity are
// owned by the parent SeedingDashboard, which also owns the SeedingFocusMap
// below. Clicking a card swaps which crop is focused on the big map.
//
// Why static SVG (not 5 Mapbox instances): glance-able comparison across all
// 5 commodities is the point — geographic precision isn't. 5 Mapbox tiles
// would be wasteful both in network and in CPU/GPU. Static SVG keeps the
// page light and consistent.

"use client";

import { SeedingMiniGlyph } from "@/components/dashboard/seeding-mini-glyph";
import {
  SeedingBeltSvg,
  lngLatToPercent,
} from "@/components/dashboard/seeding-belt-svg";
import {
  groupByState,
  fmtAcres,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";
import type {
  CommodityDashboard,
  UsTotalSummary,
} from "@/lib/queries/seeding-progress";
import { cn } from "@/lib/utils";

interface Props {
  dashboards: CommodityDashboard[];
  currentWeek: string;
  selectedCommodity: string;
  onSelectCommodity: (commodity: string) => void;
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

/** Headline badge text per commodity (right side of card head).
 *  Format: "{progress%} of {acres}" — anchors the % to a real magnitude.
 *  Wheat shows G/E condition % since spring planting is partial-data early. */
function badgeFor(
  commodity: string,
  us: UsTotalSummary | null,
  usTotalAcres: number | null,
): string {
  if (!us && usTotalAcres === null) return "no data";
  const acres = usTotalAcres !== null ? fmtAcres(usTotalAcres) : null;
  if (commodity === "WHEAT") {
    if (us?.good_excellent_pct !== null && us?.good_excellent_pct !== undefined) {
      return acres
        ? `${fmtPct(us.good_excellent_pct)} G/E · ${acres}`
        : `${fmtPct(us.good_excellent_pct)} G/E`;
    }
    return acres
      ? `${fmtPct(us?.planted_pct ?? null)} spring · ${acres}`
      : `${fmtPct(us?.planted_pct ?? null)} spring planted`;
  }
  if (acres) {
    return `${fmtPct(us?.planted_pct ?? null)} of ${acres}`;
  }
  return `${fmtPct(us?.planted_pct ?? null)} planted`;
}

export function SeedingSmallMultiples({
  dashboards,
  currentWeek,
  selectedCommodity,
  onSelectCommodity,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {dashboards.map((d) => (
        <CommodityCard
          key={d.commodity}
          dashboard={d}
          currentWeek={currentWeek}
          isSelected={d.commodity === selectedCommodity}
          onClick={() => onSelectCommodity(d.commodity)}
        />
      ))}
    </div>
  );
}

interface CommodityCardProps {
  dashboard: CommodityDashboard;
  currentWeek: string;
  isSelected: boolean;
  onClick: () => void;
}

function CommodityCard({
  dashboard,
  currentWeek,
  isSelected,
  onClick,
}: CommodityCardProps) {
  const { commodity, rows, usTotal, usTotalAcres } = dashboard;
  const grouped = groupByState(rows);
  const stats = statsFor(commodity, usTotal);
  const badge = badgeFor(commodity, usTotal, usTotalAcres);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`Focus ${titleCase(commodity)} on the detail map below`}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border bg-card/80 p-4 text-left shadow-sm transition-all duration-200",
        "hover:-translate-y-[1px] hover:shadow-md",
        isSelected
          ? "border-canola/70 ring-2 ring-canola/30 shadow-md"
          : "border-border/40 hover:border-border/70",
      )}
    >
      {/* Crop header */}
      <header className="flex items-start justify-between gap-2 border-b border-border/30 pb-3">
        <div>
          <h2
            className={cn(
              "font-display text-lg font-semibold leading-tight",
              isSelected && "text-canola",
            )}
          >
            {titleCase(commodity)}
          </h2>
          {currentWeek && (
            <p className="text-[11px] text-muted-foreground">
              Week ending {currentWeek}
            </p>
          )}
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-bold whitespace-nowrap transition-colors",
            isSelected
              ? "border-canola/40 bg-canola/10 text-canola"
              : "border-border/40 bg-muted/30 text-muted-foreground",
          )}
        >
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

      {/* Hover affordance — appears only when not selected */}
      {!isSelected && (
        <p className="text-[10px] font-medium text-muted-foreground/70 transition-colors group-hover:text-canola">
          Click to focus on map ↓
        </p>
      )}
      {isSelected && (
        <p className="text-[10px] font-medium text-canola">
          Showing on map ↓
        </p>
      )}
    </button>
  );
}
