"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  Source,
  type MapEvent,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import type {
  ExpressionSpecification,
  FillLayerSpecification,
  FilterSpecification,
  LineLayerSpecification,
} from "mapbox-gl";
import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  WHEAT_BELT_BOUNDS,
  WHEAT_BELT_GEOMETRY,
} from "@/lib/maps/wheat-belt-geometries";
import {
  STRESS_NODATA_COLOR,
  STRESS_SCALE_STOPS,
  stressColor,
  type CropStressMapData,
  type CropStressRow,
} from "@/lib/queries/gee-crop-stress-utils";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// World-ish fallback; replaced by fitBounds(WHEAT_BELT_BOUNDS) on load.
const INITIAL_VIEW = { longitude: -10, latitude: 45, zoom: 1.3 };

interface Hovered {
  fid: string;
  regionName: string;
  cropBelt: string;
  hasData: boolean;
  stressIndex: number | null;
  reading: string | null;
  ndviZ: number | null;
  smZ: number | null;
}

// Mapbox returns feature properties as loosely-typed primitives.
function asNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtZ(v: number | null): string {
  return v === null ? "--" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

function fmtIndex(v: number | null): string {
  return v === null ? "--" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

// Diverging fill expression — reads feature.properties.stress_index, falls back to
// the no-data color for regions drawn without a reading. Mapbox expression arrays
// don't type cleanly, so we build then cast (justified).
const STRESS_FILL_COLOR: ExpressionSpecification = (() => {
  const interp: unknown[] = ["interpolate", ["linear"], ["get", "stress_index"]];
  for (const s of STRESS_SCALE_STOPS) interp.push(s.value, s.color);
  return ["case", ["get", "has_data"], interp, STRESS_NODATA_COLOR] as unknown as ExpressionSpecification;
})();

const FILL_LAYER: FillLayerSpecification = {
  id: "crop-stress-fill",
  type: "fill",
  source: "crop-stress",
  paint: { "fill-color": STRESS_FILL_COLOR, "fill-opacity": 0.72 },
};

const OUTLINE_LAYER: LineLayerSpecification = {
  id: "crop-stress-outline",
  type: "line",
  source: "crop-stress",
  paint: { "line-color": "#2a261e", "line-width": 0.6, "line-opacity": 0.35 },
};

const LEGEND_GRADIENT = `linear-gradient(to right, ${STRESS_SCALE_STOPS.map((s) => s.color).join(", ")})`;

export function CropStressMap({ data }: { data: CropStressMapData }) {
  const mapRef = useRef<MapRef | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const mergedGeojson = useMemo<FeatureCollection>(() => {
    const byKey = new Map<string, CropStressRow>();
    for (const r of data.rows) byKey.set(`${r.cropBelt}__${r.regionCode}`, r);
    return {
      type: "FeatureCollection",
      features: WHEAT_BELT_GEOMETRY.features.map((f) => {
        const fid = `${f.properties.crop_belt}__${f.properties.region_code}`;
        const row = byKey.get(fid);
        return {
          ...f,
          properties: {
            crop_belt: f.properties.crop_belt,
            region_code: f.properties.region_code,
            region_name: f.properties.region_name,
            fid,
            has_data: row?.stressIndex != null,
            stress_index: row?.stressIndex ?? 0,
            reading: row?.reading ?? null,
            ndvi_z: row?.ndviZ ?? null,
            sm_z: row?.smZ ?? null,
          },
        };
      }),
    };
  }, [data.rows]);

  const hoverLayer: LineLayerSpecification = useMemo(
    () => ({
      id: "crop-stress-hover",
      type: "line",
      source: "crop-stress",
      paint: { "line-color": "#1a1710", "line-width": 2.2, "line-opacity": 0.9 },
      filter: ["==", ["get", "fid"], hovered?.fid ?? "__none__"] as unknown as FilterSpecification,
    }),
    [hovered?.fid],
  );

  const onMouseMove = useCallback((e: MapMouseEvent) => {
    const p = e.features?.[0]?.properties;
    if (!p) {
      setHovered(null);
      return;
    }
    setHovered({
      fid: String(p.fid),
      regionName: String(p.region_name),
      cropBelt: String(p.crop_belt),
      hasData: p.has_data === true || p.has_data === "true",
      stressIndex: asNum(p.stress_index),
      reading: p.reading == null || p.reading === "null" ? null : String(p.reading),
      ndviZ: asNum(p.ndvi_z),
      smZ: asNum(p.sm_z),
    });
  }, []);

  const handleLoad = useCallback((e: MapEvent) => {
    e.target.fitBounds(WHEAT_BELT_BOUNDS, { padding: 48, duration: 0 });
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-border/50 bg-card/70 text-sm text-muted-foreground">
        Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN is not configured.
      </div>
    );
  }

  return (
    <div className="relative h-[560px] overflow-hidden rounded-xl border border-border/50 bg-wheat-100">
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["crop-stress-fill"]}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        onLoad={handleLoad}
        dragRotate={false}
        touchZoomRotate
        attributionControl={false}
        minZoom={1}
        maxZoom={7}
      >
        <Source id="crop-stress" type="geojson" data={mergedGeojson}>
          <Layer {...FILL_LAYER} />
          <Layer {...OUTLINE_LAYER} />
          <Layer {...hoverLayer} />
        </Source>
      </MapGL>

      {/* Honesty badge */}
      <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-amber/40 bg-wheat-50/90 px-3 py-1.5 text-[11px] font-bold text-wheat-700 shadow-md backdrop-blur-md">
        Satellite · watch-only — not a stance input yet
      </div>

      {/* Focus panel */}
      <div className="absolute left-3 top-3 w-[230px] max-w-[calc(100%-1.5rem)] rounded-xl border border-white/40 bg-wheat-50/92 px-3 py-2.5 text-wheat-900 shadow-lg backdrop-blur-md">
        {hovered ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: hovered.hasData ? stressColor(hovered.stressIndex) : STRESS_NODATA_COLOR }}
              />
              <p className="truncate text-sm font-semibold">{hovered.regionName}</p>
            </div>
            {hovered.hasData ? (
              <div className="mt-1.5 space-y-1 text-[11px] text-wheat-700">
                <p className="font-semibold capitalize text-wheat-900">{hovered.reading ?? "--"}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                  <span>stress {fmtIndex(hovered.stressIndex)}</span>
                  <span>NDVI z {fmtZ(hovered.ndviZ)}</span>
                  <span>soil-moist z {fmtZ(hovered.smZ)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-wheat-600">No satellite reading for this belt this week.</p>
            )}
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-wheat-600">Crop stress</p>
            <p className="mt-1 text-[11px] text-wheat-600">
              Hover a belt for its NDVI + soil-moisture reading. Redder = more stressed (tends to support prices).
            </p>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 w-[220px] rounded-xl border border-white/40 bg-wheat-50/92 px-3 py-2.5 text-wheat-900 shadow-lg backdrop-blur-md">
        <div className="h-2.5 w-full rounded-full" style={{ background: LEGEND_GRADIENT }} />
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-wheat-700">
          <span>Stressed</span>
          <span>Near normal</span>
          <span>Healthy</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-wheat-600">
          <span>supports prices ← → weighs on prices</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-wheat-600">
          <span className="h-2.5 w-2.5 rounded-sm border border-black/10" style={{ backgroundColor: STRESS_NODATA_COLOR }} />
          No reading
        </div>
      </div>

      {/* Freshness ribbon */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/25 bg-wheat-900/70 px-3 py-1.5 text-[11px] font-medium text-white shadow-md backdrop-blur-md">
        {data.latestWeek ? `Week ending ${data.latestWeek}` : "No week loaded"} · Google Earth Engine — MODIS NDVI + SMAP soil moisture
      </div>
    </div>
  );
}
