-- Data Layer Foundation V1: universal source-run ledger.
--
-- This table is the audit trail for mechanical data collection. It is not an
-- analysis table and should not contain AI conclusions. Importers write one row
-- per source refresh attempt so thesis packet builders can answer:
--   did the source run, what period did it reach, how many rows changed, and did it fail?

CREATE TABLE IF NOT EXISTS public.source_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_lane text NOT NULL CHECK (
    source_lane IN (
      'canada',
      'us',
      'cross_border',
      'farmer_local',
      'international',
      'analysis',
      'system'
    )
  ),
  collector_name text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('started', 'success', 'partial', 'failed', 'skipped', 'dry_run')
  ),
  source_period_start date,
  source_period_end date,
  latest_source_label text,
  rows_inserted integer NOT NULL DEFAULT 0 CHECK (rows_inserted >= 0),
  rows_updated integer NOT NULL DEFAULT 0 CHECK (rows_updated >= 0),
  rows_skipped integer NOT NULL DEFAULT 0 CHECK (rows_skipped >= 0),
  error_message text,
  source_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_source_runs_source_finished
  ON public.source_runs (source_name, finished_at DESC NULLS LAST, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_runs_lane_status
  ON public.source_runs (source_lane, status, finished_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_source_runs_period
  ON public.source_runs (source_name, source_period_end DESC NULLS LAST);

ALTER TABLE public.source_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "source_runs_select_all" ON public.source_runs;
CREATE POLICY "source_runs_select_all"
  ON public.source_runs
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.source_runs TO anon, authenticated;

COMMENT ON TABLE public.source_runs IS
  'Universal source-run ledger for mechanical data collectors. Stores source freshness, row counts, status, errors, and source metadata; no AI interpretation.';

COMMENT ON COLUMN public.source_runs.source_name IS
  'Canonical source table or source family name, e.g. cgc_observations, usda_export_sales, cftc_cot_positions.';

COMMENT ON COLUMN public.source_runs.source_lane IS
  'Business lane: canada, us, cross_border, farmer_local, international, analysis, or system.';

COMMENT ON COLUMN public.source_runs.status IS
  'Collector result: started, success, partial, failed, skipped, or dry_run.';

NOTIFY pgrst, 'reload schema';
