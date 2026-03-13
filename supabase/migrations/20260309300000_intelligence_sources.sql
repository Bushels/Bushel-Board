-- Document sources and confidence in grain_intelligence insights
-- insights JSONB array now includes:
--   { signal, title, body, sources: ["CGC"|"AAFC"|"X"|"Derived"], confidence: "high"|"medium"|"low" }
-- No schema change needed (JSONB flexible), documenting the contract

COMMENT ON COLUMN grain_intelligence.insights IS
  'Array of insight objects: { signal: bullish|bearish|watch|social, title: string, body: string, sources: ["CGC"|"AAFC"|"X"|"Derived"], confidence: "high"|"medium"|"low" }';
