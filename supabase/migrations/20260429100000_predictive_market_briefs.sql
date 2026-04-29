-- Predictive Market Tab — Phase 1 (Track 52, design doc 2026-04-29).
--
-- Output table for the `prediction-market-desk` swarm: a Friday-weekly
-- editorial brief that cross-references Kalshi prediction-market YES
-- probabilities against our internal CAD/US grain-desk stance.
--
-- ── ISOLATION FENCE ─────────────────────────────────────────────────────
-- This table is the WRITE side of a strict read-from-many, write-to-one
-- architecture:
--
--   [Kalshi API]            ──┐
--                              ├──► prediction-market-desk swarm ──► predictive_market_briefs ──► /markets page
--   [market_analysis]      ───┘
--   [us_market_analysis]   ───┘
--
-- The swarm READS market_analysis + us_market_analysis (and Kalshi via
-- lib/kalshi/client.ts), and WRITES only here. predictive_market_briefs
-- is NEVER read by market_analysis writers, grain detail pages, or any
-- other surface — one-way data flow.
--
-- Do NOT add a foreign key from market_analysis or score_trajectory to
-- this table. Do NOT trigger market_analysis writes from a brief insert.
-- The swarm's job is to produce editorial commentary on the divergence
-- between the crowd and our desk; mixing these signals back into the
-- desk's own write path would corrupt the very divergence the brief
-- exists to highlight.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.predictive_market_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_ending DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- e.g. 'claude-opus-prediction-desk-v1'
  model_source TEXT NOT NULL,
  -- Editorial fields — Fraunces tonality, farmer-friendly copy, no jargon.
  headline TEXT NOT NULL,
  lede TEXT NOT NULL,
  bottom_line TEXT,
  -- Per-market takes: one entry per Kalshi market the swarm reviewed.
  -- Shape: [{ ticker, series, stance: 'agree'|'disagree'|'watch',
  --           kalshi_yes_pct, internal_score, comment }, ...]
  per_market_takes JSONB NOT NULL,
  -- Snapshot of the Kalshi markets at brief-write time. The /markets
  -- page can either render this (frozen Friday view) or render live
  -- Kalshi data with a "brief was written when these markets looked
  -- like X" disclaimer. Keep both options open.
  market_snapshot JSONB NOT NULL,
  -- One brief per week (idempotency for re-runs of the Friday swarm).
  CONSTRAINT predictive_market_briefs_one_per_week UNIQUE (week_ending)
);

CREATE INDEX IF NOT EXISTS idx_predictive_market_briefs_week
  ON public.predictive_market_briefs (week_ending DESC);

COMMENT ON TABLE public.predictive_market_briefs IS
  'Friday-weekly editorial brief from the prediction-market-desk swarm. Cross-references Kalshi YES probabilities against internal CAD/US grain-desk stance. Read-only by /markets page; never read back into market_analysis writers.';

-- ── RLS ────────────────────────────────────────────────────────────────
-- Public read (the brief is a public editorial surface); writes restricted
-- to service_role (the swarm runs through the Supabase service-role key).

ALTER TABLE public.predictive_market_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS predictive_market_briefs_public_read
  ON public.predictive_market_briefs;
CREATE POLICY predictive_market_briefs_public_read
  ON public.predictive_market_briefs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — service_role bypasses RLS entirely,
-- and we explicitly never want anon or authenticated users writing here.

-- ── RPC: get_latest_predictive_market_brief ────────────────────────────
-- Returns the most recently generated brief, or zero rows if no brief
-- has been written yet. /markets renders an "early days" empty state
-- when zero rows.

CREATE OR REPLACE FUNCTION public.get_latest_predictive_market_brief()
RETURNS TABLE (
  id UUID,
  week_ending DATE,
  generated_at TIMESTAMPTZ,
  model_source TEXT,
  headline TEXT,
  lede TEXT,
  bottom_line TEXT,
  per_market_takes JSONB,
  market_snapshot JSONB
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
  'Returns the latest predictive_market_briefs row (or zero rows if none yet). Public-readable — powers the /markets editorial surface.';
