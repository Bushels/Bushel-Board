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
import { SeedingDrillPanel } from "@/components/dashboard/seeding-drill-panel";
import { GlassCard } from "@/components/ui/glass-card";
import {
  groupByState,
  type SeismographRow,
} from "@/lib/queries/seeding-progress-utils";
import type { CommodityDashboard } from "@/lib/queries/seeding-progress";
import { snapToModis8Day, buildGibsTileUrl } from "@/lib/utils/ndvi-time";
import { cn } from "@/lib/utils";

const NDVI_SOURCE_ID = "ndvi-modis-8day";
const NDVI_LAYER_ID = "ndvi-modis-8day-layer";

const PINNED_STATE_ZOOM = 5.5;
const PINNED_STATE_FLY_DURATION_MS = 500;

interface Props {
  dashboards: CommodityDashboard[];
  selectedCommodity: string;
  currentWeek: string;
  /** Kept for backwards-compatibility — callers may still pass it but the
   *  focus map no longer renders its own commodity selector. The cards
   *  above the scrubber are now the single source of truth for crop
   *  selection. */
  onSelectCommodity?: (c: string) => void;
}

interface TooltipState {
  commodity: string;
  row: SeismographRow;
  anchor: { x: number; y: number };
  containerSize: { width: number; height: number };
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const EASE = [0.16, 1, 0.3, 1] as const;

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

    // satellite-streets-v12 has heavier label noise than light-v11 — keep
    // only state and country labels, dial the rest down to zero.
    const keepLabel =
      layer.id.includes("state-label") || layer.id.includes("country-label");
    try {
      map.setLayoutProperty(
        layer.id,
        "visibility",
        keepLabel ? "visible" : "none",
      );

      if (keepLabel) {
        // Light, high-contrast against satellite imagery.
        map.setPaintProperty(layer.id, "text-color", "#f5f3ee");
        map.setPaintProperty(layer.id, "text-halo-color", "#1a1813");
        map.setPaintProperty(layer.id, "text-halo-width", 1.4);
        map.setPaintProperty(layer.id, "text-opacity", 0.85);
      }
    } catch {
      // Mapbox style layers vary slightly by release; ignore unavailable layers.
    }
  }
}

