-- 20260419130000_create_unified_rankings.sql
-- Unified North American grain ranking — written by the Unifier phase
-- after both CAD and US Friday swarms complete.

BEGIN;

CREATE TABLE IF NOT EXISTS public.unified_rankings (
  id                    BIGSERIAL PRIMARY KEY,
  week_ending           DATE NOT NULL,
  region                TEXT NOT NULL CHECK (region IN ('CAD', 'US')),
  grain                 TEXT NOT NULL,
  tier                  TEXT NOT NULL CHECK (tier IN (
                          'Strong Bull', 'Mild Bull', 'Neutral', 'Mild Bear', 'Strong Bear'
                        )),
  rank_overall          SMALLINT NOT NULL,       -- 1-based rank across 20 rows
  stance_score          SMALLINT NOT NULL CHECK (stance_score BETWEEN -100 AND 100),
  compression_index     SMALLINT,                -- null for non-STRONG-fit grains
  compression_class     TEXT CHECK (compression_class IN ('A', 'B', 'C') OR compression_class IS NULL),
  primary_driver        TEXT NOT NULL,           -- one-line human-readable driver
  rule_citations        TEXT[] NOT NULL DEFAULT '{}',
  active_thesis_killers TEXT[] NOT NULL DEFAULT '{}',
  thesis_killer_watch   TEXT,                    -- narrative: "watch for X next week"
  boundary_flag         BOOLEAN NOT NULL DEFAULT FALSE,
  basis_vetoed          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Natural key: one row per (week, region, grain)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_rankings_week_region_grain
  ON public.unified_rankings (week_ending, region, grain);

-- Read path: "give me this week's ranking, ordered"
CREATE INDEX IF NOT EXISTS idx_unified_rankings_week_rank
  ON public.unified_rankings (week_ending DESC, rank_overall);

-- Tier-filter queries
CREATE INDEX IF NOT EXISTS idx_unified_rankings_tier
  ON public.unified_rankings (tier, week_ending DESC);

-- RLS: public read (anyone can see the ranking), write is service-role only
ALTER TABLE public.unified_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unified_rankings_public_read"
  ON public.unified_rankings
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- Service-role writes only (no INSERT/UPDATE/DELETE policies for anon/authenticated)

COMMENT ON TABLE public.unified_rankings IS
  'Unified North American grain ranking. Written by the Unifier phase every Friday night after CAD + US desk swarms complete. One row per grain per week. 20 rows expected per week in v1 (16 CAD + 4 US).';

COMMENT ON COLUMN public.unified_rankings.rank_overall IS
  '1-based overall rank across all rows for a given week_ending. Ordered bull-to-bear: rank 1 = most bullish stance.';

COMMENT ON COLUMN public.unified_rankings.compression_index IS
  'Composite compression score. NULL for non-STRONG-fit grains (WEAK, N/A fit). Present for the 7 STRONG-fit Canadian grains only in v1.';

COMMENT ON COLUMN public.unified_rankings.boundary_flag IS
  'TRUE if stance_score is within ±3 of a tier edge. Flags potential misclassification for meta-reviewer audit.';

COMMIT;
