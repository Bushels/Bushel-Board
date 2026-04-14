-- Ensure USDA FAS weekly export sales table exists with the fields used by the importer.
-- Remote production already has this table; this migration keeps repo state aligned for fresh environments.

CREATE TABLE IF NOT EXISTS usda_export_sales (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity             TEXT NOT NULL,
  cgc_grain             TEXT NOT NULL,
  market_year           TEXT NOT NULL,
  week_ending           DATE NOT NULL,
  net_sales_mt          NUMERIC,
  exports_mt            NUMERIC,
  outstanding_mt        NUMERIC,
  top_buyers            TEXT,
  source                TEXT NOT NULL DEFAULT 'usda_esr_api',
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  commodity_code        INTEGER,
  mapping_type          TEXT,
  cumulative_exports_mt NUMERIC,
  net_sales_next_yr_mt  NUMERIC,
  total_commitments_mt  NUMERIC,
  export_pace_pct       NUMERIC,
  usda_projection_mt    NUMERIC,
  UNIQUE (commodity, market_year, week_ending)
);

ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS commodity_code INTEGER;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS mapping_type TEXT;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS cumulative_exports_mt NUMERIC;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS net_sales_next_yr_mt NUMERIC;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS total_commitments_mt NUMERIC;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS export_pace_pct NUMERIC;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS usda_projection_mt NUMERIC;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS top_buyers TEXT;
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'usda_esr_api';
ALTER TABLE usda_export_sales ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_usda_export_sales_week_desc
  ON usda_export_sales (week_ending DESC, commodity);

CREATE INDEX IF NOT EXISTS idx_usda_export_sales_cgc_grain
  ON usda_export_sales (cgc_grain, week_ending DESC);

COMMENT ON TABLE usda_export_sales IS 'USDA FAS weekly export sales data used as the global demand signal for Canadian grain analysis.';
COMMENT ON COLUMN usda_export_sales.commodity IS 'USDA commodity label, e.g. ALL WHEAT or CORN.';
COMMENT ON COLUMN usda_export_sales.cgc_grain IS 'Mapped CGC grain name for Canadian thesis joins.';
COMMENT ON COLUMN usda_export_sales.top_buyers IS 'JSON string of top destination countries for the week.';
COMMENT ON COLUMN usda_export_sales.mapping_type IS 'primary, proxy, or reference mapping into the Canadian grain model.';
COMMENT ON COLUMN usda_export_sales.net_sales_next_yr_mt IS 'Next marketing-year net sales in metric tonnes.';

ALTER TABLE usda_export_sales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'usda_export_sales'
      AND policyname = 'Authenticated users can read USDA export sales'
  ) THEN
    CREATE POLICY "Authenticated users can read USDA export sales"
      ON usda_export_sales FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
