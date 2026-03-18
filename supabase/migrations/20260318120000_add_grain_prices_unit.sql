-- Add unit column to grain_prices for display formatting
-- '$/bu' for CBOT grains (wheat, corn, oats, soybeans)
-- '$/tonne' for ICE grains (canola)
ALTER TABLE grain_prices ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '$/bu';

-- Must drop and recreate view since column ordering changed
-- (PostgreSQL does not allow CREATE OR REPLACE to reorder columns)
DROP VIEW IF EXISTS v_latest_grain_prices;

CREATE VIEW v_latest_grain_prices AS
SELECT DISTINCT ON (grain)
  grain,
  contract,
  exchange,
  price_date,
  settlement_price,
  change_amount,
  change_pct,
  currency,
  unit,
  source
FROM grain_prices
ORDER BY grain, price_date DESC;
