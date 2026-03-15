"use client";

import { useState, useMemo, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import type { MapMouseEvent, FillLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from "react-map-gl/mapbox";
import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import { fmtKt } from "@/lib/utils/format";

/* ── Types ─────────────────────────────────────────────── */

interface ProvinceMapProps {
  provinces: Array<{
    region: string; // "Alberta", "Saskatchewan", "Manitoba", "British Columbia"
    ktonnes: number;
  }>;
}

/* ── Province config ───────────────────────────────────── */

const PROVINCE_COLORS: Record<string, string> = {
  Alberta: "#2e6b9e",
  Saskatchewan: "#6d9e3a",
  Manitoba: "#b37d24",
  "British Columbia": "#2f8f83",
};

const PROVINCE_ABBR: Record<string, string> = {
  Alberta: "AB",
  Saskatchewan: "SK",
  Manitoba: "MB",
  "British Columbia": "BC",
};

/**
 * Lightweight GeoJSON-style outlines for the western provinces.
 * Coordinate pairs are [lng, lat] in WGS84.
 */

const PROVINCE_COORDS: Record<string, [number, number][]> = {
  "British Columbia": [[-114.05,49],[-117,49],[-120,49],[-123.3,49],[-124,49.6],[-125,50.2],[-126,50.5],[-127.2,51],[-128,52],[-129,53],[-130,54],[-131,54.5],[-132,54.7],[-133,55],[-134,56],[-135,57],[-136,58],[-137,59],[-138.5,59.8],[-130,60],[-120,60],[-114.05,60],[-114.05,49]],
  Alberta: [[-114.06,49],[-114.04,49.03],[-114.16,49.1],[-114.15,49.15],[-114.23,49.19],[-114.37,49.2],[-114.38,49.26],[-114.43,49.27],[-114.48,49.34],[-114.58,49.39],[-114.6,49.44],[-114.58,49.56],[-114.69,49.55],[-114.74,49.61],[-114.68,49.63],[-114.64,49.73],[-114.63,49.8],[-114.69,49.91],[-114.68,49.96],[-114.64,49.98],[-114.66,50.07],[-114.72,50.13],[-114.75,50.29],[-114.79,50.33],[-114.77,50.36],[-114.84,50.4],[-115.02,50.58],[-115.1,50.59],[-115.22,50.55],[-115.32,50.64],[-115.28,50.66],[-115.31,50.71],[-115.35,50.73],[-115.4,50.72],[-115.42,50.75],[-115.53,50.79],[-115.65,50.85],[-115.57,50.9],[-115.62,50.97],[-115.76,51.04],[-115.78,51.07],[-115.96,51.1],[-116.02,51.14],[-116.03,51.22],[-116.06,51.25],[-116.26,51.32],[-116.31,51.39],[-116.3,51.46],[-116.38,51.49],[-116.4,51.54],[-116.47,51.57],[-116.49,51.61],[-116.6,51.66],[-116.6,51.72],[-116.66,51.8],[-116.75,51.8],[-116.82,51.75],[-116.81,51.72],[-116.92,51.71],[-117.04,51.91],[-117.27,52.04],[-117.32,52.18],[-117.36,52.14],[-117.6,52.13],[-117.69,52.2],[-117.76,52.2],[-117.83,52.27],[-117.73,52.34],[-117.75,52.4],[-117.9,52.42],[-118.01,52.49],[-118.05,52.4],[-118.15,52.4],[-118.22,52.37],[-118.26,52.44],[-118.21,52.48],[-118.29,52.53],[-118.28,52.57],[-118.35,52.62],[-118.3,52.67],[-118.35,52.74],[-118.43,52.79],[-118.42,52.84],[-118.49,52.9],[-118.62,52.88],[-118.68,52.97],[-118.67,53.03],[-118.78,53.06],[-118.76,53.12],[-118.98,53.24],[-119.01,53.22],[-119.01,53.14],[-119.05,53.14],[-119.27,53.2],[-119.35,53.28],[-119.39,53.36],[-119.61,53.38],[-119.74,53.4],[-119.78,53.45],[-119.84,53.52],[-119.9,53.52],[-119.88,53.56],[-119.93,53.61],[-119.77,53.6],[-119.74,53.63],[-119.81,53.71],[-119.92,53.72],[-119.9,53.78],[-120,53.81],[-120,54.01],[-119.98,59.99],[-110,60],[-110,59.31],[-110,58.97],[-110,56.36],[-110,56.28],[-110,54.77],[-110,54.62],[-110,54.45],[-110,54.01],[-110,49],[-110.75,49],[-111.28,49],[-112.19,49],[-114.06,49]],
  Saskatchewan: [[-102,60],[-102,59.92],[-102,58.13],[-102,58.03],[-102,57.87],[-102,57.5],[-102,57.26],[-102,57.01],[-102,56.37],[-102,56.22],[-102,55.83],[-101.97,55.76],[-101.97,55.67],[-101.97,55.47],[-101.93,55.47],[-101.93,55.12],[-101.88,55.12],[-101.88,54.77],[-101.85,54.77],[-101.85,54.54],[-101.85,54.42],[-101.81,54.42],[-101.81,54.07],[-101.77,54.07],[-101.77,54],[-101.74,53.37],[-101.7,53.37],[-101.67,52.67],[-101.64,52.67],[-101.64,52.32],[-101.61,52.32],[-101.61,51.97],[-101.57,51.97],[-101.54,50.95],[-101.51,50.95],[-101.51,50.6],[-101.48,50.59],[-101.48,50.24],[-101.45,50.24],[-101.45,49.89],[-101.43,49.89],[-101.43,49.53],[-101.4,49.53],[-101.4,49.18],[-101.37,49.18],[-101.37,49],[-101.5,49],[-102.02,49],[-102.94,49],[-104.06,49],[-105.06,49],[-106.12,49],[-107.19,49],[-108.25,49],[-109.5,49],[-110,49],[-110,54.01],[-110,54.45],[-110,54.62],[-110,54.77],[-110,56.28],[-110,56.36],[-110,58.97],[-110,59.31],[-110,60],[-107.11,59.99],[-106.26,60],[-106.04,60],[-105.86,60],[-105.54,60],[-104.71,60],[-104.27,60],[-102,60]],
  Manitoba: [[-102,60],[-100.04,60],[-99.63,60],[-94.8,60],[-94.82,59.95],[-94.77,59.78],[-94.82,59.64],[-94.76,59.57],[-94.79,59.54],[-94.73,59.45],[-94.71,59.37],[-94.74,59.34],[-94.66,59.35],[-94.78,59.29],[-94.79,59.09],[-94.93,59.08],[-95,59.05],[-94.8,59.06],[-94.8,59.01],[-94.68,58.97],[-94.75,58.83],[-94.68,58.88],[-94.59,58.87],[-94.48,58.81],[-94.42,58.72],[-94.33,58.72],[-94.28,58.78],[-94.2,58.8],[-94.24,58.74],[-94.2,58.68],[-94.27,58.63],[-94.31,58.56],[-94.29,58.44],[-94.33,58.39],[-94.36,58.22],[-94.23,58.4],[-94.25,58.59],[-94.14,58.73],[-94.18,58.77],[-93.5,58.77],[-93.47,58.72],[-93.4,58.7],[-93.32,58.76],[-93.15,58.74],[-93.12,58.51],[-92.93,58.21],[-92.85,58.16],[-92.87,58.14],[-92.8,58.06],[-92.75,57.86],[-92.78,57.83],[-92.73,57.82],[-92.6,57.65],[-92.55,57.54],[-92.45,57.44],[-92.42,57.34],[-92.44,57.23],[-92.58,57.06],[-92.72,56.95],[-92.88,56.91],[-92.69,56.93],[-92.44,57.04],[-92.21,57.06],[-92.47,56.93],[-92.18,57.03],[-91,57.26],[-90.45,57.19],[-90,57.02],[-89.18,56.87],[-89.31,56.63],[-90.84,55.67],[-92.39,54.63],[-92.48,54.57],[-92.6,54.48],[-92.7,54.41],[-93.27,54],[-93.65,53.72],[-95.15,52.83],[-95.15,49.58],[-95.15,49.45],[-95.15,49.37],[-95.16,49],[-95.28,49],[-96.41,49],[-97.23,49],[-97.94,49],[-99,49],[-99.53,49],[-100.19,49],[-101.37,49],[-101.37,49.18],[-101.4,49.18],[-101.4,49.53],[-101.43,49.53],[-101.43,49.89],[-101.45,49.89],[-101.45,50.24],[-101.48,50.24],[-101.48,50.59],[-101.51,50.6],[-101.51,50.95],[-101.54,50.95],[-101.57,51.97],[-101.61,51.97],[-101.61,52.32],[-101.64,52.32],[-101.64,52.67],[-101.67,52.67],[-101.7,53.37],[-101.74,53.37],[-101.77,54],[-101.77,54.07],[-101.81,54.07],[-101.81,54.42],[-101.85,54.42],[-101.85,54.54],[-101.85,54.77],[-101.88,54.77],[-101.88,55.12],[-101.93,55.12],[-101.93,55.47],[-101.97,55.47],[-101.97,55.67],[-101.97,55.76],[-102,55.83],[-102,56.22],[-102,56.37],[-102,57.01],[-102,57.26],[-102,57.5],[-102,57.87],[-102,58.03],[-102,58.13],[-102,59.92],[-102,60]],
};

function buildProvinceGeoJSON(
  provinces: ProvinceMapProps["provinces"]
): FeatureCollection {
  const kt = (name: string) =>
    provinces.find((p) => p.region === name)?.ktonnes ?? 0;

  return {
    type: "FeatureCollection",
    features: Object.entries(PROVINCE_COORDS).map(([name, coords]) => ({
      type: "Feature" as const,
      properties: {
        name,
        abbr: PROVINCE_ABBR[name],
        ktonnes: kt(name),
        color: PROVINCE_COLORS[name],
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [coords],
      },
    })),
  };
}

/** Center points for province labels */
function buildLabelGeoJSON(
  provinces: ProvinceMapProps["provinces"]
): FeatureCollection {
  const kt = (name: string) =>
    provinces.find((p) => p.region === name)?.ktonnes ?? 0;

  const totalKt = provinces.reduce((sum, p) => sum + p.ktonnes, 0);

  const pct = (name: string) =>
    totalKt > 0 ? ((kt(name) / totalKt) * 100).toFixed(1) : "0.0";

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "British Columbia",
          abbr: "BC",
          label: `BC\n${fmtKt(kt("British Columbia"), 1)} (${pct("British Columbia")}%)`,
        },
        geometry: { type: "Point", coordinates: [-124, 54] },
      },
      {
        type: "Feature",
        properties: {
          name: "Alberta",
          abbr: "AB",
          label: `AB\n${fmtKt(kt("Alberta"), 1)} (${pct("Alberta")}%)`,
        },
        geometry: { type: "Point", coordinates: [-114.5, 54.5] },
      },
      {
        type: "Feature",
        properties: {
          name: "Saskatchewan",
          abbr: "SK",
          label: `SK\n${fmtKt(kt("Saskatchewan"), 1)} (${pct("Saskatchewan")}%)`,
        },
        geometry: { type: "Point", coordinates: [-106.0, 54.0] },
      },
      {
        type: "Feature",
        properties: {
          name: "Manitoba",
          abbr: "MB",
          label: `MB\n${fmtKt(kt("Manitoba"), 1)} (${pct("Manitoba")}%)`,
        },
        geometry: { type: "Point", coordinates: [-98.0, 54.0] },
      },
    ],
  };
}

