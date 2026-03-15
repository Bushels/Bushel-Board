-- Processor Self-Sufficiency RPC
-- Computes the ratio of direct producer deliveries to total processor intake.
-- When processors source less grain directly from farmers (ratio drops),
-- it signals farmer pricing power (bullish).

CREATE OR REPLACE FUNCTION get_processor_self_sufficiency(
  p_grain text,
  p_crop_year text
)
RETURNS TABLE (
  grain_week int,
  cw_producer_kt numeric,
  cw_other_kt numeric,
  cw_self_sufficiency_pct numeric,
  cy_producer_kt numeric,
  cy_other_kt numeric,
  cy_self_sufficiency_pct numeric
)
LANGUAGE sql STABLE
AS $$
  WITH weekly AS (
    SELECT
      o.grain_week,
      o.metric,
      o.period,
      o.ktonnes
    FROM cgc_observations o
    WHERE o.grain = p_grain
      AND o.crop_year = p_crop_year
      AND o.worksheet = 'Process'
      AND o.metric IN ('Producer Deliveries', 'Other Deliveries')
      AND o.region = ''
      AND o.grade = ''
  ),
  pivoted AS (
    SELECT
      w.grain_week,
      MAX(CASE WHEN w.metric = 'Producer Deliveries' AND w.period = 'Current Week' THEN w.ktonnes ELSE 0 END) AS cw_producer,
      MAX(CASE WHEN w.metric = 'Other Deliveries' AND w.period = 'Current Week' THEN w.ktonnes ELSE 0 END) AS cw_other,
      MAX(CASE WHEN w.metric = 'Producer Deliveries' AND w.period = 'Crop Year' THEN w.ktonnes ELSE 0 END) AS cy_producer,
      MAX(CASE WHEN w.metric = 'Other Deliveries' AND w.period = 'Crop Year' THEN w.ktonnes ELSE 0 END) AS cy_other
    FROM weekly w
    GROUP BY w.grain_week
  )
  SELECT
    p.grain_week::int,
    p.cw_producer,
    p.cw_other,
    CASE WHEN (p.cw_producer + p.cw_other) > 0
      THEN ROUND((p.cw_producer / (p.cw_producer + p.cw_other) * 100)::numeric, 1)
      ELSE NULL
    END AS cw_self_sufficiency_pct,
    p.cy_producer,
    p.cy_other,
    CASE WHEN (p.cy_producer + p.cy_other) > 0
      THEN ROUND((p.cy_producer / (p.cy_producer + p.cy_other) * 100)::numeric, 1)
      ELSE NULL
    END AS cy_self_sufficiency_pct
  FROM pivoted p
  ORDER BY p.grain_week;
$$;
