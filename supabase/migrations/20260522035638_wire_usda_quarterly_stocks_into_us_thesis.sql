-- Wire USDA quarterly stocks into US thesis packets and freshness.
--
-- Quarterly stocks are measured NASS supply facts. They belong in the US packet
-- alongside WASDE so the app can display stocks-surprise drivers without relying
-- only on monthly balance-sheet estimates.

CREATE OR REPLACE FUNCTION public.get_thesis_data_freshness(
  p_grain text DEFAULT NULL,
  p_lane text DEFAULT NULL
)
RETURNS TABLE (
  source_name text,
  source_lane text,
  expected_cadence text,
  latest_period text,
  latest_period_end date,
  rows_available bigint,
  freshness_status text,
  thesis_use text,
  last_success_at timestamptz,
  last_run_status text,
  last_error text,
  action_hint text
)
LANGUAGE sql
STABLE
AS $$
  WITH source_snapshots AS (
    SELECT
      'cgc_observations'::text AS source_name,
      'canada'::text AS source_lane,
      'weekly Thu PM'::text AS expected_cadence,
      (
        SELECT crop_year || ' wk ' || grain_week
        FROM public.cgc_observations
        ORDER BY crop_year DESC, grain_week DESC
        LIMIT 1
      ) AS latest_period,
      (
        SELECT week_ending_date
        FROM public.cgc_observations
        ORDER BY crop_year DESC, grain_week DESC
        LIMIT 1
      ) AS latest_period_end,
      public.estimated_table_rows('public.cgc_observations'::regclass) AS rows_available,
      10::int AS strong_after_days,
      17::int AS stale_after_days,
      NULL::text AS forced_status,
      'supply / demand / logistics'::text AS thesis_use

    UNION ALL
    SELECT
      'cgc_imports',
      'system',
      'per CGC import',
      (
        SELECT crop_year || ' wk ' || grain_week
        FROM public.cgc_imports
        ORDER BY imported_at DESC
        LIMIT 1
      ),
      (
        SELECT imported_at::date
        FROM public.cgc_imports
        ORDER BY imported_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.cgc_imports'::regclass),
      10,
      17,
      NULL,
      'quality'

    UNION ALL
    SELECT
      'supply_disposition',
      'canada',
      'periodic AAFC / StatsCan refresh',
      (
        SELECT crop_year || ' / ' || source
        FROM public.supply_disposition
        ORDER BY crop_year DESC, created_at DESC
        LIMIT 1
      ),
      (
        SELECT created_at::date
        FROM public.supply_disposition
        ORDER BY crop_year DESC, created_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.supply_disposition'::regclass),
      120,
      210,
      NULL,
      'supply / demand'

    UNION ALL
    SELECT
      'grain_monitor_snapshots',
      'canada',
      'weekly Wed, naturally lagged',
      (
        SELECT crop_year || ' wk ' || grain_week
        FROM public.grain_monitor_snapshots
        ORDER BY crop_year DESC, grain_week DESC
        LIMIT 1
      ),
      (
        SELECT report_date
        FROM public.grain_monitor_snapshots
        ORDER BY crop_year DESC, grain_week DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.grain_monitor_snapshots'::regclass),
      10,
      17,
      NULL,
      'logistics'

    UNION ALL
    SELECT
      'producer_car_allocations',
      'canada',
      'weekly',
      (
        SELECT crop_year || ' wk ' || grain_week
        FROM public.producer_car_allocations
        ORDER BY crop_year DESC, grain_week DESC
        LIMIT 1
      ),
      (
        SELECT created_at::date
        FROM public.producer_car_allocations
        ORDER BY crop_year DESC, grain_week DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.producer_car_allocations'::regclass),
      10,
      17,
      NULL,
      'logistics'

    UNION ALL
    SELECT
      'usda_crop_progress',
      'us',
      'weekly Mon during growing season',
      (
        SELECT crop_year::text || ' / ' || week_ending::text
        FROM public.usda_crop_progress
        ORDER BY week_ending DESC
        LIMIT 1
      ),
      (
        SELECT week_ending
        FROM public.usda_crop_progress
        ORDER BY week_ending DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.usda_crop_progress'::regclass),
      8,
      15,
      NULL,
      'supply / weather'

    UNION ALL
    SELECT
      'usda_export_sales',
      'us',
      'weekly Thu AM',
      (
        SELECT market_year || ' / ' || week_ending::text
        FROM public.usda_export_sales
        ORDER BY week_ending DESC, imported_at DESC
        LIMIT 1
      ),
      (
        SELECT week_ending
        FROM public.usda_export_sales
        ORDER BY week_ending DESC, imported_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.usda_export_sales'::regclass),
      10,
      17,
      NULL,
      'demand'

    UNION ALL
    SELECT
      'usda_quarterly_stocks',
      'us',
      'quarterly Jan/Mar/Jun/Sep',
      (
        SELECT quarter || ' / ' || report_date::text
        FROM public.usda_quarterly_stocks
        ORDER BY report_date DESC, imported_at DESC
        LIMIT 1
      ),
      (
        SELECT report_date
        FROM public.usda_quarterly_stocks
        ORDER BY report_date DESC, imported_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.usda_quarterly_stocks'::regclass),
      100,
      125,
      NULL,
      'measured stocks / supply surprise'

    UNION ALL
    SELECT
      'usda_wasde_raw',
      'international',
      'monthly WASDE / PSD',
      (
        SELECT crop_year || ' / ' || calendar_year || '-' || lpad(month::text, 2, '0')
        FROM public.usda_wasde_raw
        ORDER BY calendar_year DESC, month DESC
        LIMIT 1
      ),
      (
        SELECT make_date(calendar_year, month, 1)
        FROM public.usda_wasde_raw
        ORDER BY calendar_year DESC, month DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.usda_wasde_raw'::regclass),
      45,
      75,
      NULL,
      'supply / demand / international context'

    UNION ALL
    SELECT
      'usda_wasde_mapped',
      'international',
      'monthly WASDE / PSD',
      (
        SELECT crop_year || ' / ' || market_year || ' / ' || report_month::text
        FROM public.usda_wasde_mapped
        ORDER BY report_month DESC
        LIMIT 1
      ),
      (
        SELECT report_month
        FROM public.usda_wasde_mapped
        ORDER BY report_month DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.usda_wasde_mapped'::regclass),
      45,
      75,
      NULL,
      'supply / demand / international context'

    UNION ALL
    SELECT
      'cftc_cot_positions',
      'cross_border',
      'weekly Fri PM',
      (
        SELECT crop_year || ' wk ' || grain_week || ' / ' || report_date::text
        FROM public.cftc_cot_positions
        ORDER BY report_date DESC, imported_at DESC
        LIMIT 1
      ),
      (
        SELECT report_date
        FROM public.cftc_cot_positions
        ORDER BY report_date DESC, imported_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.cftc_cot_positions'::regclass),
      10,
      17,
      NULL,
      'positioning'

    UNION ALL
    SELECT
      'grain_prices',
      'cross_border',
      'daily market days',
      (
        SELECT price_date::text || ' / ' || grain || ' / ' || contract
        FROM public.grain_prices
        ORDER BY price_date DESC, imported_at DESC
        LIMIT 1
      ),
      (
        SELECT price_date
        FROM public.grain_prices
        ORDER BY price_date DESC, imported_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.grain_prices'::regclass),
      3,
      7,
      NULL,
      'price'

    UNION ALL
    SELECT
      'crop_plans',
      'farmer_local',
      'user-entered',
      (
        SELECT crop_year || ' / ' || grain
        FROM public.crop_plans
        ORDER BY coalesce(updated_at, created_at) DESC
        LIMIT 1
      ),
      (
        SELECT coalesce(updated_at, created_at)::date
        FROM public.crop_plans
        ORDER BY coalesce(updated_at, created_at) DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.crop_plans'::regclass),
      30,
      90,
      NULL,
      'farmer behavior'

    UNION ALL
    SELECT
      'crop_plan_deliveries',
      'farmer_local',
      'user-entered',
      (
        SELECT crop_year || ' / ' || grain || ' / ' || delivery_date::text
        FROM public.crop_plan_deliveries
        ORDER BY delivery_date DESC NULLS LAST, created_at DESC
        LIMIT 1
      ),
      (
        SELECT coalesce(delivery_date, created_at::date)
        FROM public.crop_plan_deliveries
        ORDER BY delivery_date DESC NULLS LAST, created_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.crop_plan_deliveries'::regclass),
      30,
      90,
      NULL,
      'farmer behavior'

    UNION ALL
    SELECT
      'posted_prices',
      'farmer_local',
      'operator-entered',
      (
        SELECT grain || ' / ' || facility_name || ' / ' || posted_at::date::text
        FROM public.posted_prices
        ORDER BY posted_at DESC
        LIMIT 1
      ),
      (
        SELECT posted_at::date
        FROM public.posted_prices
        ORDER BY posted_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.posted_prices'::regclass),
      7,
      14,
      NULL,
      'price'

    UNION ALL
    SELECT
      'weather_cache',
      'farmer_local',
      'cached forecast',
      (
        SELECT country || ' / ' || postal_or_zip || ' / expires ' || expires_at::text
        FROM public.weather_cache
        ORDER BY fetched_at DESC
        LIMIT 1
      ),
      (
        SELECT fetched_at::date
        FROM public.weather_cache
        ORDER BY fetched_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.weather_cache'::regclass),
      1,
      3,
      NULL,
      'weather'

    UNION ALL
    SELECT
      'market_analysis',
      'analysis',
      'weekly thesis anchor',
      (
        SELECT crop_year || ' wk ' || grain_week
        FROM public.market_analysis
        ORDER BY crop_year DESC, grain_week DESC, generated_at DESC
        LIMIT 1
      ),
      (
        SELECT generated_at::date
        FROM public.market_analysis
        ORDER BY crop_year DESC, grain_week DESC, generated_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.market_analysis'::regclass),
      7,
      14,
      NULL,
      'AI interpretation'

    UNION ALL
    SELECT
      'us_market_analysis',
      'analysis',
      'weekly thesis anchor',
      (
        SELECT crop_year || ' / market_year ' || market_year
        FROM public.us_market_analysis
        ORDER BY generated_at DESC
        LIMIT 1
      ),
      (
        SELECT generated_at::date
        FROM public.us_market_analysis
        ORDER BY generated_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.us_market_analysis'::regclass),
      7,
      14,
      'legacy',
      'AI interpretation'

    UNION ALL
    SELECT
      'x_market_signals',
      'analysis',
      'future data input only',
      (
        SELECT crop_year || ' wk ' || grain_week
        FROM public.x_market_signals
        ORDER BY searched_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ),
      (
        SELECT coalesce(searched_at, created_at)::date
        FROM public.x_market_signals
        ORDER BY searched_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.x_market_signals'::regclass),
      7,
      21,
      'legacy',
      'social'
  ),
  latest_runs AS (
    SELECT DISTINCT ON (source_name)
      source_name,
      status AS last_run_status,
      finished_at AS last_run_finished_at,
      error_message AS last_error
    FROM public.source_runs
    ORDER BY source_name, finished_at DESC NULLS LAST, started_at DESC
  ),
  last_success AS (
    SELECT DISTINCT ON (source_name)
      source_name,
      finished_at AS last_success_at
    FROM public.source_runs
    WHERE status IN ('success', 'partial', 'skipped')
    ORDER BY source_name, finished_at DESC NULLS LAST, started_at DESC
  ),
  source_status AS (
    SELECT
      s.source_name,
      s.source_lane,
      s.expected_cadence,
      s.latest_period,
      s.latest_period_end,
      s.rows_available,
      CASE
        WHEN s.forced_status IS NOT NULL THEN s.forced_status
        WHEN s.rows_available = 0 THEN 'empty'
        WHEN r.last_run_status = 'failed'
          AND (ls.last_success_at IS NULL OR r.last_run_finished_at >= ls.last_success_at)
          THEN 'broken'
        WHEN (current_date - coalesce(s.latest_period_end, current_date)) <= s.strong_after_days
          THEN 'strong'
        WHEN (current_date - coalesce(s.latest_period_end, current_date)) <= s.stale_after_days
          THEN 'usable but stale-risk'
        ELSE 'usable but stale-risk'
      END AS freshness_status,
      s.thesis_use,
      ls.last_success_at,
      r.last_run_status,
      r.last_error,
      CASE
        WHEN s.forced_status = 'legacy' THEN 'Do not use for live source truth.'
        WHEN s.rows_available = 0 THEN 'Build or seed this source before thesis use.'
        WHEN r.last_run_status = 'failed' THEN 'Inspect source_runs.last_error and rerun collector.'
        WHEN (current_date - coalesce(s.latest_period_end, current_date)) > s.strong_after_days THEN 'Refresh or explicitly accept stale-risk before thesis generation.'
        ELSE 'No immediate action.'
      END AS action_hint
    FROM source_snapshots s
    LEFT JOIN latest_runs r USING (source_name)
    LEFT JOIN last_success ls USING (source_name)
  )
  SELECT
    f.source_name,
    f.source_lane,
    f.expected_cadence,
    f.latest_period,
    f.latest_period_end,
    f.rows_available,
    f.freshness_status,
    f.thesis_use,
    f.last_success_at,
    f.last_run_status,
    f.last_error,
    f.action_hint
  FROM source_status f
  WHERE (p_lane IS NULL OR f.source_lane = p_lane)
    AND (
      p_grain IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.grain_market_mappings m
        WHERE m.active
          AND lower(m.canonical_grain) = lower(p_grain)
          AND m.source_name = f.source_name
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.grain_market_mappings m2
        WHERE m2.active
          AND m2.source_name = f.source_name
      )
    )
  ORDER BY
    CASE f.freshness_status
      WHEN 'broken' THEN 1
      WHEN 'empty' THEN 2
      WHEN 'legacy' THEN 3
      WHEN 'usable but stale-risk' THEN 4
      ELSE 5
    END,
    f.source_lane,
    f.source_name;
$$;

GRANT EXECUTE ON FUNCTION public.estimated_table_rows(regclass) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_thesis_data_freshness(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.estimated_table_rows(regclass) IS
  'Fast row-count estimate from pg_class.reltuples for source freshness badges. Use exact source queries for financial or market numbers.';

COMMENT ON FUNCTION public.get_thesis_data_freshness(text, text) IS
  'Fast source freshness summary for an optional canonical grain and lane, including USDA quarterly stocks. Uses latest-row lookups plus estimated row counts so PostgREST calls do not time out.';

NOTIFY pgrst, 'reload schema';


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
    'international_context', jsonb_build_object('scope', 'bounded_v1', 'sources', jsonb_build_array('usda_wasde_mapped', 'usda_quarterly_stocks')),
    'freshness', coalesce((SELECT payload FROM freshness), '[]'::jsonb),
    'quality_warnings', coalesce((SELECT payload FROM quality_warnings), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_us_thesis_packet(text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.get_us_thesis_packet(text, integer) IS
  'Facts-only US source packet for a market/market_year. Includes WASDE/export context, latest crop-progress week, and latest USDA quarterly stocks for measured stocks-surprise signals.';

NOTIFY pgrst, 'reload schema';
