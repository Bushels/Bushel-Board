/**
 * Client-safe geometry for the wheat crop-stress choropleth.
 *
 * Combines:
 *  - the 5 US Hard-Red-Winter belt states (KS/OK/TX/NE/CO), committed GeoJSON
 *    generated once by scripts/maps/build-hrw-states-geojson.mjs (public-domain
 *    US Census boundaries), and
 *  - the 2 Russia wheat belts as rectangles derived from the collector bboxes in
 *    scripts/gee/gee_stress_core.py (RU_WINTER, RU_SPRING).
 *
 * Each feature carries `{ crop_belt, region_code, region_name }` so a stress row
 * from `gee_crop_stress` joins on the COMPOSITE key (crop_belt + region_code) —
 * `region_code = 'BELT'` collides across belts, so crop_belt is required.
 *
 * NOTE: the `US_HRW/BELT` row (the union of the 5 states) is deliberately NOT a
 * polygon here — it would double-render over the state fills. That aggregate row
 * feeds the page takeaway/ribbon, not the choropleth.
 */
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import usHrwStatesRaw from "./us-hrw-states.geojson.json";

export interface WheatBeltProps {
  crop_belt: string;
  region_code: string;
  region_name: string;
}

export type WheatBeltFeature = Feature<Polygon | MultiPolygon, WheatBeltProps>;
export type WheatBeltCollection = FeatureCollection<Polygon | MultiPolygon, WheatBeltProps>;

// Russia belts: explicit bboxes [W, S, E, N] from scripts/gee/gee_stress_core.py.
const RUSSIA_BELTS: ReadonlyArray<{
  crop_belt: string;
  region_name: string;
  bbox: [number, number, number, number];
}> = [
  { crop_belt: "RU_WINTER", region_name: "Russia winter-wheat belt (south)", bbox: [35, 43, 48, 53] },
  {
    crop_belt: "RU_SPRING",
    region_name: "Russia spring-wheat belt (Volga/Urals/Siberia)",
    bbox: [45, 50, 87, 57],
  },
];

function bboxFeature(belt: (typeof RUSSIA_BELTS)[number]): WheatBeltFeature {
  const [w, s, e, n] = belt.bbox;
  return {
    type: "Feature",
    properties: { crop_belt: belt.crop_belt, region_code: "BELT", region_name: belt.region_name },
    geometry: {
      type: "Polygon",
      coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
    },
  };
}

const usFeatures = (usHrwStatesRaw as unknown as WheatBeltCollection).features;

export const WHEAT_BELT_GEOMETRY: WheatBeltCollection = {
  type: "FeatureCollection",
  features: [...usFeatures, ...RUSSIA_BELTS.map(bboxFeature)],
};

/** Walk Polygon/MultiPolygon coordinates, calling fn for every [lng, lat]. */
function eachPosition(coords: Position | Position[] | Position[][] | Position[][][], fn: (lng: number, lat: number) => void): void {
  if (typeof coords[0] === "number") {
    const [lng, lat] = coords as Position;
    fn(lng, lat);
    return;
  }
  for (const c of coords as Position[]) {
    eachPosition(c as unknown as Position[], fn);
  }
}

function computeBounds(fc: WheatBeltCollection): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const feature of fc.features) {
    eachPosition(feature.geometry.coordinates, (lng, lat) => {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Bounds spanning BOTH the US HRW belt and the Russia belts — used for the map's
 * fitBounds so the (geographically distant) belts both stay visible. Computed from
 * the geometry so it self-extends when more belts (EU/Australia/Canada) are added.
 */
export const WHEAT_BELT_BOUNDS: [[number, number], [number, number]] = computeBounds(WHEAT_BELT_GEOMETRY);
