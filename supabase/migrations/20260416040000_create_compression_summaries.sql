-- Compression summaries: audit log for daily/weekly memory compression runs
-- Part of Hermes Chat Agent tiered memory system
-- Tracks how many extractions were promoted, corroborated, superseded, discarded

CREATE TABLE IF NOT EXISTS public.compression_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL CHECK (period IN ('daily', 'weekly')),
  compression_date date NOT NULL,
  conversations_processed int NOT NULL DEFAULT 0,
  extractions_total int NOT NULL DEFAULT 0,
  promoted int NOT NULL DEFAULT 0,
  corroborated int NOT NULL DEFAULT 0,
  superseded int NOT NULL DEFAULT 0,
  discarded int NOT NULL DEFAULT 0,
  deferred int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}',
  patterns_detected int NOT NULL DEFAULT 0,
  flags_for_review int NOT NULL DEFAULT 0,
  macro_micro_alignment jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_period_date UNIQUE (period, compression_date)
);

COMMENT ON TABLE public.compression_summaries IS
  'Audit log for daily/weekly memory compression runs — tracks extraction lifecycle metrics.';

-- Recent compression lookups
CREATE INDEX idx_compression_recent
  ON public.compression_summaries (period, compression_date DESC);

-- RLS: service role full access only
ALTER TABLE public.compression_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages compression_summaries"
  ON public.compression_summaries FOR ALL
  USING (auth.role() = 'service_role');
