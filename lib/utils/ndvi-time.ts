// lib/utils/ndvi-time.ts
// Pure helpers for snapping a calendar date to the most recent NASA GIBS
// MODIS Terra NDVI 8-day composite start date.
//
// Background: NASA GIBS publishes MODIS_Terra_NDVI_8Day tiles keyed by
// composite *start* date. Composites begin January 1 each year and recur
// every 8 days (Jan 1, Jan 9, ..., Dec 27). Tile URLs require the start
// date in YYYY-MM-DD format. NASA usually publishes a composite ~7-10
// days after its start date (processing lag), so we conservatively snap
// to the boundary at-or-before (target - 16 days) to maximize the chance
// of a published tile.
//
// Pure functions only — no fetch, no DOM, no globals. Testable.

/**
 * Snap a target date to the nearest preceding MODIS 8-day composite start.
 *
 * @param target - the date the caller wants tiles for (inclusive)
 * @returns ISO YYYY-MM-DD string of the composite's start date
 */
export function snapToModis8Day(target: Date | string): string {
  const date = typeof target === "string" ? new Date(target) : new Date(target);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date passed to snapToModis8Day: ${String(target)}`);
  }
  // Step back 16 days to account for NASA processing lag.
  date.setUTCDate(date.getUTCDate() - 16);

  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const daysSinceYearStart = Math.floor(
    (date.getTime() - yearStart) / (1000 * 60 * 60 * 24),
  );
  const compositeIndex = Math.floor(daysSinceYearStart / 8);
  const compositeOffsetDays = compositeIndex * 8;

  const composite = new Date(yearStart);
  composite.setUTCDate(composite.getUTCDate() + compositeOffsetDays);

  return formatIsoDate(composite);
}

/**
 * Build the GIBS WMTS tile URL template for a given composite start date.
 * Returns an XYZ-style URL with {z}/{y}/{x} placeholders (Mapbox raster
 * source format). NASA's GIBS WMTS uses YXZ ordering — the "y/x" not "x/y".
 */
export function buildGibsTileUrl(compositeDate: string): string {
  const layer = "MODIS_Terra_NDVI_8Day";
  const tileMatrixSet = "GoogleMapsCompatible_Level9";
  const base = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
  return `${base}/${layer}/default/${compositeDate}/${tileMatrixSet}/{z}/{y}/{x}.png`;
}

/** Format a Date as a UTC YYYY-MM-DD string. */
function formatIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
