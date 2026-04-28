"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import type { MapEvent, MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { SeismographGlyph } from "@/components/dashboard/seeding-seismograph-glyph";
import { SeedingStateTooltip } from "@/components/dashboard/seeding-state-tooltip";
import { GlassCard } from "@/components/ui/glass-card";
import {
  groupByState,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";
import type { CommodityDashboard } from "@/lib/queries/seeding-progress";
import { cn } from "@/lib/utils";

interface Props {
  dashboards: CommodityDashboard[];
  selectedCommodity: string;
  currentWeek: string;
  onSelectCommodity: (c: string) => void;
}

interface TooltipState {
  commodity: string;
  row: SeismographRow;
  anchor: { x: number; y: number };
  containerSize: { width: number; height: number };
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const EASE = [0.16, 1, 0.3, 1] as const;

const COMMODITY_ORDER = ["CORN", "SOYBEANS", "WHEAT", "BARLEY", "OATS"];

const INITIAL_VIEW = {
  longitude: -93.5,
  latitude: 39.8,
  zoom: 4.0,
};

const MAX_BOUNDS: [[number, number], [number, number]] = [
  [-110, 28],
  [-78, 50],
];

const CROP_FOCUS: Record<
  string,
  { longitude: number; latitude: number; zoom: number }
> = {
  CORN: { longitude: -93.5, latitude: 41.9, zoom: 4.55 },
  SOYBEANS: { longitude: -90.8, latitude: 40.8, zoom: 4.45 },
  WHEAT: { longitude: -98.6, latitude: 38.4, zoom: 4.35 },
  BARLEY: { longitude: -100.1, latitude: 47.0, zoom: 4.55 },
  OATS: { longitude: -95.2, latitude: 44.2, zoom: 4.45 },
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function swatchFor(commodity: string): string {
  return commodity === "WHEAT" ? "#e8b96b" : "#c17f24";
}

function rowForWeek(
  rows: SeismographRow[],
  currentWeek: string,
): SeismographRow | null {
  if (rows.length === 0) return null;
  return rows.find((row) => row.week_ending === currentWeek) ?? rows.at(-1)!;
}

function polishBaseMap(map: MapEvent["target"]): void {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    if (layer.type !== "symbol") continue;

    const keepStateLabel = layer.id.includes("state-label");
    try {
      map.setLayoutProperty(
        layer.id,
        "visibility",
        keepStateLabel ? "visible" : "none",
      );

      if (keepStateLabel) {
        map.setPaintProperty(layer.id, "text-color", "#8c806a");
        map.setPaintProperty(layer.id, "text-halo-color", "#f5f3ee");
        map.setPaintProperty(layer.id, "text-halo-width", 1);
        map.setPaintProperty(layer.id, "text-opacity", 0.58);
      }
    } catch {
      // Mapbox style layers vary slightly by release; ignore unavailable layers.
    }
  }
}

function EmptyTokenFallback(): JSX.Element {
  return (
    <GlassCard elevation={2} hover={false} className="p-4 sm:p-5">
      <div className="flex h-[380px] items-center justify-center rounded-2xl border border-border/40 bg-muted/20 text-center text-sm text-muted-foreground md:h-[540px]">
        Map unavailable - NEXT_PUBLIC_MAPBOX_TOKEN not configured
      </div>
    </GlassCard>
  );
}

export function SeedingFocusMap(props: Props): JSX.Element {
  if (!MAPBOX_TOKEN) {
    return <EmptyTokenFallback />;
  }

  return <SeedingFocusMapInner {...props} mapboxToken={MAPBOX_TOKEN} />;
}

function SeedingFocusMapInner({
  dashboards,
  selectedCommodity,
  currentWeek,
  onSelectCommodity,
  mapboxToken,
}: Props & { mapboxToken: string }): JSX.Element {
  const reducedMotion = useReducedMotion() === true;
  const mapRef = useRef<MapRef | null>(null);
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const previousCommodityRef = useRef(selectedCommodity);
  const [mapReady, setMapReady] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const activeDashboard = useMemo(
    () =>
      dashboards.find((dashboard) => dashboard.commodity === selectedCommodity) ??
      dashboards[0] ??
      null,
    [dashboards, selectedCommodity],
  );
  const activeCommodity = activeDashboard?.commodity ?? selectedCommodity;
  const activeRows = useMemo(
    () => activeDashboard?.rows ?? [],
    [activeDashboard],
  );

  const commodityButtons = useMemo(() => {
    const available = new Set(dashboards.map((dashboard) => dashboard.commodity));
    const ordered = COMMODITY_ORDER.filter((commodity) =>
      available.has(commodity),
    );
    return ordered.length > 0 ? ordered : COMMODITY_ORDER;
  }, [dashboards]);

  const stateEntries = useMemo(() => {
    const grouped = groupByState(activeRows);
    return Object.entries(grouped).sort(([, aRows], [, bRows]) => {
      const a = aRows[0]?.state_name ?? "";
      const b = bRows[0]?.state_name ?? "";
      return a.localeCompare(b);
    });
  }, [activeRows]);

  const handleMapLoad = useCallback((event: MapEvent) => {
    polishBaseMap(event.target);
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!mapReady) return;

    const previousCommodity = previousCommodityRef.current;
    if (previousCommodity === selectedCommodity) return;

    previousCommodityRef.current = selectedCommodity;

    if (reducedMotion) return;

    const focus = CROP_FOCUS[selectedCommodity] ?? INITIAL_VIEW;
    mapRef.current?.flyTo({
      center: [focus.longitude, focus.latitude],
      zoom: focus.zoom,
      duration: 400,
      curve: 1.25,
      essential: false,
    });
  }, [mapReady, reducedMotion, selectedCommodity]);

  const showTooltipForElement = useCallback(
    (rows: SeismographRow[], element: HTMLElement) => {
      const row = rowForWeek(rows, currentWeek);
      const container = mapShellRef.current?.getBoundingClientRect();
      if (!row || !container) return;

      const marker = element.getBoundingClientRect();
      setTooltip({
        commodity: activeCommodity,
        row,
        anchor: {
          x: marker.left - container.left + marker.width / 2,
          y: marker.top - container.top + marker.height / 2,
        },
        containerSize: {
          width: container.width,
          height: container.height,
        },
      });
    },
    [activeCommodity, currentWeek],
  );

  return (
    <GlassCard elevation={2} hover={false} className="overflow-hidden p-4 sm:p-5">
      <header className="flex flex-col gap-3 border-b border-border/35 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {commodityButtons.map((commodity) => {
            const isActive = commodity === selectedCommodity;
            return (
              <motion.button
                key={commodity}
                type="button"
                onClick={() => onSelectCommodity(commodity)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isActive
                    ? "border-canola bg-canola text-white shadow-canola-glow ring-2 ring-canola/30"
                    : "border-border/45 bg-card/50 text-muted-foreground hover:border-canola/45 hover:bg-canola/10 hover:text-foreground",
                )}
                animate={
                  reducedMotion
                    ? false
                    : { scale: isActive ? 1.035 : 1, opacity: 1 }
                }
                whileHover={
                  reducedMotion ? undefined : { scale: isActive ? 1.035 : 1.02 }
                }
                whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                transition={{ duration: 0.12, ease: EASE }}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full border"
                  style={{
                    backgroundColor: swatchFor(commodity),
                    borderColor: isActive
                      ? "rgba(255,255,255,0.75)"
                      : "transparent",
                  }}
                />
                {titleCase(commodity)}
              </motion.button>
            );
          })}
        </div>

        <p className="text-sm font-medium text-muted-foreground">
          Hover a state for details
        </p>
      </header>

      <div
        ref={mapShellRef}
        className="relative mt-4 h-[380px] overflow-hidden rounded-2xl border border-border/40 bg-wheat-50 md:h-[540px]"
        onPointerLeave={() => setTooltip(null)}
      >
        <Map
          ref={mapRef}
          initialViewState={INITIAL_VIEW}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={mapboxToken}
          maxBounds={MAX_BOUNDS}
          minZoom={3.3}
          maxZoom={7}
          scrollZoom={true}
          dragPan={true}
          dragRotate={true}
          doubleClickZoom={true}
          touchZoomRotate={true}
          keyboard={true}
          attributionControl={false}
          onLoad={handleMapLoad}
          onClick={() => setTooltip(null)}
          onMoveStart={() => setTooltip(null)}
          onZoomStart={() => setTooltip(null)}
          cursor="grab"
        >
          {stateEntries.map(([stateCode, stateRows]) => {
            const first = stateRows[0];
            if (!first) return null;

            return (
              <Marker
                key={stateCode}
                longitude={first.centroid_lng}
                latitude={first.centroid_lat}
                anchor="center"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {reducedMotion ? (
                    <button
                      key={`${activeCommodity}-${stateCode}`}
                      type="button"
                      className="block cursor-pointer rounded-[10px] outline-none ring-offset-2 ring-offset-wheat-50 focus-visible:ring-2 focus-visible:ring-canola"
                      aria-label={`${first.state_name} ${titleCase(activeCommodity)} seeding details`}
                      onPointerEnter={(event) =>
                        showTooltipForElement(stateRows, event.currentTarget)
                      }
                      onPointerLeave={() => setTooltip(null)}
                      onFocus={(event) =>
                        showTooltipForElement(stateRows, event.currentTarget)
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        showTooltipForElement(stateRows, event.currentTarget);
                      }}
                      onBlur={() => setTooltip(null)}
                    >
                      <SeismographGlyph
                        rows={stateRows}
                        commodity={activeCommodity}
                        currentWeek={currentWeek}
                      />
                    </button>
                  ) : (
                    <motion.button
                      key={`${activeCommodity}-${stateCode}`}
                      type="button"
                      className="block cursor-pointer rounded-[10px] outline-none ring-offset-2 ring-offset-wheat-50 focus-visible:ring-2 focus-visible:ring-canola"
                      aria-label={`${first.state_name} ${titleCase(activeCommodity)} seeding details`}
                      initial={{ opacity: 0, y: 4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: EASE }}
                      onPointerEnter={(event) =>
                        showTooltipForElement(stateRows, event.currentTarget)
                      }
                      onPointerLeave={() => setTooltip(null)}
                      onFocus={(event) =>
                        showTooltipForElement(stateRows, event.currentTarget)
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        showTooltipForElement(stateRows, event.currentTarget);
                      }}
                      onBlur={() => setTooltip(null)}
                    >
                      <SeismographGlyph
                        rows={stateRows}
                        commodity={activeCommodity}
                        currentWeek={currentWeek}
                      />
                    </motion.button>
                  )}
                </AnimatePresence>
              </Marker>
            );
          })}
        </Map>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
          style={{
            background:
              "radial-gradient(circle at center, transparent 56%, rgba(245,243,238,0.44) 100%)",
            boxShadow:
              "inset 0 0 72px rgba(245,243,238,0.72), inset 0 0 1px rgba(42,38,30,0.14)",
          }}
        />

        {stateEntries.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-sm font-medium text-muted-foreground">
            No state-level data this season
          </div>
        )}

        <AnimatePresence initial={false}>
          {tooltip && tooltip.commodity === activeCommodity && (
            <SeedingStateTooltip
              key={`${tooltip.row.state_code}-${tooltip.row.week_ending}`}
              row={tooltip.row}
              commodity={activeCommodity}
              anchor={tooltip.anchor}
              containerSize={tooltip.containerSize}
              reducedMotion={reducedMotion}
            />
          )}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-[11px] font-medium text-muted-foreground/80">
        Mapbox · USDA NASS · State centroids approximate
      </p>
    </GlassCard>
  );
}
