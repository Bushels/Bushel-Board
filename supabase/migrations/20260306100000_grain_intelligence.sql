-- ============================================================
-- Bushel Board: AI-generated market intelligence per grain per week
-- Stores thesis narratives, insight cards, and pre-computed KPIs
-- Written by generate-intelligence Edge Function (Task 7)
-- Read by grain detail page (Task 15)
-- ============================================================

CREATE TABLE grain_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week int NOT NULL,

  -- Thesis narrative
  thesis_title text,
  thesis_body text,

  -- Insight cards (JSONB array)
  -- Each: { "signal": "bullish"|"bearish"|"watch", "title": "...", "body": "..." }
  insights jsonb DEFAULT '[]'::jsonb,

  -- Pre-computed KPI display values
  kpi_data jsonb DEFAULT '{}'::jsonb,

  generated_at timestamptz DEFAULT now(),
  model_used text DEFAULT 'claude-sonnet-4-5-20250514',

  UNIQUE(grain, crop_year, grain_week)
);

-- Performance indexes
CREATE INDEX idx_intelligence_grain_week ON grain_intelligence(grain, crop_year, grain_week);

-- RLS: publicly readable (same as cgc_observations), only service_role writes
ALTER TABLE grain_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Intelligence is publicly readable"
  ON grain_intelligence FOR SELECT USING (true);

CREATE POLICY "Only service role can insert intelligence"
  ON grain_intelligence FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only service role can update intelligence"
  ON grain_intelligence FOR UPDATE
  USING (auth.role() = 'service_role');
