-- Add LLM call metadata for observability: request_id, finish_reason, token usage
-- Stores per-grain-week call details for debugging and cost tracking.
ALTER TABLE grain_intelligence
  ADD COLUMN IF NOT EXISTS llm_metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN grain_intelligence.llm_metadata IS
  'OpenAI call metadata: { request_id, finish_reason, total_tokens }';
