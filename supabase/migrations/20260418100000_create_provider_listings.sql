-- Track 36 Phase 4: Input Provider Listings
-- Adds seed/fertilizer/chemical/equipment/service roles to profiles
-- + provider_listings table for input company pricing & specials.
-- Mirrors elevator_prices pattern (RLS, GIN index, RPC, chat-paste source).

-- 1. Expand profiles role CHECK to include input provider types
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
  role IN ('farmer', 'observer', 'elevator', 'processor',
           'seed', 'fertilizer', 'chemical', 'equipment', 'service')
);

-- 2. Add provider-specific columns to profiles (reuse company_name from elevator migration)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider_type text,
  ADD COLUMN IF NOT EXISTS product_categories text[],
  ADD COLUMN IF NOT EXISTS service_area_fsa text[];

-- Provider type constraint (only applies when not null)
ALTER TABLE public.profiles ADD CONSTRAINT valid_provider_type CHECK (
  provider_type IS NULL OR provider_type IN ('seed', 'fertilizer', 'chemical', 'equipment', 'service')
);

-- 3. Update handle_new_user() to persist provider metadata from signup
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
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create provider_listings table
CREATE TABLE IF NOT EXISTS public.provider_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('seed', 'fertilizer', 'chemical', 'equipment', 'service')),
  product_name text NOT NULL,
  product_category text,          -- 'canola seed', 'urea', 'glyphosate', etc.
  price_per_unit numeric,
  unit text CHECK (unit IS NULL OR unit IN ('tonne', 'acre', 'jug', 'bag', 'each')),
  description text,
  special_offer text,             -- promotions/deals text
  target_fsa_codes text[] NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  source_method text NOT NULL DEFAULT 'chat' CHECK (source_method IN ('chat', 'form')),
  is_sponsored boolean NOT NULL DEFAULT false,
  CONSTRAINT max_five_fsa CHECK (array_length(target_fsa_codes, 1) <= 5),
  CONSTRAINT has_product_info CHECK (
    price_per_unit IS NOT NULL OR description IS NOT NULL OR special_offer IS NOT NULL
  )
);

-- GIN index for FSA area lookups
CREATE INDEX idx_provider_listings_area
  ON public.provider_listings USING GIN (target_fsa_codes);

-- Provider lookup: "my listings"
CREATE INDEX idx_provider_listings_provider
  ON public.provider_listings (provider_id, posted_at DESC);

-- Type + area lookup for farmer queries ("fertilizer near me")
CREATE INDEX idx_provider_listings_type_area
  ON public.provider_listings (provider_type, posted_at DESC);

-- Expiry index for runtime filtering
CREATE INDEX idx_provider_listings_expiry
  ON public.provider_listings (expires_at DESC);

-- 5. RLS: providers manage own listings, authenticated users read unexpired
ALTER TABLE public.provider_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers manage own listings"
  ON public.provider_listings
  FOR ALL
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Authenticated users read unexpired listings"
  ON public.provider_listings
  FOR SELECT
  USING (expires_at > now());

GRANT ALL ON public.provider_listings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_listings TO authenticated;

-- 6. RPC: farmers get provider listings for their area
CREATE OR REPLACE FUNCTION public.get_provider_listings_for_area(
  p_fsa_code text,
  p_provider_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  provider_type text,
  company_name text,
  product_name text,
  product_category text,
  price_per_unit numeric,
  unit text,
  description text,
  special_offer text,
  is_sponsored boolean,
  posted_at timestamptz,
  hours_since_posted numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.id,
    pl.provider_type,
    p.company_name,
    pl.product_name,
    pl.product_category,
    pl.price_per_unit,
    pl.unit,
    pl.description,
    pl.special_offer,
    pl.is_sponsored,
    pl.posted_at,
    ROUND(EXTRACT(EPOCH FROM (now() - pl.posted_at)) / 3600, 1) AS hours_since_posted
  FROM public.provider_listings pl
  JOIN public.profiles p ON p.id = pl.provider_id
  WHERE pl.expires_at > now()
    AND p_fsa_code = ANY(pl.target_fsa_codes)
    AND (p_provider_type IS NULL OR pl.provider_type = p_provider_type)
  ORDER BY pl.is_sponsored DESC, pl.posted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_provider_listings_for_area TO authenticated;

COMMENT ON TABLE public.provider_listings IS
  'Input provider listings (seed, fertilizer, chemical, equipment, service). Providers post via chat-paste or form. Expires 14 days for prices, 7 days for specials. Farmers access via get_provider_listings_for_area RPC.';

COMMENT ON FUNCTION public.get_provider_listings_for_area IS
  'Returns unexpired provider listings matching a farmer FSA code, optionally filtered by provider type. Sponsored listings sort first, then by freshness.';
