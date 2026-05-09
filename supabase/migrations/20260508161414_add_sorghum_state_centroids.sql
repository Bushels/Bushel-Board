-- Add sorghum states retained by the USDA crop-progress importer.
-- Coordinates are state centroids used for map glyph anchoring, not field-level crop locations.

insert into public.us_state_centroids (
  state_code,
  state_name,
  centroid_lng,
  centroid_lat,
  is_grain_belt
) values
  ('CO', 'Colorado',       -105.55, 39.00, true),
  ('NC', 'North Carolina',  -79.02, 35.56, true),
  ('OK', 'Oklahoma',        -97.49, 35.59, true)
on conflict (state_code) do update
set
  state_name = excluded.state_name,
  centroid_lng = excluded.centroid_lng,
  centroid_lat = excluded.centroid_lat,
  is_grain_belt = excluded.is_grain_belt;
