-- Narrow indexes for the farmer-facing Wheat export-history RPC.
-- They keep the bounded public aggregate out of full-table CGC/export-sales
-- scans without exposing any raw table access.

CREATE INDEX IF NOT EXISTS idx_cgc_observations_wheat_latest
  ON public.cgc_observations (week_ending_date DESC, grain_week DESC, crop_year)
  WHERE grain = 'Wheat';

CREATE INDEX IF NOT EXISTS idx_cgc_observations_wheat_week_components
  ON public.cgc_observations (crop_year, grain_week, period, worksheet, metric, region, grade)
  WHERE grain = 'Wheat';

CREATE INDEX IF NOT EXISTS idx_usda_export_sales_all_wheat_week
  ON public.usda_export_sales (week_ending DESC, market_year DESC, imported_at DESC)
  WHERE commodity = 'ALL WHEAT';

NOTIFY pgrst, 'reload schema';
