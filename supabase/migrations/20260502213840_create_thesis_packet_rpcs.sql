-- Data Layer Foundation V1: facts-only thesis packet RPCs.
--
-- These functions build structured source packets for the future thesis writer.
-- They must not write analysis prose or recommendations.

CREATE OR REPLACE FUNCTION public.get_canada_thesis_packet(
  p_grain text,
  p_crop_year text DEFAULT '2025-2026',
  p_grain_week integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH target AS (
    SELECT coalesce(
      p_grain_week,
      (
        SELECT max(grain_week)
        FROM public.cgc_observations
        WHERE crop_year = p_crop_year
      )
    ) AS grain_week
  ),
  current_delivery AS (
    SELECT to_jsonb(v.*) AS payload
    FROM public.v_country_producer_deliveries v, target t
    WHERE v.crop_year = p_crop_year
      AND v.grain_week = t.grain_week
      AND lower(v.grain) = lower(p_grain)
      AND v.period = 'Current Week'
    LIMIT 1
  ),
  crop_year_delivery AS (
    SELECT to_jsonb(v.*) AS payload
    FROM public.v_country_producer_deliveries v, target t
    WHERE v.crop_year = p_crop_year
      AND v.grain_week = t.grain_week
      AND lower(v.grain) = lower(p_grain)
      AND v.period = 'Crop Year'
    LIMIT 1
  ),
  supply AS (
    SELECT to_jsonb(s.*) AS payload
    FROM public.v_supply_disposition_current s
    WHERE s.grain_slug = lower(replace(p_grain, ' ', '-'))
    ORDER BY s.created_at DESC
    LIMIT 1
  ),
  overview AS (
    SELECT to_jsonb(o.*) AS payload
    FROM public.v_grain_overview o
    WHERE lower(o.grain) = lower(p_grain)
    LIMIT 1
  ),
  cgc_exports AS (
    SELECT jsonb_build_object(
      'current_week_kt', sum(ktonnes) FILTER (WHERE period = 'Current Week'),
      'crop_year_kt', sum(ktonnes) FILTER (WHERE period = 'Crop Year')
    ) AS payload
    FROM public.cgc_observations c, target t
    WHERE c.crop_year = p_crop_year
      AND c.grain_week = t.grain_week
      AND lower(c.grain) = lower(p_grain)
      AND c.worksheet IN ('Terminal Exports', 'Terminal Disposition', 'Producer Cars')
      AND c.metric IN ('Exports', 'Export Destinations', 'Shipment Destinations')
  ),
  logistics AS (
    SELECT jsonb_build_object(
      'grain_monitor',
        (
          SELECT to_jsonb(gm.*)
          FROM public.grain_monitor_snapshots gm, target t
          WHERE gm.crop_year = p_crop_year
            AND gm.grain_week <= t.grain_week
          ORDER BY gm.grain_week DESC, gm.report_date DESC
          LIMIT 1
        ),
      'producer_cars',
        coalesce(
          (
            SELECT jsonb_agg(to_jsonb(pc.*) ORDER BY pc.grain_week DESC)
            FROM (
              SELECT pc.*
              FROM public.producer_car_allocations pc, target t
              WHERE pc.crop_year = p_crop_year
                AND lower(pc.grain) = lower(p_grain)
                AND pc.grain_week >= greatest(t.grain_week - 2, 1)
              ORDER BY pc.grain_week DESC
              LIMIT 6
            ) pc
          ),
          '[]'::jsonb
        )
    ) AS payload
  ),
  prices AS (
    SELECT coalesce(jsonb_agg(to_jsonb(p.*) ORDER BY p.price_date DESC, p.imported_at DESC), '[]'::jsonb) AS payload
    FROM (
      SELECT *
      FROM public.grain_prices gp
      WHERE lower(gp.grain) = lower(p_grain)
         OR (lower(p_grain) = 'wheat' AND gp.grain IN ('Wheat', 'HRW Wheat', 'Spring Wheat'))
         OR (lower(p_grain) = 'canola' AND gp.grain IN ('Canola', 'Soybean Oil', 'Soybean Meal'))
      ORDER BY gp.price_date DESC, gp.imported_at DESC
      LIMIT 12
    ) p
  ),
  positioning AS (
    SELECT coalesce(jsonb_agg(to_jsonb(c.*) ORDER BY c.report_date DESC), '[]'::jsonb) AS payload
    FROM (
      SELECT *
      FROM public.cftc_cot_positions c
      WHERE lower(c.cgc_grain) = lower(p_grain)
      ORDER BY c.report_date DESC
      LIMIT 12
    ) c
  ),
  farmer_behavior AS (
    SELECT jsonb_build_object(
      'crop_plan_count', count(*),
      'user_count', count(DISTINCT user_id),
      'starting_grain_kt', sum(starting_grain_kt),
      'remaining_grain_kt', sum(volume_left_to_sell_kt),
      'contracted_kt', sum(contracted_kt),
      'uncontracted_kt', sum(uncontracted_kt)
    ) AS payload
    FROM public.crop_plans
    WHERE crop_year = p_crop_year
      AND lower(grain) = lower(p_grain)
  ),
  freshness AS (
    SELECT coalesce(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb) AS payload
    FROM public.get_thesis_data_freshness(p_grain, NULL) f
    WHERE f.source_lane IN ('canada', 'cross_border', 'farmer_local', 'international')
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
    FROM public.get_thesis_data_freshness(p_grain, NULL) f
    WHERE f.source_lane IN ('canada', 'cross_border', 'farmer_local', 'international')
  )
  SELECT jsonb_build_object(
    'lane', 'canada',
    'grain', p_grain,
    'crop_year', p_crop_year,
    'grain_week', (SELECT grain_week FROM target),
    'packet_generated_at', now(),
    'supply', coalesce((SELECT payload FROM supply), '{}'::jsonb),
    'demand', jsonb_build_object(
      'producer_deliveries_current_week', coalesce((SELECT payload FROM current_delivery), '{}'::jsonb),
      'producer_deliveries_crop_year', coalesce((SELECT payload FROM crop_year_delivery), '{}'::jsonb),
      'exports', coalesce((SELECT payload FROM cgc_exports), '{}'::jsonb)
    ),
    'logistics', coalesce((SELECT payload FROM logistics), '{}'::jsonb),
    'prices', coalesce((SELECT payload FROM prices), '[]'::jsonb),
    'positioning', coalesce((SELECT payload FROM positioning), '[]'::jsonb),
    'farmer_behavior', coalesce((SELECT payload FROM farmer_behavior), '{}'::jsonb),
    'overview_metrics', coalesce((SELECT payload FROM overview), '{}'::jsonb),
    'weather', jsonb_build_object('status', 'empty', 'source_table', 'weather_cache'),
    'international_context', jsonb_build_object('scope', 'bounded_v1', 'sources', jsonb_build_array('usda_wasde_mapped', 'grain_prices', 'cftc_cot_positions')),
    'freshness', coalesce((SELECT payload FROM freshness), '[]'::jsonb),
    'quality_warnings', coalesce((SELECT payload FROM quality_warnings), '[]'::jsonb)
  );
$$;

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
      AND u.crop_year = p_market_year
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

GRANT EXECUTE ON FUNCTION public.get_canada_thesis_packet(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_us_thesis_packet(text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.get_canada_thesis_packet(text, text, integer) IS
  'Facts-only Canada source packet for a grain/crop_year/grain_week. Separates source facts from AI interpretation.';

COMMENT ON FUNCTION public.get_us_thesis_packet(text, integer) IS
  'Facts-only US source packet for a market/market_year. Separates source facts from AI interpretation.';

NOTIFY pgrst, 'reload schema';
