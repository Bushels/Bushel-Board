-- RPC: Get active working memory for an area/grain
CREATE OR REPLACE FUNCTION get_area_knowledge(
  p_fsa_code text,
  p_grain text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS SETOF knowledge_state
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM knowledge_state
  WHERE fsa_code = p_fsa_code
    AND status = 'active'
    AND (p_grain IS NULL OR grain = p_grain OR grain IS NULL)
    AND (p_category IS NULL OR category = p_category)
  ORDER BY last_updated_at DESC
  LIMIT 100;
$$;

-- RPC: Get active patterns for an area
CREATE OR REPLACE FUNCTION get_area_patterns(
  p_fsa_code text,
  p_grain text DEFAULT NULL
)
RETURNS SETOF knowledge_patterns
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM knowledge_patterns
  WHERE (fsa_code = p_fsa_code OR fsa_code IS NULL)
    AND status = 'active'
    AND (p_grain IS NULL OR grain = p_grain OR grain IS NULL)
  ORDER BY confidence_score DESC, last_validated_at DESC
  LIMIT 50;
$$;

-- RPC: Get latest farmer brief
CREATE OR REPLACE FUNCTION get_latest_farmer_brief(
  p_user_id uuid
)
RETURNS SETOF weekly_farmer_briefs
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM weekly_farmer_briefs
  WHERE user_id = p_user_id
  ORDER BY week_ending DESC
  LIMIT 1;
$$;

-- RPC: Get compression summary
CREATE OR REPLACE FUNCTION get_latest_compression(
  p_period text DEFAULT 'daily'
)
RETURNS SETOF compression_summaries
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM compression_summaries
  WHERE period = p_period
  ORDER BY compression_date DESC
  LIMIT 1;
$$;

-- Notify PostgREST to pick up new functions
NOTIFY pgrst, 'reload schema';
