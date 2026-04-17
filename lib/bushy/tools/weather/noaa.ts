// WS4 Task 4.3 — Bushy chat harness
// NOAA weather client. Three-hop dance to get a forecast for a US ZIP:
//
//   1. ZIP -> lat/lon via Zippopotam (api.zippopotam.us/us/{zip}) - free,
//      no auth. Returns city + state + coords.
//   2. lat/lon -> gridpoint resolver via api.weather.gov/points/{lat},{lon}.
//      Returns a forecast URL specific to the NOAA WFO office grid.
//   3. GET the forecast URL -> periods array with alternating day/night
//      entries. Each period has temperature (F) + windSpeed (mph).
//
// We normalize everything to metric (Celsius, km/h) at the edge so callers
// never touch imperial.
//
// NOAA requires a User-Agent header identifying the app; without it they
// return 403. Use NOAA_USER_AGENT env var or fall back to BushelsApp/1.0
// with Kyle's email.

import type { WeatherSnapshot } from "./types";

const USER_AGENT =
  process.env.NOAA_USER_AGENT || "BushelsApp/1.0 (kyle@bushelsenergy.com)";

interface ZippopotamPlace {
  "place name": string;
  longitude: string;
  latitude: string;
  "state abbreviation": string;
}
interface ZippopotamResponse {
  "post code": string;
  places: ZippopotamPlace[];
}

interface NoaaPointsResponse {
  properties: {
    forecast: string;
    relativeLocation: {
      properties: { city: string; state: string };
    };
  };
}

interface NoaaForecastPeriod {
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: "F" | "C";
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
}

interface NoaaForecastResponse {
  properties: {
    updated: string;
    periods: NoaaForecastPeriod[];
  };
}

export async function getUSWeather(
  zipCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherSnapshot | null> {
  // Zippopotam accepts 5-digit ZIP only; strip ZIP+4 if present.
  const bareZip = zipCode.trim().split("-")[0];

  // Hop 1: ZIP -> lat/lon + city
  const zipResp = await fetchImpl(
    `https://api.zippopotam.us/us/${bareZip}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!zipResp.ok) return null;
  const zipData = (await zipResp.json()) as ZippopotamResponse;
  const place = zipData.places?.[0];
  if (!place) return null;
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Hop 2: lat/lon -> gridpoint forecast URL
  // NOAA expects comma-separated lat,lon with 4 decimal precision.
  const latStr = lat.toFixed(4);
  const lonStr = lon.toFixed(4);
  const pointsResp = await fetchImpl(
    `https://api.weather.gov/points/${latStr},${lonStr}`,
    { headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" } },
  );
  if (!pointsResp.ok) {
    throw new Error(
      `NOAA /points fetch failed: ${pointsResp.status} ${pointsResp.statusText}`,
    );
  }
  const pointsData = (await pointsResp.json()) as NoaaPointsResponse;
  const forecastUrl = pointsData.properties?.forecast;
  if (!forecastUrl) return null;

  // Hop 3: gridpoint forecast
  const forecastResp = await fetchImpl(forecastUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
  });
  if (!forecastResp.ok) {
    throw new Error(
      `NOAA /forecast fetch failed: ${forecastResp.status} ${forecastResp.statusText}`,
    );
  }
  const forecastData = (await forecastResp.json()) as NoaaForecastResponse;

  return normalizeNoaa(forecastData, {
    name: place["place name"],
    state: place["state abbreviation"],
  });
}

/**
 * Exported for direct testing without I/O mocks.
 */
export function normalizeNoaa(
  data: NoaaForecastResponse,
  location: { name: string; state: string },
): WeatherSnapshot {
  const periods = data.properties?.periods ?? [];

  // First period is "current" (today's remaining daylight or current night).
  const first = periods[0];
  const current = first
    ? {
        tempC: toCelsius(first.temperature, first.temperatureUnit),
        conditions: first.shortForecast,
        windKph: parseWindMphToKph(first.windSpeed),
        // NOAA doesn't report humidity in the simple forecast endpoint.
        // Would require gridpoint raw data; leave 0 for now.
        humidityPct: 0,
      }
    : { tempC: 0, conditions: "", windKph: 0, humidityPct: 0 };

  // Pair day/night periods into single-date entries. NOAA emits them in
  // chronological order alternating isDaytime true/false.
  const forecast: WeatherSnapshot["forecast"] = [];
  const byDate = new Map<
    string,
    {
      date: string;
      highC?: number;
      lowC?: number;
      precipMm: number;
      conditions: string;
    }
  >();

  for (const p of periods) {
    const date = p.startTime.slice(0, 10);
    const entry = byDate.get(date) ?? {
      date,
      precipMm: 0,
      conditions: "",
    };
    const tC = toCelsius(p.temperature, p.temperatureUnit);
    if (p.isDaytime) {
      entry.highC = tC;
      entry.conditions = p.shortForecast;
    } else {
      entry.lowC = tC;
    }
    // Probability of precip as a rough mm proxy: 0-100% -> 0-15 mm. This
    // is not meteorologically correct but gives a usable signal for
    // decision making ("will it rain tomorrow?"). A full ForecastGrid
    // call would expose quantityPrecipitation in mm.
    const pop = p.probabilityOfPrecipitation?.value ?? 0;
    entry.precipMm = Math.max(entry.precipMm, Math.round((pop / 100) * 15));
    byDate.set(date, entry);
  }

  for (const [, e] of byDate) {
    forecast.push({
      date: e.date,
      highC: e.highC ?? 0,
      lowC: e.lowC ?? 0,
      precipMm: e.precipMm,
      conditions: e.conditions,
    });
  }

  return {
    location: {
      name: location.name,
      provinceOrState: location.state,
      country: "US",
    },
    current,
    forecast,
    source: "noaa",
    fetchedAt: new Date().toISOString(),
  };
}

// --- Unit conversions ---------------------------------------------------

function toCelsius(value: number, unit: "F" | "C"): number {
  if (unit === "C") return value;
  return Math.round((((value - 32) * 5) / 9) * 10) / 10;
}

/**
 * NOAA windSpeed strings: "15 mph" or "10 to 15 mph" (range). Take the
 * upper bound and convert to km/h. Returns 0 if parsing fails.
 */
export function parseWindMphToKph(windSpeed: string): number {
  const m = windSpeed.match(/(\d+(?:\.\d+)?)\s*(?:to\s*(\d+(?:\.\d+)?)\s*)?mph/i);
  if (!m) return 0;
  const upper = m[2] ? Number(m[2]) : Number(m[1]);
  // 1 mph = 1.609344 km/h
  return Math.round(upper * 1.609344 * 10) / 10;
}
