-- Fix v_supply_pipeline to expose all AAFC disposition columns
-- with consistent naming (no "projected_" prefix aliasing).
-- Adds feed_waste_kt which was previously missing.
-- Must DROP first because CREATE OR REPLACE cannot rename columns.
DROP VIEW IF EXISTS v_supply_pipeline;
CREATE VIEW v_supply_pipeline AS
SELECT
  sd.grain_slug,
  sd.crop_year,
  sd.production_kt,
  sd.carry_in_kt,
  COALESCE(sd.production_kt, 0) + COALESCE(sd.carry_in_kt, 0) + COALESCE(sd.imports_kt, 0) as total_supply_kt,
  sd.exports_kt,
  sd.food_industrial_kt,
  sd.feed_waste_kt,
  sd.carry_out_kt,
  g.name as grain_name
FROM supply_disposition sd
JOIN grains g ON g.slug = sd.grain_slug;
