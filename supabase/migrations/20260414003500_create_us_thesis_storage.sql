CREATE TABLE IF NOT EXISTS us_market_analysis (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_name TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  market_year INTEGER NOT NULL,
  initial_thesis TEXT NOT NULL,
  bull_case TEXT NOT NULL,
  bear_case TEXT NOT NULL,
  final_assessment TEXT,
  stance_score SMALLINT NOT NULL CHECK (stance_score BETWEEN -100 AND 100),
  confidence_score SMALLINT CHECK (confidence_score BETWEEN 0 AND 100),
  recommendation TEXT NOT NULL,
  data_confidence TEXT DEFAULT 'medium',
  key_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_freshness JSONB,
  llm_metadata JSONB,
  model_used TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_name, crop_year, market_year)
);

CREATE TABLE IF NOT EXISTS us_grain_intelligence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_name TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  market_year INTEGER NOT NULL,
  thesis_title TEXT NOT NULL,
  thesis_body TEXT NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  kpi_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_metadata JSONB,
  model_used TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_name, crop_year, market_year)
);

CREATE TABLE IF NOT EXISTS us_score_trajectory (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_name TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  market_year INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scan_type TEXT NOT NULL,
  stance_score SMALLINT NOT NULL CHECK (stance_score BETWEEN -100 AND 100),
  conviction_pct SMALLINT CHECK (conviction_pct BETWEEN 0 AND 100),
  recommendation TEXT NOT NULL,
  trigger TEXT,
  evidence JSONB,
  data_freshness JSONB,
  model_source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_us_market_analysis_market ON us_market_analysis (market_name, market_year);
CREATE INDEX IF NOT EXISTS idx_us_grain_intelligence_market ON us_grain_intelligence (market_name, market_year);
CREATE INDEX IF NOT EXISTS idx_us_score_trajectory_market ON us_score_trajectory (market_name, market_year, recorded_at DESC);

ALTER TABLE us_market_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE us_grain_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE us_score_trajectory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'us_market_analysis'
      AND policyname = 'Authenticated users can read us market analysis'
  ) THEN
    CREATE POLICY "Authenticated users can read us market analysis"
      ON us_market_analysis FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'us_grain_intelligence'
      AND policyname = 'Authenticated users can read us grain intelligence'
  ) THEN
    CREATE POLICY "Authenticated users can read us grain intelligence"
      ON us_grain_intelligence FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'us_score_trajectory'
      AND policyname = 'Authenticated users can read us score trajectory'
  ) THEN
    CREATE POLICY "Authenticated users can read us score trajectory"
      ON us_score_trajectory FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
