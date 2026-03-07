-- Supply & Disposition balance sheet data (AAFC / StatsCan)
CREATE TABLE IF NOT EXISTS supply_disposition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grain_slug text NOT NULL REFERENCES grains(slug),
  crop_year text NOT NULL,
  carry_in_kt numeric,
  production_kt numeric,
  imports_kt numeric,
  total_supply_kt numeric,
  exports_kt numeric,
  food_industrial_kt numeric,
  feed_waste_kt numeric,
  seed_kt numeric,
  total_domestic_kt numeric,
  carry_out_kt numeric,
  source text NOT NULL DEFAULT 'AAFC',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE supply_disposition
  ADD CONSTRAINT supply_disposition_unique
  UNIQUE (grain_slug, crop_year, source);

ALTER TABLE supply_disposition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read supply_disposition"
  ON supply_disposition FOR SELECT USING (true);
CREATE POLICY "Service role write supply_disposition"
  ON supply_disposition FOR ALL
  USING (auth.role() = 'service_role');
