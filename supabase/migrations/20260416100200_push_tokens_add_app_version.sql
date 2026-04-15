-- Add app_version column for tracking which iOS build is sending push tokens.
-- Also add ON DELETE CASCADE to user_id FK (cleanup when user is deleted).

ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS app_version text;

-- Add push notification log for throttle tracking
CREATE TABLE IF NOT EXISTS push_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  trigger_type text NOT NULL,  -- 'basis_change', 'elevator_price', 'weekly_summary', 'area_stance', 're_engagement'
  grain text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_log_user_type ON push_notification_log(user_id, trigger_type, sent_at DESC);

ALTER TABLE push_notification_log ENABLE ROW LEVEL SECURITY;

-- Only service role writes/reads push logs (internal use only)
GRANT ALL ON push_notification_log TO service_role;

COMMENT ON TABLE push_notification_log IS 'Push notification send log for throttle enforcement. Track 36 Phase 4A.';
