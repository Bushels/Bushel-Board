-- Add stance_score to market_analysis
-- Range: -100 (strongly bearish) to +100 (strongly bullish)
ALTER TABLE market_analysis ADD COLUMN stance_score smallint;
ALTER TABLE market_analysis ADD CONSTRAINT market_analysis_stance_score_range
  CHECK (stance_score >= -100 AND stance_score <= 100);

COMMENT ON COLUMN market_analysis.stance_score IS 'AI-generated directional stance: -100 strongly bearish, 0 neutral, +100 strongly bullish';
