-- supabase/migrations/20260314510000_create_processor_capacity.sql

CREATE TABLE IF NOT EXISTS processor_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grain TEXT NOT NULL,
  crop_year TEXT NOT NULL,
  annual_capacity_kt NUMERIC NOT NULL,
  source TEXT NOT NULL,
  is_approximate BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grain, crop_year)
);

ALTER TABLE processor_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read processor capacity"
  ON processor_capacity FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE processor_capacity IS 'Annual crush/processing capacity per grain. Seeded from AAFC and industry reports.';
