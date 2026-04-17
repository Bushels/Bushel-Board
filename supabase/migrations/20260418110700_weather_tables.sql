-- WS1 Task 1.8 — Bushy chat harness
-- Weather tool infrastructure:
--   weather_cache       — 1-hour cached weather snapshots keyed by postal/zip + forecast flag
--   weather_station_map — FSA/ZIP → ECCC/NOAA station mapping for lookup resolution

CREATE TABLE weather_cache (
  cache_key text PRIMARY KEY,         -- "{postalOrZip}|{includeForecast}"
  postal_or_zip text NOT NULL,
  country text NOT NULL CHECK (country IN ('CA','US')),
  snapshot_json jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

CREATE INDEX idx_weather_cache_expires ON weather_cache(expires_at);

CREATE TABLE weather_station_map (
  fsa_code text PRIMARY KEY,
  province text NOT NULL CHECK (province IN ('AB','SK','MB','BC','ON','QC','NB','NS','PE','NL','YT','NT','NU')),
  station_code text NOT NULL,         -- e.g. 'ab-30' for Edmonton
  station_name text NOT NULL,
  lat numeric(7,4),
  lon numeric(7,4)
);

GRANT SELECT ON weather_cache, weather_station_map TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON weather_cache TO service_role;