function ensureNdviLayer(
  map: MapEvent["target"],
  compositeDate: string,
  initiallyVisible: boolean,
): void {
  const tileUrl = buildGibsTileUrl(compositeDate);

  // Find the first symbol layer so we can insert the raster *under* labels
  // (state/country names should stay readable over the NDVI tint).
  const layers = map.getStyle().layers ?? [];
  const firstSymbolLayerId = layers.find(
    (layer) => layer.type === "symbol",
  )?.id;

  if (!map.getSource(NDVI_SOURCE_ID)) {
    map.addSource(NDVI_SOURCE_ID, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      attribution: "NDVI © NASA EOSDIS GIBS · MODIS Terra",
    });
  }

  if (!map.getLayer(NDVI_LAYER_ID)) {
    map.addLayer(
      {
        id: NDVI_LAYER_ID,
        type: "raster",
        source: NDVI_SOURCE_ID,
        paint: {
          "raster-opacity": 0.55,
          "raster-saturation": 0.4,
          "raster-contrast": 0.1,
        },
        layout: {
          visibility: initiallyVisible ? "visible" : "none",
        },
      },
      firstSymbolLayerId,
    );
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
  mapboxToken,
}: Props & { mapboxToken: string }): JSX.Element {
  const reducedMotion = useReducedMotion() === true;
  const mapRef = useRef<MapRef | null>(null);
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const previousCommodityRef = useRef(selectedCommodity);
  const [mapReady, setMapReady] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [showNdvi, setShowNdvi] = useState(true);
  const [pinnedStateCode, setPinnedStateCode] = useState<string | null>(null);
  const [drillSelection, setDrillSelection] = useState<{
    stateCode: string;
    commodity: string;
  } | null>(null);

  const ndviCompositeDate = useMemo(() => {
    if (!currentWeek) return snapToModis8Day(new Date());
    try {
      return snapToModis8Day(currentWeek);
    } catch {
      return snapToModis8Day(new Date());
    }
  }, [currentWeek]);

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

  const stateEntries = useMemo(() => {
    const grouped = groupByState(activeRows);
    return Object.entries(grouped).sort(([, aRows], [, bRows]) => {
      const a = aRows[0]?.state_name ?? "";
      const b = bRows[0]?.state_name ?? "";
      return a.localeCompare(b);
    });
  }, [activeRows]);

  const handleMapLoad = useCallback(
    (event: MapEvent) => {
      polishBaseMap(event.target);
      ensureNdviLayer(event.target, ndviCompositeDate, showNdvi);
      setMapReady(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
    // ndviCompositeDate / showNdvi are captured at mount; their changes are
    // handled by the dedicated effects below. This callback only fires on
    // the initial Mapbox load event.
  );

  // Update NDVI tiles when the user scrubs the week — Mapbox swaps tiles
  // without recreating the source, so this is cheap.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const source = map.getSource(NDVI_SOURCE_ID) as
      | { setTiles?: (tiles: string[]) => void }
      | undefined;
    if (source?.setTiles) {
      source.setTiles([buildGibsTileUrl(ndviCompositeDate)]);
    }
  }, [ndviCompositeDate, mapReady]);

  // Toggle NDVI layer visibility without removing it (keeps tile cache warm).
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map?.getLayer(NDVI_LAYER_ID)) return;
    map.setLayoutProperty(
      NDVI_LAYER_ID,
      "visibility",
      showNdvi ? "visible" : "none",
    );
  }, [showNdvi, mapReady]);

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

  // Show tooltip via lng/lat projection rather than DOM lookup — used by the
  // state quick-jump pills, where we don't have a marker element in hand.
  const showTooltipForLngLat = useCallback(
    (rows: SeismographRow[]) => {
      const row = rowForWeek(rows, currentWeek);
      const container = mapShellRef.current?.getBoundingClientRect();
      const map = mapRef.current?.getMap();
      if (!row || !container || !map) return;
      const point = map.project([row.centroid_lng, row.centroid_lat]);
      setTooltip({
        commodity: activeCommodity,
        row,
        anchor: { x: point.x, y: point.y },
        containerSize: { width: container.width, height: container.height },
      });
    },
    [activeCommodity, currentWeek],
  );

  const handleStatePillClick = useCallback(
    (stateCode: string, stateRows: SeismographRow[]) => {
      // Toggle off if already pinned
      if (pinnedStateCode === stateCode) {
        setPinnedStateCode(null);
        setTooltip(null);
        setDrillSelection(null);
        return;
      }
      setPinnedStateCode(stateCode);
      setDrillSelection({ stateCode, commodity: activeCommodity });
      const first = stateRows[0];
      const map = mapRef.current?.getMap();
      if (!first) return;

      if (reducedMotion || !map) {
        showTooltipForLngLat(stateRows);
        return;
      }

      map.flyTo({
        center: [first.centroid_lng, first.centroid_lat],
        zoom: PINNED_STATE_ZOOM,
        duration: PINNED_STATE_FLY_DURATION_MS,
        curve: 1.2,
        essential: false,
      });
      map.once("moveend", () => {
        showTooltipForLngLat(stateRows);
      });
    },
    [activeCommodity, pinnedStateCode, reducedMotion, showTooltipForLngLat],
  );

  // Clear pinned state and drill panel when commodity changes
  useEffect(() => {
    setPinnedStateCode(null);
    setDrillSelection(null);
  }, [selectedCommodity]);

  return (
    <GlassCard elevation={2} hover={false} className="overflow-hidden p-4 sm:p-5">
      <header className="flex flex-col gap-3 border-b border-border/35 pb-4 lg:flex-row lg:items-center lg:justify-between">
        {/* State quick-jump pills. The 5 commodities are selected via the
            small-multiples cards above the scrubber — keeping this row free
            of duplicate crop pills and instead using it for state focus. */}
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          <span
            aria-hidden="true"
            className="shrink-0 pr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            {titleCase(activeCommodity)} ·
          </span>
          {stateEntries.length === 0 && (
            <span className="text-xs italic text-muted-foreground">
              No state-level data this commodity
            </span>
          )}
          {stateEntries.map(([stateCode, stateRows]) => {
            const first = stateRows[0];
            if (!first) return null;
            const isPinned = pinnedStateCode === stateCode;
            return (
              <motion.button
                key={stateCode}
                type="button"
                onClick={() => handleStatePillClick(stateCode, stateRows)}
                aria-pressed={isPinned}
                aria-label={`Focus on ${first.state_name}`}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isPinned
                    ? "border-canola bg-canola text-white shadow-sm ring-2 ring-canola/30"
                    : "border-border/40 bg-card/50 text-muted-foreground hover:border-canola/40 hover:bg-canola/10 hover:text-foreground",
                )}
                whileHover={
                  reducedMotion ? undefined : { scale: isPinned ? 1.0 : 1.04 }
                }
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                transition={{ duration: 0.1, ease: EASE }}
              >
                <span className="font-display text-[10px]">{stateCode}</span>
                <span className="hidden font-medium sm:inline">
                  {first.state_name}
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setShowNdvi((prev) => !prev)}
            aria-pressed={showNdvi}
            aria-label="Toggle NDVI satellite vegetation overlay"
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
              showNdvi
                ? "border-prairie/60 bg-prairie/12 text-prairie"
                : "border-border/45 bg-card/50 text-muted-foreground hover:border-prairie/40 hover:bg-prairie/8 hover:text-foreground",
            )}
          >
            <span aria-hidden="true">🛰</span>
            {showNdvi ? "NDVI on" : "NDVI off"}
          </button>
        </div>
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
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
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
                        setDrillSelection({
                          stateCode,
                          commodity: activeCommodity,
                        });
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
                        setDrillSelection({
                          stateCode,
                          commodity: activeCommodity,
                        });
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
              "radial-gradient(circle at center, transparent 56%, rgba(26,24,19,0.34) 100%)",
            boxShadow:
              "inset 0 0 60px rgba(26,24,19,0.28), inset 0 0 1px rgba(42,38,30,0.45)",
          }}
        />

        {showNdvi && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full border border-white/30 bg-ink/45 px-3 py-1.5 text-[11px] font-medium text-white shadow-md backdrop-blur-md">
            <span aria-hidden="true">🛰</span>{" "}
            NDVI · MODIS Terra · {ndviCompositeDate}
          </div>
        )}

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

        <AnimatePresence>
          {drillSelection && (
            <SeedingDrillPanel
              key={`${drillSelection.stateCode}-${drillSelection.commodity}`}
              stateCode={drillSelection.stateCode}
              commodity={drillSelection.commodity}
              currentWeek={currentWeek}
              onClose={() => {
                setDrillSelection(null);
                setPinnedStateCode(null);
                setTooltip(null);
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-[11px] font-medium text-muted-foreground/80">
        Mapbox satellite · NASA EOSDIS GIBS NDVI · USDA NASS · State centroids approximate
      </p>
    </GlassCard>
  );
}
