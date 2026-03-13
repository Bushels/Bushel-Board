-- Stores results of post-import data validation checks.
-- Populated by the validate-import Edge Function.
CREATE TABLE validation_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'warn')),
  checks jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Index for querying latest report per crop year
CREATE INDEX idx_validation_reports_week ON validation_reports (crop_year, grain_week DESC);

-- RLS: publicly readable, only service_role can write
ALTER TABLE validation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read validation_reports" ON validation_reports FOR SELECT USING (true);
