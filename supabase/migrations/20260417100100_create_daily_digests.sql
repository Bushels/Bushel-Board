-- Track 38: Daily Owner Digest
-- Table: daily_digests — cached daily operational briefings for bu/ac.
-- RPC: generate_daily_digest(p_date) — aggregates users, data, feedback, conversations.

-- ─── Table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_digests_date ON daily_digests(digest_date DESC);

ALTER TABLE daily_digests ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write digests (admin-only page)
CREATE POLICY "Service role full access" ON daily_digests
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON daily_digests TO service_role;

-- ─── RPC: generate_daily_digest ───────────────────────

CREATE OR REPLACE FUNCTION generate_daily_digest(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_result jsonb;

  -- Aggregates
  v_new_profiles   jsonb;
  v_chat_stats     jsonb;
  v_data_collected jsonb;
  v_feedback       jsonb;
  v_area_stances   jsonb;
BEGIN
  v_start := p_date::timestamptz;
  v_end   := (p_date + 1)::timestamptz;

  -- ── New profiles in last 24h ──────────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'role', p.role,
    'postal_code', LEFT(p.postal_code, 3),
    'created_at', p.created_at
  )), '[]'::jsonb)
  INTO v_new_profiles
  FROM profiles p
  WHERE p.created_at >= v_start AND p.created_at < v_end;

  -- ── Chat statistics ───────────────────────────────
  SELECT jsonb_build_object(
    'total_messages', COUNT(*),
    'unique_users', COUNT(DISTINCT user_id),
    'threads_active', COUNT(DISTINCT thread_id),
    'avg_messages_per_thread', ROUND(
      CASE WHEN COUNT(DISTINCT thread_id) > 0
           THEN COUNT(*)::numeric / COUNT(DISTINCT thread_id)
           ELSE 0
      END, 1
    )
  )
  INTO v_chat_stats
  FROM chat_messages
  WHERE created_at >= v_start AND created_at < v_end;

  -- ── Data collected (local_market_intel) ───────────
  SELECT jsonb_build_object(
    'total_records', COUNT(*),
    'by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'data_type', sub.data_type,
        'count', sub.cnt
      ))
      FROM (
        SELECT data_type, COUNT(*) AS cnt
        FROM local_market_intel
        WHERE reported_at >= v_start AND reported_at < v_end
        GROUP BY data_type
        ORDER BY cnt DESC
      ) sub
    ), '[]'::jsonb),
    'by_grain', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'grain', sub.grain,
        'count', sub.cnt
      ))
      FROM (
        SELECT grain, COUNT(*) AS cnt
        FROM local_market_intel
        WHERE reported_at >= v_start AND reported_at < v_end
        GROUP BY grain
        ORDER BY cnt DESC
      ) sub
    ), '[]'::jsonb)
  )
  INTO v_data_collected
  FROM local_market_intel
  WHERE reported_at >= v_start AND reported_at < v_end;

  -- ── Feedback ──────────────────────────────────────
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'feedback_type', sub.feedback_type,
        'count', sub.cnt
      ))
      FROM (
        SELECT feedback_type, COUNT(*) AS cnt
        FROM feedback_log
        WHERE created_at >= v_start AND created_at < v_end
        GROUP BY feedback_type
        ORDER BY cnt DESC
      ) sub
    ), '[]'::jsonb),
    'high_severity', (
      SELECT COUNT(*)
      FROM feedback_log
      WHERE created_at >= v_start AND created_at < v_end
        AND severity = 'high'
    ),
    'unresolved', (
      SELECT COUNT(*)
      FROM feedback_log
      WHERE resolved = false
    ),
    'recent_messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'feedback_type', sub.feedback_type,
        'farmer_message', sub.farmer_message,
        'bushy_context', sub.bushy_context,
        'severity', sub.severity,
        'created_at', sub.created_at
      ))
      FROM (
        SELECT feedback_type, farmer_message, bushy_context, severity, created_at
        FROM feedback_log
        WHERE created_at >= v_start AND created_at < v_end
        ORDER BY created_at DESC
        LIMIT 10
      ) sub
    ), '[]'::jsonb)
  )
  INTO v_feedback
  FROM feedback_log
  WHERE created_at >= v_start AND created_at < v_end;

  -- ── Area stance changes ───────────────────────────
  -- Check for FSA areas with 3+ new reports (threshold for stance change)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fsa_code', sub.fsa_code,
    'grain', sub.grain,
    'report_count', sub.cnt
  )), '[]'::jsonb)
  INTO v_area_stances
  FROM (
    SELECT fsa_code, grain, COUNT(*) AS cnt
    FROM local_market_intel
    WHERE reported_at >= v_start AND reported_at < v_end
    GROUP BY fsa_code, grain
    HAVING COUNT(*) >= 3
    ORDER BY cnt DESC
  ) sub;

  -- ── Assemble result ───────────────────────────────
  v_result := jsonb_build_object(
    'digest_date', p_date,
    'generated_at', now(),
    'users', jsonb_build_object(
      'new_profiles', v_new_profiles,
      'new_count', jsonb_array_length(v_new_profiles),
      'total_active', (SELECT COUNT(*) FROM profiles)
    ),
    'chat', v_chat_stats,
    'data_collected', v_data_collected,
    'feedback', v_feedback,
    'area_stance_changes', v_area_stances
  );

  -- Cache the digest (upsert)
  INSERT INTO daily_digests (digest_date, data, generated_at)
  VALUES (p_date, v_result, now())
  ON CONFLICT (digest_date) DO UPDATE
  SET data = EXCLUDED.data,
      generated_at = EXCLUDED.generated_at;

  RETURN v_result;
END;
$$;

-- Revoke public access, grant only to service_role
REVOKE EXECUTE ON FUNCTION generate_daily_digest(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_daily_digest(date) TO service_role;
