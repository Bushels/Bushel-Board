-- Track 38: Operational Feedback Loop
-- Table: feedback_log — captures frustration events, bug reports, feature requests,
-- praise, and corrections from farmer conversations with Bushy.

CREATE TABLE IF NOT EXISTS feedback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  thread_id uuid REFERENCES chat_threads(id) ON DELETE SET NULL,
  feedback_type text NOT NULL CHECK (
    feedback_type IN ('frustration', 'bug_report', 'feature_request', 'praise', 'correction')
  ),
  farmer_message text,
  bushy_context text,
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  resolved boolean DEFAULT false,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for operator digest queries
CREATE INDEX idx_feedback_type ON feedback_log(feedback_type, created_at DESC);
CREATE INDEX idx_feedback_unresolved ON feedback_log(resolved) WHERE resolved = false;
CREATE INDEX idx_feedback_created_at ON feedback_log(created_at DESC);

-- RLS
ALTER TABLE feedback_log ENABLE ROW LEVEL SECURITY;

-- Farmers can insert their own feedback (user_id derived from auth.uid())
CREATE POLICY "Users create own feedback" ON feedback_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Farmers can read their own feedback
CREATE POLICY "Users read own feedback" ON feedback_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role manages all (used by daily digest RPC and admin)
CREATE POLICY "Service role full access" ON feedback_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant minimum required permissions
GRANT SELECT, INSERT ON feedback_log TO authenticated;
GRANT ALL ON feedback_log TO service_role;
