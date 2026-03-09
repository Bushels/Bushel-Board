-- X Market Signals: scored social posts from x_search
CREATE TABLE IF NOT EXISTS x_market_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week int NOT NULL,
  post_summary text NOT NULL,
  post_author text,
  post_date timestamptz,
  relevance_score int NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  sentiment text NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  category text NOT NULL CHECK (category IN (
    'farmer_report', 'analyst_commentary', 'elevator_bid',
    'export_news', 'weather', 'policy', 'other'
  )),
  confidence_score int NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  search_query text NOT NULL,
  raw_context jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(grain, crop_year, grain_week, post_summary)
);

CREATE INDEX idx_xms_grain_week ON x_market_signals(grain, crop_year, grain_week);
CREATE INDEX idx_xms_relevance ON x_market_signals(relevance_score DESC);

-- RLS: public read, service_role write
ALTER TABLE x_market_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read x_market_signals"
  ON x_market_signals FOR SELECT
  USING (true);

CREATE POLICY "Service role manages x_market_signals"
  ON x_market_signals FOR ALL
  USING (auth.role() = 'service_role');
