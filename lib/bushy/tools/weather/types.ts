// WS4 Task 4.2 — Bushy chat harness
// WeatherSnapshot: the normalized shape both ECCC and NOAA clients produce.
// The harness and the `get_weather` tool both consume this — keeping it
// provider-agnostic means switching data sources later (e.g., swapping
// ECCC for OpenWeatherMap) doesn't ripple.
//
// Unit conventions: metric (Celsius, km/h, mm, percent). NOAA returns
// imperial; the NOAA client converts at the edge.
//
// Agronomic block is optional — only Canadian observations (ECCC) supply
// computed growing-degree-days + frost-risk today. NOAA could be upgraded
// when we wire in NWS climate data.

export type WeatherSnapshot = {
  location: {
    name: string;
    provinceOrState: string;
    country: "CA" | "US";
  };
  current: {
    tempC: number;
    conditions: string;
    windKph: number;
    humidityPct: number;
  };
  forecast: Array<{
    /** ISO date string (YYYY-MM-DD) */
    date: string;
    highC: number;
    lowC: number;
    /** Forecast precipitation in mm. 0 when "no precip expected". */
    precipMm: number;
    conditions: string;
  }>;
  agronomic?: {
    last7DaysPrecipMm: number;
    /** Cumulative growing-degree-days year-to-date, base 5 °C. */
    growingDegreeDays: number;
    frostRiskNext5Days: boolean;
    droughtIndex?: "none" | "moderate" | "severe" | "extreme";
  };
  source: "eccc" | "noaa";
  /** ISO timestamp the snapshot was assembled. Populated by the client. */
  fetchedAt: string;
};

/**
 * Row shape for weather_station_map table (WS1 Task 1.8).
 * Used by ECCC client for FSA → station lookups.
 */
export interface WeatherStation {
  fsa_code: string;
  province: string;
  station_code: string;
  station_name: string;
  lat: number | null;
  lon: number | null;
}
