-- Farmer sentiment votes: one vote per user per grain per week
CREATE TABLE grain_sentiment_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grain text NOT NULL,
  crop_year text NOT NULL,
  grain_week integer NOT NULL CHECK (grain_week BETWEEN 1 AND 52),
  sentiment smallint NOT NULL CHECK (sentiment BETWEEN 1 AND 5),
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, grain, crop_year, grain_week)
);

-- Index for fast aggregate queries per grain/week
CREATE INDEX idx_sentiment_grain_week
  ON grain_sentiment_votes (grain, crop_year, grain_week);

-- RLS
ALTER TABLE grain_sentiment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own votes"
  ON grain_sentiment_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON grain_sentiment_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own votes"
  ON grain_sentiment_votes FOR SELECT
  USING (auth.uid() = user_id);
