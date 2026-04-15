-- Tier 1: Ephemeral extractions from farmer chat conversations
-- Part of Hermes Chat Agent tiered memory system
-- Raw data points extracted from user messages before validation/promotion

CREATE TABLE IF NOT EXISTS public.chat_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id),
  fsa_code text NOT NULL CHECK (fsa_code ~ '^[A-Z][0-9][A-Z]$'),
  category text NOT NULL CHECK (category IN (
    'market', 'agronomic', 'weather', 'intent', 'logistics', 'input_cost'
  )),
  data_type text NOT NULL,
  grain text,
  value_numeric numeric,
  value_text text,
  location_detail text,
  confidence text NOT NULL DEFAULT 'reported'
    CHECK (confidence IN ('reported', 'inferred')),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  promoted boolean NOT NULL DEFAULT false,
  discarded boolean NOT NULL DEFAULT false,
  discard_reason text,

  CONSTRAINT has_value CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

COMMENT ON TABLE public.chat_extractions IS
  'Tier 1 ephemeral extractions: raw data points from farmer chat messages, pending promotion or discard.';

-- Unprocessed extractions awaiting promotion/discard
CREATE INDEX idx_extractions_unprocessed
  ON public.chat_extractions (extracted_at DESC)
  WHERE promoted = false AND discarded = false;

-- User + grain + category lookup for per-farmer context
CREATE INDEX idx_extractions_user_grain
  ON public.chat_extractions (user_id, grain, category, extracted_at DESC);

-- Area-level aggregation by FSA code
CREATE INDEX idx_extractions_fsa_category
  ON public.chat_extractions (fsa_code, category, data_type, extracted_at DESC);

-- RLS: service role full access only
ALTER TABLE public.chat_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages chat_extractions"
  ON public.chat_extractions FOR ALL
  USING (auth.role() = 'service_role');
