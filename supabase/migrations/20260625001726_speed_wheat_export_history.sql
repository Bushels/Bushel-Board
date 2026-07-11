-- Speed up the public Wheat export-history RPC by avoiding broad CGC scans and
-- the heavier producer-delivery view. The chart only needs the latest Wheat
-- crop-year window, so compute the small aggregate set directly.

CREATE OR REPLACE FUNCTION public.get_wheat_export_history(
  p_weeks integer DEFAULT 16
)
RETURNS TABLE (
  country text,
  source_name text,
  season_label text,
  week_ending date,
  week_index integer,
  weekly_exports_kt numeric,
  cumulative_exports_kt numeric,
  weekly_producer_deliveries_kt numeric,
  cumulative_producer_deliveries_kt numeric,
  export_delivery_ratio_pct numeric,
  net_sales_kt numeric,
  outstanding_sales_kt numeric,
  total_commitments_kt numeric,
  export_pace_pct numeric,
  usda_projection_kt numeric,
  projection_admitted boolean,
  freshness_status text,
  source_period_end date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH bounds AS (
    SELECT greatest(4, least(coalesce(p_weeks, 16), 52))::integer AS weeks
  ),
  latest_cgc AS (
    SELECT c.crop_year, c.grain_week, c.week_ending_date
    FROM public.cgc_observations c
    WHERE c.grain = 'Wheat'
    ORDER BY c.week_ending_date DESC, c.grain_week DESC
    LIMIT 1
  ),
  source_periods AS (
    SELECT
      (SELECT lc.week_ending_date::date FROM latest_cgc lc) AS cgc_period_end,
      (
        SELECT max(e.week_ending)::date
        FROM public.usda_export_sales e
        WHERE e.commodity = 'ALL WHEAT'
      ) AS usda_period_end
  ),
  source_freshness AS (
    SELECT
      CASE
        WHEN sp.cgc_period_end IS NULL THEN 'empty'
        WHEN current_date - sp.cgc_period_end <= 10 THEN 'strong'
        WHEN current_date - sp.cgc_period_end <= 17 THEN 'usable but stale-risk'
        ELSE 'stale'
      END AS cgc_status,
      CASE
        WHEN sp.usda_period_end IS NULL THEN 'empty'
        WHEN current_date - sp.usda_period_end <= 10 THEN 'strong'
        WHEN current_date - sp.usda_period_end <= 17 THEN 'usable but stale-risk'
        ELSE 'stale'
      END AS usda_status,
      sp.cgc_period_end,
      sp.usda_period_end
    FROM source_periods sp
  ),
  canada_weeks AS (
    SELECT DISTINCT c.crop_year, c.grain_week, c.week_ending_date
    FROM public.cgc_observations c
    CROSS JOIN latest_cgc lc
    CROSS JOIN bounds b
    WHERE c.grain = 'Wheat'
      AND c.crop_year = lc.crop_year
      AND c.grain_week BETWEEN greatest(lc.grain_week - b.weeks + 1, 1) AND lc.grain_week
  ),
  canada_exports AS (
    SELECT
      c.crop_year,
      c.grain_week,
      sum(c.ktonnes) FILTER (WHERE c.period = 'Current Week') AS weekly_exports_kt,
      sum(c.ktonnes) FILTER (WHERE c.period = 'Crop Year') AS cumulative_exports_kt
    FROM public.cgc_observations c
    JOIN canada_weeks w
      ON w.crop_year = c.crop_year
      AND w.grain_week = c.grain_week
    WHERE c.grain = 'Wheat'
      AND (
        (c.worksheet = 'Terminal Exports' AND c.metric = 'Exports')
        OR (c.worksheet = 'Primary Shipment Distribution' AND c.metric = 'Shipment Distribution' AND c.region = 'Export Destinations')
        OR (c.worksheet = 'Producer Cars' AND c.metric = 'Shipment Distribution' AND c.region = 'Export')
      )
    GROUP BY c.crop_year, c.grain_week
  ),
  canada_deliveries AS (
    SELECT
      c.crop_year,
      c.grain_week,
      sum(c.ktonnes) FILTER (WHERE c.period = 'Current Week') AS weekly_producer_deliveries_kt,
      sum(c.ktonnes) FILTER (WHERE c.period = 'Crop Year') AS cumulative_producer_deliveries_kt
    FROM public.cgc_observations c
    JOIN canada_weeks w
      ON w.crop_year = c.crop_year
      AND w.grain_week = c.grain_week
    WHERE c.grain = 'Wheat'
      AND c.grade = ''
      AND (
        (c.worksheet = 'Primary' AND c.metric = 'Deliveries')
        OR (c.worksheet = 'Process' AND c.metric = 'Producer Deliveries')
        OR (c.worksheet = 'Producer Cars' AND c.metric = 'Shipments')
      )
    GROUP BY c.crop_year, c.grain_week
  ),
  canada_rows AS (
    SELECT
      'Canada'::text AS country,
      'cgc_observations'::text AS source_name,
      w.crop_year::text AS season_label,
      w.week_ending_date::date AS week_ending,
      w.grain_week::integer AS week_index,
      coalesce(e.weekly_exports_kt, 0)::numeric AS weekly_exports_kt,
      coalesce(e.cumulative_exports_kt, 0)::numeric AS cumulative_exports_kt,
      d.weekly_producer_deliveries_kt::numeric AS weekly_producer_deliveries_kt,
      d.cumulative_producer_deliveries_kt::numeric AS cumulative_producer_deliveries_kt,
      CASE
        WHEN d.weekly_producer_deliveries_kt > 0
          THEN round((coalesce(e.weekly_exports_kt, 0) / d.weekly_producer_deliveries_kt) * 100, 1)
        ELSE NULL
      END::numeric AS export_delivery_ratio_pct,
      NULL::numeric AS net_sales_kt,
      NULL::numeric AS outstanding_sales_kt,
      NULL::numeric AS total_commitments_kt,
      NULL::numeric AS export_pace_pct,
      NULL::numeric AS usda_projection_kt,
      false AS projection_admitted,
      sf.cgc_status AS freshness_status,
      sf.cgc_period_end AS source_period_end
    FROM canada_weeks w
    LEFT JOIN canada_exports e
      ON e.crop_year = w.crop_year
      AND e.grain_week = w.grain_week
    LEFT JOIN canada_deliveries d
      ON d.crop_year = w.crop_year
      AND d.grain_week = w.grain_week
    CROSS JOIN source_freshness sf
  ),
  us_ranked AS (
    SELECT
      e.*,
      row_number() OVER (
        PARTITION BY e.week_ending
        ORDER BY e.market_year DESC, e.imported_at DESC
      ) AS row_rank
    FROM public.usda_export_sales e
    WHERE e.commodity = 'ALL WHEAT'
  ),
  us_weeks AS (
    SELECT *
    FROM us_ranked
    WHERE row_rank = 1
    ORDER BY week_ending DESC
    LIMIT (SELECT weeks FROM bounds)
  ),
  us_rows AS (
    SELECT
      'United States'::text AS country,
      'usda_export_sales'::text AS source_name,
      u.market_year::text AS season_label,
      u.week_ending::date AS week_ending,
      extract(week from u.week_ending)::integer AS week_index,
      (u.exports_mt / 1000.0)::numeric AS weekly_exports_kt,
      (u.cumulative_exports_mt / 1000.0)::numeric AS cumulative_exports_kt,
      NULL::numeric AS weekly_producer_deliveries_kt,
      NULL::numeric AS cumulative_producer_deliveries_kt,
      NULL::numeric AS export_delivery_ratio_pct,
      (u.net_sales_mt / 1000.0)::numeric AS net_sales_kt,
      (u.outstanding_mt / 1000.0)::numeric AS outstanding_sales_kt,
      (u.total_commitments_mt / 1000.0)::numeric AS total_commitments_kt,
      u.export_pace_pct::numeric AS export_pace_pct,
      (u.usda_projection_mt / 1000.0)::numeric AS usda_projection_kt,
      (u.export_pace_pct IS NOT NULL AND u.usda_projection_mt IS NOT NULL) AS projection_admitted,
      sf.usda_status AS freshness_status,
      sf.usda_period_end AS source_period_end
    FROM us_weeks u
    CROSS JOIN source_freshness sf
  )
  SELECT *
  FROM canada_rows
  UNION ALL
  SELECT *
  FROM us_rows
  ORDER BY country ASC, week_ending ASC;
$$;

REVOKE ALL ON FUNCTION public.get_wheat_export_history(integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_wheat_export_history(integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_wheat_export_history(integer) IS
  'Returns bounded Wheat export and demand-confirmation history for /thesis. Canada rows use CGC aggregate movement; U.S. rows use USDA Export Sales ALL WHEAT. Does not expose raw usda_export_sales or grade/destination detail.';

NOTIFY pgrst, 'reload schema';
