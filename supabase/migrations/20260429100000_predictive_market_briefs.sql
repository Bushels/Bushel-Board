-- Predictive Market Tab - Phase 1 (Track 52, design doc 2026-04-29).
--
-- Output table for the prediction-market-desk swarm: a Friday-weekly
-- editorial brief that cross-references Kalshi prediction-market YES
-- probabilities against internal CAD/US grain-desk stance.
--
-- Isolation fence:
-- This table is the WRITE side of a read-from-many, write-to-one architecture:
--
--   Kalshi API
--   market_analysis       -> prediction-market-desk swarm -> predictive_market_briefs -> /markets page
--   us_market_analysis
--
-- The swarm reads market_analysis + us_market_analysis and writes only here.
-- predictive_market_briefs must not be read back into market_analysis writers.

CREATE TABLE IF NOT EXISTS public.predictive_market_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_ending date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  model_source text NOT NULL,
  headline text NOT NULL,
  lede text NOT NULL,
  bottom_line text,
  per_market_takes jsonb NOT NULL,
  market_snapshot jsonb NOT NULL,
  CONSTRAINT predictive_market_briefs_one_per_week UNIQUE (week_ending)
);

CREATE INDEX IF NOT EXISTS idx_predictive_market_briefs_week
  ON public.predictive_market_briefs (week_ending DESC);

COMMENT ON TABLE public.predictive_market_briefs IS
  'Friday-weekly editorial brief from the prediction-market-desk swarm. Cross-references Kalshi YES probabilities against internal CAD/US grain-desk stance. Read-only by /markets page; never read back into market_analysis writers.';

ALTER TABLE public.predictive_market_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS predictive_market_briefs_public_read
  ON public.predictive_market_briefs;

CREATE POLICY predictive_market_briefs_public_read
  ON public.predictive_market_briefs
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.get_latest_predictive_market_brief()
RETURNS TABLE (
  id uuid,
  week_ending date,
  generated_at timestamptz,
  model_source text,
  headline text,
  lede text,
  bottom_line text,
  per_market_takes jsonb,
  market_snapshot jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.week_ending,
    b.generated_at,
    b.model_source,
    b.headline,
    b.lede,
    b.bottom_line,
    b.per_market_takes,
    b.market_snapshot
  FROM public.predictive_market_briefs b
  ORDER BY b.week_ending DESC, b.generated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_latest_predictive_market_brief() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_latest_predictive_market_brief()
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_latest_predictive_market_brief() IS
  'Returns the latest predictive_market_briefs row, or zero rows if none exists. Public-readable; powers the /markets editorial surface.';
