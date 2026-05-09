-- Canola source-admission automation support.
--
-- Adds the missing durable storage for crop-size baseline facts and the
-- Canola Council Markets & Stats inventory pass. These are source facts and
-- source metadata only; no thesis prose or recommendations are written here.

ALTER TABLE public.supply_disposition
  ADD COLUMN IF NOT EXISTS seeded_area_acres numeric,
  ADD COLUMN IF NOT EXISTS harvested_area_acres numeric,
  ADD COLUMN IF NOT EXISTS yield_bu_per_acre numeric,
  ADD COLUMN IF NOT EXISTS intended_seeded_area_acres numeric,
  ADD COLUMN IF NOT EXISTS estimate_stage text,
  ADD COLUMN IF NOT EXISTS source_release_date date,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.supply_disposition.seeded_area_acres IS
  'Seeded area in acres when the source provides an area baseline. Keep distinct from intended seeded area.';
COMMENT ON COLUMN public.supply_disposition.harvested_area_acres IS
  'Harvested area in acres when the source provides a final harvested-area baseline.';
COMMENT ON COLUMN public.supply_disposition.yield_bu_per_acre IS
  'Farmer-facing yield in bushels per acre when the source provides it.';
COMMENT ON COLUMN public.supply_disposition.intended_seeded_area_acres IS
  'Seeding-intention acreage. Preliminary by design and not a replacement for final seeded acreage.';
COMMENT ON COLUMN public.supply_disposition.estimate_stage IS
  'Source estimate stage, e.g. final, forecast, seeding_intentions, or mixed_official_baseline.';
COMMENT ON COLUMN public.supply_disposition.source_detail IS
  'Structured provenance for mixed official baseline fields, including source URLs, release dates, and source-table labels.';

DROP VIEW IF EXISTS public.v_supply_disposition_current;

CREATE VIEW public.v_supply_disposition_current
WITH (security_invoker = true)
AS
WITH ranked_sources AS (
  SELECT
    sd.*,
    ROW_NUMBER() OVER (
      PARTITION BY sd.grain_slug, sd.crop_year
      ORDER BY
        CASE WHEN sd.source ILIKE 'AAFC%' THEN 0 ELSE 1 END,
        sd.created_at DESC,
        sd.id DESC
    ) AS source_rank
  FROM public.supply_disposition sd
)
SELECT
  id,
  grain_slug,
  crop_year,
  carry_in_kt,
  production_kt,
  imports_kt,
  total_supply_kt,
  exports_kt,
  food_industrial_kt,
  feed_waste_kt,
  seed_kt,
  total_domestic_kt,
  carry_out_kt,
  seeded_area_acres,
  harvested_area_acres,
  yield_bu_per_acre,
  intended_seeded_area_acres,
  estimate_stage,
  source_release_date,
  source_url,
  source_detail,
  source,
  created_at
FROM ranked_sources
WHERE source_rank = 1;

GRANT SELECT ON public.v_supply_disposition_current TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.canola_council_market_stats_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL,
  page_url text NOT NULL,
  page_title text NOT NULL,
  table_index integer NOT NULL,
  table_title text NOT NULL,
  upstream_source text,
  update_date date,
  period_hint text,
  unit_hint text,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  column_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ingestion_status text NOT NULL DEFAULT 'inventory_only'
    CHECK (ingestion_status IN ('inventory_only', 'ready_for_admission', 'blocked')),
  source_hash text NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_slug, table_index)
);

CREATE INDEX IF NOT EXISTS idx_canola_council_inventory_page
  ON public.canola_council_market_stats_inventory (page_slug, table_index);

CREATE INDEX IF NOT EXISTS idx_canola_council_inventory_updated
  ON public.canola_council_market_stats_inventory (update_date DESC NULLS LAST, scraped_at DESC);

ALTER TABLE public.canola_council_market_stats_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canola_council_inventory_select_all"
  ON public.canola_council_market_stats_inventory;
CREATE POLICY "canola_council_inventory_select_all"
  ON public.canola_council_market_stats_inventory
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "canola_council_inventory_service_role_write"
  ON public.canola_council_market_stats_inventory;
CREATE POLICY "canola_council_inventory_service_role_write"
  ON public.canola_council_market_stats_inventory
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.canola_council_market_stats_inventory TO anon, authenticated;

COMMENT ON TABLE public.canola_council_market_stats_inventory IS
  'Inventory-only scrape ledger for Canola Council Markets & Stats pages. Stores table metadata and provenance before values are admitted as source facts.';

INSERT INTO public.grain_market_mappings (
  canonical_grain,
  market_lane,
  source_name,
  source_commodity,
  source_class,
  source_region,
  mapping_type,
  mapping_confidence,
  notes
)
VALUES
  (
    'Canola',
    'canada',
    'canola_council_market_stats_inventory',
    'Canola Council Markets & Stats',
    'derived',
    'CA',
    'context',
    0.70,
    'Inventory-only aggregator metadata. Values are not source truth until upstream source, update date, period, and units are captured.'
  )
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
