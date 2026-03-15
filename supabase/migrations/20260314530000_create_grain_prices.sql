-- supabase/migrations/20260314530000_create_grain_prices.sql

CREATE TABLE IF NOT EXISTS grain_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grain TEXT NOT NULL,
  contract TEXT NOT NULL,          -- e.g. "RSK26" (ICE Canola May 2026), "WK26" (CBOT Wheat May 2026)
  exchange TEXT NOT NULL,          -- "ICE", "CBOT", "MGE"
  price_date DATE NOT NULL,
  settlement_price NUMERIC,       -- CAD/tonne for ICE, USD/bushel for CBOT
  change_amount NUMERIC,
  change_pct NUMERIC,
  volume INTEGER,
  open_interest INTEGER,
  currency TEXT NOT NULL DEFAULT 'CAD',
  source TEXT NOT NULL,            -- "manual", "barchart", "alpha_vantage"
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grain, contract, price_date)
);

ALTER TABLE grain_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read grain prices"
  ON grain_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_grain_prices_grain_date
  ON grain_prices (grain, price_date DESC);

COMMENT ON TABLE grain_prices IS 'Daily futures settlement prices. Source: manual entry or delayed API.';

-- Convenience view: latest price per grain
CREATE OR REPLACE VIEW v_latest_grain_prices AS
SELECT DISTINCT ON (grain)
  grain,
  contract,
  exchange,
  price_date,
  settlement_price,
  change_amount,
  change_pct,
  currency,
  source
FROM grain_prices
ORDER BY grain, price_date DESC;
