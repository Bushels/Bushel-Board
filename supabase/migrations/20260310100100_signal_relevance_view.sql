-- View: v_signal_relevance_scores
-- Aggregates farmer feedback votes per signal and computes a blended
-- relevance score (60% Grok AI + 40% farmer consensus when votes >= 3).
-- Signals with < 3 votes use Grok's original score alone (cold-start safe).

CREATE OR REPLACE VIEW v_signal_relevance_scores AS
SELECT
  sf.signal_id,
  xs.grain,
  xs.crop_year,
  xs.grain_week,
  xs.post_summary,
  xs.sentiment,
  xs.category,
  xs.relevance_score AS grok_relevance,
  COUNT(*) AS total_votes,
  COUNT(*) FILTER (WHERE sf.relevant = true) AS relevant_votes,
  COUNT(*) FILTER (WHERE sf.relevant = false) AS not_relevant_votes,
  ROUND(
    COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100
  ) AS farmer_relevance_pct,
  -- Blended score: 60% Grok + 40% farmer consensus (when votes >= 3)
  CASE
    WHEN COUNT(*) >= 3 THEN
      ROUND(
        xs.relevance_score * 0.6 +
        (COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100) * 0.4
      )
    ELSE xs.relevance_score -- Not enough votes, use Grok score only
  END AS blended_relevance
FROM signal_feedback sf
JOIN x_market_signals xs ON xs.id = sf.signal_id
GROUP BY sf.signal_id, xs.id, xs.grain, xs.crop_year, xs.grain_week,
         xs.post_summary, xs.sentiment, xs.category, xs.relevance_score;
