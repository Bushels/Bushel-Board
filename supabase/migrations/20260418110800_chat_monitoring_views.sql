-- WS1 Task 1.10 — Bushy chat harness
-- Six monitoring views over chat_turns_audit + chat_quality_evals +
-- chat_extractions + chat_engine_config/routing. All read-only, granted to
-- authenticated (admin UI consumes them). Policies on the underlying tables
-- still apply — non-admin reads will return empty rows where RLS blocks.

-- ──────────────────────────────────────────────────────────────────────────
-- v_chat_daily_health — 30-day daily volume / cost / latency / error rate
CREATE OR REPLACE VIEW v_chat_daily_health AS
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

-- ──────────────────────────────────────────────────────────────────────────
-- v_model_performance_7d — per-model quality / cost / latency over 7 days
CREATE OR REPLACE VIEW v_model_performance_7d AS
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

-- ──────────────────────────────────────────────────────────────────────────
-- v_experiment_status — control vs variant comparison for live/completed A/B
CREATE OR REPLACE VIEW v_experiment_status AS
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

-- ──────────────────────────────────────────────────────────────────────────
-- v_memory_health — daily extraction volume + promote/discard/review rates
-- 'kyle_kept_pct' / 'kyle_discarded_pct' come from chat_extractions.review_status
-- (added in 20260418110000). 'lessons_active' is a scalar from extraction_lessons.
CREATE OR REPLACE VIEW v_memory_health AS
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

-- ──────────────────────────────────────────────────────────────────────────
-- v_cost_alerts — users whose daily cost exceeds the fleet p95 (last 7 days)
-- CTE pattern: compute p95 once, then cross-join; avoids correlated subquery.
CREATE OR REPLACE VIEW v_cost_alerts AS
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

-- ──────────────────────────────────────────────────────────────────────────
-- v_tool_usage_7d — tool-call counts over 7 days
-- SCHEMA CONTRACT: WS6 harness must write tool_calls_jsonb with a 'tools' key
-- containing an array of tool names. Example shape:
--   { "tools": ["get_weather","get_price"], "timings_ms": [123, 456] }
-- If the harness stores tool names under a different key this view returns 0 rows.
CREATE OR REPLACE VIEW v_tool_usage_7d AS
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
