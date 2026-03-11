-- Delivery ledger + canonical supply disposition selection
-- 1. Move farmer delivery logging onto an append-only table with idempotency keys
-- 2. Keep crop_plans.deliveries synced as a compatibility projection
-- 3. Remove hardcoded AAFC source assumptions via a canonical current view

CREATE TABLE IF NOT EXISTS public.crop_plan_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_plan_id uuid NOT NULL REFERENCES public.crop_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_year text NOT NULL,
  grain text NOT NULL,
  submission_id uuid NOT NULL UNIQUE,
  delivery_date date NOT NULL,
  amount_kt numeric NOT NULL CHECK (amount_kt > 0),
  destination text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crop_plan_deliveries_plan
  ON public.crop_plan_deliveries(crop_plan_id, delivery_date, created_at);

CREATE INDEX IF NOT EXISTS idx_crop_plan_deliveries_user_grain
  ON public.crop_plan_deliveries(user_id, crop_year, grain);

ALTER TABLE public.crop_plan_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own crop plan deliveries" ON public.crop_plan_deliveries;
DROP POLICY IF EXISTS "Farmers can insert own crop plan deliveries" ON public.crop_plan_deliveries;
DROP POLICY IF EXISTS "Service role reads all crop plan deliveries" ON public.crop_plan_deliveries;

CREATE POLICY "Users can read own crop plan deliveries"
  ON public.crop_plan_deliveries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Farmers can insert own crop plan deliveries"
  ON public.crop_plan_deliveries FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

CREATE POLICY "Service role reads all crop plan deliveries"
  ON public.crop_plan_deliveries FOR SELECT
  USING (auth.role() = 'service_role');

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
          'destination', cpd.destination
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

REVOKE ALL ON FUNCTION public.sync_crop_plan_deliveries_projection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_crop_plan_deliveries_projection(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_crop_plan_delivery_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_crop_plan_deliveries_projection(
    COALESCE(NEW.crop_plan_id, OLD.crop_plan_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_crop_plan_deliveries_projection_trigger
  ON public.crop_plan_deliveries;

CREATE TRIGGER sync_crop_plan_deliveries_projection_trigger
AFTER INSERT OR DELETE ON public.crop_plan_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.handle_crop_plan_delivery_projection();

INSERT INTO public.crop_plan_deliveries (
  crop_plan_id,
  user_id,
  crop_year,
  grain,
  submission_id,
  delivery_date,
  amount_kt,
  destination,
  created_at
)
SELECT
  cp.id,
  cp.user_id,
  cp.crop_year,
  cp.grain,
  gen_random_uuid(),
  (delivery->>'date')::date,
  (delivery->>'amount_kt')::numeric,
  NULLIF(delivery->>'destination', ''),
  COALESCE(cp.updated_at, cp.created_at, now())
FROM public.crop_plans cp
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cp.deliveries, '[]'::jsonb)) AS delivery
WHERE jsonb_array_length(COALESCE(cp.deliveries, '[]'::jsonb)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.crop_plan_deliveries cpd
    WHERE cpd.crop_plan_id = cp.id
  );

UPDATE public.crop_plans cp
SET deliveries = COALESCE(delivery_rollup.deliveries, '[]'::jsonb)
FROM (
  SELECT
    cpd.crop_plan_id,
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(cpd.delivery_date, 'YYYY-MM-DD'),
        'amount_kt', cpd.amount_kt,
        'destination', cpd.destination
      )
      ORDER BY cpd.delivery_date, cpd.created_at, cpd.id
    ) AS deliveries
  FROM public.crop_plan_deliveries cpd
  GROUP BY cpd.crop_plan_id
) AS delivery_rollup
WHERE cp.id = delivery_rollup.crop_plan_id;

UPDATE public.crop_plans
SET deliveries = '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM public.crop_plan_deliveries cpd
  WHERE cpd.crop_plan_id = crop_plans.id
);

DROP VIEW IF EXISTS public.v_supply_disposition_current;

CREATE VIEW public.v_supply_disposition_current AS
WITH ranked_sources AS (
  SELECT
    sd.*,
    ROW_NUMBER() OVER (
      PARTITION BY sd.grain_slug, sd.crop_year
      ORDER BY
        CASE WHEN sd.source ILIKE 'AAFC%' THEN 0 ELSE 1 END,
        sd.created_at DESC,
        sd.id DESC
    ) AS source_rank
  FROM public.supply_disposition sd
)
SELECT
  id,
  grain_slug,
  crop_year,
  carry_in_kt,
  production_kt,
  imports_kt,
  total_supply_kt,
  exports_kt,
  food_industrial_kt,
  feed_waste_kt,
  seed_kt,
  total_domestic_kt,
  carry_out_kt,
  source,
  created_at
FROM ranked_sources
WHERE source_rank = 1;
