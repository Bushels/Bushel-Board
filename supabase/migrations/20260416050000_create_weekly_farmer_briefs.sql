-- Weekly farmer briefs: personalized weekly intelligence summaries
-- Part of Hermes Chat Agent tiered memory system
-- Combines macro pipeline analysis with micro local intelligence per user

CREATE TABLE IF NOT EXISTS public.weekly_farmer_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  fsa_code text NOT NULL,
  week_ending date NOT NULL,
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  grains_covered text[] NOT NULL DEFAULT '{}',
  macro_micro_alignment jsonb NOT NULL DEFAULT '{}',
  personal_insights jsonb NOT NULL DEFAULT '[]',
  area_intelligence_summary text,
  weather_context text,
  recommended_actions jsonb NOT NULL DEFAULT '[]',
  pipeline_stance_scores jsonb NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_user_week UNIQUE (user_id, week_ending)
);

COMMENT ON TABLE public.weekly_farmer_briefs IS
  'Personalized weekly intelligence briefs combining macro pipeline analysis with micro local intelligence.';

-- User brief lookup
CREATE INDEX idx_briefs_user
  ON public.weekly_farmer_briefs (user_id, week_ending DESC);

-- RLS: users read own briefs, service role full access
ALTER TABLE public.weekly_farmer_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own briefs"
  ON public.weekly_farmer_briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages weekly_farmer_briefs"
  ON public.weekly_farmer_briefs FOR ALL
  USING (auth.role() = 'service_role');