/* ── Layer styles ──────────────────────────────────────── */

const fillLayer: FillLayerSpecification = {
  id: "province-fill",
  type: "fill",
  source: "provinces",
  paint: {
    "fill-color": ["get", "color"],
    "fill-opacity": [
      "case",
      ["boolean", ["feature-state", "hover"], false],
      0.45,
      0.25,
    ],
  },
};

const outlineLayer: LineLayerSpecification = {
  id: "province-outline",
  type: "line",
  source: "provinces",
  paint: {
    "line-color": ["get", "color"],
    "line-width": 2,
    "line-opacity": 0.7,
  },
};

const labelLayer: SymbolLayerSpecification = {
  id: "province-labels",
  type: "symbol",
  source: "province-labels",
  layout: {
    "text-field": ["get", "label"],
    "text-size": 14,
    "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
    "text-anchor": "center",
    "text-allow-overlap": true,
  },
  paint: {
    "text-color": "#1a1a1a",
    "text-halo-color": "rgba(255,255,255,0.85)",
    "text-halo-width": 2,
  },
};

/* ── Component ─────────────────────────────────────────── */

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Western provinces centre */
const INITIAL_VIEW = {
  longitude: -111,
  latitude: 54.3,
  zoom: 3.2,
};

export function ProvinceMap({ provinces }: ProvinceMapProps) {
  const [hoverInfo, setHoverInfo] = useState<{
    name: string;
    ktonnes: number;
    x: number;
    y: number;
    lng: number;
    lat: number;
  } | null>(null);

  const geojson = useMemo(() => buildProvinceGeoJSON(provinces), [provinces]);
  const labels = useMemo(() => buildLabelGeoJSON(provinces), [provinces]);

  const maxKt = Math.max(...provinces.map((p) => p.ktonnes), 1);

  const onHover = useCallback(
    (event: MapMouseEvent) => {
      const feature = event.features?.[0];
      if (feature) {
        setHoverInfo({
          name: feature.properties?.name ?? "",
          ktonnes: feature.properties?.ktonnes ?? 0,
          x: event.point.x,
          y: event.point.y,
          lng: event.lngLat.lng,
          lat: event.lngLat.lat,
        });
      } else {
        setHoverInfo(null);
      }
    },
    []
  );

  const onMouseLeave = useCallback(() => setHoverInfo(null), []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-[350px] flex items-center justify-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
        Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN not configured
      </div>
    );
  }

  return (
    <div className="relative w-full h-[350px] rounded-xl overflow-hidden border border-border/40">
      <Map
        initialViewState={INITIAL_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactiveLayerIds={["province-fill"]}
        onMouseMove={onHover}
        onMouseLeave={onMouseLeave}
        scrollZoom={false}
        dragPan={false}
        dragRotate={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        keyboard={false}
        cursor={hoverInfo ? "pointer" : "default"}
        attributionControl={false}
      >
        {/* Province fill + outline */}
        <Source id="provinces" type="geojson" data={geojson}>
          <Layer {...fillLayer} />
          <Layer {...outlineLayer} />
        </Source>

        {/* Province labels (abbreviation + kt value) */}
        <Source id="province-labels" type="geojson" data={labels}>
          <Layer {...labelLayer} />
        </Source>
      </Map>

      {/* Hover tooltip */}
      {hoverInfo && (
        <div
          className="absolute z-10 pointer-events-none bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg"
          style={{
            left: hoverInfo.x + 12,
            top: hoverInfo.y - 12,
          }}
        >
          <p className="text-sm font-semibold text-foreground">
            {hoverInfo.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {fmtKt(hoverInfo.ktonnes, 0)} delivered (CY)
          </p>
          <div
            className="mt-1 h-1.5 rounded-full"
            style={{
              width: `${Math.max((hoverInfo.ktonnes / maxKt) * 100, 10)}%`,
              backgroundColor:
                PROVINCE_COLORS[hoverInfo.name] ?? "var(--color-canola)",
            }}
          />
        </div>
      )}
    </div>
  );
}
