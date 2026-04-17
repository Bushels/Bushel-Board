// WS4 Task 4.4 — Bushy chat harness
// weather_cache read/write helpers. Table created in WS1 Task 1.8:
//
//   weather_cache (
//     cache_key text PRIMARY KEY,
//     postal_or_zip text, country text,
//     snapshot_json jsonb,
//     fetched_at timestamptz, expires_at timestamptz DEFAULT now() + '1 hour'
//   )
//
// Read path: double-checks expires_at > now() rather than trusting the
// SQL-level default, so stale rows can't slip through if a client misses
// the TTL window.
//
// Write path: upsert on cache_key so concurrent cache-misses don't race
// into a duplicate-key error.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeatherSnapshot } from "./types";

export function cacheKey(
  postalOrZip: string,
  includeForecast: boolean,
): string {
  return `${postalOrZip.trim().toUpperCase()}|${includeForecast}`;
}

export async function readCache(
  supabase: SupabaseClient,
  key: string,
): Promise<WeatherSnapshot | null> {
  const { data, error } = await supabase
    .from("weather_cache")
    .select("snapshot_json, expires_at")
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return (data as { snapshot_json: WeatherSnapshot }).snapshot_json ?? null;
}

export async function writeCache(
  supabase: SupabaseClient,
  key: string,
  postalOrZip: string,
  country: "CA" | "US",
  snapshot: WeatherSnapshot,
): Promise<void> {
  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

  const { error } = await supabase.from("weather_cache").upsert(
    {
      cache_key: key,
      postal_or_zip: postalOrZip,
      country,
      snapshot_json: snapshot,
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: "cache_key" },
  );

  if (error) {
    // Cache write failures are non-fatal — the caller already has the
    // snapshot; next request will just re-fetch. Log for observability.
    console.warn(`[weather.cache] upsert failed: ${error.message}`);
  }
}
