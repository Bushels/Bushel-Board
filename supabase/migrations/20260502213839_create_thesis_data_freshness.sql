-- Data Layer Foundation V1: source freshness view + RPC.
--
-- v_source_freshness summarizes the actual source tables, then overlays the
-- new source_runs ledger when available. This means it works immediately after
-- migration, before every importer has been patched.

CREATE OR REPLACE VIEW public.v_source_freshness
WITH (security_invoker = true)
AS
WITH source_snapshots AS (
  SELECT
    'cgc_observations'::text AS source_name,
    'canada'::text AS source_lane,
    'import-cgc-weekly-codex'::text AS collector_name,
    'weekly Thu PM'::text AS expected_cadence,
    (SELECT crop_year || ' wk ' || grain_week FROM public.cgc_observations ORDER BY week_ending_date DESC, grain_week DESC LIMIT 1) AS latest_period,
    max(week_ending_date) AS latest_period_end,
    max(created_at) AS latest_ingested_at,
    count(*)::bigint AS rows_available,
    10::int AS strong_after_days,
    17::int AS stale_after_days,
    NULL::text AS forced_status,
    'supply / demand / logistics'::text AS thesis_use
  FROM public.cgc_observations

  UNION ALL
  SELECT
    'cgc_imports',
    'system',
    'import-cgc-weekly-codex',
    'per CGC import',
    (SELECT crop_year || ' wk ' || grain_week FROM public.cgc_imports ORDER BY imported_at DESC LIMIT 1),
    max(imported_at)::date,
    max(imported_at),
    count(*)::bigint,
    10,
    17,
    NULL,
    'quality'
  FROM public.cgc_imports

  UNION ALL
  SELECT
    'supply_disposition',
    'canada',
    'seed-supply-disposition',
    'periodic AAFC / StatsCan refresh',
    (SELECT crop_year || ' / ' || source FROM public.supply_disposition ORDER BY created_at DESC, crop_year DESC LIMIT 1),
    max(created_at)::date,
    max(created_at),
    count(*)::bigint,
    120,
    210,
    NULL,
    'supply / demand'
  FROM public.supply_disposition

  UNION ALL
  SELECT
    'grain_monitor_snapshots',
    'canada',
    'import-grain-monitor-weekly',
    'weekly Wed, naturally lagged',
    (SELECT crop_year || ' wk ' || grain_week FROM public.grain_monitor_snapshots ORDER BY report_date DESC, grain_week DESC LIMIT 1),
    max(report_date),
    max(created_at),
    count(*)::bigint,
    10,
    17,
    NULL,
    'logistics'
  FROM public.grain_monitor_snapshots

  UNION ALL
  SELECT
    'producer_car_allocations',
    'canada',
    'import-producer-cars',
    'weekly',
    (SELECT crop_year || ' wk ' || grain_week FROM public.producer_car_allocations ORDER BY grain_week DESC, created_at DESC LIMIT 1),
    max(created_at)::date,
    max(created_at),
    count(*)::bigint,
    10,
    17,
    NULL,
    'logistics'
  FROM public.producer_car_allocations

  UNION ALL
  SELECT
    'usda_crop_progress',
    'us',
    'import-usda-crop-progress',
    'weekly Mon during growing season',
    (SELECT crop_year::text || ' / ' || week_ending::text FROM public.usda_crop_progress ORDER BY week_ending DESC LIMIT 1),
    max(week_ending),
    max(imported_at),
    count(*)::bigint,
    8,
    15,
    NULL,
    'supply / weather'
  FROM public.usda_crop_progress

  UNION ALL
  SELECT
    'usda_export_sales',
    'us',
    'import-usda-export-sales',
    'weekly Thu AM',
    (SELECT market_year || ' / ' || week_ending::text FROM public.usda_export_sales ORDER BY week_ending DESC LIMIT 1),
    max(week_ending),
    max(imported_at),
    count(*)::bigint,
    10,
    17,
    NULL,
    'demand'
  FROM public.usda_export_sales

  UNION ALL
  SELECT
    'usda_wasde_raw',
    'international',
    'import-usda-wasde',
    'monthly WASDE / PSD',
    (SELECT crop_year || ' / ' || calendar_year || '-' || lpad(month::text, 2, '0') FROM public.usda_wasde_raw ORDER BY calendar_year DESC, month DESC LIMIT 1),
    (SELECT make_date(calendar_year, month, 1) FROM public.usda_wasde_raw ORDER BY calendar_year DESC, month DESC LIMIT 1),
    max(imported_at),
    count(*)::bigint,
    45,
    75,
    NULL,
    'supply / demand / international context'
  FROM public.usda_wasde_raw

  UNION ALL
  SELECT
    'usda_wasde_mapped',
    'international',
    'import-usda-wasde',
    'monthly WASDE / PSD',
    (SELECT crop_year || ' / ' || market_year || ' / ' || report_month::text FROM public.usda_wasde_mapped ORDER BY report_month DESC LIMIT 1),
    max(report_month),
    max(imported_at),
    count(*)::bigint,
    45,
    75,
    NULL,
    'supply / demand / international context'
  FROM public.usda_wasde_mapped

  UNION ALL
  SELECT
    'cftc_cot_positions',
    'cross_border',
    'collect-cftc-cot',
    'weekly Fri PM',
    (SELECT crop_year || ' wk ' || grain_week || ' / ' || report_date::text FROM public.cftc_cot_positions ORDER BY report_date DESC LIMIT 1),
    max(report_date),
    max(imported_at),
    count(*)::bigint,
    10,
    17,
    NULL,
    'positioning'
  FROM public.cftc_cot_positions

  UNION ALL
  SELECT
    'grain_prices',
    'cross_border',
    'import-grain-prices',
    'daily market days',
    (SELECT price_date::text || ' / ' || grain || ' / ' || contract FROM public.grain_prices ORDER BY price_date DESC, imported_at DESC LIMIT 1),
    max(price_date),
    max(imported_at),
    count(*)::bigint,
    3,
    7,
    NULL,
    'price'
  FROM public.grain_prices

  UNION ALL
  SELECT
    'crop_plans',
    'farmer_local',
    'user_input',
    'user-entered',
    (SELECT crop_year || ' / ' || grain FROM public.crop_plans ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1),
    max(updated_at)::date,
    max(updated_at),
    count(*)::bigint,
    30,
    90,
    NULL,
    'farmer behavior'
  FROM public.crop_plans

  UNION ALL
  SELECT
    'crop_plan_deliveries',
    'farmer_local',
    'user_input',
    'user-entered',
    (SELECT crop_year || ' / ' || grain || ' / ' || delivery_date::text FROM public.crop_plan_deliveries ORDER BY delivery_date DESC NULLS LAST, created_at DESC LIMIT 1),
    max(delivery_date),
    max(created_at),
    count(*)::bigint,
    30,
    90,
    NULL,
    'farmer behavior'
  FROM public.crop_plan_deliveries

  UNION ALL
  SELECT
    'posted_prices',
    'farmer_local',
    'operator_input',
    'operator-entered',
    (SELECT grain || ' / ' || facility_name || ' / ' || posted_at::date::text FROM public.posted_prices ORDER BY posted_at DESC LIMIT 1),
    max(posted_at)::date,
    max(posted_at),
    count(*)::bigint,
    7,
    14,
    NULL,
    'price'
  FROM public.posted_prices

  UNION ALL
  SELECT
    'weather_cache',
    'farmer_local',
    'weather-cache',
    'cached forecast',
    (SELECT country || ' / ' || postal_or_zip || ' / expires ' || expires_at::text FROM public.weather_cache ORDER BY fetched_at DESC LIMIT 1),
    max(fetched_at)::date,
    max(fetched_at),
    count(*)::bigint,
    1,
    3,
    NULL,
    'weather'
  FROM public.weather_cache

  UNION ALL
  SELECT
    'market_analysis',
    'analysis',
    'claude-agent-desk',
    'weekly thesis anchor',
    (SELECT crop_year || ' wk ' || grain_week FROM public.market_analysis ORDER BY grain_week DESC, generated_at DESC LIMIT 1),
    max(generated_at)::date,
    max(generated_at),
    count(*)::bigint,
    7,
    14,
    NULL,
    'AI interpretation'
  FROM public.market_analysis

  UNION ALL
  SELECT
    'us_market_analysis',
    'analysis',
    'us-desk',
    'weekly thesis anchor',
    (SELECT crop_year || ' / market_year ' || market_year FROM public.us_market_analysis ORDER BY generated_at DESC LIMIT 1),
    max(generated_at)::date,
    max(generated_at),
    count(*)::bigint,
    7,
    14,
    'legacy',
    'AI interpretation'
  FROM public.us_market_analysis

  UNION ALL
  SELECT
    'x_market_signals',
    'analysis',
    'x-api-v2-future',
    'future data input only',
    (SELECT crop_year || ' wk ' || grain_week FROM public.x_market_signals ORDER BY coalesce(post_date, searched_at, created_at) DESC LIMIT 1),
    max(coalesce(post_date, searched_at, created_at))::date,
    max(coalesce(searched_at, created_at)),
    count(*)::bigint,
    7,
    21,
    'legacy',
    'social'
  FROM public.x_market_signals
),
latest_runs AS (
  SELECT DISTINCT ON (source_name)
    source_name,
    status AS last_run_status,
    finished_at AS last_run_finished_at,
    error_message AS last_error,
    rows_inserted,
    rows_updated,
    rows_skipped
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
)
SELECT
  s.source_name,
  s.source_lane,
  s.collector_name,
  s.expected_cadence,
  s.latest_period,
  s.latest_period_end,
  s.latest_ingested_at,
  s.rows_available,
  CASE
    WHEN s.forced_status IS NOT NULL THEN s.forced_status
    WHEN s.rows_available = 0 THEN 'empty'
    WHEN r.last_run_status = 'failed'
      AND (ls.last_success_at IS NULL OR r.last_run_finished_at >= ls.last_success_at)
      THEN 'broken'
    WHEN (current_date - coalesce(s.latest_period_end, s.latest_ingested_at::date)) <= s.strong_after_days
      THEN 'strong'
    WHEN (current_date - coalesce(s.latest_period_end, s.latest_ingested_at::date)) <= s.stale_after_days
      THEN 'usable but stale-risk'
    ELSE 'usable but stale-risk'
  END AS freshness_status,
  s.thesis_use,
  ls.last_success_at,
  r.last_run_status,
  r.last_run_finished_at,
  r.last_error,
  CASE
    WHEN s.forced_status = 'legacy' THEN 'Do not use for live source truth.'
    WHEN s.rows_available = 0 THEN 'Build or seed this source before thesis use.'
    WHEN r.last_run_status = 'failed' THEN 'Inspect source_runs.last_error and rerun collector.'
    WHEN (current_date - coalesce(s.latest_period_end, s.latest_ingested_at::date)) > s.strong_after_days THEN 'Refresh or explicitly accept stale-risk before thesis generation.'
    ELSE 'No immediate action.'
  END AS action_hint
FROM source_snapshots s
LEFT JOIN latest_runs r USING (source_name)
LEFT JOIN last_success ls USING (source_name);

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
  FROM public.v_source_freshness f
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

GRANT SELECT ON public.v_source_freshness TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_thesis_data_freshness(text, text) TO anon, authenticated;

COMMENT ON VIEW public.v_source_freshness IS
  'Source-table freshness summary overlaid with source_runs when available. Used by thesis packet RPCs and future UI badges.';

COMMENT ON FUNCTION public.get_thesis_data_freshness(text, text) IS
  'Returns source freshness for an optional canonical grain and lane. p_grain filters mapped source tables but keeps unmapped global sources.';

NOTIFY pgrst, 'reload schema';
