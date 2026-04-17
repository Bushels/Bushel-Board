-- WS1 Task 1.11 — Bushy chat harness
-- Deterministic A/B assignment. Sticky per (user, experiment): once a user is
-- bucketed they stay bucketed even if variant_split_pct changes later.
--
-- Security: EXECUTE granted to service_role only. The harness must derive
-- p_user_id from auth.uid() server-side — NEVER from request bodies.
-- (See CLAUDE.md: "Never accept a caller-supplied user ID".)

CREATE OR REPLACE FUNCTION assign_chat_engine_variant(p_user_id uuid)
RETURNS TABLE(experiment_id uuid, model_id text, variant text)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_config record;
  v_existing record;
  v_assigned text;
  v_hash int;
BEGIN
  -- There is exactly one active config at a time (enforced by the partial
  -- unique index uniq_chat_engine_active from 20260418110400). Treat the
  -- absence of an active config as a hard error — the harness should never
  -- be called without one.
  SELECT * INTO v_config
  FROM chat_engine_config
  WHERE status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active chat_engine_config';
  END IF;

  -- Fast path: no variant configured → everyone is control.
  IF v_config.variant_model_id IS NULL OR v_config.variant_split_pct = 0 THEN
    RETURN QUERY SELECT v_config.id, v_config.control_model_id, 'control'::text;
    RETURN;
  END IF;

  -- Sticky lookup: keep an existing assignment if one exists.
  SELECT * INTO v_existing
  FROM chat_engine_routing
  WHERE user_id = p_user_id
    AND chat_engine_routing.experiment_id = v_config.id;

  IF FOUND THEN
    v_assigned := v_existing.assigned_variant;
  ELSE
    -- Deterministic bucketing: hash(user_id || experiment_id) mod 100.
    -- Salting with experiment_id ensures a new experiment re-randomizes users.
    v_hash := abs(hashtextextended(p_user_id::text || v_config.id::text, 0)::int) % 100;
    v_assigned := CASE WHEN v_hash < v_config.variant_split_pct THEN 'variant' ELSE 'control' END;

    -- ON CONFLICT DO NOTHING: belt-and-suspenders against concurrent callers.
    INSERT INTO chat_engine_routing(user_id, experiment_id, assigned_variant)
    VALUES (p_user_id, v_config.id, v_assigned)
    ON CONFLICT (user_id, experiment_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT
    v_config.id,
    CASE WHEN v_assigned = 'variant' THEN v_config.variant_model_id ELSE v_config.control_model_id END,
    v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_chat_engine_variant(uuid) TO service_role;
