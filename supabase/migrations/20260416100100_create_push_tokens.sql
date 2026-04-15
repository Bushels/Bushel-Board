-- Push notification device tokens for iOS (APNs).
-- Each user can have multiple devices; each device has one token.

CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  device_token text NOT NULL,
  platform text NOT NULL DEFAULT 'ios',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_token)
);

-- Index for fast lookup when dispatching push to a user
CREATE INDEX idx_push_tokens_user_id ON push_tokens (user_id);

-- RLS: users can only manage their own device tokens
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can read all tokens for dispatch (Edge Functions use service role)
CREATE POLICY "Service role reads all push tokens"
  ON push_tokens
  FOR SELECT
  USING (auth.role() = 'service_role');

-- Auto-update updated_at on token refresh
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_token_updated
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_push_token_timestamp();

COMMENT ON TABLE push_tokens IS 'APNs device tokens for push notification delivery. Track 36 Phase 4.';
