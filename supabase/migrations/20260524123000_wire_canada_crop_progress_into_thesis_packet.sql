-- Wire Canada provincial crop progress into Canada thesis packets and source freshness.

-- Prefer the packet crop year when selecting supply-disposition facts.
--
-- The deterministic Canola read now stores the 2025-2026 Canola crop-size
-- baseline, but the packet RPC previously ordered supply rows by created_at
-- only. That allowed an older crop-year balance sheet to win even when the
-- requested crop year was present.

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
    ORDER BY
      CASE WHEN s.crop_year = p_crop_year THEN 0 ELSE 1 END,
      s.crop_year DESC,
      s.created_at DESC
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
  canada_crop_progress AS (
    SELECT coalesce(jsonb_agg(to_jsonb(cp.*) ORDER BY cp.report_date DESC, cp.province_code), '[]'::jsonb) AS payload
    FROM (
      SELECT *
      FROM public.v_canada_crop_progress_latest cp
      WHERE cp.crop_year = NULLIF(split_part(p_crop_year, '-', 2), '')::smallint
        AND cp.metric = 'seeded_pct'
        AND (
          lower(cp.canonical_grain) = lower(p_grain)
          OR (lower(p_grain) = 'amber durum' AND lower(cp.canonical_grain) = 'durum')
        )
        AND cp.region_scope = 'province'
      ORDER BY cp.report_date DESC, cp.province_code
      LIMIT 6
    ) cp
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
    'supply', coalesce((SELECT payload FROM supply), '{}'::jsonb) || jsonb_build_object(
      'canada_crop_progress', coalesce((SELECT payload FROM canada_crop_progress), '[]'::jsonb)
    ),
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

GRANT EXECUTE ON FUNCTION public.get_canada_thesis_packet(text, text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.get_canada_thesis_packet(text, text, integer) IS
  'Facts-only Canada source packet for a grain/crop_year/grain_week. Separates source facts from AI interpretation. Supply rows prefer the requested packet crop year and include latest province-level Canada crop-progress rows where directly mapped.';

NOTIFY pgrst, 'reload schema';


-- Add USDA/NASS acreage to thesis freshness alongside the acreage payload already
-- emitted by get_us_thesis_packet(). The long cadence reflects annual acreage
-- reports plus Jan final survey revisions, so current marketing-year acreage stays usable.

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
      'canada_crop_progress',
      'canada',
      'weekly during growing season',
      (
        SELECT crop_year::text || ' / ' || report_date::text
        FROM public.canada_crop_progress
        ORDER BY report_date DESC, updated_at DESC
        LIMIT 1
      ),
      (
        SELECT report_date
        FROM public.canada_crop_progress
        ORDER BY report_date DESC, updated_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.canada_crop_progress'::regclass),
      10,
      17,
      NULL,
      'supply / crop progress'

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
      'crop_acreage_estimates',
      'us',
      'annual NASS acreage Jun/Jan revisions',
      (
        SELECT market_year || ' / ' || source_release_date::text
        FROM public.crop_acreage_estimates
        ORDER BY source_release_date DESC, imported_at DESC
        LIMIT 1
      ),
      (
        SELECT source_release_date
        FROM public.crop_acreage_estimates
        ORDER BY source_release_date DESC, imported_at DESC
        LIMIT 1
      ),
      public.estimated_table_rows('public.crop_acreage_estimates'::regclass),
      365,
      455,
      NULL,
      'planted acreage / supply base'

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
  'Fast source freshness summary for an optional canonical grain and lane, including Canada crop progress, USDA quarterly stocks, and acreage. Uses latest-row lookups plus estimated row counts so PostgREST calls do not time out.';

NOTIFY pgrst, 'reload schema';
