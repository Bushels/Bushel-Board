// WS4 Task 4.2 — Bushy chat harness
// ECCC Atom feed client. Fetches Canadian weather from Environment Canada
// and normalizes it to WeatherSnapshot.
//
// Flow:
//   1. FSA (first 3 chars of postal) -> station lookup via weather_station_map.
//   2. Build ECCC Atom URL. Format: https://weather.gc.ca/rss/city/{code}_e.xml
//      where {code} is the station_code (e.g., 'ab-30' for Edmonton).
//   3. Fetch with User-Agent (ECCC requires identification per their ToS).
//   4. Parse Atom: first <entry> = current conditions, rest = forecast periods.
//      Forecast periods alternate day/night; we pair them into date-level
//      highC/lowC. Regex-driven parsing -- no XML lib dep.
//
// Error handling: network failures throw; unknown FSA returns null (caller
// decides whether to prompt the user for a different location).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeatherSnapshot, WeatherStation } from "./types";

const USER_AGENT =
  process.env.ECCC_USER_AGENT || "BushelsApp/1.0 (kyle@bushelsenergy.com)";

export async function getCanadianWeather(
  postalCode: string,
  supabase: SupabaseClient,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherSnapshot | null> {
  // FSA = first 3 chars, uppercased. Postal codes are validated upstream.
  const fsa = postalCode.trim().slice(0, 3).toUpperCase();

  const { data: station, error } = await supabase
    .from("weather_station_map")
    .select("fsa_code, province, station_code, station_name, lat, lon")
    .eq("fsa_code", fsa)
    .maybeSingle();

  if (error || !station) return null;

  const stationTyped = station as WeatherStation;
  const url = `https://weather.gc.ca/rss/city/${stationTyped.station_code}_e.xml`;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
  });
  if (!response.ok) {
    throw new Error(
      `ECCC fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const xml = await response.text();
  return parseEcccAtom(xml, stationTyped);
}

// --- Atom parser ---------------------------------------------------------
// Parses a small subset of Atom: <entry><title>...</title><summary>...</summary></entry>.
// ECCC's feed structure is stable enough that regex is reliable; if this
// proves brittle we swap to fast-xml-parser.

interface ParsedEntry {
  title: string;
  summary: string;
}

export function parseEcccAtom(
  xml: string,
  station: WeatherStation,
): WeatherSnapshot {
  const entries = extractEntries(xml);

  const currentEntry = entries.find((e) =>
    /^Current Conditions:/i.test(e.title),
  );
  const forecastEntries = entries.filter(
    (e) => !/^Current Conditions:/i.test(e.title),
  );

  const current = currentEntry
    ? parseCurrentEntry(currentEntry)
    : { tempC: 0, conditions: "", windKph: 0, humidityPct: 0 };

  const forecast = pairForecastEntries(forecastEntries);

  return {
    location: {
      name: station.station_name,
      provinceOrState: station.province,
      country: "CA",
    },
    current,
    forecast,
    source: "eccc",
    fetchedAt: new Date().toISOString(),
  };
}

function extractEntries(xml: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  // matchAll returns an iterable of RegExpMatchArray; [\s\S] acts as
  // "any char including newline" (dotall) without needing the /s flag.
  const entryMatches = xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/g);
  for (const m of entryMatches) {
    const body = m[1];
    const title = decodeXmlEntities(
      (body.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "").trim(),
    );
    const summary = decodeXmlEntities(
      (body.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "").trim(),
    );
    entries.push({ title, summary });
  }
  return entries;
}

function parseCurrentEntry(entry: ParsedEntry): {
  tempC: number;
  conditions: string;
  windKph: number;
  humidityPct: number;
} {
  // Title format: "Current Conditions: Mainly Sunny, 12.3°C"
  const titleMatch = entry.title.match(
    /Current Conditions:\s*([^,]+),\s*(-?\d+(?:\.\d+)?)\s*°?\s*C/i,
  );
  const conditions = titleMatch?.[1]?.trim() ?? "";
  const tempC = titleMatch ? Number(titleMatch[2]) : 0;

  // ECCC summaries embed HTML tags (<b>Wind:</b> W 18 km/h). Strip them
  // before regex matching so our patterns don't have to encode HTML noise.
  const plain = stripHtmlTags(entry.summary);

  const windMatch = plain.match(
    /Wind:[^0-9]*?(\d+(?:\.\d+)?)\s*km\/h/i,
  );
  const humidityMatch = plain.match(
    /Humidity:[^0-9]*?(\d+(?:\.\d+)?)\s*%/i,
  );

  return {
    tempC: Number.isFinite(tempC) ? tempC : 0,
    conditions,
    windKph: windMatch ? Number(windMatch[1]) : 0,
    humidityPct: humidityMatch ? Number(humidityMatch[1]) : 0,
  };
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

/**
 * ECCC forecast entries alternate day/night, titled e.g.
 *   "Friday: Sunny. High 16."
 *   "Friday night: Cloudy periods. Low minus 2."
 * We pair them: day provides high/conditions, night provides low.
 * If a forecast day lacks a night entry, lowC falls back to 0.
 */
function pairForecastEntries(
  entries: ParsedEntry[],
): WeatherSnapshot["forecast"] {
  const now = new Date();
  const parsed = entries.map((e) => parseForecastEntry(e, now));

  // Pair by dayStem stem (e.g., "Friday" and "Friday night" -> same date)
  const forecast: WeatherSnapshot["forecast"] = [];
  const byDay = new Map<
    string,
    { date: string; highC?: number; lowC?: number; precipMm: number; conditions: string }
  >();

  for (const p of parsed) {
    const entry = byDay.get(p.dayStem) ?? {
      date: p.date,
      precipMm: 0,
      conditions: "",
    };
    if (p.isNight) {
      entry.lowC = p.tempC;
    } else {
      entry.highC = p.tempC;
      entry.conditions = p.conditions;
    }
    entry.precipMm = Math.max(entry.precipMm, p.precipMm);
    byDay.set(p.dayStem, entry);
  }

  for (const [, e] of byDay) {
    forecast.push({
      date: e.date,
      highC: e.highC ?? 0,
      lowC: e.lowC ?? 0,
      precipMm: e.precipMm,
      conditions: e.conditions,
    });
  }

  return forecast;
}

function parseForecastEntry(
  entry: ParsedEntry,
  reference: Date,
): {
  date: string;
  dayStem: string;
  isNight: boolean;
  tempC: number;
  precipMm: number;
  conditions: string;
} {
  // Title: "<DayName>[ night]: <Conditions description>. High/Low <value>."
  const titleMatch = entry.title.match(
    /^([A-Za-z]+)(\s+night)?:\s*(.+?)\.\s*(High|Low)\s+(plus|minus|-)?\s*(\d+)/i,
  );

  const dayStem = (titleMatch?.[1] ?? "").toLowerCase();
  const isNight = Boolean(titleMatch?.[2]);
  const conditions = titleMatch?.[3]?.trim() ?? "";
  const sign = titleMatch?.[5] ?? "";
  const magnitude = titleMatch ? Number(titleMatch[6]) : 0;
  const tempC = Number.isFinite(magnitude)
    ? sign === "minus" || sign === "-"
      ? -magnitude
      : magnitude
    : 0;

  // Precipitation: "Amount 5 to 10 mm" -- take upper bound
  const precipMatch = entry.summary.match(
    /Amount\s+(?:(\d+)\s+to\s+)?(\d+)\s*mm/i,
  );
  const precipMm = precipMatch ? Number(precipMatch[2]) : 0;

  return {
    date: approximateDateForDayStem(dayStem, reference),
    dayStem,
    isNight,
    tempC,
    precipMm,
    conditions,
  };
}

/**
 * Resolve "Saturday" -> nearest future Saturday's ISO date (YYYY-MM-DD).
 * If stem matches today's day-of-week, returns today.
 */
function approximateDateForDayStem(dayStem: string, reference: Date): string {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const idx = days.indexOf(dayStem.toLowerCase());
  if (idx < 0) return isoDate(reference);

  const offset = (idx - reference.getDay() + 7) % 7;
  const d = new Date(reference);
  d.setDate(d.getDate() + offset);
  return isoDate(d);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xB0;/g, "°")
    .replace(/&deg;/g, "°")
    .replace(/&amp;/g, "&"); // Must be last to avoid double-decoding
}
