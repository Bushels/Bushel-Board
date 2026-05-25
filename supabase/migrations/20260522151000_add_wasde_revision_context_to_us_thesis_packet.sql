-- Add month-over-month WASDE revision deltas to US thesis packets.
-- The app converts these fields into deterministic farmer-readable bull/bear drivers
-- such as ending-stocks cuts/raises and export/crush projection revisions.

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
    SELECT jsonb_strip_nulls(
      to_jsonb(w.*) ||
      jsonb_build_object(
        'previous_report_month', previous.report_month,
        'ending_stocks_change_kt', w.ending_stocks_kt - previous.ending_stocks_kt,
        'stocks_to_use_change_pct', w.stocks_to_use_pct - previous.stocks_to_use_pct,
        'exports_change_kt', w.exports_kt - previous.exports_kt,
        'domestic_consumption_change_kt', w.domestic_consumption_kt - previous.domestic_consumption_kt,
        'crush_change_kt', w.crush_kt - previous.crush_kt,
        'production_change_kt', w.production_kt - previous.production_kt
      )
    ) AS payload
    FROM public.usda_wasde_mapped w
    CROSS JOIN market m
    LEFT JOIN LATERAL (
      SELECT p.*
      FROM public.usda_wasde_mapped p
      WHERE lower(p.market_name) = lower(w.market_name)
        AND p.market_year = w.market_year
        AND p.country_code = w.country_code
        AND p.report_month < w.report_month
      ORDER BY p.report_month DESC
      LIMIT 1
    ) previous ON true
    WHERE lower(w.market_name) = lower(m.market_name)
      AND w.market_year = p_market_year::text
      AND w.country_code = 'US'
    ORDER BY w.report_month DESC
    LIMIT 1
  ),
  quarterly_stocks AS (
    SELECT to_jsonb(q.*) AS payload
    FROM public.usda_quarterly_stocks q, market m
    WHERE lower(q.commodity) = lower(m.commodity)
       OR lower(q.cgc_grain) = lower(m.market_name)
       OR (lower(m.market_name) = 'wheat' AND q.commodity = 'WHEAT')
       OR (lower(m.market_name) = 'soybeans' AND q.commodity = 'SOYBEANS')
       OR (lower(m.market_name) = 'corn' AND q.commodity = 'CORN')
       OR (lower(m.market_name) = 'barley' AND q.commodity = 'BARLEY')
       OR (lower(m.market_name) = 'oats' AND q.commodity = 'OATS')
    ORDER BY q.report_date DESC, q.imported_at DESC
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
      'quarterly_stocks', coalesce((SELECT payload FROM quarterly_stocks), '{}'::jsonb),
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
    'international_context', jsonb_build_object('scope', 'bounded_v1', 'sources', jsonb_build_array('usda_wasde_mapped', 'usda_quarterly_stocks'), 'wasde_revision_fields', jsonb_build_array('ending_stocks_change_kt', 'exports_change_kt', 'domestic_consumption_change_kt', 'crush_change_kt')),
    'freshness', coalesce((SELECT payload FROM freshness), '[]'::jsonb),
    'quality_warnings', coalesce((SELECT payload FROM quality_warnings), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_us_thesis_packet(text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.get_us_thesis_packet(text, integer) IS
  'Facts-only US source packet for a market/market_year. Includes WASDE/export context with month-over-month revision deltas, latest crop-progress week, acreage, and latest USDA quarterly stocks for measured stocks-surprise signals.';


NOTIFY pgrst, 'reload schema';
