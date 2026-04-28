-- Migration: us_state_centroids reference table
-- Powers /seeding map glyph anchoring without client-side GeoJSON computation.

CREATE TABLE IF NOT EXISTS us_state_centroids (
  state_code text PRIMARY KEY,
  state_name text NOT NULL,
  centroid_lng numeric NOT NULL,
  centroid_lat numeric NOT NULL,
  is_grain_belt boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE us_state_centroids IS
  'US state centroid coordinates for /seeding map glyph anchoring. Read-only after seed.';

INSERT INTO us_state_centroids (state_code, state_name, centroid_lng, centroid_lat, is_grain_belt) VALUES
  ('IA', 'Iowa',          -93.50, 42.07, true),
  ('IL', 'Illinois',      -89.20, 40.05, true),
  ('IN', 'Indiana',       -86.13, 39.85, true),
  ('OH', 'Ohio',          -82.78, 40.30, true),
  ('NE', 'Nebraska',      -99.79, 41.50, true),
  ('KS', 'Kansas',        -98.38, 38.50, true),
  ('MO', 'Missouri',      -92.60, 38.45, true),
  ('SD', 'South Dakota',  -99.45, 44.30, true),
  ('ND', 'North Dakota',  -100.30, 47.50, true),
  ('MN', 'Minnesota',     -94.30, 46.30, true),
  ('WI', 'Wisconsin',     -89.99, 44.62, true),
  ('MI', 'Michigan',      -84.62, 44.33, true),
  ('KY', 'Kentucky',      -84.27, 37.53, true),
  ('AR', 'Arkansas',      -92.44, 34.90, true),
  ('TX', 'Texas',         -99.34, 31.05, true)
ON CONFLICT (state_code) DO NOTHING;

GRANT SELECT ON us_state_centroids TO anon, authenticated;
