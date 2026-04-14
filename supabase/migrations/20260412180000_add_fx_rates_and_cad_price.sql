-- Add daily FX rates plus CAD-normalized grain prices.
-- USD/CAD is the canonical pair used to translate USD-denominated futures into CAD.

CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  pair TEXT NOT NULL,
  rate NUMERIC(18, 8) NOT NULL,
  source TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, pair)
);

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fx_rates'
      AND policyname = 'Authenticated users can read fx rates'
  ) THEN
    CREATE POLICY "Authenticated users can read fx rates"
      ON fx_rates FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_date_desc
  ON fx_rates (pair, date DESC);

COMMENT ON TABLE fx_rates IS 'Daily foreign-exchange rates used to normalize USD grain futures into CAD for prairie farmers.';
COMMENT ON COLUMN fx_rates.pair IS 'Currency pair in base/quote form, e.g. USD/CAD.';
COMMENT ON COLUMN fx_rates.rate IS 'Units of quote currency per 1 unit of base currency.';

ALTER TABLE grain_prices ADD COLUMN IF NOT EXISTS cad_price NUMERIC;

COMMENT ON COLUMN grain_prices.cad_price IS 'CAD-equivalent settlement price. For USD contracts this is settlement_price * USD/CAD rate; for CAD contracts it equals settlement_price.';

DROP VIEW IF EXISTS v_latest_grain_prices;

CREATE VIEW v_latest_grain_prices AS
SELECT DISTINCT ON (grain)
  grain,
  contract,
  exchange,
  price_date,
  settlement_price,
  cad_price,
  change_amount,
  change_pct,
  currency,
  unit,
  source
FROM grain_prices
ORDER BY grain, price_date DESC;

CREATE OR REPLACE FUNCTION recalculate_grain_prices_cad(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  usd_rows_updated INTEGER,
  cad_rows_updated INTEGER,
  missing_fx_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usd_rows_updated INTEGER := 0;
  v_cad_rows_updated INTEGER := 0;
  v_missing_fx_rows INTEGER := 0;
BEGIN
  UPDATE grain_prices gp
  SET cad_price = gp.settlement_price
  WHERE gp.currency = 'CAD'
    AND (p_start_date IS NULL OR gp.price_date >= p_start_date)
    AND (p_end_date IS NULL OR gp.price_date <= p_end_date)
    AND gp.cad_price IS DISTINCT FROM gp.settlement_price;

  GET DIAGNOSTICS v_cad_rows_updated = ROW_COUNT;

  UPDATE grain_prices gp
  SET cad_price = ROUND((gp.settlement_price * fx.rate)::numeric, 6)
  FROM fx_rates fx
  WHERE gp.currency = 'USD'
    AND fx.pair = 'USD/CAD'
    AND gp.price_date = fx.date
    AND (p_start_date IS NULL OR gp.price_date >= p_start_date)
    AND (p_end_date IS NULL OR gp.price_date <= p_end_date)
    AND gp.cad_price IS DISTINCT FROM ROUND((gp.settlement_price * fx.rate)::numeric, 6);

  GET DIAGNOSTICS v_usd_rows_updated = ROW_COUNT;

  SELECT COUNT(*)::INTEGER
  INTO v_missing_fx_rows
  FROM grain_prices gp
  WHERE gp.currency = 'USD'
    AND (p_start_date IS NULL OR gp.price_date >= p_start_date)
    AND (p_end_date IS NULL OR gp.price_date <= p_end_date)
    AND NOT EXISTS (
      SELECT 1
      FROM fx_rates fx
      WHERE fx.pair = 'USD/CAD'
        AND fx.date = gp.price_date
    );

  RETURN QUERY SELECT v_usd_rows_updated, v_cad_rows_updated, v_missing_fx_rows;
END;
$$;

COMMENT ON FUNCTION recalculate_grain_prices_cad(DATE, DATE) IS 'Backfills CAD-equivalent grain_prices.cad_price using fx_rates for USD contracts and passthrough for CAD contracts.';

GRANT EXECUTE ON FUNCTION recalculate_grain_prices_cad(DATE, DATE) TO authenticated, service_role;
