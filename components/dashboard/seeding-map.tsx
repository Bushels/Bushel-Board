// components/dashboard/seeding-map.tsx
// Mapbox map with per-state SeismographGlyph markers + temporal scrubber + legend.

"use client";

import { useMemo, useState } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { SeismographGlyph } from "@/components/dashboard/seeding-seismograph-glyph";
import { SeedingScrubber } from "@/components/dashboard/seeding-scrubber";
import { SeedingLegend } from "@/components/dashboard/seeding-legend";
import {
  groupByState,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const INITIAL_VIEW = {
  longitude: -93.5,
  latitude: 40.5,
  zoom: 3.5,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rows: SeismographRow[];
  commodity: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SeedingMap({ rows, commodity }: Props) {
  // ── Token guard ────────────────────────────────────────────────────────────
  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-2xl border border-border/40 bg-muted/20 text-sm text-muted-foreground">
        Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN not configured
      </div>
    );
  }

  return <SeedingMapInner rows={rows} commodity={commodity} />;
}

// Inner component rendered only when token is present — keeps hooks unconditional
// (the outer component early-returns before any hook calls when token is absent).
function SeedingMapInner({ rows, commodity }: Props) {
  // ── Derived data ───────────────────────────────────────────────────────────
  const { grouped, states, allWeeks } = useMemo(() => {
    const grouped = groupByState(rows);
    const states = Object.keys(grouped).sort();

    // Collect unique week_ending values across all rows, then sort ascending
    const weekSet = new Set<string>();
    for (const r of rows) weekSet.add(r.week_ending);
    const allWeeks = Array.from(weekSet).sort();

    return { grouped, states, allWeeks };
  }, [rows]);

  // ── Temporal state ─────────────────────────────────────────────────────────
  const [currentWeek, setCurrentWeek] = useState<string>(
    allWeeks[allWeeks.length - 1] ?? ""
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      {/* Left column: map + scrubber */}
      <div className="space-y-3">
        <div className="relative h-[480px] overflow-hidden rounded-2xl border border-border/40">
          <Map
            initialViewState={INITIAL_VIEW}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            scrollZoom={false}
            dragPan={false}
            dragRotate={false}
            doubleClickZoom={false}
            touchZoomRotate={false}
            keyboard={false}
            attributionControl={false}
          >
            {states.map((stateCode) => {
              const stateRows = grouped[stateCode];
              const first = stateRows[0];
              if (!first) return null;
              return (
                <Marker
                  key={stateCode}
                  longitude={first.centroid_lng}
                  latitude={first.centroid_lat}
                  anchor="center"
                >
                  <SeismographGlyph
                    rows={stateRows}
                    commodity={commodity}
                    currentWeek={currentWeek}
                  />
                </Marker>
              );
            })}
          </Map>
        </div>

        <SeedingScrubber
          weeks={allWeeks}
          currentWeek={currentWeek}
          onChange={setCurrentWeek}
        />
      </div>

      {/* Right column: legend */}
      <SeedingLegend />
    </div>
  );
}
