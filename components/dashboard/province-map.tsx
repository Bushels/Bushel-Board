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
    region: string; // "Alberta", "Saskatchewan", "Manitoba"
    ktonnes: number;
  }>;
}

/* ── Province config ───────────────────────────────────── */

const PROVINCE_COLORS: Record<string, string> = {
  Alberta: "#2e6b9e",
  Saskatchewan: "#6d9e3a",
  Manitoba: "#b37d24",
};

const PROVINCE_ABBR: Record<string, string> = {
  Alberta: "AB",
  Saskatchewan: "SK",
  Manitoba: "MB",
};

/**
 * Simplified GeoJSON boundaries for the three prairie provinces.
 * Coordinate pairs are [lng, lat] in WGS84.
 *
 * These are intentionally simplified (~6-10 vertices per province) for
 * dashboard rendering. The real topography comes from Mapbox's basemap tiles.
 */
function buildProvinceGeoJSON(
  provinces: ProvinceMapProps["provinces"]
): FeatureCollection {
  // Look up ktonnes for a region; default to 0
  const kt = (name: string) =>
    provinces.find((p) => p.region === name)?.ktonnes ?? 0;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Alberta",
          abbr: "AB",
          ktonnes: kt("Alberta"),
          color: PROVINCE_COLORS.Alberta,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-120.0, 49.0],
              [-120.0, 54.0],
              [-120.0, 60.0],
              [-110.0, 60.0],
              [-110.0, 54.0],
              [-110.0, 49.0],
              [-120.0, 49.0],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          name: "Saskatchewan",
          abbr: "SK",
          ktonnes: kt("Saskatchewan"),
          color: PROVINCE_COLORS.Saskatchewan,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-110.0, 49.0],
              [-110.0, 54.0],
              [-110.0, 60.0],
              [-102.0, 60.0],
              [-102.0, 54.0],
              [-102.0, 49.0],
              [-110.0, 49.0],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          name: "Manitoba",
          abbr: "MB",
          ktonnes: kt("Manitoba"),
          color: PROVINCE_COLORS.Manitoba,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-102.0, 49.0],
              [-102.0, 53.0],
              [-102.0, 60.0],
              [-95.15, 60.0],
              [-89.0, 58.0],
              [-88.0, 56.85],
              [-89.0, 56.5],
              [-89.5, 55.0],
              [-89.0, 53.0],
              [-89.0, 52.0],
              [-95.15, 49.0],
              [-102.0, 49.0],
            ],
          ],
        },
      },
    ],
  };
}

/** Center points for province labels */
function buildLabelGeoJSON(
  provinces: ProvinceMapProps["provinces"]
): FeatureCollection {
  const kt = (name: string) =>
    provinces.find((p) => p.region === name)?.ktonnes ?? 0;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Alberta",
          abbr: "AB",
          label: `AB\n${fmtKt(kt("Alberta"), 0)}`,
        },
        geometry: { type: "Point", coordinates: [-115.0, 53.5] },
      },
      {
        type: "Feature",
        properties: {
          name: "Saskatchewan",
          abbr: "SK",
          label: `SK\n${fmtKt(kt("Saskatchewan"), 0)}`,
        },
        geometry: { type: "Point", coordinates: [-106.0, 53.5] },
      },
      {
        type: "Feature",
        properties: {
          name: "Manitoba",
          abbr: "MB",
          label: `MB\n${fmtKt(kt("Manitoba"), 0)}`,
        },
        geometry: { type: "Point", coordinates: [-97.5, 53.5] },
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

/** Prairie centre — roughly Saskatoon */
const INITIAL_VIEW = {
  longitude: -106,
  latitude: 54,
  zoom: 3.8,
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
