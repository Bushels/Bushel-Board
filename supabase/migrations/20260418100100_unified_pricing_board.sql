-- Track 39: Unified Pricing Board
-- Replaces elevator_prices + provider_listings (both 0 rows) with a single
-- posted_prices system. Adds operator_products catalog, price_query_log for
-- demand analytics, facility_status on profiles, and 3 new RPCs.

-- ─── 1. posted_prices table ─────────────────────────────

CREATE TABLE public.posted_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  business_type text NOT NULL CHECK (
    business_type IN ('elevator','crusher','mill','terminal','seed','fertilizer','chemical')
  ),
  facility_name text NOT NULL,
  grain text NOT NULL,
  grade text,
  price_per_tonne numeric,
  price_per_bushel numeric,
  basis numeric,
  basis_reference text,
  delivery_period text NOT NULL DEFAULT 'spot',
  unit text NOT NULL DEFAULT 'tonne' CHECK (
    unit IN ('tonne','bushel','acre','jug','bag','each')
  ),
  capacity_notes text,
  delivery_notes text,
  special_offer text,
  target_fsa_codes text[] NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  source_method text NOT NULL DEFAULT 'chat' CHECK (source_method IN ('chat','form')),
  is_sponsored boolean NOT NULL DEFAULT false,
  CONSTRAINT max_three_fsa CHECK (array_length(target_fsa_codes, 1) <= 3),
  CONSTRAINT has_price_or_info CHECK (
    price_per_tonne IS NOT NULL OR price_per_bushel IS NOT NULL
    OR basis IS NOT NULL OR special_offer IS NOT NULL
  )
);

CREATE INDEX idx_posted_prices_area
  ON public.posted_prices USING GIN (target_fsa_codes);
CREATE INDEX idx_posted_prices_operator
  ON public.posted_prices (operator_id, posted_at DESC);
CREATE INDEX idx_posted_prices_grain
  ON public.posted_prices (grain, posted_at DESC);
CREATE INDEX idx_posted_prices_expiry
  ON public.posted_prices (expires_at DESC);

ALTER TABLE public.posted_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators manage own prices"
  ON public.posted_prices FOR ALL
  USING (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);

CREATE POLICY "Authenticated users read unexpired prices"
  ON public.posted_prices FOR SELECT
  USING (expires_at > now());

GRANT ALL ON public.posted_prices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posted_prices TO authenticated;

-- ─── 2. operator_products table ─────────────────────────

CREATE TABLE public.operator_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_name text NOT NULL,
  product_category text,
  is_active boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, product_name)
);

ALTER TABLE public.operator_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators manage own products"
  ON public.operator_products FOR ALL
  USING (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);

GRANT ALL ON public.operator_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_products TO authenticated;

-- ─── 3. price_query_log table ───────────────────────────

CREATE TABLE public.price_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users,
  farmer_id uuid NOT NULL REFERENCES auth.users,
  grain text NOT NULL,
  fsa_code text NOT NULL,
  queried_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_query_log_operator
  ON public.price_query_log (operator_id, queried_at DESC);
CREATE INDEX idx_price_query_log_grain
  ON public.price_query_log (operator_id, grain, queried_at DESC);

ALTER TABLE public.price_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read own query logs"
  ON public.price_query_log FOR SELECT
  USING (auth.uid() = operator_id);

-- Service role inserts (from chat tool execution)
CREATE POLICY "Service role manages query logs"
  ON public.price_query_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- Restrict the ALL policy to service_role only by granting appropriately
GRANT ALL ON public.price_query_log TO service_role;
GRANT SELECT ON public.price_query_log TO authenticated;

-- ─── 4. Profile changes ────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facility_status text;

-- ─── 5. Feedback extension ─────────────────────────────

ALTER TABLE public.feedback_log
  ADD COLUMN IF NOT EXISTS user_role text;

-- ─── 6. Expand profiles role CHECK for unified operator types ──

DO $$
DECLARE
  _con text;
BEGIN
  SELECT conname INTO _con
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%';
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', _con);
  END IF;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('farmer', 'observer', 'elevator', 'processor', 'crusher', 'mill', 'terminal',
           'seed', 'fertilizer', 'chemical', 'equipment', 'service')
);

-- ─── 7. RPC: get_area_prices ────────────────────────────

