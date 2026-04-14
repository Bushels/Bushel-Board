CREATE TABLE IF NOT EXISTS usda_wasde_raw (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crop_year TEXT NOT NULL DEFAULT '',
  market_name TEXT NOT NULL,
  commodity_code TEXT NOT NULL,
  commodity_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  market_year TEXT NOT NULL,
  calendar_year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  attribute_id INTEGER NOT NULL,
  unit_id INTEGER NOT NULL,
  value NUMERIC,
  source TEXT NOT NULL DEFAULT 'usda_fas_psd_api',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commodity_code, country_code, market_year, calendar_year, month, attribute_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_usda_wasde_raw_market_month
  ON usda_wasde_raw (market_name, market_year, calendar_year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_usda_wasde_raw_commodity_country
  ON usda_wasde_raw (commodity_code, country_code, market_year);

COMMENT ON TABLE usda_wasde_raw IS 'Raw USDA FAS PSD/WASDE balance-sheet rows used to build the US thesis layer.';
COMMENT ON COLUMN usda_wasde_raw.market_name IS 'Normalized thesis market, e.g. Corn, Soybeans, Winter Wheat, Spring Wheat, Oats.';
COMMENT ON COLUMN usda_wasde_raw.attribute_id IS 'USDA PSD attribute identifier; mapped later into thesis metrics like production or ending stocks.';
COMMENT ON COLUMN usda_wasde_raw.unit_id IS 'USDA PSD unit identifier; mapped later into thesis units and stocks-to-use calculations.';

ALTER TABLE usda_wasde_raw ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'usda_wasde_raw'
      AND policyname = 'Authenticated users can read USDA WASDE raw rows'
  ) THEN
    CREATE POLICY "Authenticated users can read USDA WASDE raw rows"
      ON usda_wasde_raw FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
