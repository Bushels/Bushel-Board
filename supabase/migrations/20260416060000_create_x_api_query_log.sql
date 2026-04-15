-- X API query log: tracks every X/Twitter search for dedup and budget monitoring
-- Part of Hermes Chat Agent tiered memory system
-- Enables query deduplication and API usage tracking

CREATE TABLE IF NOT EXISTS public.x_api_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  query_hash text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('background', 'chat_realtime')),
  triggered_by_user uuid REFERENCES auth.users(id),
  tweets_returned int NOT NULL DEFAULT 0,
  tweets_relevant int NOT NULL DEFAULT 0,
  extractions_created int NOT NULL DEFAULT 0,
  value_score smallint CHECK (value_score IS NULL OR value_score BETWEEN 0 AND 100),
  searched_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.x_api_query_log IS
  'X API search query log for deduplication and budget monitoring across background and chat-realtime modes.';

-- Query deduplication lookup
CREATE INDEX idx_xapi_dedup
  ON public.x_api_query_log (query_hash, searched_at DESC);

-- Budget monitoring by mode
CREATE INDEX idx_xapi_budget
  ON public.x_api_query_log (mode, searched_at DESC);

-- RLS: service role full access only
ALTER TABLE public.x_api_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages x_api_query_log"
  ON public.x_api_query_log FOR ALL
  USING (auth.role() = 'service_role');
