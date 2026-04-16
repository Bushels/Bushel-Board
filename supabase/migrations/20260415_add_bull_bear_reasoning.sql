-- Add structured reasoning columns for two-column Bull/Bear display
ALTER TABLE market_analysis
  ADD COLUMN IF NOT EXISTS bull_reasoning jsonb,
  ADD COLUMN IF NOT EXISTS bear_reasoning jsonb;

COMMENT ON COLUMN market_analysis.bull_reasoning IS 'Array of {fact, reasoning} pairs for two-column bull case display';
COMMENT ON COLUMN market_analysis.bear_reasoning IS 'Array of {fact, reasoning} pairs for two-column bear case display';
