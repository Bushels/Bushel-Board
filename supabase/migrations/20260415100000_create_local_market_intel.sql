-- Phase 2: Local Market Intelligence table
-- Stores farmer-reported local data (basis, prices, conditions) keyed by postal FSA.
-- Data decays via expires_at; area aggregates via RPC only (RLS blocks cross-user reads).
-- Expanded data types include seasonal inputs (seeding, harvest, weather, pest, inputs).

CREATE TABLE IF NOT EXISTS public.local_market_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  fsa_code text NOT NULL,
  grain text NOT NULL,
  data_type text NOT NULL,
  value_numeric numeric,
  value_text text,
  elevator_name text,
  confidence text NOT NULL DEFAULT 'reported',
  reported_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  source_thread_id uuid REFERENCES public.chat_threads ON DELETE SET NULL,
  extracted_by text NOT NULL DEFAULT 'chat',

  -- v1 grain marketing + v1.5 seasonal expansion
  CONSTRAINT valid_data_type CHECK (
    data_type IN (
      'basis', 'elevator_price', 'crop_condition', 'yield_estimate', 'quality',
      'seeding_progress', 'input_price', 'weather_observation',
      'harvest_progress', 'pest_report', 'acres_planned'
    )
  ),
  CONSTRAINT valid_confidence CHECK (
    confidence IN ('reported', 'verified', 'inferred', 'outlier')
  ),
  CONSTRAINT valid_extracted_by CHECK (
    extracted_by IN ('chat', 'manual_entry', 'siri', 'photo')
  ),
  -- FSA code is exactly 3 uppercase alphanumeric characters
  CONSTRAINT valid_fsa_code CHECK (fsa_code ~ '^[A-Z][0-9][A-Z]$')
);

-- Primary lookup: active reports for an area + grain + type
CREATE INDEX idx_local_intel_area
  ON public.local_market_intel (fsa_code, grain, data_type, reported_at DESC);

-- Expiry-aware lookups: queries filter `expires_at > now()` at runtime
CREATE INDEX idx_local_intel_expiry
  ON public.local_market_intel (fsa_code, grain, expires_at DESC);

-- User-scoped lookups (My Farm, dedup checks)
CREATE INDEX idx_local_intel_user
  ON public.local_market_intel (user_id, grain, data_type, reported_at DESC);

-- Stale suppression: find recent duplicates within 24h window
CREATE INDEX idx_local_intel_dedup
  ON public.local_market_intel (user_id, grain, data_type, elevator_name, reported_at DESC);

-- RLS: users see only their own raw reports; area aggregates via RPC
ALTER TABLE public.local_market_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own intel"
  ON public.local_market_intel
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role needs full access for RPC aggregation
GRANT ALL ON public.local_market_intel TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_market_intel TO authenticated;

COMMENT ON TABLE public.local_market_intel IS
  'Farmer-reported local market intelligence. Decays via expires_at. Raw data is per-user (RLS); area aggregates served by get_area_stance_modifier RPC.';
