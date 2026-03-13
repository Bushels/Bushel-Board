-- CFTC Commitments of Traders — Disaggregated Options+Futures Combined
-- Source: https://www.cftc.gov/dea/options/ag_lof.htm
-- Updated every Friday ~1:30pm MST (data as of prior Tuesday)

CREATE TABLE cftc_cot_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  commodity text NOT NULL,
  contract_market_name text NOT NULL,
  exchange text NOT NULL,

  -- Open Interest
  open_interest numeric NOT NULL,
  change_open_interest numeric,

  -- Producer/Merchant/Processor/User (Commercial hedgers)
  prod_merc_long numeric NOT NULL,
  prod_merc_short numeric NOT NULL,

  -- Swap Dealers
  swap_long numeric NOT NULL,
  swap_short numeric NOT NULL,
  swap_spread numeric,

  -- Managed Money (Speculators — hedge funds, CTAs)
  managed_money_long numeric NOT NULL,
  managed_money_short numeric NOT NULL,
  managed_money_spread numeric,

  -- Other Reportables
  other_long numeric NOT NULL,
  other_short numeric NOT NULL,
  other_spread numeric,

  -- Non-Reportable (small traders)
  nonreportable_long numeric NOT NULL,
  nonreportable_short numeric NOT NULL,

  -- WoW changes (key categories)
  change_prod_merc_long numeric,
  change_prod_merc_short numeric,
  change_swap_long numeric,
  change_swap_short numeric,
  change_managed_money_long numeric,
  change_managed_money_short numeric,
  change_other_long numeric,
  change_other_short numeric,
  change_nonreportable_long numeric,
  change_nonreportable_short numeric,

  -- Percent of Open Interest
  pct_prod_merc_long numeric,
  pct_prod_merc_short numeric,
  pct_swap_long numeric,
  pct_swap_short numeric,
  pct_managed_money_long numeric,
  pct_managed_money_short numeric,
  pct_other_long numeric,
  pct_other_short numeric,
  pct_nonreportable_long numeric,
  pct_nonreportable_short numeric,

  -- Number of traders
  traders_prod_merc_long smallint,
  traders_prod_merc_short smallint,
  traders_swap_long smallint,
  traders_swap_short smallint,
  traders_swap_spread smallint,
  traders_managed_money_long smallint,
  traders_managed_money_short smallint,
  traders_managed_money_spread smallint,
  traders_other_long smallint,
  traders_other_short smallint,
  traders_other_spread smallint,
  traders_total smallint,

  -- Concentration (top 4/8 traders)
  concentration_gross_4_long numeric,
  concentration_gross_4_short numeric,
  concentration_gross_8_long numeric,
  concentration_gross_8_short numeric,
  concentration_net_4_long numeric,
  concentration_net_4_short numeric,
  concentration_net_8_long numeric,
  concentration_net_8_short numeric,

  -- Bushel Board mapping
  cgc_grain text,
  mapping_type text DEFAULT 'primary',
  crop_year text,
  grain_week smallint,

  -- Metadata
  imported_at timestamptz DEFAULT now(),
  import_source text DEFAULT 'manual',

  UNIQUE(report_date, commodity)
);

-- Index for grain lookups in intelligence pipeline
CREATE INDEX idx_cftc_cot_cgc_grain ON cftc_cot_positions(cgc_grain, report_date DESC);
CREATE INDEX idx_cftc_cot_crop_year ON cftc_cot_positions(crop_year, grain_week DESC);

-- RLS: authenticated users can read
ALTER TABLE cftc_cot_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read COT data"
  ON cftc_cot_positions FOR SELECT
  TO authenticated
  USING (true);

-- Service role can insert (for Edge Function and manual imports)
CREATE POLICY "Service role can insert COT data"
  ON cftc_cot_positions FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE cftc_cot_positions IS 'CFTC Disaggregated COT data — weekly trader positioning for grain futures. Source: cftc.gov/dea/options/ag_lof.htm';
