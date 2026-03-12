-- =============================================================================
-- Reconcile crop year cleanup and community stats with the live project state
-- =============================================================================
-- Goals:
-- 1. Finish long-format crop_year migration for remaining tables.
-- 2. Replace stale community stats SQL with current-year farmer plan totals.
-- 3. Remove the stale short-format default from calculate_delivery_percentiles().

CREATE OR REPLACE FUNCTION public._migrate_crop_year_cleanup(p_crop_year text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_crop_year ~ '^\d{4}-\d{4}$' THEN p_crop_year
    WHEN p_crop_year ~ '^\d{4}-\d{2}$'
      THEN split_part(p_crop_year, '-', 1) || '-' || (split_part(p_crop_year, '-', 1)::int + 1)::text
    ELSE p_crop_year
  END;
$$;

UPDATE public.grain_intelligence
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.x_market_signals
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.farm_summaries
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.crop_plans
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.grain_sentiment_votes
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.signal_feedback
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.supply_disposition
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.market_analysis
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.cgc_imports
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

UPDATE public.validation_reports
SET crop_year = public._migrate_crop_year_cleanup(crop_year)
WHERE crop_year ~ '^\d{4}-\d{2}$';

INSERT INTO public.macro_estimates (
  crop_year,
  grain,
  production_kt,
  carry_over_kt,
  created_at,
  updated_at
)
SELECT
  public._migrate_crop_year_cleanup(crop_year),
  grain,
  production_kt,
  carry_over_kt,
  created_at,
  updated_at
FROM public.macro_estimates
WHERE crop_year ~ '^\d{4}-\d{2}$'
ON CONFLICT (crop_year, grain) DO UPDATE
SET production_kt = EXCLUDED.production_kt,
    carry_over_kt = EXCLUDED.carry_over_kt,
    updated_at = GREATEST(public.macro_estimates.updated_at, EXCLUDED.updated_at);

DELETE FROM public.macro_estimates
WHERE crop_year ~ '^\d{4}-\d{2}$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'signal_scan_log'
      AND column_name = 'crop_year'
  ) THEN
    EXECUTE $sql$
      UPDATE public.signal_scan_log
      SET crop_year = public._migrate_crop_year_cleanup(crop_year)
      WHERE crop_year ~ '^\d{4}-\d{2}$'
    $sql$;
  END IF;
END
$$;

DROP FUNCTION public._migrate_crop_year_cleanup(text);

DROP FUNCTION IF EXISTS public.get_community_stats();
DROP FUNCTION IF EXISTS public.refresh_community_stats();
DROP MATERIALIZED VIEW IF EXISTS public.v_community_stats;
DROP VIEW IF EXISTS public.v_community_stats;

CREATE VIEW public.v_community_stats AS
WITH current_cy AS (
  SELECT CASE
    WHEN EXTRACT(MONTH FROM now()) >= 8
      THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
    ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
  END AS crop_year
),
delivery_rollup AS (
  SELECT
    cpd.crop_plan_id,
    COALESCE(SUM(cpd.amount_kt), 0) AS delivered_kt
  FROM public.crop_plan_deliveries cpd
  GROUP BY cpd.crop_plan_id
),
normalized AS (
  SELECT
    cp.user_id,
    cp.grain,
    COALESCE(cp.acres_seeded, 0) AS acres_seeded,
    GREATEST(
      COALESCE(cp.starting_grain_kt, 0),
      COALESCE(cp.volume_left_to_sell_kt, 0) + COALESCE(dr.delivered_kt, 0),
      COALESCE(cp.volume_left_to_sell_kt, 0)
    ) AS tracked_kt
  FROM public.crop_plans cp
  JOIN public.profiles pr
    ON pr.id = cp.user_id
   AND pr.role = 'farmer'
  LEFT JOIN delivery_rollup dr
    ON dr.crop_plan_id = cp.id
  JOIN current_cy cy
    ON cp.crop_year = cy.crop_year
)
SELECT
  COALESCE(SUM(acres_seeded), 0)::numeric AS total_acres,
  COALESCE(SUM(tracked_kt), 0)::numeric * 1000 AS total_tonnes,
  COUNT(DISTINCT grain)::bigint AS grain_count,
  COUNT(DISTINCT user_id)::bigint AS farmer_count
FROM normalized;

COMMENT ON VIEW public.v_community_stats IS
  'Current-crop-year community social-proof totals derived from farmer crop plans.';

CREATE OR REPLACE FUNCTION public.get_community_stats()
RETURNS TABLE (
  total_acres numeric,
  total_tonnes numeric,
  grain_count bigint,
  farmer_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    vcs.total_acres,
    vcs.total_tonnes,
    vcs.grain_count,
    vcs.farmer_count
  FROM public.v_community_stats vcs
  WHERE vcs.farmer_count >= 10;
$$;

REVOKE ALL ON FUNCTION public.get_community_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_stats() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_community_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_community_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_community_stats() TO service_role;

COMMENT ON FUNCTION public.refresh_community_stats() IS
  'Compatibility no-op. Community stats are now computed live via v_community_stats.';

CREATE OR REPLACE FUNCTION public.calculate_delivery_percentiles(
  p_crop_year text DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  grain text,
  total_delivered_kt numeric,
  delivery_pace_pct numeric,
  percentile_rank numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH current_cy AS (
    SELECT CASE
      WHEN EXTRACT(MONTH FROM now()) >= 8
        THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
      ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
    END AS crop_year
  ),
  delivery_rollup AS (
    SELECT
      cpd.crop_plan_id,
      COALESCE(SUM(cpd.amount_kt), 0) AS total_delivered_kt
    FROM public.crop_plan_deliveries cpd
    GROUP BY cpd.crop_plan_id
  ),
  farmer_plans AS (
    SELECT
      cp.id,
      cp.user_id,
      cp.grain,
      GREATEST(
        COALESCE(cp.starting_grain_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0) + COALESCE(dr.total_delivered_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0)
      ) AS starting_kt,
      COALESCE(cp.volume_left_to_sell_kt, 0) AS remaining_kt,
      LEAST(COALESCE(cp.contracted_kt, 0), COALESCE(cp.volume_left_to_sell_kt, 0)) AS contracted_kt,
      COALESCE(dr.total_delivered_kt, 0) AS total_delivered_kt
    FROM public.crop_plans cp
    JOIN public.profiles pr
      ON pr.id = cp.user_id
     AND pr.role = 'farmer'
    LEFT JOIN delivery_rollup dr
      ON dr.crop_plan_id = cp.id
    WHERE cp.crop_year = COALESCE(p_crop_year, (SELECT crop_year FROM current_cy))
  ),
  pace_base AS (
    SELECT
      fp.user_id,
      fp.grain,
      fp.total_delivered_kt,
      GREATEST(fp.starting_kt - fp.remaining_kt, 0) AS marketed_kt,
      fp.contracted_kt,
      CASE
        WHEN fp.starting_kt > 0
          THEN ((GREATEST(fp.starting_kt - fp.remaining_kt, 0) + fp.contracted_kt) / fp.starting_kt) * 100
        ELSE 0
      END AS pace_pct
    FROM farmer_plans fp
  )
  SELECT
    pb.user_id,
    pb.grain,
    pb.total_delivered_kt,
    ROUND(pb.pace_pct::numeric, 1) AS delivery_pace_pct,
    ROUND(
      (
        PERCENT_RANK() OVER (
          PARTITION BY pb.grain
          ORDER BY pb.pace_pct
        ) * 100
      )::numeric,
      1
    ) AS percentile_rank
  FROM pace_base pb;
$$;
