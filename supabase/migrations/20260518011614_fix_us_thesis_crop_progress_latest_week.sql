-- Fix US thesis packets using stale prior-season crop progress.
--
-- get_us_thesis_packet receives p_market_year for WASDE/export-sales marketing-year data,
-- but USDA crop progress is a current crop/report-year time series. Filtering crop
-- progress by p_market_year=2025 caused Wheat to pull 2025-08-31 rows while source
-- freshness correctly reported 2026-05-10. Use the latest available crop-progress week
-- for the requested market instead.

CREATE OR REPLACE FUNCTION public.get_us_thesis_packet(
  p_market_name text,
  p_market_year integer DEFAULT 2025
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH market AS (
    SELECT
      initcap(trim(p_market_name)) AS market_name,
      upper(trim(p_market_name)) AS commodity
  ),
  latest_progress_week AS (
    SELECT max(u.week_ending) AS week_ending
    FROM public.usda_crop_progress u, market m
    WHERE lower(u.market_name) = lower(m.market_name)
  ),
  crop_progress AS (
    SELECT jsonb_build_object(
      'us_total',
        (
          SELECT to_jsonb(u.*)
          FROM public.usda_crop_progress u, latest_progress_week w, market m
          WHERE lower(u.market_name) = lower(m.market_name)
            AND u.week_ending = w.week_ending
            AND u.state = 'US TOTAL'
          LIMIT 1
        ),
      'states',
        coalesce(
          (
            SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.state)
            FROM public.usda_crop_progress s, latest_progress_week w, market m
            WHERE lower(s.market_name) = lower(m.market_name)
              AND s.week_ending = w.week_ending
              AND s.state <> 'US TOTAL'
          ),
          '[]'::jsonb
        )
    ) AS payload
  ),
  export_sales AS (
    SELECT to_jsonb(e.*) AS payload
    FROM public.usda_export_sales e, market m
    WHERE lower(e.cgc_grain) = lower(m.market_name)
       OR (lower(m.market_name) = 'wheat' AND e.commodity = 'ALL WHEAT')
       OR (lower(m.market_name) = 'soybeans' AND e.commodity = 'SOYBEANS')
       OR (lower(m.market_name) = 'corn' AND e.commodity = 'CORN')
       OR (lower(m.market_name) = 'barley' AND e.commodity = 'BARLEY')
       OR (lower(m.market_name) = 'oats' AND e.commodity = 'OATS')
    ORDER BY e.week_ending DESC, e.imported_at DESC
    LIMIT 1
  ),
  wasde AS (
    SELECT to_jsonb(w.*) AS payload
    FROM public.usda_wasde_mapped w, market m
    WHERE lower(w.market_name) = lower(m.market_name)
      AND w.market_year = p_market_year::text
      AND w.country_code = 'US'
    ORDER BY w.report_month DESC
    LIMIT 1
  ),
  acreage AS (
    SELECT coalesce(jsonb_agg(to_jsonb(a.*) ORDER BY a.region_code), '[]'::jsonb) AS payload
    FROM public.crop_acreage_estimates a, market m
    WHERE lower(a.cgc_grain) = lower(m.market_name)
      AND a.market_year = p_market_year
  ),
  prices AS (
    SELECT coalesce(jsonb_agg(to_jsonb(p.*) ORDER BY p.price_date DESC, p.imported_at DESC), '[]'::jsonb) AS payload
    FROM (
      SELECT gp.*
      FROM public.grain_prices gp, market m
      WHERE lower(gp.grain) = lower(m.market_name)
         OR (lower(m.market_name) = 'wheat' AND gp.grain IN ('Wheat', 'HRW Wheat', 'Spring Wheat'))
         OR (lower(m.market_name) = 'soybeans' AND gp.grain IN ('Soybeans', 'Soybean Oil', 'Soybean Meal'))
      ORDER BY gp.price_date DESC, gp.imported_at DESC
      LIMIT 12
    ) p
  ),
  positioning AS (
    SELECT coalesce(jsonb_agg(to_jsonb(c.*) ORDER BY c.report_date DESC), '[]'::jsonb) AS payload
    FROM (
      SELECT c.*
      FROM public.cftc_cot_positions c, market m
      WHERE lower(c.cgc_grain) = lower(m.market_name)
      ORDER BY c.report_date DESC
      LIMIT 12
    ) c
  ),
  freshness AS (
    SELECT coalesce(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb) AS payload
    FROM public.get_thesis_data_freshness(p_market_name, NULL) f
    WHERE f.source_lane IN ('us', 'cross_border', 'international')
  ),
  quality_warnings AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source_name', f.source_name,
          'status', f.freshness_status,
          'action_hint', f.action_hint
        )
      ) FILTER (WHERE f.freshness_status <> 'strong'),
      '[]'::jsonb
    ) AS payload
    FROM public.get_thesis_data_freshness(p_market_name, NULL) f
    WHERE f.source_lane IN ('us', 'cross_border', 'international')
  )
  SELECT jsonb_build_object(
    'lane', 'us',
    'market_name', p_market_name,
    'market_year', p_market_year,
    'packet_generated_at', now(),
    'supply', jsonb_build_object(
      'crop_progress', coalesce((SELECT payload FROM crop_progress), '{}'::jsonb),
      'wasde', coalesce((SELECT payload FROM wasde), '{}'::jsonb),
      'acreage', coalesce((SELECT payload FROM acreage), '[]'::jsonb)
    ),
    'demand', jsonb_build_object(
      'export_sales', coalesce((SELECT payload FROM export_sales), '{}'::jsonb),
      'wasde', coalesce((SELECT payload FROM wasde), '{}'::jsonb)
    ),
    'logistics', jsonb_build_object('status', 'not_v1_us_source'),
    'prices', coalesce((SELECT payload FROM prices), '[]'::jsonb),
    'positioning', coalesce((SELECT payload FROM positioning), '[]'::jsonb),
    'weather', jsonb_build_object('status', 'derived_from_crop_progress_only', 'source_table', 'usda_crop_progress'),
    'farmer_behavior', jsonb_build_object('status', 'not_available_for_us_lane_v1'),
    'international_context', jsonb_build_object('scope', 'bounded_v1', 'sources', jsonb_build_array('usda_wasde_mapped')),
    'freshness', coalesce((SELECT payload FROM freshness), '[]'::jsonb),
    'quality_warnings', coalesce((SELECT payload FROM quality_warnings), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_us_thesis_packet(text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.get_us_thesis_packet(text, integer) IS
  'Facts-only US source packet for a market/market_year. Uses market_year for WASDE/export context and latest available crop-progress week for current supply/weather signals.';

NOTIFY pgrst, 'reload schema';
