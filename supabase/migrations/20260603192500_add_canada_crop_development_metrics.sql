-- Admit official Canada crop-development timing metrics.
--
-- Saskatchewan reports current development by crop group as normal, ahead,
-- and behind. These are source context rows, not crop-condition rows.

ALTER TABLE public.canada_crop_progress
  DROP CONSTRAINT IF EXISTS canada_crop_progress_metric_check;

ALTER TABLE public.canada_crop_progress
  ADD CONSTRAINT canada_crop_progress_metric_check
    CHECK (
      metric IN (
        'seeded_pct',
        'emerged_pct',
        'harvested_pct',
        'condition_good_excellent_pct',
        'pasture_good_excellent_pct',
        'soil_moisture_adequate_surplus_pct',
        'development_normal_pct',
        'development_ahead_pct',
        'development_behind_pct'
      )
    );
