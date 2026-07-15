-- Keep Wheat classes physically separate, repair the thesis packet contract,
-- admit current Prairie heading observations, and remove the frozen MGEX feed.

BEGIN;

ALTER TABLE public.usda_crop_progress
  ADD COLUMN IF NOT EXISTS wheat_class text;

UPDATE public.usda_crop_progress
SET wheat_class = CASE WHEN commodity = 'WHEAT' THEN 'legacy_mixed' ELSE 'all' END
WHERE wheat_class IS NULL;

ALTER TABLE public.usda_crop_progress
  ALTER COLUMN wheat_class SET DEFAULT 'all',
  ALTER COLUMN wheat_class SET NOT NULL;

ALTER TABLE public.usda_crop_progress
  DROP CONSTRAINT IF EXISTS usda_crop_progress_wheat_class_check;

ALTER TABLE public.usda_crop_progress
  ADD CONSTRAINT usda_crop_progress_wheat_class_check
  CHECK (wheat_class IN ('all', 'winter', 'spring', 'durum', 'legacy_mixed'));

ALTER TABLE public.usda_crop_progress
  DROP CONSTRAINT IF EXISTS usda_crop_progress_commodity_state_week_ending_key;
DROP INDEX IF EXISTS public.idx_usda_crop_progress_canonical_unique;

CREATE UNIQUE INDEX idx_usda_crop_progress_class_safe_unique
  ON public.usda_crop_progress (commodity, wheat_class, state, week_ending);

ALTER TABLE public.usda_crop_progress
  ADD CONSTRAINT usda_crop_progress_class_safe_key
  UNIQUE USING INDEX idx_usda_crop_progress_class_safe_unique;

COMMENT ON COLUMN public.usda_crop_progress.wheat_class IS
  'Normalized USDA Wheat class: winter, spring, durum, legacy_mixed; non-Wheat rows use all.';

DROP FUNCTION IF EXISTS public.get_usda_crop_conditions(text, int);

