-- Track 40: Parallel Pipeline Orchestrator
-- Adds pipeline_runs table for observability + RPCs for atomic grain status updates.

-- =============================================================================
-- 1. pipeline_runs table
-- =============================================================================

CREATE TABLE public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','partial','failed')),
  grains_requested text[] NOT NULL,
  grains_completed text[] NOT NULL DEFAULT '{}',
  grains_failed text[] NOT NULL DEFAULT '{}',
  failure_details jsonb NOT NULL DEFAULT '{}',
  farm_summaries_completed int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,
  triggered_by text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','cron','retry'))
);

-- RLS: service_role only — pipeline is internal, not user-facing
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pipeline_runs TO service_role;
-- No grants to authenticated — internal only

-- =============================================================================
-- 2. update_pipeline_grain_status RPC
-- Called by each analyze-grain-market invocation to report completion/failure.
-- Idempotent: will not double-append a grain.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_pipeline_grain_status(
  p_run_id uuid,
  p_grain text,
  p_status text,  -- 'completed' or 'failed'
  p_error text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF p_status = 'completed' THEN
    UPDATE public.pipeline_runs
    SET grains_completed = array_append(grains_completed, p_grain)
    WHERE id = p_run_id
      AND NOT (p_grain = ANY(grains_completed));  -- idempotent
  ELSIF p_status = 'failed' THEN
    UPDATE public.pipeline_runs
    SET grains_failed = array_append(grains_failed, p_grain),
        failure_details = failure_details || jsonb_build_object(p_grain, p_error)
    WHERE id = p_run_id
      AND NOT (p_grain = ANY(grains_failed));  -- idempotent
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_pipeline_grain_status TO service_role;

-- =============================================================================
-- 3. complete_pipeline_run RPC
-- Called by the orchestrator when all grains have reported (or timed out).
-- Finalizes status, sets completed_at and duration_ms.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.complete_pipeline_run(
  p_run_id uuid
)
RETURNS void AS $$
DECLARE
  v_requested int;
  v_completed int;
  v_failed int;
BEGIN
  SELECT
    array_length(grains_requested, 1),
    COALESCE(array_length(grains_completed, 1), 0),
    COALESCE(array_length(grains_failed, 1), 0)
  INTO v_requested, v_completed, v_failed
  FROM public.pipeline_runs WHERE id = p_run_id;

  UPDATE public.pipeline_runs SET
    status = CASE
      WHEN v_failed = 0 AND v_completed = v_requested THEN 'completed'
      WHEN v_completed > 0 THEN 'partial'
      ELSE 'failed'
    END,
    completed_at = now(),
    duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::int * 1000
  WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.complete_pipeline_run TO service_role;
