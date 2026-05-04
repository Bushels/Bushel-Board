-- Data Layer Foundation V1: source/grain mapping registry.
--
-- This table replaces scattered hard-coded commodity mappings with a visible
-- registry. Proxy relationships are allowed, but must be labelled so a soybean
-- signal can inform canola without becoming canola source truth.

CREATE TABLE IF NOT EXISTS public.grain_market_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_grain text NOT NULL,
  market_lane text NOT NULL CHECK (
    market_lane IN ('canada', 'us', 'cross_border', 'farmer_local', 'international')
  ),
  source_name text NOT NULL,
  source_commodity text NOT NULL,
  source_class text NOT NULL CHECK (
    source_class IN (
      'official',
      'derived',
      'price',
      'positioning',
      'weather',
      'farmer_input',
      'private_estimate',
      'social'
    )
  ),
  source_region text,
  mapping_type text NOT NULL CHECK (
    mapping_type IN ('primary', 'proxy', 'context', 'legacy', 'unmapped')
  ),
  mapping_confidence numeric NOT NULL DEFAULT 1.0 CHECK (
    mapping_confidence >= 0 AND mapping_confidence <= 1
  ),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grain_market_mappings_unique_active
  ON public.grain_market_mappings (
    lower(canonical_grain),
    market_lane,
    source_name,
    lower(source_commodity),
    coalesce(source_region, ''),
    mapping_type
  )
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_grain_market_mappings_source
  ON public.grain_market_mappings (source_name, source_commodity, market_lane)
  WHERE active;

ALTER TABLE public.grain_market_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grain_market_mappings_select_all" ON public.grain_market_mappings;
CREATE POLICY "grain_market_mappings_select_all"
  ON public.grain_market_mappings
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.grain_market_mappings TO anon, authenticated;

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
SELECT
  g.name,
  'canada',
  'cgc_observations',
  g.name,
  'official',
  'CA',
  'primary',
  1.0,
  'CGC weekly operational source for Canadian grain flow.'
FROM public.grains g
ON CONFLICT DO NOTHING;

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
SELECT
  g.name,
  'canada',
  'supply_disposition',
  g.slug,
  'official',
  'CA',
  'primary',
  1.0,
  'AAFC/StatsCan-style balance sheet source keyed by grain_slug.'
