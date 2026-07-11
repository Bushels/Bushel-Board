export type FloodWatchBucket = "observed" | "forecast" | "excess" | "watch" | "none";

export interface FloodWatchRow {
  gridId: string;
  west: number;
  south: number;
  east: number;
  north: number;
  centerLon: number;
  centerLat: number;
  observedInundationAcres: number;
  excessMoistureAcres: number;
  forecastAtRiskAcres: number;
  forecast3DayAtRiskAcres: number;
  forecast7DayAtRiskAcres: number;
  watchAcres: number;
  totalWatchLayerAcres: number;
}

export interface FloodWatchTotals {
  observedInundationAcres: number;
  excessMoistureAcres: number;
  forecastAtRiskAcres: number;
  forecast3DayAtRiskAcres: number;
  forecast7DayAtRiskAcres: number;
  watchAcres: number;
}

export interface FloodWatchOfficialMoistureLayer {
  id: string;
  label: string;
  provider: string;
  coverage: string;
  service: string;
  serviceUrl: string;
  sourceUrl: string;
  latestAt: string;
  resolution: string;
  description: string;
  map?: string;
  layerName?: string;
}

export interface FloodWatchMapData {
  eventStart: string;
  eventEnd: string;
  eventLabel: string;
  computedAt: string;
  claimBoundary: string;
  watchOnly: boolean;
  acreTotals: FloodWatchTotals;
  rows: FloodWatchRow[];
  sourceFreshness: Record<string, unknown>;
  datasets: Record<string, string>;
  officialMoistureLayers: FloodWatchOfficialMoistureLayer[];
}

export const FLOOD_WATCH_BUCKETS: Record<
  Exclude<FloodWatchBucket, "none">,
  { label: string; color: string; description: string }
> = {
  observed: {
    label: "Observed surface water",
    color: "#2f6f91",
    description: "Sentinel-1 saw water-like cropland pixels after permanent water was removed.",
  },
  forecast: {
    label: "Forecast at risk",
    color: "#b7791f",
    description: "Forecast rain overlaps wet, recently rained-on, or low-lying cropland.",
  },
  excess: {
    label: "Excess moisture",
    color: "#2f7f72",
    description: "Recent rain and SMAP wetness point to saturated cropland risk.",
  },
  watch: {
    label: "Watch",
    color: "#9b8754",
    description: "Enough rain, wetness, or terrain risk to keep on the board.",
  },
};

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapRow(row: Record<string, unknown>): FloodWatchRow {
  return {
    gridId: text(row.grid_id),
    west: n(row.west),
    south: n(row.south),
    east: n(row.east),
    north: n(row.north),
    centerLon: n(row.center_lon),
    centerLat: n(row.center_lat),
    observedInundationAcres: n(row.observed_inundation_acres),
    excessMoistureAcres: n(row.excess_moisture_acres),
    forecastAtRiskAcres: n(row.forecast_at_risk_acres),
    forecast3DayAtRiskAcres: n(row.forecast_3day_at_risk_acres),
    forecast7DayAtRiskAcres: n(row.forecast_7day_at_risk_acres),
    watchAcres: n(row.watch_acres),
    totalWatchLayerAcres: n(row.total_watch_layer_acres),
  };
}

function mapOfficialMoistureLayer(layer: Record<string, unknown>): FloodWatchOfficialMoistureLayer {
  return {
    id: text(layer.id),
    label: text(layer.label),
    provider: text(layer.provider),
    coverage: text(layer.coverage),
    service: text(layer.service),
    serviceUrl: text(layer.service_url),
    sourceUrl: text(layer.source_url),
    latestAt: text(layer.latest_at),
    resolution: text(layer.resolution),
    description: text(layer.description),
    map: text(layer.map) || undefined,
    layerName: text(layer.layer_name) || undefined,
  };
}

export function normalizeFloodWatchArtifact(raw: Record<string, unknown>): FloodWatchMapData {
  const event = (raw.event ?? {}) as Record<string, unknown>;
  const totals = (raw.acre_totals ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map((row) => mapRow(row as Record<string, unknown>))
    : [];
  const officialMoistureLayers = Array.isArray(raw.official_moisture_layers)
    ? raw.official_moisture_layers.map((layer) =>
        mapOfficialMoistureLayer(layer as Record<string, unknown>),
      )
    : [];

  return {
    eventStart: text(event.start),
    eventEnd: text(event.end),
    eventLabel: text(event.label),
    computedAt: text(raw.computed_at),
    claimBoundary: text(raw.claim_boundary),
    watchOnly: Boolean(raw.watch_only),
    acreTotals: {
      observedInundationAcres: n(totals.observed_inundation_acres),
      excessMoistureAcres: n(totals.excess_moisture_acres),
      forecastAtRiskAcres: n(totals.forecast_at_risk_acres),
      forecast3DayAtRiskAcres: n(totals.forecast_3day_at_risk_acres),
      forecast7DayAtRiskAcres: n(totals.forecast_7day_at_risk_acres),
      watchAcres: n(totals.watch_acres),
    },
    rows,
    sourceFreshness: (raw.source_freshness ?? {}) as Record<string, unknown>,
    datasets: (raw.datasets ?? {}) as Record<string, string>,
    officialMoistureLayers,
  };
}

export function dominantFloodWatchBucket(row: FloodWatchRow): FloodWatchBucket {
  if (row.observedInundationAcres > 0) return "observed";
  if (row.forecastAtRiskAcres > 0) return "forecast";
  if (row.excessMoistureAcres > 0) return "excess";
  if (row.watchAcres > 0) return "watch";
  return "none";
}

export function formatAcres(acres: number): string {
  if (acres >= 1_000_000) return `${(acres / 1_000_000).toFixed(1)}M ac`;
  if (acres >= 10_000) return `${Math.round(acres / 1000)}k ac`;
  if (acres >= 1000) return `${(acres / 1000).toFixed(1)}k ac`;
  return `${Math.round(acres).toLocaleString("en-US")} ac`;
}

export function formatDate(value: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
