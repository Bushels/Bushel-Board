CREATE OR REPLACE FUNCTION get_cot_positioning(
  p_grain text,
  p_crop_year text DEFAULT NULL,
  p_weeks_back int DEFAULT 4
)
RETURNS TABLE (
  report_date date,
  commodity text,
  exchange text,
  mapping_type text,
  open_interest numeric,
  managed_money_net numeric,
  managed_money_net_pct numeric,
  wow_net_change numeric,
  commercial_net numeric,
  commercial_net_pct numeric,
  spec_commercial_divergence boolean,
  grain_week smallint
) LANGUAGE sql STABLE AS $$
  SELECT
    c.report_date,
    c.commodity,
    c.exchange,
    c.mapping_type,
    c.open_interest,
    (c.managed_money_long - c.managed_money_short) AS managed_money_net,
    ROUND(((c.managed_money_long - c.managed_money_short)
      / NULLIF(c.open_interest, 0) * 100)::numeric, 1) AS managed_money_net_pct,
    COALESCE(c.change_managed_money_long, 0)
      - COALESCE(c.change_managed_money_short, 0) AS wow_net_change,
    (c.prod_merc_long - c.prod_merc_short) AS commercial_net,
    ROUND(((c.prod_merc_long - c.prod_merc_short)
      / NULLIF(c.open_interest, 0) * 100)::numeric, 1) AS commercial_net_pct,
    CASE
      WHEN (c.managed_money_long - c.managed_money_short) > 0
        AND (c.prod_merc_long - c.prod_merc_short) < 0 THEN true
      WHEN (c.managed_money_long - c.managed_money_short) < 0
        AND (c.prod_merc_long - c.prod_merc_short) > 0 THEN true
      ELSE false
    END AS spec_commercial_divergence,
    c.grain_week
  FROM cftc_cot_positions c
  WHERE c.cgc_grain = p_grain
    AND (p_crop_year IS NULL OR c.crop_year = p_crop_year)
    AND c.mapping_type = 'primary'
  ORDER BY c.report_date DESC
  LIMIT p_weeks_back;
$$;

COMMENT ON FUNCTION get_cot_positioning IS 'Returns managed money and commercial net positioning for a CGC grain from CFTC COT data, with spec/commercial divergence flag';
