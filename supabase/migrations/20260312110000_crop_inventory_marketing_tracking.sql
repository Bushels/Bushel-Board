-- Crop inventory and marketing tracking
-- 1. Add a fixed starting grain denominator for percentage-based farm marketing views
-- 2. Require delivery sale classification (contracted vs open) on the ledger
-- 3. Keep live remaining / contracted / open balances in sync when deliveries are logged
-- 4. Recompute farmer pace and community analytics around priced grain, not raw delivered tonnes

ALTER TABLE public.crop_plans
  ADD COLUMN IF NOT EXISTS starting_grain_kt numeric;

ALTER TABLE public.crop_plans
  ALTER COLUMN starting_grain_kt SET DEFAULT 0;

COMMENT ON COLUMN public.crop_plans.starting_grain_kt IS
  'Estimated starting grain amount for the crop year (kilotonnes); fixed denominator for grain-left and priced percentages';

ALTER TABLE public.crop_plan_deliveries
  ADD COLUMN IF NOT EXISTS marketing_type text NOT NULL DEFAULT 'legacy_unspecified';

COMMENT ON COLUMN public.crop_plan_deliveries.marketing_type IS
  'How the load was marketed: contracted, open, or legacy_unspecified for pre-classification rows';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crop_plan_deliveries_marketing_type_check'
  ) THEN
    ALTER TABLE public.crop_plan_deliveries
      ADD CONSTRAINT crop_plan_deliveries_marketing_type_check
      CHECK (marketing_type IN ('contracted', 'open', 'legacy_unspecified'));
  END IF;
END
$$;

WITH delivery_rollup AS (
  SELECT
    cpd.crop_plan_id,
    COALESCE(SUM(cpd.amount_kt), 0) AS delivered_kt
  FROM public.crop_plan_deliveries cpd
  GROUP BY cpd.crop_plan_id
),
normalized AS (
  SELECT
    cp.id,
    GREATEST(
      COALESCE(cp.starting_grain_kt, 0),
      COALESCE(cp.volume_left_to_sell_kt, 0),
      0
    ) AS starting_kt,
    GREATEST(COALESCE(cp.volume_left_to_sell_kt, 0), 0) AS legacy_remaining_kt,
    GREATEST(COALESCE(cp.contracted_kt, 0), 0) AS legacy_contracted_kt,
    COALESCE(dr.delivered_kt, 0) AS delivered_kt
  FROM public.crop_plans cp
  LEFT JOIN delivery_rollup dr ON dr.crop_plan_id = cp.id
)
UPDATE public.crop_plans cp
SET starting_grain_kt = n.starting_kt,
    volume_left_to_sell_kt = GREATEST(n.legacy_remaining_kt - n.delivered_kt, 0),
    contracted_kt = LEAST(
      GREATEST(n.legacy_contracted_kt - n.delivered_kt, 0),
      GREATEST(n.legacy_remaining_kt - n.delivered_kt, 0)
    ),
    uncontracted_kt = GREATEST(
      GREATEST(n.legacy_remaining_kt - n.delivered_kt, 0)
      - LEAST(
        GREATEST(n.legacy_contracted_kt - n.delivered_kt, 0),
        GREATEST(n.legacy_remaining_kt - n.delivered_kt, 0)
      ),
      0
    ),
    updated_at = now()
FROM normalized n
WHERE cp.id = n.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crop_plans_marketing_state_check'
  ) THEN
    ALTER TABLE public.crop_plans
      ADD CONSTRAINT crop_plans_marketing_state_check
      CHECK (
        COALESCE(starting_grain_kt, 0) >= 0
        AND COALESCE(volume_left_to_sell_kt, 0) >= 0
        AND COALESCE(contracted_kt, 0) >= 0
        AND COALESCE(uncontracted_kt, 0) >= 0
        AND COALESCE(starting_grain_kt, 0) >= COALESCE(volume_left_to_sell_kt, 0)
        AND COALESCE(contracted_kt, 0) <= COALESCE(volume_left_to_sell_kt, 0)
        AND COALESCE(uncontracted_kt, 0)
          = GREATEST(COALESCE(volume_left_to_sell_kt, 0) - COALESCE(contracted_kt, 0), 0)
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_crop_plan_deliveries_projection(p_crop_plan_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.crop_plans cp
  SET deliveries = COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', to_char(cpd.delivery_date, 'YYYY-MM-DD'),
          'amount_kt', cpd.amount_kt,
          'destination', cpd.destination,
          'marketing_type', cpd.marketing_type
        )
        ORDER BY cpd.delivery_date, cpd.created_at, cpd.id
      )
      FROM public.crop_plan_deliveries cpd
      WHERE cpd.crop_plan_id = cp.id
    ),
    '[]'::jsonb
  ),
  updated_at = now()
  WHERE cp.id = p_crop_plan_id;
$$;

