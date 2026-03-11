-- Add columns to x_market_signals for intraday scanning (3x/day pulse + weekly deep)
-- searched_at: when signal was discovered or last refreshed
-- search_mode: 'pulse' (intraday) vs 'deep' (Thursday post-CGC)
-- source: 'x' (Twitter) vs 'web' (Grok web_search)

ALTER TABLE public.x_market_signals
  ADD COLUMN IF NOT EXISTS searched_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS search_mode text DEFAULT 'deep'
    CHECK (search_mode IN ('pulse', 'deep')),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'x'
    CHECK (source IN ('x', 'web'));

-- Backfill existing rows: treat them all as deep/x since they came from the weekly pipeline
UPDATE public.x_market_signals
SET searched_at = created_at,
    search_mode = 'deep',
    source = 'x'
WHERE searched_at IS NULL OR search_mode IS NULL OR source IS NULL;

-- Recency-based ordering for "newest signals first"
CREATE INDEX IF NOT EXISTS idx_xms_searched_at
  ON public.x_market_signals(searched_at DESC);

-- Composite index for feed freshness queries (grain detail page)
CREATE INDEX IF NOT EXISTS idx_xms_grain_week_searched
  ON public.x_market_signals(grain, crop_year, grain_week, searched_at DESC);
