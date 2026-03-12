-- =============================================================================
-- Health checks table for automated site health verification
-- =============================================================================
-- Stores results from validate-site-health Edge Function.
-- Written by the import pipeline (step 6) and daily cron health checks.

CREATE TABLE public.health_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week integer,
  status text NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
  checks jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'pipeline',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.health_checks IS
  'Automated site health verification results. Sources: pipeline (post-import chain), scheduled (daily cron), manual (ad-hoc).';
COMMENT ON COLUMN public.health_checks.source IS
  'What triggered this check: pipeline | scheduled | manual';

CREATE INDEX idx_health_checks_created ON public.health_checks (created_at DESC);

ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;

-- Anyone can read health checks (useful for dashboards/monitoring)
CREATE POLICY "Anyone can read health checks"
  ON public.health_checks FOR SELECT USING (true);

-- Only service role can insert (Edge Functions use service role key)
CREATE POLICY "Service role inserts health checks"
  ON public.health_checks FOR INSERT WITH CHECK (true);
