-- Enhanced relevance scoring: recency decay, vote velocity, deep mode bonus,
-- and category diversity enforcement.
--
-- Previous formula: 60% Grok + 40% farmer consensus (when >= 3 votes)
-- New formula: 50% recency-adjusted Grok + 40% farmer consensus + 10% bonuses
--
-- Also updates both RPC functions to expose new columns (searched_at, source,
-- search_mode, is_new) and enforce category diversity (max 3 per category).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Replace v_signal_relevance_scores with enhanced scoring
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_signal_relevance_scores AS
SELECT
  sf.signal_id,
  xs.grain,
  xs.crop_year,
  xs.grain_week,
  xs.post_summary,
  xs.sentiment,
  xs.category,
  xs.source,
  xs.search_mode,
  xs.searched_at,
  xs.relevance_score AS grok_relevance,
  COUNT(*) AS total_votes,
  COUNT(*) FILTER (WHERE sf.relevant = true) AS relevant_votes,
  COUNT(*) FILTER (WHERE sf.relevant = false) AS not_relevant_votes,
  ROUND(
    COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100
  ) AS farmer_relevance_pct,

  -- Blended score with recency decay, velocity bonus, and search depth bonus
  CASE
    WHEN COUNT(*) >= 3 THEN
      LEAST(100, GREATEST(0, ROUND(
        -- 50% recency-adjusted Grok score (decays 5 points per day since discovery)
        GREATEST(0,
          xs.relevance_score - EXTRACT(EPOCH FROM (now() - xs.searched_at)) / 86400.0 * 5
        ) * 0.50
        -- 40% farmer consensus
        + (COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100) * 0.40
        -- 10% bonuses (velocity + deep mode, capped at 10)
        + LEAST(10,
            -- Vote velocity: +5 when >= 2 votes arrive within 1 hour
            CASE
              WHEN COUNT(*) >= 2
                AND EXTRACT(EPOCH FROM (MAX(sf.voted_at) - MIN(sf.voted_at))) < 3600
              THEN 5 ELSE 0
            END
            -- Deep scan bonus: +3 for deep-mode signals
            + CASE WHEN xs.search_mode = 'deep' THEN 3 ELSE 0 END
          )
      )))::int
    ELSE
      -- Cold start: recency-adjusted Grok + deep mode bonus only
      LEAST(100, GREATEST(0,
        xs.relevance_score
        - EXTRACT(EPOCH FROM (now() - xs.searched_at)) / 86400.0 * 5
        + CASE WHEN xs.search_mode = 'deep' THEN 3 ELSE 0 END
      ))::int
  END AS blended_relevance
FROM public.signal_feedback sf
JOIN public.x_market_signals xs ON xs.id = sf.signal_id
GROUP BY sf.signal_id, xs.id, xs.grain, xs.crop_year, xs.grain_week,
         xs.post_summary, xs.sentiment, xs.category, xs.relevance_score,
         xs.source, xs.search_mode, xs.searched_at;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Updated get_signals_with_feedback — adds searched_at, source,
--    search_mode, is_new; enforces category diversity (max 3 per category)
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_signals_with_feedback(text, text, int);

CREATE OR REPLACE FUNCTION public.get_signals_with_feedback(
  p_grain text,
  p_crop_year text,
  p_grain_week int DEFAULT NULL,
  p_last_seen timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  grain text,
  post_summary text,
  post_url text,
  post_author text,
  post_date timestamptz,
  relevance_score int,
  sentiment text,
  category text,
  confidence_score int,
  search_query text,
  searched_at timestamptz,
  source text,
  search_mode text,
  is_new boolean,
  user_voted boolean,
  user_relevant boolean,
  blended_relevance int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      xs.id,
      xs.grain,
      xs.post_summary,
      xs.post_url,
      xs.post_author,
      xs.post_date,
      xs.relevance_score,
      xs.sentiment,
      xs.category,
      xs.confidence_score,
      xs.search_query,
      xs.searched_at,
      xs.source,
      xs.search_mode,
      CASE
        WHEN p_last_seen IS NOT NULL THEN xs.searched_at > p_last_seen
        ELSE false
      END AS is_new,
      (sf.id IS NOT NULL) AS user_voted,
      sf.relevant AS user_relevant,
      COALESCE(vrs.blended_relevance, xs.relevance_score)::int AS blended_relevance,
      ROW_NUMBER() OVER (
        PARTITION BY xs.category
        ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
      ) AS cat_rank
    FROM public.x_market_signals xs
    LEFT JOIN public.signal_feedback sf
      ON sf.signal_id = xs.id
     AND sf.user_id = auth.uid()
    LEFT JOIN public.v_signal_relevance_scores vrs
      ON vrs.signal_id = xs.id
    WHERE auth.uid() IS NOT NULL
      AND xs.grain = p_grain
      AND xs.crop_year = p_crop_year
      AND xs.relevance_score >= 60
      AND (p_grain_week IS NULL OR xs.grain_week = p_grain_week)
  )
  SELECT
    r.id, r.grain, r.post_summary, r.post_url, r.post_author, r.post_date,
    r.relevance_score, r.sentiment, r.category, r.confidence_score,
    r.search_query, r.searched_at, r.source, r.search_mode, r.is_new,
    r.user_voted, r.user_relevant, r.blended_relevance
  FROM ranked r
  WHERE r.cat_rank <= 3
  ORDER BY r.blended_relevance DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.get_signals_with_feedback(text, text, int, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_signals_with_feedback(text, text, int, timestamptz) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Updated get_signals_for_intelligence — adds source, search_mode
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_signals_for_intelligence(text, text, int);

CREATE OR REPLACE FUNCTION public.get_signals_for_intelligence(
  p_grain text,
  p_crop_year text,
  p_grain_week int
)
RETURNS TABLE (
  id uuid,
  post_summary text,
  post_url text,
  post_author text,
  post_date timestamptz,
  relevance_score int,
  sentiment text,
  category text,
  confidence_score int,
  search_query text,
  source text,
  search_mode text,
  blended_relevance int,
  total_votes bigint,
  farmer_relevance_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    xs.id,
    xs.post_summary,
    xs.post_url,
    xs.post_author,
    xs.post_date,
    xs.relevance_score,
    xs.sentiment,
    xs.category,
    xs.confidence_score,
    xs.search_query,
    xs.source,
    xs.search_mode,
    COALESCE(vrs.blended_relevance, xs.relevance_score)::int AS blended_relevance,
    COALESCE(vrs.total_votes, 0) AS total_votes,
    vrs.farmer_relevance_pct
  FROM public.x_market_signals xs
  LEFT JOIN public.v_signal_relevance_scores vrs ON vrs.signal_id = xs.id
  WHERE xs.grain = p_grain
    AND xs.crop_year = p_crop_year
    AND xs.grain_week = p_grain_week
    AND COALESCE(vrs.blended_relevance, xs.relevance_score) >= 60
  ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.get_signals_for_intelligence(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_signals_for_intelligence(text, text, int) TO service_role;
