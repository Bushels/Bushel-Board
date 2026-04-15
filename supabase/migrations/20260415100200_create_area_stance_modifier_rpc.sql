-- Phase 2: Area Stance Modifier RPC
-- Aggregates local_market_intel across all farmers in an FSA to compute
-- a ±30 modifier to the national grain stance score.
--
-- Privacy: returns NULL modifier when <3 active reports (cold start protection).
-- SECURITY DEFINER: reads across users for aggregation while RLS blocks direct access.
-- Basis trend: compares latest vs previous basis report (narrowing = positive for farmer).
-- Condition signal: poor/dry sentiment = supply concern = bullish modifier.

CREATE OR REPLACE FUNCTION public.get_area_stance_modifier(
  p_fsa_code text,
  p_grain text
) RETURNS TABLE(
  modifier integer,
  report_count integer,
  confidence text,
  basis_trend text,
  latest_basis numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report_count integer;
  v_latest_basis numeric;
  v_prev_basis numeric;
  v_basis_trend text;
  v_basis_modifier integer := 0;
  v_condition_modifier integer := 0;
  v_final_modifier integer;
  v_confidence text;
BEGIN
  -- ── Count active, non-outlier reports ─────────────
  SELECT COUNT(*)::integer INTO v_report_count
  FROM public.local_market_intel
  WHERE fsa_code = p_fsa_code
    AND grain = p_grain
    AND expires_at > now()
    AND local_market_intel.confidence != 'outlier';

  -- ── Privacy threshold: need ≥3 reports ────────────
  IF v_report_count < 3 THEN
    RETURN QUERY SELECT
      NULL::integer   AS modifier,
      v_report_count  AS report_count,
      'insufficient'::text AS confidence,
      NULL::text      AS basis_trend,
      NULL::numeric   AS latest_basis;
    RETURN;
  END IF;

  -- ── Latest basis report ───────────────────────────
  SELECT value_numeric INTO v_latest_basis
  FROM public.local_market_intel
  WHERE fsa_code = p_fsa_code
    AND grain = p_grain
    AND data_type = 'basis'
    AND expires_at > now()
    AND local_market_intel.confidence != 'outlier'
    AND value_numeric IS NOT NULL
  ORDER BY reported_at DESC
  LIMIT 1;

  -- ── Previous basis report (for trend) ─────────────
  SELECT value_numeric INTO v_prev_basis
  FROM public.local_market_intel
  WHERE fsa_code = p_fsa_code
    AND grain = p_grain
    AND data_type = 'basis'
    AND expires_at > now()
    AND local_market_intel.confidence != 'outlier'
    AND value_numeric IS NOT NULL
  ORDER BY reported_at DESC
  OFFSET 1
  LIMIT 1;

  -- ── Basis trend + modifier (±15 cap) ──────────────
  -- Narrowing basis (less negative) = positive for farmer = positive modifier
  IF v_latest_basis IS NOT NULL AND v_prev_basis IS NOT NULL THEN
    IF v_latest_basis > v_prev_basis THEN
      v_basis_trend := 'narrowing';
    ELSIF v_latest_basis < v_prev_basis THEN
      v_basis_trend := 'widening';
    ELSE
      v_basis_trend := 'flat';
    END IF;

    v_basis_modifier := LEAST(15, GREATEST(-15,
      ROUND((v_latest_basis - v_prev_basis) * 2)::integer
    ));
  END IF;

  -- ── Crop condition modifier (±10 cap) ─────────────
  -- Poor/dry conditions = supply concern = bullish signal
  SELECT COALESCE(
    CASE
      WHEN COUNT(*) FILTER (
        WHERE value_text ILIKE ANY(ARRAY['%poor%','%dry%','%stressed%','%concern%','%damaged%'])
      ) > COUNT(*) FILTER (
        WHERE value_text ILIKE ANY(ARRAY['%good%','%excellent%','%strong%','%healthy%'])
      ) THEN 5
      WHEN COUNT(*) FILTER (
        WHERE value_text ILIKE ANY(ARRAY['%good%','%excellent%','%strong%','%healthy%'])
      ) > COUNT(*) FILTER (
        WHERE value_text ILIKE ANY(ARRAY['%poor%','%dry%','%stressed%','%concern%','%damaged%'])
      ) THEN -5
      ELSE 0
    END,
    0
  )::integer INTO v_condition_modifier
  FROM public.local_market_intel
  WHERE fsa_code = p_fsa_code
    AND grain = p_grain
    AND data_type = 'crop_condition'
    AND expires_at > now()
    AND local_market_intel.confidence != 'outlier';

  -- ── Final modifier (±30 hard cap) ─────────────────
  v_final_modifier := LEAST(30, GREATEST(-30,
    v_basis_modifier + v_condition_modifier
  ));

  -- ── Confidence level ──────────────────────────────
  IF v_report_count >= 8 THEN
    v_confidence := 'strong';
  ELSIF v_report_count >= 3 THEN
    v_confidence := 'solid';
  ELSE
    v_confidence := 'early';
  END IF;

  RETURN QUERY SELECT
    v_final_modifier AS modifier,
    v_report_count   AS report_count,
    v_confidence     AS confidence,
    v_basis_trend    AS basis_trend,
    v_latest_basis   AS latest_basis;
END;
$$;

-- Grant to authenticated users (called by chat-completion Edge Function via service role,
-- but also accessible for future client-side area overview)
GRANT EXECUTE ON FUNCTION public.get_area_stance_modifier(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_area_stance_modifier(text, text) TO service_role;

COMMENT ON FUNCTION public.get_area_stance_modifier IS
  'Returns area stance modifier (±30 cap) for a grain in a postal FSA. Aggregates local_market_intel across all farmers. Returns NULL modifier when <3 active reports (privacy threshold).';