UPDATE public.crop_plans cp
SET deliveries = COALESCE(delivery_rollup.deliveries, '[]'::jsonb)
FROM (
  SELECT
    cpd.crop_plan_id,
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(cpd.delivery_date, 'YYYY-MM-DD'),
        'amount_kt', cpd.amount_kt,
        'destination', cpd.destination,
        'marketing_type', cpd.marketing_type
      )
      ORDER BY cpd.delivery_date, cpd.created_at, cpd.id
    ) AS deliveries
  FROM public.crop_plan_deliveries cpd
  GROUP BY cpd.crop_plan_id
) AS delivery_rollup
WHERE cp.id = delivery_rollup.crop_plan_id;

CREATE OR REPLACE FUNCTION public.apply_crop_plan_delivery_marketing_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starting numeric;
  v_remaining numeric;
  v_contracted numeric;
  v_new_remaining numeric;
  v_new_contracted numeric;
BEGIN
  SELECT
    COALESCE(cp.starting_grain_kt, 0),
    COALESCE(cp.volume_left_to_sell_kt, 0),
    COALESCE(cp.contracted_kt, 0)
  INTO
    v_starting,
    v_remaining,
    v_contracted
  FROM public.crop_plans cp
  WHERE cp.id = NEW.crop_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crop plan % not found for delivery', NEW.crop_plan_id;
  END IF;

  IF NEW.amount_kt > v_remaining + 0.000001 THEN
    RAISE EXCEPTION 'Delivery amount exceeds grain left to sell for crop plan %', NEW.crop_plan_id;
  END IF;

  IF NEW.marketing_type = 'contracted'
    AND NEW.amount_kt > v_contracted + 0.000001 THEN
    RAISE EXCEPTION 'Contracted delivery amount exceeds contracted balance for crop plan %', NEW.crop_plan_id;
  END IF;

  IF NEW.marketing_type = 'open'
    AND NEW.amount_kt > GREATEST(v_remaining - v_contracted, 0) + 0.000001 THEN
    RAISE EXCEPTION 'Open-market delivery amount exceeds open balance for crop plan %', NEW.crop_plan_id;
  END IF;

  v_new_remaining := GREATEST(v_remaining - NEW.amount_kt, 0);

  IF NEW.marketing_type IN ('contracted', 'legacy_unspecified') THEN
    v_new_contracted := LEAST(
      GREATEST(v_contracted - NEW.amount_kt, 0),
      v_new_remaining
    );
  ELSE
    v_new_contracted := LEAST(v_contracted, v_new_remaining);
  END IF;

  UPDATE public.crop_plans
  SET starting_grain_kt = GREATEST(v_starting, v_remaining, 0),
      volume_left_to_sell_kt = v_new_remaining,
      contracted_kt = v_new_contracted,
      uncontracted_kt = GREATEST(v_new_remaining - v_new_contracted, 0),
      updated_at = now()
  WHERE id = NEW.crop_plan_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS adjust_crop_plan_marketing_state_trigger
  ON public.crop_plan_deliveries;

CREATE TRIGGER adjust_crop_plan_marketing_state_trigger
AFTER INSERT ON public.crop_plan_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.apply_crop_plan_delivery_marketing_state();

