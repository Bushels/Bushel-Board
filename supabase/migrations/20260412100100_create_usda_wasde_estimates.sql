-- USDA WASDE (World Agricultural Supply and Demand Estimates)
-- Source: https://apps.fas.usda.gov/psdonline/api/
-- Updated monthly (~12th of each month)
-- Provides stocks-to-use ratios — the #1 fundamental driver of grain prices

CREATE TABLE usda_wasde_estimates (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity       text NOT NULL,           -- USDA commodity name
  commodity_code  smallint,                -- USDA PSD code
  cgc_grain       text,                    -- Mapped CGC grain name
  country         text NOT NULL DEFAULT 'United States', -- 'United States' or 'World'
  market_year     text NOT NULL,           -- USDA marketing year (e.g., '2025/2026')
  report_date     date NOT NULL,           -- WASDE release date

  -- Supply side (million metric tonnes)
  beginning_stocks_mmt  numeric,
  production_mmt        numeric,
  imports_mmt           numeric,
  total_supply_mmt      numeric,

  -- Demand side (million metric tonnes)
  domestic_use_mmt      numeric,
  exports_mmt           numeric,
  total_use_mmt         numeric,

  -- Balance (million metric tonnes)
  ending_stocks_mmt     numeric,

  -- Key derived ratios (computed at import)
  stocks_to_use_pct     numeric,           -- ending_stocks / total_use * 100
  production_change_pct numeric,           -- vs prior month estimate
  stocks_change_mmt     numeric,           -- vs prior month estimate

  -- Month-over-month revision tracking
  prior_ending_stocks_mmt numeric,         -- Last month's estimate for same MY
  revision_direction    text,              -- 'tighter', 'looser', 'unchanged'

  -- Metadata
  source          text DEFAULT 'USDA-WASDE',
  imported_at     timestamptz DEFAULT now(),

  UNIQUE (commodity, country, market_year, report_date)
);

-- Indexes for intelligence pipeline
CREATE INDEX idx_wasde_cgc_grain ON usda_wasde_estimates(cgc_grain, report_date DESC);
CREATE INDEX idx_wasde_commodity ON usda_wasde_estimates(commodity, country, market_year);
CREATE INDEX idx_wasde_report_date ON usda_wasde_estimates(report_date DESC);

-- RLS
ALTER TABLE usda_wasde_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read WASDE data"
  ON usda_wasde_estimates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert WASDE data"
  ON usda_wasde_estimates FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update WASDE data"
  ON usda_wasde_estimates FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE usda_wasde_estimates IS 'USDA WASDE monthly S&D estimates — stocks-to-use ratios for global and US grain markets. Source: apps.fas.usda.gov/psdonline/';

-- RPC: Get latest WASDE context for a grain
CREATE OR REPLACE FUNCTION get_usda_wasde_context(
  p_cgc_grain text,
  p_months_back int DEFAULT 3
)
RETURNS TABLE (
  report_date date,
  commodity text,
  country text,
  market_year text,
  ending_stocks_mmt numeric,
  stocks_to_use_pct numeric,
  revision_direction text,
  stocks_change_mmt numeric,
  production_mmt numeric,
  exports_mmt numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    w.report_date,
    w.commodity,
    w.country,
    w.market_year,
    w.ending_stocks_mmt,
    w.stocks_to_use_pct,
    w.revision_direction,
    w.stocks_change_mmt,
    w.production_mmt,
    w.exports_mmt
  FROM usda_wasde_estimates w
  WHERE w.cgc_grain = p_cgc_grain
  ORDER BY w.report_date DESC
  LIMIT p_months_back * 2;  -- US + World rows
$$;