FROM public.grains g
ON CONFLICT DO NOTHING;

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
  ('Wheat', 'us', 'usda_crop_progress', 'WHEAT', 'official', 'US', 'primary', 1.0, 'USDA NASS condition/progress signal; not a direct yield forecast.'),
  ('Corn', 'us', 'usda_crop_progress', 'CORN', 'official', 'US', 'primary', 1.0, 'USDA NASS condition/progress signal.'),
  ('Soybeans', 'us', 'usda_crop_progress', 'SOYBEANS', 'official', 'US', 'primary', 1.0, 'USDA NASS condition/progress signal.'),
  ('Barley', 'us', 'usda_crop_progress', 'BARLEY', 'official', 'US', 'primary', 1.0, 'USDA NASS condition/progress signal.'),
  ('Oats', 'us', 'usda_crop_progress', 'OATS', 'official', 'US', 'primary', 1.0, 'USDA NASS condition/progress signal.'),

  ('Wheat', 'us', 'usda_export_sales', 'ALL WHEAT', 'official', 'US', 'primary', 1.0, 'USDA FAS weekly export sales.'),
  ('Corn', 'us', 'usda_export_sales', 'CORN', 'official', 'US', 'primary', 1.0, 'USDA FAS weekly export sales.'),
  ('Soybeans', 'us', 'usda_export_sales', 'SOYBEANS', 'official', 'US', 'primary', 1.0, 'USDA FAS weekly export sales.'),
  ('Barley', 'us', 'usda_export_sales', 'BARLEY', 'official', 'US', 'primary', 1.0, 'USDA FAS weekly export sales.'),
  ('Oats', 'us', 'usda_export_sales', 'OATS', 'official', 'US', 'primary', 1.0, 'USDA FAS weekly export sales.'),
  ('Canola', 'cross_border', 'usda_export_sales', 'SOYBEANS', 'official', 'US', 'proxy', 0.65, 'Soybeans can inform canola oilseed context; never store as canola fact.'),
  ('Canola', 'cross_border', 'usda_export_sales', 'SOYBEAN OIL', 'official', 'US', 'proxy', 0.60, 'Soybean oil is a cross-border oilseed-price context proxy for canola.'),

  ('Wheat', 'us', 'usda_wasde_mapped', 'Wheat', 'official', 'US', 'primary', 1.0, 'USDA PSD/WASDE monthly wheat balance sheet.'),
  ('Corn', 'us', 'usda_wasde_mapped', 'Corn', 'official', 'US', 'primary', 1.0, 'USDA PSD/WASDE monthly corn balance sheet.'),
  ('Soybeans', 'us', 'usda_wasde_mapped', 'Soybeans', 'official', 'US', 'primary', 1.0, 'USDA PSD/WASDE monthly soybean balance sheet.'),
  ('Barley', 'us', 'usda_wasde_mapped', 'Barley', 'official', 'US', 'primary', 1.0, 'USDA PSD/WASDE monthly barley balance sheet.'),
  ('Oats', 'us', 'usda_wasde_mapped', 'Oats', 'official', 'US', 'primary', 1.0, 'USDA PSD/WASDE monthly oats balance sheet.'),
  ('Canola', 'cross_border', 'usda_wasde_mapped', 'Soybeans', 'official', 'US', 'proxy', 0.65, 'US soybean balance sheet is canola context, not canola source truth.'),

  ('Wheat', 'cross_border', 'cftc_cot_positions', 'WHEAT-SRW', 'positioning', 'US', 'primary', 0.95, 'CBOT SRW positioning context.'),
  ('Wheat', 'cross_border', 'cftc_cot_positions', 'WHEAT-HRW', 'positioning', 'US', 'primary', 0.95, 'KC HRW positioning context.'),
  ('Wheat', 'cross_border', 'cftc_cot_positions', 'WHEAT-HRSpring', 'positioning', 'US', 'primary', 0.90, 'MGEX HRS positioning context.'),
  ('Corn', 'cross_border', 'cftc_cot_positions', 'CORN', 'positioning', 'US', 'primary', 1.0, 'CBOT corn positioning context.'),
  ('Soybeans', 'cross_border', 'cftc_cot_positions', 'SOYBEANS', 'positioning', 'US', 'primary', 1.0, 'CBOT soybean positioning context.'),
  ('Canola', 'cross_border', 'cftc_cot_positions', 'CANOLA', 'positioning', 'CA', 'primary', 1.0, 'ICE canola positioning context.'),
  ('Canola', 'cross_border', 'cftc_cot_positions', 'SOYBEAN OIL', 'positioning', 'US', 'proxy', 0.60, 'Soy oil positioning as canola context proxy.'),

  ('Wheat', 'cross_border', 'grain_prices', 'ZW', 'price', 'US', 'primary', 0.95, 'CBOT SRW wheat futures.'),
  ('Wheat', 'cross_border', 'grain_prices', 'KE', 'price', 'US', 'primary', 0.95, 'KC HRW wheat futures.'),
  ('Wheat', 'cross_border', 'grain_prices', 'MWK26', 'price', 'US', 'primary', 0.90, 'MGEX spring wheat futures.'),
  ('Corn', 'cross_border', 'grain_prices', 'ZC', 'price', 'US', 'primary', 1.0, 'CBOT corn futures.'),
  ('Soybeans', 'cross_border', 'grain_prices', 'ZS', 'price', 'US', 'primary', 1.0, 'CBOT soybean futures.'),
  ('Oats', 'cross_border', 'grain_prices', 'ZO', 'price', 'US', 'primary', 1.0, 'CBOT oats futures.'),
  ('Canola', 'cross_border', 'grain_prices', 'RSK26', 'price', 'CA', 'primary', 1.0, 'ICE canola futures.'),
  ('Canola', 'cross_border', 'grain_prices', 'ZL', 'price', 'US', 'proxy', 0.60, 'Soybean oil futures as canola context proxy.'),
  ('Canola', 'cross_border', 'grain_prices', 'ZM', 'price', 'US', 'context', 0.50, 'Soybean meal futures as oilseed crush context.')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.grain_market_mappings IS
  'Visible registry of source commodity names, canonical grains, lanes, and proxy/context mappings for thesis packet construction.';

NOTIFY pgrst, 'reload schema';
