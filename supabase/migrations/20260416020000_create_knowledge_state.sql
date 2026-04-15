-- Tier 2: Working memory — validated current beliefs per FSA area
-- Part of Hermes Chat Agent tiered memory system
-- Promoted from chat_extractions after validation; superseded when updated

CREATE TABLE IF NOT EXISTS public.knowledge_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fsa_code text NOT NULL CHECK (fsa_code ~ '^[A-Z][0-9][A-Z]$'),
  category text NOT NULL CHECK (category IN (
    'market', 'agronomic', 'weather', 'intent', 'logistics', 'input_cost'
  )),
  data_type text NOT NULL,
  grain text,
  value_numeric numeric,
  value_text text,
  location_detail text,
  source_count int NOT NULL DEFAULT 1,
  confidence_level text NOT NULL DEFAULT 'single_report'
    CHECK (confidence_level IN ('single_report', 'corroborated', 'consensus')),
  first_reported_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'expired')),
  superseded_by uuid REFERENCES public.knowledge_state(id),
  supersession_reason text,
  source_extraction_ids uuid[] NOT NULL DEFAULT '{}',

  CONSTRAINT has_value CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

COMMENT ON TABLE public.knowledge_state IS
  'Tier 2 working memory: validated current beliefs per FSA area, promoted from chat_extractions.';

-- Active knowledge lookup by area + category + grain
CREATE INDEX idx_knowledge_active
  ON public.knowledge_state (fsa_code, category, data_type, grain)
  WHERE status = 'active';

-- Supersession chain traversal
CREATE INDEX idx_knowledge_superseded
  ON public.knowledge_state (superseded_by)
  WHERE status = 'superseded';

-- Grain-specific knowledge lookup
CREATE INDEX idx_knowledge_grain
  ON public.knowledge_state (grain, category, status, last_updated_at DESC)
  WHERE grain IS NOT NULL;

-- RLS: service role full access only
ALTER TABLE public.knowledge_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages knowledge_state"
  ON public.knowledge_state FOR ALL
  USING (auth.role() = 'service_role');
