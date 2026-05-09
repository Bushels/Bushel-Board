-- Add northern spring-wheat states retained by the USDA crop-progress importer.
-- Coordinates are state centroids used for map glyph anchoring, not field-level
-- crop locations.

insert into public.us_state_centroids (
  state_code,
  state_name,
  centroid_lng,
  centroid_lat,
  is_grain_belt
) values
  ('ID', 'Idaho',      -114.74, 44.07, true),
  ('MT', 'Montana',    -109.63, 46.97, true),
  ('WA', 'Washington', -120.74, 47.75, true)
on conflict (state_code) do update
set
  state_name = excluded.state_name,
  centroid_lng = excluded.centroid_lng,
  centroid_lat = excluded.centroid_lat,
  is_grain_belt = excluded.is_grain_belt;
