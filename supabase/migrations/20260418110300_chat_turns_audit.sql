-- WS1 Task 1.4 — Bushy chat harness
-- Canonical audit log for every completed chat turn. One row per model invocation:
-- token usage, cost, latency, tool calls, experiment variant. Powers cost dashboards,
-- A/B analysis, quality evals, and anomaly detection.

CREATE TABLE chat_turns_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id text NOT NULL,
  thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  response_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  model_id text NOT NULL,
  provider text NOT NULL,
  experiment_id uuid,
  assigned_variant text CHECK (assigned_variant IN ('control','variant')),
  system_prompt_hash text NOT NULL,
  system_prompt_tokens int NOT NULL DEFAULT 0,
  prompt_tokens int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  cached_tokens int NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  latency_first_token_ms int,
  latency_total_ms int,
  tool_call_count int NOT NULL DEFAULT 0,
  tool_calls_jsonb jsonb,
  extractions_written int NOT NULL DEFAULT 0,
  extraction_ids uuid[],
  finish_reason text NOT NULL DEFAULT 'stop'
    CHECK (finish_reason IN ('stop','length','tool_use','error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user_date ON chat_turns_audit(user_id, created_at DESC);
CREATE INDEX idx_audit_model_date ON chat_turns_audit(model_id, created_at DESC);
CREATE INDEX idx_audit_experiment ON chat_turns_audit(experiment_id, assigned_variant)
  WHERE experiment_id IS NOT NULL;
CREATE INDEX idx_audit_errors ON chat_turns_audit(created_at DESC)
  WHERE finish_reason = 'error';

ALTER TABLE chat_turns_audit ENABLE ROW LEVEL SECURITY;

-- Admin-only reads (see note in 20260418110100_nightly_reflections.sql about 'admin' role).
CREATE POLICY "admin read audit" ON chat_turns_audit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
GRANT SELECT ON chat_turns_audit TO authenticated;
