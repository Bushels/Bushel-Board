-- Add confidence_score (0-100 numeric) and final_assessment (plain-English recommendation)
-- to market_analysis for enhanced Bull/Bear cards display
ALTER TABLE market_analysis
  ADD COLUMN IF NOT EXISTS confidence_score smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_assessment text DEFAULT NULL;

COMMENT ON COLUMN market_analysis.confidence_score IS 'Numeric confidence 0-100 for the analysis confidence gauge';
COMMENT ON COLUMN market_analysis.final_assessment IS 'Plain-English 1-2 sentence recommendation for the farmer';
