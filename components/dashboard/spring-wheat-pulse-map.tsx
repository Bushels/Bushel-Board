"use client";

import { useMemo, useRef, useState } from "react";
import { BarChart3, ChevronDown, Search } from "lucide-react";
import Map, { Layer, Marker, Source } from "react-map-gl/mapbox";
import type { MapRef, MapEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type {
  SpringWheatPulseRegion,
  SpringWheatTotalPulse,
} from "@/lib/queries/spring-wheat-pulse";
import { buildGibsTileUrl, snapToModis8Day } from "@/lib/utils/ndvi-time";
import { cn } from "@/lib/utils";

interface Props {
  grainLabel: string;
  regions: SpringWheatPulseRegion[];
  latestUsWeek: string | null;
  usTotal: SpringWheatTotalPulse | null;
}

interface PulseFeatureProperties {
  id: string;
  countryCode: "US" | "CA";
  regionCode: string;
  regionName: string;
  status: "reported" | "scheduled";
  metricScope: SpringWheatPulseRegion["metricScope"];
  displayPct: number | null;
  plantedPct: number | null;
  emergedPct: number | null;
  seededPct: number | null;
  plantedPctPreviousYear: number | null;
  plantedPctYoyChange: number | null;
  emergedPctPreviousYear: number | null;
  emergedPctYoyChange: number | null;
  seededPctPreviousYear: number | null;
  seededPctYoyChange: number | null;
  paceDeltaPct: number | null;
  conditionVeryPoorPct: number | null;
  conditionPoorPct: number | null;
  conditionFairPct: number | null;
  conditionGoodPct: number | null;
  conditionExcellentPct: number | null;
  goodExcellentPct: number | null;
  conditionIndex: number | null;
  gePctYoyChange: number | null;
  metricLabel: string;
  sourceName: string;
  sourceUrl: string;
  sourceResolution: string;
  summary: string;
  reportDate: string | null;
}

interface HoverState {
  properties: PulseFeatureProperties;
}

type MapMode = "progress" | "condition";

const CONDITION_SEGMENTS = [
  { key: "conditionVeryPoorPct", label: "VP", color: "#b8350f" },
  { key: "conditionPoorPct", label: "P", color: "#d97706" },
  { key: "conditionFairPct", label: "F", color: "#a89060" },
  { key: "conditionGoodPct", label: "G", color: "#437a22" },
  { key: "conditionExcellentPct", label: "E", color: "#7ba84e" },
] as const;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const INITIAL_VIEW = {
  longitude: -106.2,
  latitude: 48.2,
  zoom: 3.45,
};

const MOBILE_INITIAL_VIEW = {
  longitude: -106.6,
  latitude: 47.8,
  zoom: 2.45,
};

const MAX_BOUNDS: [[number, number], [number, number]] = [
  [-126, 31],
  [-88, 57],
];

function fmtPct(value: number | null): string {
  return value === null ? "--" : `${Math.round(value)}%`;
}

function fmtSigned(value: number | null): string {
  if (value === null) return "--";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function polishBaseMap(map: MapEvent["target"]): void {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    if (layer.type !== "symbol") continue;
    const keepLabel =
      layer.id.includes("state-label") ||
      layer.id.includes("province-label");
    try {
      map.setLayoutProperty(
        layer.id,
        "visibility",
        keepLabel ? "visible" : "none",
      );
      if (keepLabel) {
        map.setPaintProperty(layer.id, "text-color", "#f5f3ee");
        map.setPaintProperty(layer.id, "text-halo-color", "#1a1710");
        map.setPaintProperty(layer.id, "text-halo-width", 1.35);
        map.setPaintProperty(layer.id, "text-opacity", 0.82);
      }
    } catch {
      // Mapbox layer names can shift between style releases.
    }
  }
}

function displayPct(region: SpringWheatPulseRegion): number | null {
  return region.plantedPct ?? region.seededPct;
}

function conditionPct(region: SpringWheatPulseRegion): number | null {
  return region.countryCode === "US" ? region.goodExcellentPct : null;
}

function activePct(
  region: SpringWheatPulseRegion,
  mode: MapMode,
): number | null {
  return mode === "condition" ? conditionPct(region) : displayPct(region);
}

function displayPctFromProperties(
  properties: PulseFeatureProperties,
): number | null {
  return properties.plantedPct ?? properties.seededPct;
}

function conditionPctFromProperties(
  properties: PulseFeatureProperties,
): number | null {
  return properties.countryCode === "US" ? properties.goodExcellentPct : null;
}

function isCanadaAllCrop(
  metricScope: SpringWheatPulseRegion["metricScope"],
): boolean {
  return metricScope === "canada_all_crop_with_regional_note";
}

function lastYearPctFromProperties(
  properties: PulseFeatureProperties,
): number | null {
  return properties.plantedPctPreviousYear ?? properties.seededPctPreviousYear;
}

function yoyChangeFromProperties(
  properties: PulseFeatureProperties,
): number | null {
  return properties.plantedPctYoyChange ?? properties.seededPctYoyChange;
}

function regionToProperties(
  region: SpringWheatPulseRegion,
): PulseFeatureProperties {
  return {
    id: region.id,
    countryCode: region.countryCode,
    regionCode: region.regionCode,
    regionName: region.regionName,
    status: region.status,
    metricScope: region.metricScope,
    displayPct: displayPct(region),
    plantedPct: region.plantedPct,
    emergedPct: region.emergedPct,
    seededPct: region.seededPct,
    plantedPctPreviousYear: region.plantedPctPreviousYear,
    plantedPctYoyChange: region.plantedPctYoyChange,
    emergedPctPreviousYear: region.emergedPctPreviousYear,
    emergedPctYoyChange: region.emergedPctYoyChange,
    seededPctPreviousYear: region.seededPctPreviousYear,
    seededPctYoyChange: region.seededPctYoyChange,
    paceDeltaPct: region.paceDeltaPct,
    conditionVeryPoorPct: region.conditionVeryPoorPct,
    conditionPoorPct: region.conditionPoorPct,
    conditionFairPct: region.conditionFairPct,
    conditionGoodPct: region.conditionGoodPct,
    conditionExcellentPct: region.conditionExcellentPct,
    goodExcellentPct: region.goodExcellentPct,
    conditionIndex: region.conditionIndex,
    gePctYoyChange: region.gePctYoyChange,
    metricLabel: region.metricLabel,
    sourceName: region.sourceName,
    sourceUrl: region.sourceUrl,
    sourceResolution: region.sourceResolution,
    summary: region.summary,
    reportDate: region.reportDate,
  };
}

function valueTone(value: number | null): "positive" | "negative" | "neutral" {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function fmtIndex(value: number | null): string {
  return value === null ? "--" : value.toFixed(2);
}

function conditionTone(value: number | null): string {
  if (value === null) return "#5a4f36";
  if (value < 40) return "#b33a3a";
  if (value < 55) return "#d97706";
  if (value < 70) return "#c17f24";
  return "#437a22";
}

function markerTone(region: SpringWheatPulseRegion, mode: MapMode): string {
  if (region.status === "scheduled") return "#7c6c43";
  if (mode === "condition") return conditionTone(conditionPct(region));
  if (isCanadaAllCrop(region.metricScope)) {
    return "#b37d24";
  }
  const pace = region.paceDeltaPct ?? 0;
  if (pace < -4) return "#b33a3a";
  if (pace > 3) return "#437a22";
  return "#c17f24";
}

export function SpringWheatPulseMap({
  grainLabel,
  regions,
  latestUsWeek,
  usTotal,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [initialViewState] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640
      ? MOBILE_INITIAL_VIEW
      : INITIAL_VIEW,
  );
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [mapMode, setMapMode] = useState<MapMode>("progress");
  const [showNdvi, setShowNdvi] = useState(false);
  const [showProgressBoard, setShowProgressBoard] = useState(false);

  const ndviDate = useMemo(() => {
    if (!latestUsWeek) return snapToModis8Day(new Date());
    try {
      return snapToModis8Day(latestUsWeek);
    } catch {
      return snapToModis8Day(new Date());
    }
  }, [latestUsWeek]);

  const reportedRegions = useMemo(
    () =>
      regions
        .filter(
          (region) =>
            region.status === "reported" && displayPct(region) !== null,
        )
        .sort((a, b) => {
          if (a.countryCode !== b.countryCode) return a.countryCode === "US" ? -1 : 1;
          return (displayPct(a) ?? 0) - (displayPct(b) ?? 0);
        }),
    [regions],
  );

  const conditionRegions = useMemo(
    () =>
      regions
        .filter(
          (region) =>
            region.countryCode === "US" &&
            region.status === "reported" &&
            conditionPct(region) !== null,
        )
        .sort(
          (a, b) =>
            (conditionPct(a) ?? 0) - (conditionPct(b) ?? 0),
        ),
    [regions],
  );

  const boardRegions =
    mapMode === "condition" ? conditionRegions : reportedRegions;

  const sortedRegions = useMemo(
    () =>
      [...regions].sort((a, b) => {
        if (a.countryCode !== b.countryCode) {
          return a.countryCode === "US" ? -1 : 1;
        }
        return a.regionName.localeCompare(b.regionName);
      }),
    [regions],
  );
  const activeSelectedRegionId = regions.some((region) => region.id === selectedRegionId)
    ? selectedRegionId
    : "";

  function clearHover() {
    setHovered(null);
  }

  function selectRegion(regionId: string) {
    setSelectedRegionId(regionId);
    const region = regions.find((item) => item.id === regionId);
    if (!region) {
      setHovered(null);
      return;
    }

    setHovered({ properties: regionToProperties(region) });
    mapRef.current?.flyTo({
      center: [region.centroidLng, region.centroidLat],
      duration: 650,
      zoom: region.status === "scheduled" ? 4.2 : 4.8,
    });
  }

  function handleMapLoad(event: MapEvent) {
    polishBaseMap(event.target);
    const coords = regions.filter(
      (region) =>
        Number.isFinite(region.centroidLng) &&
        Number.isFinite(region.centroidLat),
    );
    if (coords.length === 0) return;

    const lngs = coords.map((region) => region.centroidLng);
    const lats = coords.map((region) => region.centroidLat);
    const mobile = typeof window !== "undefined" && window.innerWidth < 640;
    event.target.fitBounds(
      [
        [Math.min(...lngs) - 2.5, Math.min(...lats) - 2],
        [Math.max(...lngs) + 2.5, Math.max(...lats) + 2],
      ],
      {
        duration: 0,
        maxZoom: mobile ? 2.7 : 3.45,
        padding: mobile
          ? { top: 86, right: 24, bottom: 34, left: 24 }
          : { top: 88, right: 42, bottom: 48, left: 42 },
      },
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-xl border border-border/50 bg-card/70 text-sm text-muted-foreground">
        Map unavailable: NEXT_PUBLIC_MAPBOX_TOKEN is not configured.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="grid gap-3 border-b border-border/45 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(250px,320px)_minmax(210px,280px)] md:items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Cross-border map
          </p>
          <h2 className="font-display text-lg font-semibold text-foreground">
            {grainLabel} source pulse
          </h2>
        </div>

        <MapFocusStrip
          mode={mapMode}
          properties={hovered?.properties ?? null}
        />

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <MapModeControl mode={mapMode} onChange={setMapMode} />
          <RegionFinder
            regions={sortedRegions}
            selectedRegionId={activeSelectedRegionId}
            onSelect={selectRegion}
          />
          <button
            type="button"
            onClick={() => setShowNdvi((value) => !value)}
            aria-pressed={showNdvi}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
              showNdvi
                ? "border-prairie/50 bg-prairie/10 text-prairie"
                : "border-border/50 bg-wheat-50 text-muted-foreground hover:text-foreground",
            )}
          >
            {showNdvi ? "NDVI on" : "NDVI off"}
          </button>
        </div>
      </div>

      <div className="relative h-[520px] bg-wheat-900">
        <Map
          ref={mapRef}
          initialViewState={initialViewState}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
          maxBounds={MAX_BOUNDS}
          minZoom={2.25}
          maxZoom={7.5}
          scrollZoom
          dragPan
          dragRotate={false}
          touchZoomRotate
          attributionControl={false}
          onLoad={handleMapLoad}
          onMouseLeave={clearHover}
        >
          {showNdvi && (
            <Source
              id="spring-wheat-ndvi"
              type="raster"
              tiles={[buildGibsTileUrl(ndviDate)]}
              tileSize={256}
              attribution="NASA EOSDIS GIBS MODIS Terra"
            >
              <Layer
                id="spring-wheat-ndvi-layer"
                type="raster"
                paint={{
                  "raster-opacity": 0.46,
                  "raster-saturation": 0.35,
                  "raster-contrast": 0.08,
                }}
              />
            </Source>
          )}

          {regions.map((region) => (
            <Marker
              key={region.id}
              longitude={region.centroidLng}
              latitude={region.centroidLat}
              anchor="center"
            >
              <PulseMapMarker
                active={hovered?.properties.id === region.id}
                mode={mapMode}
                region={region}
                onClear={clearHover}
                onSelect={() =>
                  setHovered({ properties: regionToProperties(region) })
                }
              />
            </Marker>
          ))}

        </Map>

        <MapTotalsRibbon
          mode={mapMode}
          regions={regions}
          usTotal={usTotal}
        />

        <MapProgressDropdown
          mode={mapMode}
          open={showProgressBoard}
          regions={boardRegions}
          onToggle={() => setShowProgressBoard((value) => !value)}
        />

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/25 bg-wheat-900/70 px-3 py-1.5 text-[11px] font-medium text-white shadow-md backdrop-blur-md">
          Mapbox satellite | USDA NASS{" "}
          {mapMode === "condition" ? "condition" : "progress"} | Provincial
          reports | NDVI{" "}
          {showNdvi ? ndviDate : "off"}
        </div>
      </div>
    </section>
  );
}

function RegionFinder({
  regions,
  selectedRegionId,
  onSelect,
}: {
  regions: SpringWheatPulseRegion[];
  selectedRegionId: string;
  onSelect: (regionId: string) => void;
}) {
  return (
    <label className="relative min-w-[185px] flex-1 md:flex-none">
      <span className="sr-only">Find a state or province</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <select
        data-testid="seeding-region-finder"
        value={selectedRegionId}
        onChange={(event) => onSelect(event.target.value)}
        className="min-h-9 w-full appearance-none rounded-full border border-border/55 bg-wheat-50 py-1.5 pl-8 pr-8 text-xs font-semibold text-foreground shadow-sm outline-none transition-colors hover:border-canola/50 focus:border-canola focus:ring-2 focus:ring-canola/20"
      >
        <option value="">Find state/province</option>
        {regions.map((region) => (
          <option key={region.id} value={region.id}>
            {region.regionCode} - {region.regionName}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
}

function MapModeControl({
  mode,
  onChange,
}: {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
}) {
  const options: { mode: MapMode; label: string }[] = [
    { mode: "progress", label: "Progress" },
    { mode: "condition", label: "Condition" },
  ];

  return (
    <div
      data-testid="seeding-map-mode-control"
      className="inline-flex min-h-9 rounded-full border border-border/55 bg-wheat-50 p-1 shadow-sm"
      role="group"
      aria-label="Map display mode"
    >
      {options.map((option) => {
        const active = option.mode === mode;
        return (
          <button
            key={option.mode}
            type="button"
            data-testid={`seeding-map-mode-${option.mode}`}
            aria-pressed={active}
            onClick={() => onChange(option.mode)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold transition-colors",
              active
                ? "bg-canola text-white shadow-sm"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MapTotalsRibbon({
  mode,
  regions,
  usTotal,
}: {
  mode: MapMode;
  regions: SpringWheatPulseRegion[];
  usTotal: SpringWheatTotalPulse | null;
}) {
  const canadaReported = regions.filter(
    (region) => region.countryCode === "CA" && region.status === "reported",
  );
  const canadaPrimary =
    [...canadaReported]
      .filter((region) => region.seededPct !== null)
      .sort((a, b) => {
        const dateCompare = (b.reportDate ?? "").localeCompare(
          a.reportDate ?? "",
        );
        return dateCompare || a.regionCode.localeCompare(b.regionCode);
      })[0] ?? null;

  const canadaMain = canadaPrimary
    ? `${canadaPrimary.regionCode} ${fmtPct(canadaPrimary.seededPct)} all-crop`
    : "No province loaded";
  const canadaDetail =
    canadaReported.length > 0
      ? `${canadaReported.length} province${
          canadaReported.length === 1 ? "" : "s"
        } loaded | crop-specific pending`
      : "Provincial source watch active";
  const conditionMode = mode === "condition";

  return (
    <div
      data-testid="seeding-map-totals"
      className="pointer-events-none absolute left-3 right-3 top-3 z-20 grid gap-2 sm:grid-cols-2"
    >
      <div className="pointer-events-auto rounded-xl border border-white/25 bg-wheat-50/92 px-3 py-2 text-wheat-900 shadow-lg backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wheat-600">
              {conditionMode ? "USA condition" : "USA total"}
            </p>
            <p className="font-display text-xl font-semibold leading-none tabular-nums">
              {fmtPct(
                conditionMode
                  ? usTotal?.goodExcellentPct ?? null
                  : usTotal?.plantedPct ?? null,
              )}
            </p>
          </div>
          <div className="text-right text-[11px] font-semibold text-wheat-700">
            {conditionMode ? (
              <>
                <p>{fmtSigned(usTotal?.gePctYoyChange ?? null)} vs LY</p>
                <p>index {fmtIndex(usTotal?.conditionIndex ?? null)}</p>
              </>
            ) : (
              <>
                <p>{fmtPct(usTotal?.emergedPct ?? null)} emerged</p>
                <p>{fmtSigned(usTotal?.plantedPctVsAvg ?? null)} vs 5-year</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-auto rounded-xl border border-white/25 bg-wheat-50/92 px-3 py-2 text-wheat-900 shadow-lg backdrop-blur-md">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wheat-600">
              {conditionMode ? "Canada condition" : "Canada loaded"}
            </p>
            <p className="font-display text-base font-semibold leading-tight tabular-nums sm:text-lg sm:leading-none">
              {conditionMode ? "Pending" : canadaMain}
            </p>
          </div>
          <p className="text-left text-[11px] font-semibold text-wheat-700 sm:max-w-[160px] sm:text-right">
            {conditionMode
              ? "Crop-specific condition will be added after Canadian source parsing."
              : canadaDetail}
          </p>
        </div>
      </div>
    </div>
  );
}

function MapProgressDropdown({
  mode,
  open,
  regions,
  onToggle,
}: {
  mode: MapMode;
  open: boolean;
  regions: SpringWheatPulseRegion[];
  onToggle: () => void;
}) {
  const conditionMode = mode === "condition";

  return (
    <div
      data-testid="seeding-progress-dropdown"
      className="absolute left-3 top-[176px] z-20 max-w-[calc(100%-1.5rem)] text-wheat-900 sm:left-4 sm:top-[86px]"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="pointer-events-auto inline-flex min-h-10 max-w-full items-center justify-between gap-3 rounded-full border border-white/35 bg-wheat-50/92 px-3 py-2 text-left shadow-lg backdrop-blur-md transition-colors hover:bg-white/95"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canola/12 text-canola">
            <BarChart3 className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.13em] text-wheat-600">
              {conditionMode ? "USDA condition" : "Seeded / planted"}
            </span>
            <span className="block truncate text-sm font-semibold">
              {conditionMode ? "Condition board" : "Progress board"}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-canola/40 bg-canola/10 px-2 py-1 text-[10px] font-bold text-canola">
            {regions.length} live
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-wheat-600 transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="pointer-events-auto mt-2 max-h-[285px] w-[330px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-white/30 bg-wheat-50/94 p-3 shadow-lg backdrop-blur-md sm:max-h-[360px]">
          <div className="mb-3">
            <h3 className="font-display text-base font-semibold">
              {conditionMode ? "Condition by state" : "Progress by region"}
            </h3>
            <p className="text-[11px] text-wheat-600">
              {conditionMode
                ? "USDA Good/Excellent only. Canada condition is not loaded yet."
                : "Bar is current progress. Canada is all-crop until crop-specific provincial figures release."}
            </p>
          </div>

          {regions.length === 0 ? (
            <p className="rounded-lg border border-border/45 bg-wheat-100/70 px-3 py-2 text-xs text-wheat-700">
              USDA has not reported condition ratings for this crop in the
              current map week.
            </p>
          ) : (
            <div className="space-y-2">
              {regions.map((region) => {
                const pct = conditionMode ? conditionPct(region) : displayPct(region);
                const yoy = conditionMode
                  ? region.gePctYoyChange
                  : region.plantedPctYoyChange ?? region.seededPctYoyChange ?? null;
                const barColor = conditionMode
                  ? conditionTone(pct)
                  : (region.paceDeltaPct ?? 0) < -4
                    ? "#b33a3a"
                    : (region.paceDeltaPct ?? 0) > 3
                      ? "#437a22"
                      : "#c17f24";
                return (
                  <div
                    key={region.id}
                    className="grid grid-cols-[34px_1fr_46px] items-center gap-2"
                  >
                    <span className="rounded-md bg-wheat-100 px-1.5 py-1 text-center text-[10px] font-bold">
                      {region.regionCode}
                    </span>
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold">
                          {region.regionName}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-bold tabular-nums",
                            yoy === null
                              ? "text-muted-foreground"
                              : yoy < 0
                                ? "text-error"
                                : "text-prairie",
                          )}
                        >
                          LY {fmtSigned(yoy)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-wheat-200">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, pct ?? 0))}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-right font-display text-base font-semibold tabular-nums">
                      {fmtPct(pct)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PulseMapMarker({
  active,
  mode,
  region,
  onClear,
  onSelect,
}: {
  active: boolean;
  mode: MapMode;
  region: SpringWheatPulseRegion;
  onClear: () => void;
  onSelect: () => void;
}) {
  const pct = activePct(region, mode);
  const tone = markerTone(region, mode);
  const conditionMode = mode === "condition";

  if (pct === null && !conditionMode) {
    return (
      <button
        type="button"
        aria-label={`${region.regionName} release watch`}
        className={cn(
          "group flex min-h-8 min-w-[64px] items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-white shadow-lg backdrop-blur-md transition-transform hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canola sm:min-h-10 sm:min-w-[74px] sm:px-2.5 sm:py-1.5",
          active
            ? "border-white bg-wheat-900/88"
            : "border-white/35 bg-wheat-900/68",
        )}
        onPointerEnter={onSelect}
        onPointerLeave={onClear}
        onFocus={onSelect}
        onBlur={onClear}
        onClick={onSelect}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide">
          {region.regionCode}
        </span>
        <span className="font-display text-xs font-semibold sm:text-sm">
          watch
        </span>
      </button>
    );
  }

  const ringPct = pct === null ? 100 : Math.max(6, Math.min(100, pct));
  const emptyCondition = conditionMode && pct === null;
  const ringBackground = emptyCondition
    ? "rgba(90, 79, 54, 0.62)"
    : `conic-gradient(${tone} 0 ${ringPct}%, rgba(245, 243, 238, 0.46) ${ringPct}% 100%)`;
  const metricText = conditionMode
    ? pct === null
      ? "condition not reported"
      : `${fmtPct(pct)} Good/Excellent`
    : isCanadaAllCrop(region.metricScope)
      ? "all-crop seeded"
      : region.metricLabel;

  return (
      <button
        type="button"
        aria-label={`${region.regionName} ${metricText}`}
      className={cn(
        "group relative flex h-12 w-12 items-center justify-center rounded-full p-1 shadow-lg transition-transform hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canola sm:h-[62px] sm:w-[62px] sm:p-[5px]",
        active && "scale-[1.05]",
      )}
      style={{
        background: ringBackground,
        boxShadow: active
          ? `0 0 0 3px rgba(245, 243, 238, 0.72), 0 10px 24px rgba(26, 23, 16, 0.34)`
          : `0 8px 20px rgba(26, 23, 16, 0.28)`,
      }}
      onPointerEnter={onSelect}
      onPointerLeave={onClear}
      onFocus={onSelect}
      onBlur={onClear}
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex h-full w-full flex-col items-center justify-center rounded-full border border-white/80 bg-wheat-50/94 text-wheat-900 backdrop-blur-md",
          emptyCondition && "text-wheat-700",
        )}
      >
        <span className="text-[9px] font-bold uppercase leading-none tracking-wide sm:text-[10px]">
          {region.regionCode}
        </span>
        <span className="mt-0.5 font-display text-sm font-semibold leading-none tabular-nums sm:text-base">
          {fmtPct(pct)}
        </span>
      </span>
    </button>
  );
}

function MapFocusStrip({
  mode,
  properties,
}: {
  mode: MapMode;
  properties: PulseFeatureProperties | null;
}) {
  if (!properties) {
    return (
      <div
        data-testid="seeding-focus-readout"
        className="min-h-[54px] rounded-lg border border-dashed border-border/60 bg-wheat-50/55 px-3 py-2"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          Focus readout
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "condition"
            ? "Hover or tap a U.S. state for USDA Good/Excellent condition."
            : "Hover or tap a region for current, last year, and 5-year pace."}
        </p>
      </div>
    );
  }

  const currentLabel =
    properties.metricScope === "usda_crop_progress"
      ? "planted"
      : isCanadaAllCrop(properties.metricScope)
        ? "all-crop seeded"
        : "seeded";
  const currentPct = displayPctFromProperties(properties);
  const lastYearPct = lastYearPctFromProperties(properties);
  const yoyChange = yoyChangeFromProperties(properties);
  const conditionMode = mode === "condition";
  const conditionPct = conditionPctFromProperties(properties);
  const conditionAvailable =
    conditionMode &&
    properties.countryCode === "US" &&
    properties.status === "reported" &&
    conditionPct !== null;

  return (
    <div
      data-testid="seeding-focus-readout"
      className="min-h-[54px] rounded-lg border border-border/45 bg-wheat-50/75 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold text-foreground">
          {properties.regionName}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold",
            properties.status === "scheduled"
              ? "border-border/60 bg-muted/60 text-muted-foreground"
              : "border-canola/45 bg-canola/10 text-canola",
          )}
        >
          {properties.status}
        </span>
      </div>

      {properties.status === "scheduled" ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          Release watch | {properties.sourceName}
        </p>
      ) : conditionMode ? (
        conditionAvailable ? (
          <div className="mt-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <MapFocusValue
                label="Good/Excellent"
                value={fmtPct(conditionPct)}
                strong
              />
              <MapFocusValue
                label="LY"
                value={fmtSigned(properties.gePctYoyChange)}
                tone={valueTone(properties.gePctYoyChange)}
              />
              <MapFocusValue
                label="index"
                value={fmtIndex(properties.conditionIndex)}
              />
            </div>
            <ConditionStack properties={properties} compact />
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {properties.countryCode === "CA"
              ? "Canadian crop condition parsing is not wired yet."
              : "USDA condition is not reported for this crop/state this week."}
          </p>
        )
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <MapFocusValue
            label={currentLabel}
            value={fmtPct(currentPct)}
            strong
          />
          <MapFocusValue
            label={`LY ${fmtPct(lastYearPct)}`}
            value={fmtSigned(yoyChange)}
            tone={valueTone(yoyChange)}
          />
          <MapFocusValue
            label="5-year"
            value={fmtSigned(properties.paceDeltaPct)}
            tone={valueTone(properties.paceDeltaPct)}
          />
        </div>
      )}
    </div>
  );
}

function ConditionStack({
  properties,
  compact = false,
}: {
  properties: PulseFeatureProperties;
  compact?: boolean;
}) {
  const values = CONDITION_SEGMENTS.map((segment) => ({
    ...segment,
    value: properties[segment.key],
  }));
  const total = values.reduce((sum, segment) => sum + (segment.value ?? 0), 0);

  if (total <= 0) return null;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-wheat-200",
          compact ? "h-1.5" : "h-2",
        )}
      >
        {values.map((segment) => {
          const width = ((segment.value ?? 0) / total) * 100;
          return width > 0 ? (
            <span
              key={segment.key}
              style={{ width: `${width}%`, backgroundColor: segment.color }}
            />
          ) : null;
        })}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-semibold text-muted-foreground">
          {values.map((segment) => (
            <span key={segment.key}>
              {segment.label} {fmtPct(segment.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MapFocusValue({
  label,
  value,
  tone = "neutral",
  strong = false,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  strong?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]">
        {label}
      </span>
      <span
        className={cn(
          "font-bold tabular-nums text-foreground",
          strong && "font-display text-base leading-none",
          tone === "positive" && "text-prairie",
          tone === "negative" && "text-error",
        )}
      >
        {value}
      </span>
    </span>
  );
}
