#!/usr/bin/env node
/**
 * One-time DEV generator — NOT part of `npm run build` (no build-time network fetch).
 *
 * Pulls a public-domain US states GeoJSON, extracts the 5 US Hard-Red-Winter
 * wheat-belt states (KS/OK/TX/NE/CO), normalizes each feature's properties to the
 * crop-stress choropleth join shape ({crop_belt, region_code, region_name}), lightly
 * simplifies by rounding coordinates to 3 decimals (~110 m — plenty at belt zoom),
 * and writes lib/maps/us-hrw-states.geojson.json (committed).
 *
 * Source data: US Census Bureau cartographic state boundaries (a U.S. government work,
 * public domain), redistributed as GeoJSON. Regenerate with:  node scripts/maps/build-hrw-states-geojson.mjs
 *
 * Output JSON: stdout summary; diagnostics to stderr (per repo Script Conventions).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const OUT_PATH = resolve(REPO_ROOT, "lib", "maps", "us-hrw-states.geojson.json");

// name (as it appears in the source `properties.name`) -> 2-letter region_code
const HRW_STATES = {
  Kansas: "KS",
  Oklahoma: "OK",
  Texas: "TX",
  Nebraska: "NE",
  Colorado: "CO",
};

// Candidate public-domain sources (property field noted). Tried in order.
const SOURCES = [
  { url: "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json", nameKey: "name" },
  { url: "https://raw.githubusercontent.com/python-visualization/folium/main/examples/data/us-states.json", nameKey: "name" },
];

function log(...a) {
  process.stderr.write(a.join(" ") + "\n");
}

/** Recursively round every [lng,lat] pair to 3 decimals. Handles Polygon + MultiPolygon nesting. */
function roundCoords(coords) {
  if (typeof coords[0] === "number") {
    return [Math.round(coords[0] * 1000) / 1000, Math.round(coords[1] * 1000) / 1000];
  }
  return coords.map(roundCoords);
}

async function fetchFirstWorking() {
  for (const src of SOURCES) {
    try {
      log(`[hrw-geojson] fetching ${src.url}`);
      const res = await fetch(src.url, { redirect: "follow" });
      if (!res.ok) {
        log(`[hrw-geojson]   HTTP ${res.status}, trying next source`);
        continue;
      }
      const json = await res.json();
      if (json?.type === "FeatureCollection" && Array.isArray(json.features)) {
        return { json, nameKey: src.nameKey, url: src.url };
      }
      log("[hrw-geojson]   not a FeatureCollection, trying next source");
    } catch (err) {
      log(`[hrw-geojson]   fetch failed (${String(err).slice(0, 120)}), trying next source`);
    }
  }
  throw new Error("All GeoJSON sources failed");
}

async function main() {
  const { json, nameKey, url } = await fetchFirstWorking();

  const features = [];
  for (const f of json.features) {
    const name = f?.properties?.[nameKey];
    const code = HRW_STATES[name];
    if (!code) continue;
    features.push({
      type: "Feature",
      properties: { crop_belt: "US_HRW", region_code: code, region_name: name },
      geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
    });
  }

  const found = features.map((f) => f.properties.region_code).sort();
  const expected = Object.values(HRW_STATES).sort();
  const missing = expected.filter((c) => !found.includes(c));
  if (missing.length) {
    throw new Error(`Missing states after filter: ${missing.join(", ")} (found ${found.join(", ")})`);
  }

  const out = {
    type: "FeatureCollection",
    metadata: {
      generated_by: "scripts/maps/build-hrw-states-geojson.mjs",
      source: url,
      source_license: "US Census Bureau cartographic boundaries — public domain (U.S. government work)",
      simplification: "coordinates rounded to 3 decimals (~110 m)",
      states: expected,
    },
    features,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out) + "\n", "utf8");

  const bytes = Buffer.byteLength(JSON.stringify(out));
  process.stdout.write(
    JSON.stringify({ ok: true, out: "lib/maps/us-hrw-states.geojson.json", states: found, bytes }, null, 2) + "\n",
  );
}

main().catch((err) => {
  log(`[hrw-geojson] FAILED: ${String(err)}`);
  process.exit(1);
});
