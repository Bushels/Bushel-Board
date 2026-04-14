CREATE TABLE IF NOT EXISTS prediction_scorecard (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  source_recorded_at timestamptz NOT NULL,
  scan_type text NOT NULL,
  stance_score smallint NOT NULL CHECK (stance_score BETWEEN -100 AND 100),
  recommendation text NOT NULL,
  model_source text,
  eval_window_days smallint NOT NULL CHECK (eval_window_days IN (7, 14, 28)),
  start_price_date date,
  start_settlement_price numeric,
  end_price_date date,
  end_settlement_price numeric,
  price_change_pct numeric,
  direction_result text NOT NULL CHECK (direction_result IN ('correct', 'wrong', 'neutral', 'unresolved')),
  action_result text NOT NULL CHECK (action_result IN ('helpful', 'too_early', 'too_late', 'wrong', 'unresolved')),
  timing_result text NOT NULL CHECK (timing_result IN ('good', 'late', 'early', 'unclear')),
  score_bias numeric,
  data_freshness jsonb,
  price_verification jsonb,
  notes text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grain, crop_year, grain_week, source_recorded_at, eval_window_days)
);

CREATE INDEX IF NOT EXISTS idx_prediction_scorecard_grain_week
  ON prediction_scorecard (grain, crop_year, grain_week);

CREATE INDEX IF NOT EXISTS idx_prediction_scorecard_recorded_at
  ON prediction_scorecard (source_recorded_at);

COMMENT ON TABLE prediction_scorecard IS 'Evaluates Bushel Board weekly thesis anchors and daily modifier calls over 7, 14, and 28 day windows.';
COMMENT ON COLUMN prediction_scorecard.source_recorded_at IS 'Exact score_trajectory.recorded_at timestamp for the call being judged.';
COMMENT ON COLUMN prediction_scorecard.scan_type IS 'Call type being evaluated, e.g. weekly_debate or daily morning modifier.';
COMMENT ON COLUMN prediction_scorecard.price_verification IS 'Snapshot of price verification state copied from market_analysis metadata when available.';
