-- Tier 3: Long-term memory — detected trends and patterns
-- Part of Hermes Chat Agent tiered memory system
-- Patterns detected from aggregated knowledge_state entries

CREATE TABLE IF NOT EXISTS public.knowledge_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fsa_code text,
  pattern_type text NOT NULL CHECK (pattern_type IN (
    'trend', 'seasonal', 'correlation', 'anomaly', 'area_shift'
  )),
  category text NOT NULL,
  grain text,
  title text NOT NULL,
  description text NOT NULL,
  supporting_data jsonb NOT NULL DEFAULT '[]',
  confidence_score smallint NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invalidated', 'archived')),
  season text CHECK (season IS NULL OR season IN (
    'seeding', 'growing', 'harvest', 'marketing'
  ))
);

COMMENT ON TABLE public.knowledge_patterns IS
  'Tier 3 long-term memory: detected trends, seasonal patterns, correlations, and anomalies.';

-- Active patterns by area + category + grain
CREATE INDEX idx_patterns_active
  ON public.knowledge_patterns (fsa_code, category, grain)
  WHERE status = 'active';

-- Pattern type lookup
CREATE INDEX idx_patterns_type
  ON public.knowledge_patterns (pattern_type, status, detected_at DESC);

-- RLS: service role full access only
ALTER TABLE public.knowledge_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages knowledge_patterns"
  ON public.knowledge_patterns FOR ALL
  USING (auth.role() = 'service_role');
