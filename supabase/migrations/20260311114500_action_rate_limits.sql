-- Per-user action rate limiting for high-volume mutations

CREATE TABLE IF NOT EXISTS public.action_rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_rate_limit_events_lookup
  ON public.action_rate_limit_events(user_id, action_key, created_at DESC);

ALTER TABLE public.action_rate_limit_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_action_key text,
  p_limit int,
  p_window_seconds int
)
RETURNS TABLE (
  allowed boolean,
  remaining int,
  retry_after_seconds int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count int;
  v_oldest timestamptz;
  v_retry_after int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, GREATEST(p_window_seconds, 1);
    RETURN;
  END IF;

  IF p_limit <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'Rate limit config must be positive';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_action_key));

  SELECT
    COUNT(*)::int,
    MIN(created_at)
  INTO v_count, v_oldest
  FROM public.action_rate_limit_events
  WHERE user_id = v_user_id
    AND action_key = p_action_key
    AND created_at >= v_window_start;

  IF v_count >= p_limit THEN
    v_retry_after := GREATEST(
      CEIL(
        EXTRACT(
          EPOCH FROM (
            COALESCE(v_oldest, now()) + make_interval(secs => p_window_seconds) - now()
          )
        )
      )::int,
      1
    );

    RETURN QUERY SELECT false, 0, v_retry_after;
    RETURN;
  END IF;

  INSERT INTO public.action_rate_limit_events (user_id, action_key)
  VALUES (v_user_id, p_action_key);

  DELETE FROM public.action_rate_limit_events
  WHERE user_id = v_user_id
    AND action_key = p_action_key
    AND created_at < now() - interval '14 days';

  RETURN QUERY
  SELECT true, GREATEST(p_limit - v_count - 1, 0), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, int, int) TO authenticated, service_role;
