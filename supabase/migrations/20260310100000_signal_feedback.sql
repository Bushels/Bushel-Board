-- Signal Feedback: farmer relevance votes on X market signals
-- Each farmer votes "relevant" or "not for me" on individual X posts.
-- Denormalized user_province and user_crops for fast aggregation
-- without joining profiles/crop_plans at query time.

CREATE TABLE signal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES x_market_signals(id) ON DELETE CASCADE,
  relevant boolean NOT NULL, -- true = relevant, false = not relevant
  -- Denormalized context (snapshotted at vote time for analytics)
  user_province text, -- 'AB', 'SK', 'MB' from profiles at vote time
  user_crops text[], -- ['Canola', 'Wheat'] from crop_plans at vote time
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL,
  voted_at timestamptz DEFAULT now(),

  UNIQUE(user_id, signal_id) -- one vote per user per signal
);

-- Indexes for aggregation queries
CREATE INDEX idx_signal_feedback_signal ON signal_feedback(signal_id);
CREATE INDEX idx_signal_feedback_grain_week ON signal_feedback(grain, crop_year, grain_week);
CREATE INDEX idx_signal_feedback_user ON signal_feedback(user_id);

-- RLS: users can only insert/update/read their own votes
ALTER TABLE signal_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback"
  ON signal_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON signal_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own feedback"
  ON signal_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can read all for aggregation in Edge Functions
CREATE POLICY "Service role reads all feedback"
  ON signal_feedback FOR SELECT
  USING (auth.role() = 'service_role');
