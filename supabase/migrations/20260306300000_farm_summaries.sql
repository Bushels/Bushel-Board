-- Farm AI summaries: personalized weekly narratives with delivery percentiles
CREATE TABLE IF NOT EXISTS farm_summaries (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_year     text NOT NULL,
  grain_week    integer NOT NULL,
  summary_text  text NOT NULL,
  percentiles   jsonb NOT NULL DEFAULT '{}',
  generated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, crop_year, grain_week)
);

ALTER TABLE farm_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own summaries"
  ON farm_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages summaries"
  ON farm_summaries FOR ALL
  USING ((current_setting('role'::text)) = 'service_role');
