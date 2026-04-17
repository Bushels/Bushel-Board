-- WS1 Remediation — Bushy chat harness
-- Post-audit hardening: the plan intended "service-role-only" access for 8
-- tables without RLS, but Supabase's pg_default_acl auto-grants anon +
-- authenticated SELECT on every new table in the public schema. Without RLS,
-- those GRANTs mean any browser with the anon key can SELECT from these
-- tables. This migration closes the hole by enabling RLS with no SELECT
-- policy (fail-closed). The service_role bypasses RLS automatically, so the
-- harness and server-side code keep working.
--
-- Defense-in-depth: the 6 monitoring views are re-created WITH
-- (security_invoker=on) so they run as the caller (respecting RLS on
-- underlying tables), not as the view owner. This is the Supabase-recommended
-- pattern (Security Advisor flags `security_definer_view` as ERROR) and
-- prevents the views from becoming an authz back door if the underlying
-- tables later accumulate client-facing readers.
--
-- Admin UIs (WS9) must use server actions with service_role for these
-- tables — consistent with the rest of the codebase.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS (fail-closed) on WS1 tables that were meant to be
--    service-role-only.
--
--    Already RLS-enabled (skipped here, policies already in place):
--      nightly_reflections, chat_turns_audit, chat_extractions
--
--    Newly RLS-enabled by this migration:

ALTER TABLE extraction_lessons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_engine_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_engine_routing     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_engine_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_quality_evals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_alerts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_chunks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_station_map     ENABLE ROW LEVEL SECURITY;

-- No policies = no non-superuser reads. service_role bypasses RLS, so the
-- Bushy harness and nightly jobs (which use service_role) still work.

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Recreate monitoring views with security_invoker=on so they run as the
--    calling user (respecting RLS on underlying tables). This is the
--    Supabase-recommended pattern (Security Advisor flags SECURITY DEFINER
--    views as ERROR).

DROP VIEW IF EXISTS v_chat_daily_health;
CREATE VIEW v_chat_daily_health
WITH (security_invoker = on)
AS
SELECT
  date_trunc('day', created_at)::date AS date,
  COUNT(*) AS total_turns,
  COUNT(DISTINCT user_id) AS unique_users,
  ROUND(AVG(cost_usd)::numeric, 4) AS avg_cost_per_turn,
  ROUND(SUM(cost_usd)::numeric, 2) AS total_cost,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_total_ms)::int AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_total_ms)::int AS p95_latency_ms,
  ROUND(100.0 * SUM((finish_reason = 'error')::int) / COUNT(*), 2) AS error_rate_pct
FROM chat_turns_audit
WHERE created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

DROP VIEW IF EXISTS v_model_performance_7d;
CREATE VIEW v_model_performance_7d
WITH (security_invoker = on)
AS
SELECT
  a.model_id,
  COUNT(*) AS total_turns,
  ROUND(AVG(e.overall_score)::numeric, 1) AS avg_overall_score,
  ROUND(AVG(a.cost_usd)::numeric, 4) AS avg_cost_per_turn,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY a.latency_total_ms)::int AS p95_latency_ms,
  ROUND(100.0 * SUM((a.finish_reason = 'error')::int) / COUNT(*), 2) AS error_rate_pct
FROM chat_turns_audit a
LEFT JOIN chat_quality_evals e USING (turn_id)
WHERE a.created_at > now() - interval '7 days'
GROUP BY a.model_id
ORDER BY total_turns DESC;

DROP VIEW IF EXISTS v_experiment_status;
CREATE VIEW v_experiment_status
WITH (security_invoker = on)
AS
SELECT
  c.id AS experiment_id,
  c.name,
  c.status,
  EXTRACT(day FROM (now() - c.created_at))::int AS days_running,
  COUNT(*) FILTER (WHERE a.assigned_variant = 'control') AS control_turns,
  COUNT(*) FILTER (WHERE a.assigned_variant = 'variant') AS variant_turns,
  ROUND(AVG(e.overall_score) FILTER (WHERE a.assigned_variant = 'control')::numeric, 1) AS control_quality,
  ROUND(AVG(e.overall_score) FILTER (WHERE a.assigned_variant = 'variant')::numeric, 1) AS variant_quality,
  ROUND(AVG(a.cost_usd) FILTER (WHERE a.assigned_variant = 'control')::numeric, 4) AS control_cost,
  ROUND(AVG(a.cost_usd) FILTER (WHERE a.assigned_variant = 'variant')::numeric, 4) AS variant_cost
FROM chat_engine_config c
LEFT JOIN chat_turns_audit a ON a.experiment_id = c.id
LEFT JOIN chat_quality_evals e USING (turn_id)
WHERE c.status IN ('active', 'completed')
GROUP BY c.id, c.name, c.status, c.created_at;

DROP VIEW IF EXISTS v_memory_health;
CREATE VIEW v_memory_health
WITH (security_invoker = on)
AS
SELECT
  date_trunc('day', extracted_at)::date AS date,
  COUNT(*) AS extractions_total,
  ROUND(100.0 * SUM(promoted::int) / NULLIF(COUNT(*), 0), 1) AS promoted_pct,
  ROUND(100.0 * SUM(discarded::int) / NULLIF(COUNT(*), 0), 1) AS discarded_pct,
  ROUND(100.0 * SUM((review_status = 'keep')::int) / NULLIF(COUNT(*), 0), 1) AS kyle_kept_pct,
  ROUND(100.0 * SUM((review_status = 'discard')::int) / NULLIF(COUNT(*), 0), 1) AS kyle_discarded_pct,
  (SELECT COUNT(*) FROM extraction_lessons WHERE status = 'active') AS lessons_active
FROM chat_extractions
WHERE extracted_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

DROP VIEW IF EXISTS v_cost_alerts;
CREATE VIEW v_cost_alerts
WITH (security_invoker = on)
AS
WITH user_daily AS (
  SELECT
    user_id,
    date_trunc('day', created_at)::date AS date,
    SUM(cost_usd) AS daily_cost,
    COUNT(*) AS conversation_count
  FROM chat_turns_audit
  WHERE created_at > now() - interval '7 days'
  GROUP BY 1, 2
),
p95 AS (
  SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY daily_cost) AS p95_cost
  FROM user_daily
)
SELECT
  u.user_id,
  u.date,
  ROUND(u.daily_cost::numeric, 2) AS daily_cost,
  ROUND(p95.p95_cost::numeric, 2) AS p95_user_cost,
  u.conversation_count
FROM user_daily u, p95
WHERE u.daily_cost > p95.p95_cost
ORDER BY u.daily_cost DESC;

DROP VIEW IF EXISTS v_tool_usage_7d;
CREATE VIEW v_tool_usage_7d
WITH (security_invoker = on)
AS
SELECT
  jsonb_array_elements_text(tool_calls_jsonb -> 'tools') AS tool_name,
  COUNT(*) AS total_calls,
  ROUND(AVG(latency_total_ms)::numeric, 0) AS avg_latency_ms
FROM chat_turns_audit
WHERE created_at > now() - interval '7 days'
  AND tool_call_count > 0
  AND tool_calls_jsonb ? 'tools'
GROUP BY 1
ORDER BY total_calls DESC;

GRANT SELECT ON
  v_chat_daily_health, v_model_performance_7d, v_experiment_status,
  v_memory_health, v_cost_alerts, v_tool_usage_7d
TO authenticated;
