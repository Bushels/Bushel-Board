CREATE TABLE IF NOT EXISTS usda_wasde_attributes (
  attribute_id INTEGER PRIMARY KEY,
  attribute_name TEXT NOT NULL,
  variants TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usda_wasde_units (
  unit_id INTEGER PRIMARY KEY,
  unit_description TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usda_wasde_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE usda_wasde_units ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usda_wasde_attributes'
      AND policyname = 'Authenticated users can read USDA WASDE attributes'
  ) THEN
    CREATE POLICY "Authenticated users can read USDA WASDE attributes"
      ON usda_wasde_attributes FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usda_wasde_units'
      AND policyname = 'Authenticated users can read USDA WASDE units'
  ) THEN
    CREATE POLICY "Authenticated users can read USDA WASDE units"
      ON usda_wasde_units FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE OR REPLACE VIEW usda_wasde_mapped AS
SELECT
  r.crop_year,
  r.market_name,
  r.commodity_code,
  r.country_code,
  r.market_year,
  r.calendar_year,
  r.month,
  make_date(r.calendar_year, r.month, 1) AS report_month,
  max(CASE WHEN r.attribute_id = 4 THEN r.value END) AS area_harvested_kha,
  max(CASE WHEN r.attribute_id = 20 THEN r.value END) AS beginning_stocks_kt,
  max(CASE WHEN r.attribute_id = 28 THEN r.value END) AS production_kt,
  max(CASE WHEN r.attribute_id = 57 THEN r.value END) AS imports_kt,
  max(CASE WHEN r.attribute_id = 86 THEN r.value END) AS total_supply_kt,
  max(CASE WHEN r.attribute_id = 88 THEN r.value END) AS exports_kt,
  max(CASE WHEN r.attribute_id = 125 THEN r.value END) AS domestic_consumption_kt,
  max(CASE WHEN r.attribute_id = 130 THEN r.value END) AS feed_domestic_consumption_kt,
  max(CASE WHEN r.attribute_id = 7 THEN r.value END) AS crush_kt,
  max(CASE WHEN r.attribute_id = 149 THEN r.value END) AS food_use_domestic_consumption_kt,
  max(CASE WHEN r.attribute_id = 161 THEN r.value END) AS feed_waste_domestic_consumption_kt,
  max(CASE WHEN r.attribute_id = 176 THEN r.value END) AS ending_stocks_kt,
  max(CASE WHEN r.attribute_id = 178 THEN r.value END) AS total_distribution_kt,
  max(CASE WHEN r.attribute_id = 184 THEN r.value END) AS yield,
  CASE
    WHEN COALESCE(max(CASE WHEN r.attribute_id = 125 THEN r.value END), 0) + COALESCE(max(CASE WHEN r.attribute_id = 88 THEN r.value END), 0) > 0
    THEN ROUND(
      (COALESCE(max(CASE WHEN r.attribute_id = 176 THEN r.value END), 0)
      / (COALESCE(max(CASE WHEN r.attribute_id = 125 THEN r.value END), 0) + COALESCE(max(CASE WHEN r.attribute_id = 88 THEN r.value END), 0))) * 100,
      4
    )
    ELSE NULL
  END AS stocks_to_use_pct,
  max(r.imported_at) AS imported_at
FROM usda_wasde_raw r
GROUP BY
  r.crop_year,
  r.market_name,
  r.commodity_code,
  r.country_code,
  r.market_year,
  r.calendar_year,
  r.month;

COMMENT ON VIEW usda_wasde_mapped IS 'Mapped USDA PSD/WASDE balance-sheet fields for the US thesis lane.';
