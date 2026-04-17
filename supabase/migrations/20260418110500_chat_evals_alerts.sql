-- WS1 Task 1.6 — Bushy chat harness
-- Quality eval storage (WS8.3 persona eval job writes here) + alert queue
-- (WS8.1 anomaly detector writes here; admin UI reads unacked).

CREATE TABLE chat_quality_evals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id text NOT NULL,
  eval_run_id uuid NOT NULL,
  evaluator_model text NOT NULL,
  warmth_score smallint CHECK (warmth_score BETWEEN 0 AND 100),
  brevity_score smallint CHECK (brevity_score BETWEEN 0 AND 100),
  accuracy_score smallint CHECK (accuracy_score BETWEEN 0 AND 100),
  persona_fidelity_score smallint CHECK (persona_fidelity_score BETWEEN 0 AND 100),
  helpfulness_score smallint CHECK (helpfulness_score BETWEEN 0 AND 100),
  overall_score smallint CHECK (overall_score BETWEEN 0 AND 100),
  failure_modes text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_turn ON chat_quality_evals(turn_id);
CREATE INDEX idx_quality_run ON chat_quality_evals(eval_run_id);

CREATE TABLE chat_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('CRIT','HIGH','MED','LOW')),
  alert_type text NOT NULL,
  details jsonb NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_unack
  ON chat_alerts(severity, created_at DESC)
  WHERE acknowledged_at IS NULL;

GRANT SELECT ON chat_quality_evals, chat_alerts TO authenticated;
