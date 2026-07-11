/**
 * Client-safe types + pure helpers for the GEE crop-stress map.
 *
 * This is the TYPE SOURCE: the server query (`gee-crop-stress.ts`) and the client
 * map (`components/dashboard/crop-stress-map.tsx`) both import from here. Keep it
 * free of any server-only imports (no `@/lib/supabase/server`).
 *
 * `stress_index` ∈ [-1, +1]; NEGATIVE = stressed = bullish supply (red),
 * POSITIVE = healthy = bearish supply (green), ~0 = near normal (wheat-tan).
 */

export type CropBelt = "US_HRW" | "RU_WINTER" | "RU_SPRING";

/** One `gee_crop_stress` row, normalized for the client. */
export interface CropStressRow {
  cropBelt: string;
  regionCode: string; // 'KS' | 'OK' | 'TX' | 'NE' | 'CO' | 'BELT'
  regionName: string;
  weekEnding: string;
  ndviZ: number | null;
  smZ: number | null;
  stressIndex: number | null;
  reading: string | null;
}

/** Server payload handed to the client map. */
export interface CropStressMapData {
  latestWeek: string | null;
  /** All rows for the latest week (includes the US_HRW/BELT aggregate). */
  rows: CropStressRow[];
  /** Belt-level rows only (region_code='BELT'): US_HRW belt + RU_WINTER + RU_SPRING. */
  beltSummaries: CropStressRow[];
  sourceDatasets: string[];
  computedAt: string | null;
  /** Plain-English one-liner for the page hero. */
  takeaway: string;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- Diverging color scale (single source of truth: legend + Mapbox fill) -----
// Anchored on project tokens (globals.css): error #b33a3a, wheat-500 #9b8754,
// prairie #437a22, with darker extremes for the ±1 ends.
export const STRESS_SCALE_STOPS: ReadonlyArray<{ value: number; color: string }> = [
  { value: -1.0, color: "#8c2f2f" }, // deeply stressed
  { value: -0.4, color: "#c0533a" }, // stressed
  { value: 0.0, color: "#9b8754" }, // near normal (wheat tan)
  { value: 0.4, color: "#6d9e3a" }, // healthy
  { value: 1.0, color: "#2f6e1a" }, // very healthy
];

export const STRESS_NODATA_COLOR = "#d6d0c2"; // muted wheat — region drawn but no reading

function lerpHex(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const ch = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** JS twin of the Mapbox fill expression — used for legend + hover swatches. */
export function stressColor(idx: number | null): string {
  if (idx === null || !Number.isFinite(idx)) return STRESS_NODATA_COLOR;
  const x = Math.max(-1, Math.min(1, idx));
  for (let i = 0; i < STRESS_SCALE_STOPS.length - 1; i++) {
    const lo = STRESS_SCALE_STOPS[i];
    const hi = STRESS_SCALE_STOPS[i + 1];
    if (x >= lo.value && x <= hi.value) {
      const t = (x - lo.value) / (hi.value - lo.value);
      return lerpHex(lo.color, hi.color, t);
    }
  }
  return STRESS_NODATA_COLOR;
}

// --- Plain-English takeaway ---------------------------------------------------
export function beltLabel(cropBelt: string): string {
  switch (cropBelt) {
    case "US_HRW":
      return "the US winter-wheat belt";
    case "RU_WINTER":
      return "Russia's winter-wheat belt";
    case "RU_SPRING":
      return "Russia's spring-wheat belt";
    default:
      return cropBelt;
  }
}

/** Reading vocabulary (from scripts/gee/gee_stress_core.py) → farmer-voice phrase. */
function readingPhrase(reading: string | null): string {
  if (!reading || reading === "no-data") return "has no fresh satellite reading";
  if (reading.startsWith("stressed")) return "is showing crop stress — which tends to support prices";
  if (reading.startsWith("healthy")) return "looks healthy — which tends to weigh on prices";
  return "looks near normal";
}

export function buildCropStressTakeaway(beltSummaries: CropStressRow[]): string {
  if (!beltSummaries.length) {
    return "Satellite crop-stress readings aren't available yet — check back after Friday's run.";
  }
  // Stable, readable order: US first, then Russia winter, then spring.
  const order: Record<string, number> = { US_HRW: 0, RU_WINTER: 1, RU_SPRING: 2 };
  const parts = [...beltSummaries]
    .sort((a, b) => (order[a.cropBelt] ?? 9) - (order[b.cropBelt] ?? 9))
    .map((b) => `${beltLabel(b.cropBelt)} ${readingPhrase(b.reading)}`);
  return `This week, ${parts.join("; ")}.`;
}