CREATE OR REPLACE FUNCTION public.calculate_delivery_percentiles(
  p_crop_year text DEFAULT '2025-26'
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
  WITH delivery_rollup AS (
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
    WHERE cp.crop_year = p_crop_year
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

REVOKE ALL ON FUNCTION public.calculate_delivery_percentiles(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_delivery_percentiles(text) TO service_role;

DROP FUNCTION IF EXISTS public.get_delivery_analytics(text, text);

CREATE OR REPLACE FUNCTION public.get_delivery_analytics(
  p_crop_year text,
  p_grain text DEFAULT NULL
)
RETURNS TABLE (
  grain text,
  farmer_count int,
  total_delivered_kt numeric,
  mean_delivered_kt numeric,
  median_delivered_kt numeric,
  mean_pace_pct numeric,
  p25_pace_pct numeric,
  p50_pace_pct numeric,
  p75_pace_pct numeric,
  total_starting_kt numeric,
  total_remaining_kt numeric,
  total_contracted_kt numeric,
  total_uncontracted_kt numeric,
  mean_priced_pct numeric,
  mean_contracted_pct numeric,
  mean_open_pct numeric,
  mean_left_to_sell_pct numeric,
  farmers_with_contracts int,
  contracting_farmer_pct numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH delivery_rollup AS (
    SELECT
      cpd.crop_plan_id,
      COALESCE(SUM(cpd.amount_kt), 0) AS total_delivered_kt,
      COALESCE(SUM(CASE WHEN cpd.marketing_type = 'contracted' THEN cpd.amount_kt ELSE 0 END), 0)
        AS contracted_delivered_kt
    FROM public.crop_plan_deliveries cpd
    GROUP BY cpd.crop_plan_id
  ),
  user_stats AS (
    SELECT
      cp.grain,
      cp.user_id,
      GREATEST(
        COALESCE(cp.starting_grain_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0) + COALESCE(dr.total_delivered_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0)
      ) AS starting_kt,
      COALESCE(cp.volume_left_to_sell_kt, 0) AS remaining_kt,
      LEAST(COALESCE(cp.contracted_kt, 0), COALESCE(cp.volume_left_to_sell_kt, 0)) AS contracted_kt,
      GREATEST(
        COALESCE(cp.volume_left_to_sell_kt, 0)
        - LEAST(COALESCE(cp.contracted_kt, 0), COALESCE(cp.volume_left_to_sell_kt, 0)),
        0
      ) AS uncontracted_kt,
      COALESCE(dr.total_delivered_kt, 0) AS delivered_kt,
      COALESCE(dr.contracted_delivered_kt, 0) AS contracted_delivered_kt
    FROM public.crop_plans cp
    JOIN public.profiles pr
      ON pr.id = cp.user_id
     AND pr.role = 'farmer'
    LEFT JOIN delivery_rollup dr
      ON dr.crop_plan_id = cp.id
    WHERE cp.crop_year = p_crop_year
      AND (p_grain IS NULL OR cp.grain = p_grain)
  ),
  pace_base AS (
    SELECT
      us.grain,
      us.user_id,
      us.starting_kt,
      us.remaining_kt,
      us.contracted_kt,
      us.uncontracted_kt,
      us.delivered_kt,
      us.contracted_delivered_kt,
      GREATEST(us.starting_kt - us.remaining_kt, 0) AS marketed_kt,
      CASE
        WHEN us.starting_kt > 0
          THEN ((GREATEST(us.starting_kt - us.remaining_kt, 0) + us.contracted_kt) / us.starting_kt) * 100
        ELSE 0
      END AS pace_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN ((GREATEST(us.starting_kt - us.remaining_kt, 0) + us.contracted_kt) / us.starting_kt) * 100
        ELSE 0
      END AS priced_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN (us.contracted_kt / us.starting_kt) * 100
        ELSE 0
      END AS contracted_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN (us.uncontracted_kt / us.starting_kt) * 100
        ELSE 0
      END AS open_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN (us.remaining_kt / us.starting_kt) * 100
        ELSE 0
      END AS left_to_sell_pct,
      CASE
        WHEN us.contracted_kt > 0 OR us.contracted_delivered_kt > 0 THEN true
        ELSE false
      END AS uses_contracts
    FROM user_stats us
  )
  SELECT
    pb.grain,
    COUNT(DISTINCT pb.user_id)::int AS farmer_count,
    ROUND(SUM(pb.delivered_kt)::numeric, 3) AS total_delivered_kt,
    ROUND(AVG(pb.delivered_kt)::numeric, 3) AS mean_delivered_kt,
    ROUND(
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.delivered_kt))::numeric,
      3
    ) AS median_delivered_kt,
    ROUND(AVG(pb.pace_pct)::numeric, 1) AS mean_pace_pct,
    ROUND(
      (PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY pb.pace_pct))::numeric,
      1
    ) AS p25_pace_pct,
    ROUND(
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.pace_pct))::numeric,
      1
    ) AS p50_pace_pct,
    ROUND(
      (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY pb.pace_pct))::numeric,
      1
    ) AS p75_pace_pct,
    ROUND(SUM(pb.starting_kt)::numeric, 3) AS total_starting_kt,
    ROUND(SUM(pb.remaining_kt)::numeric, 3) AS total_remaining_kt,
    ROUND(SUM(pb.contracted_kt)::numeric, 3) AS total_contracted_kt,
    ROUND(SUM(pb.uncontracted_kt)::numeric, 3) AS total_uncontracted_kt,
    ROUND(AVG(pb.priced_pct)::numeric, 1) AS mean_priced_pct,
    ROUND(AVG(pb.contracted_pct)::numeric, 1) AS mean_contracted_pct,
    ROUND(AVG(pb.open_pct)::numeric, 1) AS mean_open_pct,
    ROUND(AVG(pb.left_to_sell_pct)::numeric, 1) AS mean_left_to_sell_pct,
    COUNT(DISTINCT pb.user_id) FILTER (WHERE pb.uses_contracts)::int AS farmers_with_contracts,
    ROUND(
      (
        COUNT(DISTINCT pb.user_id) FILTER (WHERE pb.uses_contracts)::numeric
        / NULLIF(COUNT(DISTINCT pb.user_id), 0)
      ) * 100,
      1
    ) AS contracting_farmer_pct
  FROM pace_base pb
  GROUP BY pb.grain
  HAVING COUNT(DISTINCT pb.user_id) >= 5;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_analytics(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_analytics(text, text) TO authenticated, service_role;
