-- Widget data provider RPC: returns pre-joined, widget-ready data
-- for the farmer's crop plan grains. Called by the main iOS app to
-- refresh the App Group cache that widgets read from.
--
-- Returns: grain, stance_score, stance_label, price_change_pct,
--          basis_latest, area_modifier, area_confidence, updated_at

CREATE OR REPLACE FUNCTION public.get_widget_data()
RETURNS TABLE(
  grain text,
  stance_score smallint,
  stance_label text,
  price_change_pct numeric,
  basis_latest numeric,
  area_modifier integer,
  area_confidence text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_fsa_code text;
  v_crop_year text;
  v_now_year int;
  v_now_month int;
BEGIN
  -- Derive user from JWT
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get farmer's FSA code from profile
  SELECT substring(p.postal_code, 1, 3)
  INTO v_fsa_code
  FROM profiles p
  WHERE p.id = v_user_id;

  -- Compute current crop year (Aug 1 - Jul 31)
  v_now_year := extract(year FROM now())::int;
  v_now_month := extract(month FROM now())::int;
  IF v_now_month >= 8 THEN
    v_crop_year := v_now_year || '-' || (v_now_year + 1);
  ELSE
    v_crop_year := (v_now_year - 1) || '-' || v_now_year;
  END IF;

  RETURN QUERY
  SELECT
    cp.grain,

    -- Latest stance score for this grain
    ma.stance_score,

    -- Human-readable stance label
    CASE
      WHEN ma.stance_score >= 20 THEN 'Bullish'
      WHEN ma.stance_score >= 5  THEN 'Leaning Bull'
      WHEN ma.stance_score <= -20 THEN 'Bearish'
      WHEN ma.stance_score <= -5  THEN 'Leaning Bear'
      ELSE 'Neutral'
    END::text AS stance_label,

    -- Latest price change % from grain_prices
    gp.change_pct AS price_change_pct,

    -- Latest non-expired basis from the farmer's area
    (
      SELECT lmi.value_numeric
      FROM local_market_intel lmi
      WHERE lmi.fsa_code = v_fsa_code
        AND lmi.grain = cp.grain
        AND lmi.data_type = 'basis'
        AND lmi.expires_at > now()
        AND lmi.confidence != 'outlier'
      ORDER BY lmi.reported_at DESC
      LIMIT 1
    ) AS basis_latest,

    -- Area stance modifier (NULL if insufficient data)
    asm.modifier AS area_modifier,
    asm.confidence AS area_confidence,

    -- When this analysis was generated
    ma.generated_at AS updated_at

  FROM crop_plans cp

  -- Latest market_analysis for this grain + crop year
  LEFT JOIN LATERAL (
    SELECT m.stance_score, m.generated_at
    FROM market_analysis m
    WHERE m.grain = cp.grain
      AND m.crop_year = v_crop_year
    ORDER BY m.generated_at DESC
    LIMIT 1
  ) ma ON true

  -- Latest grain price change
  LEFT JOIN LATERAL (
    SELECT p.change_pct
    FROM grain_prices p
    WHERE p.grain = cp.grain
    ORDER BY p.price_date DESC
    LIMIT 1
  ) gp ON true

  -- Area stance modifier (only if farmer has FSA code)
  LEFT JOIN LATERAL (
    SELECT s.modifier, s.confidence
    FROM get_area_stance_modifier(v_fsa_code, cp.grain) s
    WHERE v_fsa_code IS NOT NULL
  ) asm ON true

  WHERE cp.user_id = v_user_id
    AND cp.crop_year = v_crop_year
  ORDER BY ma.stance_score DESC NULLS LAST;
END;
$$;

-- Grant execute to authenticated users (widgets call via main app with JWT)
GRANT EXECUTE ON FUNCTION public.get_widget_data() TO authenticated;

COMMENT ON FUNCTION public.get_widget_data() IS
  'Returns widget-ready grain stance data for the authenticated user''s crop plan. Track 36 Phase 4A.';
