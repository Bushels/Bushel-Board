-- Repair live fx_rates drift.
--
-- Remote migration history marked the FX migration as applied, but the live
-- table only had date/pair/rate/imported_at. The importer writes a source
-- label, so add it idempotently and reload PostgREST.

ALTER TABLE public.fx_rates
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN public.fx_rates.source IS
  'Provider label for the imported FX observation, e.g. yahoo-finance:USDCAD=X.';

NOTIFY pgrst, 'reload schema';
