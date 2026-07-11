"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import MapGL, {
  Layer,
  Source,
  type MapEvent,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  RasterLayerSpecification,
} from "mapbox-gl";
import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  FLOOD_WATCH_BUCKETS,
  dominantFloodWatchBucket,
  formatAcres,
  formatDate,
  type FloodWatchMapData,
  type FloodWatchRow,
} from "@/lib/queries/flood-watch-utils";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const INITIAL_VIEW = { longitude: -99, latitude: 46.5, zoom: 3.25 };
const CONTEXT_BOUNDS: [[number, number], [number, number]] = [[-128, 23.2], [-65, 56.5]];
const AAFC_MOISTURE_BOUNDS: [number, number, number, number] = [-141, 41, -52, 84];
const CROP_CASMA_MOISTURE_BOUNDS: [number, number, number, number] = [-127.842, 23.2547, -65.3994, 51.5405];

interface HoveredCell extends FloodWatchRow {
  bucket: string;
}

function rowFeature(row: FloodWatchRow) {
  const bucket = dominantFloodWatchBucket(row);
  return {
    type: "Feature" as const,
    properties: {
      ...row,
      bucket,
      bucketLabel: bucket === "none" ? "No watch" : FLOOD_WATCH_BUCKETS[bucket].label,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [row.centerLon, row.centerLat],
    },
  };
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const CIRCLE_COLOR: ExpressionSpecification = [
  "match",
  ["get", "bucket"],
  "observed",
  FLOOD_WATCH_BUCKETS.observed.color,
  "forecast",
  FLOOD_WATCH_BUCKETS.forecast.color,
  "excess",
  FLOOD_WATCH_BUCKETS.excess.color,
  "watch",
  FLOOD_WATCH_BUCKETS.watch.color,
  "#d6d0c2",
] as ExpressionSpecification;

const RISK_MARKER_LAYER: CircleLayerSpecification = {
  id: "flood-watch-marker",
  type: "circle",
  source: "flood-watch-hotspots",
  paint: {
    "circle-color": CIRCLE_COLOR,
    "circle-opacity": 0.62,
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "totalWatchLayerAcres"],
      0,
      8,
      2500,
      16,
      12000,
      34,
    ],
    "circle-stroke-color": "#fffaf0",
    "circle-stroke-opacity": 0.88,
    "circle-stroke-width": 1.4,
  },
};

const RISK_MARKER_HALO_LAYER: CircleLayerSpecification = {
  id: "flood-watch-marker-halo",
  type: "circle",
  source: "flood-watch-hotspots",
  paint: {
    "circle-color": CIRCLE_COLOR,
    "circle-opacity": 0.16,
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "totalWatchLayerAcres"],
      0,
      18,
      2500,
      28,
      12000,
      58,
    ],
  },
};

const HOVER_LAYER: CircleLayerSpecification = {
  id: "flood-watch-hover",
  type: "circle",
  source: "flood-watch-hotspots",
  paint: {
    "circle-color": "rgba(255,255,255,0)",
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "totalWatchLayerAcres"],
      0,
      12,
      2500,
      20,
      12000,
      40,
    ],
    "circle-stroke-color": "#11100d",
    "circle-stroke-opacity": 0.95,
    "circle-stroke-width": 2.4,
  },
  filter: ["==", ["get", "gridId"], "__none__"],
};

const AAFC_MOISTURE_LAYER: RasterLayerSpecification = {
  id: "aafc-soil-moisture-context",
  type: "raster",
  source: "aafc-soil-moisture",
  paint: {
    "raster-opacity": 0.28,
    "raster-saturation": -0.28,
    "raster-contrast": -0.12,
    "raster-resampling": "linear",
  },
};

const CROP_CASMA_MOISTURE_LAYER: RasterLayerSpecification = {
  id: "crop-casma-soil-moisture-context",
  type: "raster",
  source: "crop-casma-soil-moisture",
  paint: {
    "raster-opacity": 0.42,
    "raster-saturation": -0.1,
    "raster-contrast": -0.06,
    "raster-resampling": "linear",
  },
};

