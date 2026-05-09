-- Add Oats to the cross-border CFTC source registry.
--
-- The parser and US market constants already treat Oats as a tracked market;
-- the mapping registry must match so portfolio collectors and thesis packets
-- do not silently treat Oats as unmapped.

INSERT INTO public.grain_market_mappings (
  canonical_grain,
  market_lane,
  source_name,
  source_commodity,
  source_class,
  source_region,
  mapping_type,
  mapping_confidence,
  notes
)
VALUES
  (
    'Oats',
    'cross_border',
    'cftc_cot_positions',
    'OATS',
    'positioning',
    'US',
    'primary',
    1.0,
    'CBOT oats positioning context. Thin market, but this is the direct CFTC contract for the Oats grain lane.'
  )
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
