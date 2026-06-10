-- Source admissions (research-verified 2026-06-10):
-- 1) statcan_wds_raw - Statistics Canada Web Data Service rows for principal field crops
--    (32100359 seeded area/production, 32100007 tri-annual stocks) and monthly canola
--    crushing operations (32100352). Raw long-format spine, usda_wasde_raw-style.
-- 2) sk_cash_prices - Saskatchewan Dashboard weekly provincial average cash prices
--    (10 crops, first-party CSV export endpoints; provincial average, NOT local basis).

CREATE TABLE IF NOT EXISTS public.statcan_wds_raw (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id integer NOT NULL,
  coordinate text NOT NULL,
  vector_id bigint,
  ref_date date NOT NULL,
  geo text NOT NULL,
  dim_group text NOT NULL,
  item text NOT NULL,
  value numeric,
  unit text,
  scalar_factor smallint,
  status_code smallint,
  release_time timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT statcan_wds_raw_key UNIQUE (product_id, coordinate, ref_date)
);

CREATE INDEX IF NOT EXISTS statcan_wds_raw_item_idx
  ON public.statcan_wds_raw (product_id, item, geo, ref_date DESC);

ALTER TABLE public.statcan_wds_raw ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "statcan_wds_raw_public_read" ON public.statcan_wds_raw;
CREATE POLICY "statcan_wds_raw_public_read"
  ON public.statcan_wds_raw FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.sk_cash_prices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crop text NOT NULL,
  series_name text NOT NULL,
  price_date date NOT NULL,
  value numeric,
  unit text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sk_cash_prices_key UNIQUE (series_name, price_date)
);

CREATE INDEX IF NOT EXISTS sk_cash_prices_crop_idx
  ON public.sk_cash_prices (crop, price_date DESC);

ALTER TABLE public.sk_cash_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sk_cash_prices_public_read" ON public.sk_cash_prices;
CREATE POLICY "sk_cash_prices_public_read"
  ON public.sk_cash_prices FOR SELECT
  USING (true);
