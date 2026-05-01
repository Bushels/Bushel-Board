-- Widen score_trajectory.scan_type CHECK constraint to allow Producer Cars collectors.
--
-- Current allowed values (from prior migrations + MEMORY.md):
--   weekly_debate
--   collector_crop_progress, collector_grain_monitor, collector_export_sales,
--   collector_cgc, collector_cftc_cot, collector_wasde
--   opus_review_crop_progress, opus_review_grain_monitor, opus_review_export_sales,
--   opus_review_cgc, opus_review_cftc_cot, opus_review_wasde
--
-- This migration adds:
--   collector_producer_cars       — Phase 1 mechanical heartbeat from collect-producer-cars Thursday routine
--   opus_review_producer_cars     — Reserved for future Phase 2 Opus soft-review
--
-- Live data sanity (2026-04-28): only weekly_debate / collector_cgc / collector_grain_monitor
-- rows exist today, so dropping and recreating the CHECK with the full documented set
-- cannot orphan any existing row. This migration is safe.

ALTER TABLE public.score_trajectory
  DROP CONSTRAINT IF EXISTS score_trajectory_scan_type_check;

ALTER TABLE public.score_trajectory
  ADD CONSTRAINT score_trajectory_scan_type_check
  CHECK (scan_type IN (
    -- Friday weekly anchor
    'weekly_debate',
    -- Phase 1 mechanical heartbeats
    'collector_crop_progress',
    'collector_grain_monitor',
    'collector_export_sales',
    'collector_cgc',
    'collector_cftc_cot',
    'collector_wasde',
    'collector_producer_cars',
    -- Phase 2 Opus soft-reviews
    'opus_review_crop_progress',
    'opus_review_grain_monitor',
    'opus_review_export_sales',
    'opus_review_cgc',
    'opus_review_cftc_cot',
    'opus_review_wasde',
    'opus_review_producer_cars'
  ));

COMMENT ON CONSTRAINT score_trajectory_scan_type_check ON public.score_trajectory IS
  'Allowed scan_type values for the CAD score_trajectory writer pipeline. Friday weekly_debate is the thesis-of-record. collector_* are Phase 1 mechanical heartbeats. opus_review_* are Phase 2 soft reviews. Producer Cars added 2026-04-28; see docs/reference/collector-task-configs.md.';

-- Apply same widening to us_score_trajectory if it has the same constraint.
-- Producer Cars is CAD-only, so we only add the values that already exist on the US side
-- plus producer_cars (in case the US desk later picks up CAD producer car signals as a logistics input).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'us_score_trajectory'
  ) THEN
    EXECUTE 'ALTER TABLE public.us_score_trajectory DROP CONSTRAINT IF EXISTS us_score_trajectory_scan_type_check';
    EXECUTE $sql$
      ALTER TABLE public.us_score_trajectory
      ADD CONSTRAINT us_score_trajectory_scan_type_check
      CHECK (scan_type IN (
        'weekly_debate',
        'collector_crop_progress',
        'collector_grain_monitor',
        'collector_export_sales',
        'collector_cgc',
        'collector_cftc_cot',
        'collector_wasde',
        'collector_producer_cars',
        'opus_review_crop_progress',
        'opus_review_grain_monitor',
        'opus_review_export_sales',
        'opus_review_cgc',
        'opus_review_cftc_cot',
        'opus_review_wasde',
        'opus_review_producer_cars'
      ))
    $sql$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
