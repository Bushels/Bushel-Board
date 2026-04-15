-- Track 36 Phase 3: Elevator/Processor Operator Pricing
-- Adds operator roles to profiles + elevator_prices table for posted pricing.
-- Operators post prices → farmers see them in chat → two-sided flywheel.

-- 1. Expand profiles role CHECK to include elevator and processor
-- Drop any existing role CHECK constraint (name may be auto-generated)
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
  role IN ('farmer', 'observer', 'elevator', 'processor')
);

-- 2. Add operator-specific columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS facility_name text,
  ADD COLUMN IF NOT EXISTS facility_type text,
  ADD COLUMN IF NOT EXISTS facility_postal_code text;

-- Facility type constraint (only applies when not null)
ALTER TABLE public.profiles ADD CONSTRAINT valid_facility_type CHECK (
  facility_type IS NULL OR facility_type IN ('elevator', 'crusher', 'mill', 'terminal')
);

-- 3. Update handle_new_user() to persist operator metadata from signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, role, company_name, facility_name, facility_type, facility_postal_code
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'farmer'),
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'facility_name',
    new.raw_user_meta_data->>'facility_type',
    new.raw_user_meta_data->>'facility_postal_code'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create elevator_prices table
CREATE TABLE IF NOT EXISTS public.elevator_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  facility_name text NOT NULL,
  facility_type text NOT NULL CHECK (facility_type IN ('elevator', 'crusher', 'mill', 'terminal')),
  grain text NOT NULL,
  grade text,                        -- 'CWRS 1', '#1 Canola', etc.
  price_per_bushel numeric,
  price_per_tonne numeric,
  basis numeric,
  basis_reference text,              -- 'ICE Canola', 'CBOT Wheat'
  delivery_period text NOT NULL DEFAULT 'spot', -- 'spot', 'Oct 2026', 'new crop'
  posted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,   -- 3 days for prices, 7 for basis
  source_method text NOT NULL DEFAULT 'chat' CHECK (source_method IN ('chat', 'photo', 'form')),
  target_fsa_codes text[] NOT NULL,  -- max 3 elements
  CONSTRAINT max_three_fsa CHECK (array_length(target_fsa_codes, 1) <= 3),
  CONSTRAINT has_some_price CHECK (
    price_per_bushel IS NOT NULL OR price_per_tonne IS NOT NULL OR basis IS NOT NULL
  )
);

-- GIN index for FSA area lookups (no partial predicate — now() is not IMMUTABLE)
CREATE INDEX idx_elevator_prices_area
  ON public.elevator_prices USING GIN (target_fsa_codes);

-- Operator lookup: "my posted prices"
CREATE INDEX idx_elevator_prices_operator
  ON public.elevator_prices (operator_id, posted_at DESC);

-- Grain + area lookup for farmer queries
CREATE INDEX idx_elevator_prices_grain_area
  ON public.elevator_prices (grain, posted_at DESC);

-- Expiry index for runtime filtering
CREATE INDEX idx_elevator_prices_expiry
  ON public.elevator_prices (expires_at DESC);

-- 5. RLS: operators manage own prices, authenticated users read unexpired
ALTER TABLE public.elevator_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators manage own prices"
  ON public.elevator_prices
  FOR ALL
  USING (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);

CREATE POLICY "Authenticated users read unexpired prices"
  ON public.elevator_prices
  FOR SELECT
  USING (expires_at > now());

GRANT ALL ON public.elevator_prices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elevator_prices TO authenticated;

-- 6. RPC: farmers get elevator prices for their area
CREATE OR REPLACE FUNCTION public.get_elevator_prices_for_area(
  p_fsa_code text,
  p_grain text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  facility_name text,
  facility_type text,
  grain text,
  grade text,
  price_per_bushel numeric,
  price_per_tonne numeric,
  basis numeric,
  basis_reference text,
  delivery_period text,
  posted_at timestamptz,
  hours_since_posted numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ep.id,
    ep.facility_name,
    ep.facility_type,
    ep.grain,
    ep.grade,
    ep.price_per_bushel,
    ep.price_per_tonne,
    ep.basis,
    ep.basis_reference,
    ep.delivery_period,
    ep.posted_at,
    ROUND(EXTRACT(EPOCH FROM (now() - ep.posted_at)) / 3600, 1) AS hours_since_posted
  FROM public.elevator_prices ep
  WHERE ep.expires_at > now()
    AND p_fsa_code = ANY(ep.target_fsa_codes)
    AND (p_grain IS NULL OR ep.grain = p_grain)
  ORDER BY ep.posted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_elevator_prices_for_area TO authenticated;

COMMENT ON TABLE public.elevator_prices IS
  'Elevator/processor posted pricing. Operators post via chat-paste, photo, or form. Expires aggressively (3 days default). Farmers access via get_elevator_prices_for_area RPC.';

COMMENT ON FUNCTION public.get_elevator_prices_for_area IS
  'Returns unexpired elevator prices matching a farmer FSA code, optionally filtered by grain. Sorted by freshness.';
