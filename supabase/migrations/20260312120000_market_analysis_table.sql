-- market_analysis table: stores Step 3.5 Flash (Round 1) analysis results
-- Used by generate-intelligence (Grok, Round 2) for dual-LLM debate
CREATE TABLE IF NOT EXISTS market_analysis (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  initial_thesis text NOT NULL DEFAULT '',
  bull_case text NOT NULL DEFAULT '',
  bear_case text NOT NULL DEFAULT '',
  historical_context jsonb NOT NULL DEFAULT '{}',
  data_confidence text NOT NULL DEFAULT 'medium',
  key_signals jsonb NOT NULL DEFAULT '[]',
  model_used text,
  llm_metadata jsonb DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_analysis_grain_week_unique UNIQUE (grain, crop_year, grain_week)
);

-- RLS: service role only (Edge Functions write, no direct client access needed)
ALTER TABLE market_analysis ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read market analysis (displayed in grain detail page)
CREATE POLICY "Authenticated users can read market_analysis"
  ON market_analysis FOR SELECT TO authenticated
  USING (true);

-- Index for the common query pattern: latest analysis per grain
CREATE INDEX IF NOT EXISTS idx_market_analysis_grain_week
  ON market_analysis (grain, crop_year, grain_week);
