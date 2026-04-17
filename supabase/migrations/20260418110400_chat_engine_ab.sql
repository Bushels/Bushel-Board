-- WS1 Task 1.5 — Bushy chat harness
-- A/B routing infrastructure:
--   chat_engine_config  — live experiment config (control + optional variant model, split %)
--   chat_engine_routing — sticky per-user assignment (variant doesn't flicker mid-conversation)
--   chat_engine_runs    — experiment lifecycle event log
-- Seeded with a single 'active' production config using Claude Sonnet 4.6 control,
-- no variant, so behaviour pre-cutover is deterministic until Kyle enables a variant.

CREATE TABLE chat_engine_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','paused','completed')),
  control_model_id text NOT NULL,
  variant_model_id text,
  variant_split_pct int NOT NULL DEFAULT 0
    CHECK (variant_split_pct BETWEEN 0 AND 100),
  compression_model_id text NOT NULL DEFAULT 'claude-opus-4.7',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- Only one active config at a time (partial unique index on status='active')
CREATE UNIQUE INDEX uniq_chat_engine_active
  ON chat_engine_config(status) WHERE status = 'active';

CREATE TABLE chat_engine_routing (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES chat_engine_config(id) ON DELETE CASCADE,
  assigned_variant text NOT NULL CHECK (assigned_variant IN ('control','variant')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment_id)
);

CREATE TABLE chat_engine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES chat_engine_config(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN
    ('started','kill_switch','promoted','completed')),
  event_data jsonb,
  triggered_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed initial production config
INSERT INTO chat_engine_config (name, status, control_model_id, notes)
VALUES ('production-launch', 'active', 'claude-sonnet-4.6',
        'Initial single-model launch — no variant');

GRANT SELECT ON chat_engine_config, chat_engine_routing, chat_engine_runs TO authenticated;