export function FloodWatchMap({ data }: { data: FloodWatchMapData }) {
  const mapRef = useRef<MapRef | null>(null);
  const [hovered, setHovered] = useState<HoveredCell | null>(null);
  const [showMoistureContext, setShowMoistureContext] = useState(true);

  const geojson = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: data.rows.map(rowFeature),
  }), [data.rows]);

  const aafcLayer = data.officialMoistureLayers.find((layer) => layer.id === "aafc_smos_weekly_anomaly");
  const cropCasmaLayer = data.officialMoistureLayers.find(
    (layer) => layer.id === "crop_casma_smap_hybrid_1km_weekly_anomaly",
  );
  const aafcLatestAt = aafcLayer?.latestAt ?? "";
  const cropCasmaLayerName = cropCasmaLayer?.layerName ?? "";

  const aafcTileUrl = useMemo(() => {
    const latestMs = aafcLatestAt ? Date.parse(aafcLatestAt) : Number.NaN;
    const params = new URLSearchParams({ clean: "1" });
    if (Number.isFinite(latestMs)) params.set("time", String(latestMs));
    return `/api/map/aafc-soil-moisture/{z}/{x}/{y}.png?${params}`;
  }, [aafcLatestAt]);

  const cropCasmaTileUrl = useMemo(() => {
    if (!cropCasmaLayerName) return null;
    const params = new URLSearchParams({ clean: "1", layer: cropCasmaLayerName });
    return `/api/map/crop-casma/{z}/{x}/{y}.png?${params}`;
  }, [cropCasmaLayerName]);

  const hoverLayer = useMemo<CircleLayerSpecification>(() => ({
    ...HOVER_LAYER,
    filter: ["==", ["get", "gridId"], hovered?.gridId ?? "__none__"],
  }), [hovered?.gridId]);

  const onMouseMove = useCallback((e: MapMouseEvent) => {
    const props = e.features?.[0]?.properties;
    if (!props) {
      setHovered(null);
      return;
    }
    setHovered({
      gridId: asText(props.gridId),
      west: asNumber(props.west),
      south: asNumber(props.south),
      east: asNumber(props.east),
      north: asNumber(props.north),
      centerLon: asNumber(props.centerLon),
      centerLat: asNumber(props.centerLat),
      observedInundationAcres: asNumber(props.observedInundationAcres),
      excessMoistureAcres: asNumber(props.excessMoistureAcres),
      forecastAtRiskAcres: asNumber(props.forecastAtRiskAcres),
      forecast3DayAtRiskAcres: asNumber(props.forecast3DayAtRiskAcres),
      forecast7DayAtRiskAcres: asNumber(props.forecast7DayAtRiskAcres),
      watchAcres: asNumber(props.watchAcres),
      totalWatchLayerAcres: asNumber(props.totalWatchLayerAcres),
      bucket: asText(props.bucket),
    });
  }, []);

  const handleLoad = useCallback((e: MapEvent) => {
    e.target.fitBounds(CONTEXT_BOUNDS, { padding: 38, duration: 0 });
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-border/50 bg-card/70 text-sm text-muted-foreground">
        Map unavailable - NEXT_PUBLIC_MAPBOX_TOKEN is not configured.
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
        projection="mercator"
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["flood-watch-marker"]}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        onLoad={handleLoad}
        dragRotate={false}
        touchZoomRotate
        attributionControl={false}
        minZoom={2}
        maxZoom={7}
      >
        {showMoistureContext && aafcLayer ? (
          <Source
            id="aafc-soil-moisture"
            type="raster"
            tiles={[aafcTileUrl]}
            tileSize={256}
            bounds={AAFC_MOISTURE_BOUNDS}
          >
            <Layer {...AAFC_MOISTURE_LAYER} />
          </Source>
        ) : null}
        {showMoistureContext && cropCasmaLayer && cropCasmaTileUrl ? (
          <Source
            id="crop-casma-soil-moisture"
            type="raster"
            tiles={[cropCasmaTileUrl]}
            tileSize={256}
            bounds={CROP_CASMA_MOISTURE_BOUNDS}
          >
            <Layer {...CROP_CASMA_MOISTURE_LAYER} />
          </Source>
        ) : null}
        <Source id="flood-watch-hotspots" type="geojson" data={geojson}>
          <Layer {...RISK_MARKER_HALO_LAYER} />
          <Layer {...RISK_MARKER_LAYER} />
          <Layer {...hoverLayer} />
        </Source>
      </MapGL>

      <div className="absolute right-2 top-2 flex max-w-[110px] flex-col items-end gap-1.5 sm:right-3 sm:top-3 sm:max-w-[calc(100%-1.5rem)] sm:gap-2">
        <div className="pointer-events-none rounded-full border border-amber/40 bg-wheat-50/92 px-2.5 py-1.5 text-[10px] font-bold text-wheat-800 shadow-md backdrop-blur-md sm:px-3 sm:text-[11px]">
          <span className="sm:hidden">Watch-only</span>
          <span className="hidden sm:inline">Watch-only - acres at risk, not acres damaged</span>
        </div>
        <button
          type="button"
          aria-label="Moisture context"
          aria-pressed={showMoistureContext}
          onClick={() => setShowMoistureContext((current) => !current)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-wheat-900/78 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-md backdrop-blur-md transition-colors hover:bg-wheat-900 sm:px-3 sm:text-[11px]"
        >
          {showMoistureContext ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="sm:hidden">Moisture</span>
          <span className="hidden sm:inline">Moisture context</span>
        </button>
      </div>

      <div className="absolute left-2 top-2 w-[220px] max-w-[calc(100%-1rem)] rounded-xl border border-white/40 bg-wheat-50/92 px-3 py-2.5 text-wheat-900 shadow-lg backdrop-blur-md sm:left-3 sm:top-3 sm:w-[260px] sm:max-w-[calc(100%-1.5rem)]">
        {hovered ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                style={{
                  backgroundColor:
                    hovered.bucket in FLOOD_WATCH_BUCKETS
                      ? FLOOD_WATCH_BUCKETS[hovered.bucket as keyof typeof FLOOD_WATCH_BUCKETS].color
                      : "#d6d0c2",
                }}
              />
              <p className="text-sm font-semibold">
                Watch area near {hovered.centerLat.toFixed(1)}, {hovered.centerLon.toFixed(1)}
              </p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-wheat-700">
              <span>Observed</span>
              <b className="text-right text-wheat-900">{formatAcres(hovered.observedInundationAcres)}</b>
              <span>Excess moisture</span>
              <b className="text-right text-wheat-900">{formatAcres(hovered.excessMoistureAcres)}</b>
              <span>Forecast risk</span>
              <b className="text-right text-wheat-900">{formatAcres(hovered.forecastAtRiskAcres)}</b>
              <span>Watch</span>
              <b className="text-right text-wheat-900">{formatAcres(hovered.watchAcres)}</b>
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-wheat-600">
              Flood / excess moisture
            </p>
            <p className="mt-1 text-[11px] leading-5 text-wheat-700">
              Official soil-moisture anomaly context sits underneath GEE acreage hotspots. Hover a marker for acres at risk.
            </p>
          </>
        )}
      </div>

      <div className="absolute bottom-3 right-3 w-[270px] rounded-xl border border-white/40 bg-wheat-50/92 px-3 py-2.5 text-wheat-900 shadow-lg backdrop-blur-md">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-wheat-600">Risk hotspots</p>
          {Object.entries(FLOOD_WATCH_BUCKETS).map(([key, bucket]) => (
            <div key={key} className="flex items-center justify-between gap-2 text-[10px] text-wheat-700">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: bucket.color }} />
                {bucket.label}
              </span>
            </div>
          ))}
        </div>
        {showMoistureContext ? (
          <div className="mt-2.5 border-t border-wheat-200 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-wheat-600">
              Moisture anomaly context
            </p>
            <div className="mt-1.5 h-2 rounded-full bg-gradient-to-r from-[#8c5d30] via-[#d9d6bd] to-[#2f6f91]" />
            <div className="mt-1 flex justify-between text-[9px] font-medium text-wheat-600">
              <span>Drier</span>
              <span>Near average</span>
              <span>Wetter</span>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-wheat-700">
              AAFC SMOS for Canada; Crop-CASMA SMAP hybrid for the U.S.
            </p>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full border border-white/25 bg-wheat-900/72 px-3 py-1.5 text-[11px] font-medium text-white shadow-md backdrop-blur-md sm:block">
        {formatDate(data.eventStart)}-{formatDate(data.eventEnd)} - GEE acreage hotspots over official moisture context
      </div>
    </div>
  );
}
