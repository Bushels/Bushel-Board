-- USDA FAS Weekly Export Sales
-- Source: https://apps.fas.usda.gov/OpenData/api/esr/exports/
-- Updated every Thursday ~8:30 AM ET (data for prior week)
-- Provides global demand signal for Canadian grain thesis

CREATE TABLE usda_export_sales (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity       text NOT NULL,           -- USDA commodity name (e.g., 'Wheat', 'Corn', 'Soybeans')
  commodity_code  smallint NOT NULL,       -- USDA FAS code (107=Wheat, 104=Corn, 201=Soybeans, etc.)
  cgc_grain       text,                    -- Mapped CGC grain name (e.g., 'Wheat', 'Canola' via soybean proxy)
  mapping_type    text DEFAULT 'primary',  -- 'primary' = direct comp, 'proxy' = indirect (e.g., soybeans→canola)
  market_year     text NOT NULL,           -- USDA marketing year (e.g., '2025/2026')
  week_ending     date NOT NULL,           -- Report week ending date

  -- Core metrics (all in metric tonnes)
  net_sales_mt          numeric,           -- Net new sales booked this week
  exports_mt            numeric,           -- Actual shipments this week
  outstanding_mt        numeric,           -- Total unshipped commitments
  cumulative_exports_mt numeric,           -- Marketing-year-to-date exports
  net_sales_next_yr_mt  numeric,           -- New-crop (next MY) net sales this week

  -- Context
  top_buyers            jsonb,             -- Array of {country, mt} for top 3-5 buyers this week
  total_commitments_mt  numeric,           -- outstanding + cumulative_exports (total program)

  -- Computed pace metrics (calculated at import time)
  export_pace_pct       numeric,           -- cumulative_exports / USDA annual projection * 100
  usda_projection_mt    numeric,           -- Current USDA export projection for this MY

  -- Metadata
  source          text DEFAULT 'USDA-FAS',
  imported_at     timestamptz DEFAULT now(),

  UNIQUE (commodity_code, market_year, week_ending)
);

-- Indexes for intelligence pipeline lookups
CREATE INDEX idx_usda_exports_cgc_grain ON usda_export_sales(cgc_grain, week_ending DESC);
CREATE INDEX idx_usda_exports_commodity ON usda_export_sales(commodity, market_year, week_ending DESC);
CREATE INDEX idx_usda_exports_week ON usda_export_sales(week_ending DESC);

-- RLS: authenticated users can read
ALTER TABLE usda_export_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read USDA export data"
  ON usda_export_sales FOR SELECT
  TO authenticated
  USING (true);

-- Service role can insert (for Hermes agent and manual imports)
CREATE POLICY "Service role can insert USDA export data"
  ON usda_export_sales FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can update (for re-imports and pace recalculations)
CREATE POLICY "Service role can update USDA export data"
  ON usda_export_sales FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE usda_export_sales IS 'USDA FAS weekly export sales — global demand signal for Canadian grain thesis. Source: apps.fas.usda.gov/OpenData/api/esr/exports/';

-- Commodity mapping reference (used by Hermes import skill)
COMMENT ON COLUMN usda_export_sales.commodity_code IS 'USDA FAS codes: 107=Wheat, 104=Corn, 201=Soybeans, 101=Barley, 105=Oats, 108=Sorghum, 207=SoybeanOil, 206=SoybeanMeal';
COMMENT ON COLUMN usda_export_sales.mapping_type IS 'primary=direct competitor, proxy=indirect demand signal (e.g., SoybeanOil→Canola)';

-- RPC: Get latest USDA export context for a given grain
CREATE OR REPLACE FUNCTION get_usda_export_context(
  p_cgc_grain text,
  p_weeks_back int DEFAULT 4
)
RETURNS TABLE (
  week_ending date,
  commodity text,
  net_sales_mt numeric,
  exports_mt numeric,
  outstanding_mt numeric,
  cumulative_exports_mt numeric,
  export_pace_pct numeric,
  top_buyers jsonb,
  mapping_type text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    u.week_ending,
    u.commodity,
    u.net_sales_mt,
    u.exports_mt,
    u.outstanding_mt,
    u.cumulative_exports_mt,
    u.export_pace_pct,
    u.top_buyers,
    u.mapping_type
  FROM usda_export_sales u
  WHERE u.cgc_grain = p_cgc_grain
  ORDER BY u.week_ending DESC
  LIMIT p_weeks_back;
$$;

-- RPC: Get 4-week average net sales for pace comparison
CREATE OR REPLACE FUNCTION get_usda_sales_pace(
  p_cgc_grain text,
  p_market_year text DEFAULT NULL
)
RETURNS TABLE (
  commodity text,
  avg_net_sales_4wk numeric,
  avg_exports_4wk numeric,
  latest_outstanding numeric,
  latest_pace_pct numeric,
  weeks_of_data bigint
)
LANGUAGE sql STABLE
AS $$
  WITH recent AS (
    SELECT
      u.commodity,
      u.net_sales_mt,
      u.exports_mt,
      u.outstanding_mt,
      u.export_pace_pct,
      ROW_NUMBER() OVER (PARTITION BY u.commodity ORDER BY u.week_ending DESC) AS rn
    FROM usda_export_sales u
    WHERE u.cgc_grain = p_cgc_grain
      AND (p_market_year IS NULL OR u.market_year = p_market_year)
  )
  SELECT
    commodity,
    ROUND(AVG(net_sales_mt) FILTER (WHERE rn <= 4), 0) AS avg_net_sales_4wk,
    ROUND(AVG(exports_mt) FILTER (WHERE rn <= 4), 0) AS avg_exports_4wk,
    MAX(outstanding_mt) FILTER (WHERE rn = 1) AS latest_outstanding,
    MAX(export_pace_pct) FILTER (WHERE rn = 1) AS latest_pace_pct,
    COUNT(*) AS weeks_of_data
  FROM recent
  GROUP BY commodity;
$$;