CREATE FUNCTION public.get_usda_crop_conditions(
  p_cgc_grain text,
  p_weeks_back int DEFAULT 6
)
RETURNS TABLE (
  wheat_class text,
  class_desc text,
  week_ending date,
  commodity text,
  good_excellent_pct numeric,
  condition_index numeric,
  ge_pct_yoy_change numeric,
  planted_pct numeric,
  emerged_pct numeric,
  headed_pct numeric,
  harvested_pct numeric,
  planted_pct_vs_avg numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH resolved AS (
    SELECT CASE WHEN p_cgc_grain = 'Canola' THEN 'Soybeans' ELSE p_cgc_grain END AS cgc_grain
  ),
  eligible AS (
    SELECT c.*
    FROM public.usda_crop_progress c
    CROSS JOIN resolved r
    WHERE c.cgc_grain = r.cgc_grain
      AND c.state = 'US TOTAL'
      AND (
        c.wheat_class <> 'legacy_mixed'
        OR NOT EXISTS (
          SELECT 1
          FROM public.usda_crop_progress explicit
          WHERE explicit.cgc_grain = r.cgc_grain
            AND explicit.state = 'US TOTAL'
            AND explicit.wheat_class IN ('winter', 'spring', 'durum')
        )
      )
  ),
  ranked AS (
    SELECT e.*,
      row_number() OVER (PARTITION BY e.wheat_class ORDER BY e.week_ending DESC) AS class_week_rank
    FROM eligible e
  )
  SELECT
    r.wheat_class,
    r.class_desc,
    r.week_ending,
    r.commodity,
    r.good_excellent_pct,
    r.condition_index,
    r.ge_pct_yoy_change,
    r.planted_pct,
    r.emerged_pct,
    r.headed_pct,
    r.harvested_pct,
    r.planted_pct_vs_avg
  FROM ranked r
  WHERE r.class_week_rank <= greatest(1, p_weeks_back)
  ORDER BY r.week_ending DESC, r.wheat_class;
$$;

REVOKE ALL ON FUNCTION public.get_usda_crop_conditions(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_usda_crop_conditions(text, int)
TO authenticated, service_role;

-- Preserve the existing packet implementation as the non-progress base, then
-- replace its crop_progress object with deterministic class-safe rows.
ALTER FUNCTION public.get_us_thesis_packet(text, integer)
  RENAME TO get_us_thesis_packet_legacy_unclassified;

CREATE FUNCTION public.get_us_thesis_packet(
  p_market_name text,
  p_market_year integer DEFAULT 2025
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT public.get_us_thesis_packet_legacy_unclassified(p_market_name, p_market_year) AS payload
  ),
  latest_week AS (
    SELECT max(u.week_ending) AS week_ending
    FROM public.usda_crop_progress u
    WHERE lower(u.market_name) = lower(p_market_name)
      AND (
        u.wheat_class <> 'legacy_mixed'
        OR NOT EXISTS (
          SELECT 1 FROM public.usda_crop_progress explicit
          WHERE lower(explicit.market_name) = lower(p_market_name)
            AND explicit.wheat_class IN ('winter', 'spring', 'durum')
        )
      )
  ),
  current_rows AS (
    SELECT u.*
    FROM public.usda_crop_progress u
    CROSS JOIN latest_week w
    WHERE lower(u.market_name) = lower(p_market_name)
      AND u.week_ending = w.week_ending
      AND (
        u.wheat_class <> 'legacy_mixed'
        OR NOT EXISTS (
          SELECT 1 FROM public.usda_crop_progress explicit
          WHERE lower(explicit.market_name) = lower(p_market_name)
            AND explicit.wheat_class IN ('winter', 'spring', 'durum')
        )
      )
  ),
  progress AS (
    SELECT jsonb_build_object(
      'us_total', coalesce(
        (
          SELECT to_jsonb(u.*)
          FROM current_rows u
          WHERE u.state = 'US TOTAL'
          ORDER BY
            CASE
              WHEN lower(p_market_name) = 'wheat'
                AND extract(month FROM u.week_ending) BETWEEN 4 AND 8
                AND u.wheat_class = 'spring' THEN 0
              WHEN lower(p_market_name) = 'wheat'
                AND NOT (extract(month FROM u.week_ending) BETWEEN 4 AND 8)
                AND u.wheat_class = 'winter' THEN 0
              WHEN u.wheat_class = 'all' THEN 1
              ELSE 2
            END,
            u.wheat_class
          LIMIT 1
        ),
        '{}'::jsonb
      ),
      'classes', coalesce(
        (
          SELECT jsonb_agg(to_jsonb(u.*) ORDER BY u.wheat_class)
          FROM current_rows u
          WHERE u.state = 'US TOTAL'
        ),
        '[]'::jsonb
      ),
      'states', coalesce(
        (
          SELECT jsonb_agg(to_jsonb(u.*) ORDER BY u.wheat_class, u.state)
          FROM current_rows u
          WHERE u.state <> 'US TOTAL'
        ),
        '[]'::jsonb
      )
    ) AS payload
  )
  SELECT jsonb_set(
    b.payload,
    '{supply,crop_progress}',
    coalesce((SELECT p.payload FROM progress p), '{}'::jsonb),
    true
  )
  FROM base b;
$$;

REVOKE ALL ON FUNCTION public.get_us_thesis_packet_legacy_unclassified(text, integer)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_us_thesis_packet(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_us_thesis_packet(text, integer)
TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_us_thesis_packet(text, integer) IS
  'Facts-only US source packet with class-safe Wheat crop_progress.classes and a deterministic seasonal compatibility us_total row.';

ALTER TABLE public.canada_crop_progress
  DROP CONSTRAINT IF EXISTS canada_crop_progress_metric_check;

ALTER TABLE public.canada_crop_progress
  ADD CONSTRAINT canada_crop_progress_metric_check
  CHECK (
    metric IN (
      'seeded_pct',
      'emerged_pct',
      'headed_pct',
      'harvested_pct',
      'condition_good_excellent_pct',
      'pasture_good_excellent_pct',
      'soil_moisture_adequate_surplus_pct',
      'development_normal_pct',
      'development_ahead_pct',
      'development_behind_pct'
    )
  );

-- MWK26 stopped changing after its last real session on 2026-05-14. These
-- later rows were the collector re-stamping the same expired snapshot.
DELETE FROM public.grain_prices
WHERE grain = 'Spring Wheat'
  AND contract = 'MWK26'
  AND price_date > DATE '2026-05-14';

UPDATE public.grain_market_mappings
SET source_commodity = 'MW*0',
    notes = 'MGEX spring wheat continuous front month; collector stores the resolved active contract.'
WHERE canonical_grain = 'Wheat'
  AND source_name = 'grain_prices'
  AND source_commodity = 'MWK26';

NOTIFY pgrst, 'reload schema';

COMMIT;