CREATE OR REPLACE FUNCTION public.get_area_prices(
  p_fsa_code text,
  p_grain text DEFAULT NULL,
  p_business_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  operator_id uuid,
  business_type text,
  facility_name text,
  facility_status text,
  grain text,
  grade text,
  price_per_tonne numeric,
  price_per_bushel numeric,
  basis numeric,
  basis_reference text,
  delivery_period text,
  unit text,
  capacity_notes text,
  delivery_notes text,
  special_offer text,
  is_sponsored boolean,
  posted_at timestamptz,
  hours_since_posted numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.id,
    pp.operator_id,
    pp.business_type,
    pp.facility_name,
    pr.facility_status,
    pp.grain,
    pp.grade,
    pp.price_per_tonne,
    pp.price_per_bushel,
    pp.basis,
    pp.basis_reference,
    pp.delivery_period,
    pp.unit,
    pp.capacity_notes,
    pp.delivery_notes,
    pp.special_offer,
    pp.is_sponsored,
    pp.posted_at,
    ROUND(EXTRACT(EPOCH FROM (now() - pp.posted_at)) / 3600, 1) AS hours_since_posted
  FROM public.posted_prices pp
  JOIN public.profiles pr ON pr.id = pp.operator_id
  WHERE pp.expires_at > now()
    AND p_fsa_code = ANY(pp.target_fsa_codes)
    AND (p_grain IS NULL OR pp.grain = p_grain)
    AND (p_business_type IS NULL OR pp.business_type = p_business_type)
  ORDER BY pp.is_sponsored DESC, pp.posted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_area_prices TO authenticated;

-- ─── 8. RPC: get_operator_analytics ─────────────────────

CREATE OR REPLACE FUNCTION public.get_operator_analytics(
  p_days_back int DEFAULT 7
)
RETURNS TABLE (
  grain text,
  current_count bigint,
  previous_count bigint,
  trend text
) AS $$
DECLARE
  v_operator_id uuid := auth.uid();
  v_period_start timestamptz := now() - (p_days_back || ' days')::interval;
  v_prev_start timestamptz := now() - (p_days_back * 2 || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT pql.grain, COUNT(*) AS cnt
    FROM public.price_query_log pql
    WHERE pql.operator_id = v_operator_id
      AND pql.queried_at >= v_period_start
    GROUP BY pql.grain
  ),
  previous_period AS (
    SELECT pql.grain, COUNT(*) AS cnt
    FROM public.price_query_log pql
    WHERE pql.operator_id = v_operator_id
      AND pql.queried_at >= v_prev_start
      AND pql.queried_at < v_period_start
    GROUP BY pql.grain
  )
  SELECT
    COALESCE(c.grain, p.grain) AS grain,
    COALESCE(c.cnt, 0) AS current_count,
    COALESCE(p.cnt, 0) AS previous_count,
    CASE
      WHEN COALESCE(c.cnt, 0) > COALESCE(p.cnt, 0) THEN 'up'
      WHEN COALESCE(c.cnt, 0) < COALESCE(p.cnt, 0) THEN 'down'
      ELSE 'flat'
    END AS trend
  FROM current_period c
  FULL OUTER JOIN previous_period p ON c.grain = p.grain
  ORDER BY COALESCE(c.cnt, 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_operator_analytics TO authenticated;

-- ─── 9. RPC: get_operator_reach ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_operator_reach(
  p_fsa_codes text[]
)
RETURNS TABLE (
  farmer_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*) AS farmer_count
  FROM public.profiles
  WHERE role = 'farmer'
    AND LEFT(postal_code, 3) = ANY(p_fsa_codes);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_operator_reach TO authenticated;

-- ─── 10. Update handle_new_user() to seed operator_products ──

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, role, company_name, facility_name, facility_type, facility_postal_code,
    provider_type, product_categories, service_area_fsa
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'farmer'),
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'facility_name',
    new.raw_user_meta_data->>'facility_type',
    new.raw_user_meta_data->>'facility_postal_code',
    new.raw_user_meta_data->>'provider_type',
    CASE
      WHEN new.raw_user_meta_data->'product_categories' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(new.raw_user_meta_data->'product_categories'))
      ELSE NULL
    END,
    CASE
      WHEN new.raw_user_meta_data->'service_area_fsa' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(new.raw_user_meta_data->'service_area_fsa'))
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;

  -- Seed operator_products from signup metadata 'products' array
  IF new.raw_user_meta_data->'products' IS NOT NULL THEN
    INSERT INTO public.operator_products (operator_id, product_name, product_category)
    SELECT
      new.id,
      p.product_name,
      NULL
    FROM (
      SELECT jsonb_array_elements_text(new.raw_user_meta_data->'products') AS product_name
    ) p
    ON CONFLICT (operator_id, product_name) DO NOTHING;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 11. Drop old RPCs (reference tables, so drop first) ──

DROP FUNCTION IF EXISTS public.get_elevator_prices_for_area(text, text);
DROP FUNCTION IF EXISTS public.get_provider_listings_for_area(text, text);

-- ─── 12. Drop old tables (0 rows in production) ────────

DROP TABLE IF EXISTS public.elevator_prices;
DROP TABLE IF EXISTS public.provider_listings;

-- ─── Comments ──────────────────────────────────────────

COMMENT ON TABLE public.posted_prices IS
  'Unified pricing board — all operator types (elevator, crusher, seed, fertilizer, etc.) post prices here. 24h default expiry. Replaces elevator_prices + provider_listings.';

COMMENT ON TABLE public.operator_products IS
  'Operator product catalog — seeded at signup, managed via chat. Drives quick-update flow.';

COMMENT ON TABLE public.price_query_log IS
  'Demand analytics — logs each time a farmer views an operator price. farmer_id for dedup only, never exposed to operators.';

COMMENT ON FUNCTION public.get_area_prices IS
  'Returns unexpired posted prices matching a farmer FSA code. JOINs profiles for facility_name and facility_status. Sorted by sponsored DESC, then freshness.';

COMMENT ON FUNCTION public.get_operator_analytics IS
  'Returns per-grain query counts for the calling operator (auth.uid()). Compares current period vs previous period for trend.';

COMMENT ON FUNCTION public.get_operator_reach IS
  'Counts registered farmers whose postal code FSA matches any of the given codes.';
