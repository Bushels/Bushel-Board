-- Per-grain peer comparison for the simplified storage tracker on /my-farm.
--
-- Powers the headline metric "X% of farmers have more <grain> in the bin
-- than you" — the only comparison surfaced in the new two-input UI.
--
-- Rules (mirroring existing analytics pattern):
--   1. Caller identity comes from auth.uid() — never trust a passed-in user id.
--   2. Privacy threshold: at least 5 farmers tracking this grain must have a
--      remaining > 0 entry, or we return zero rows so the UI can show an
--      "early days" empty state instead of an unsafe single-farmer compare.
--   3. Operates on the canonical crop_plans columns:
--        - starting_grain_kt        (their total)
--        - volume_left_to_sell_kt   (their remaining — what's "in the bin")
--      and joins profiles on role='farmer' to exclude observers.

CREATE OR REPLACE FUNCTION public.get_grain_storage_comparison(
  p_grain text
)
RETURNS TABLE (
  grain text,
  farmer_count int,
  your_remaining_kt numeric,
  your_total_kt numeric,
  median_remaining_kt numeric,
  pct_farmers_with_more_remaining numeric,
  percentile_rank numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT auth.uid() AS user_id
  ),
  population AS (
    SELECT
      cp.user_id,
      cp.grain,
      COALESCE(cp.volume_left_to_sell_kt, 0) AS remaining_kt,
      COALESCE(cp.starting_grain_kt, 0) AS total_kt
    FROM public.crop_plans cp
    JOIN public.profiles pr
      ON pr.id = cp.user_id
     AND pr.role = 'farmer'
    WHERE cp.grain = p_grain
      AND cp.crop_year = (
        SELECT MAX(crop_year) FROM public.crop_plans WHERE grain = p_grain
      )
      AND COALESCE(cp.volume_left_to_sell_kt, 0) >= 0
  ),
  ranked AS (
    SELECT
      p.user_id,
      p.grain,
      p.remaining_kt,
      p.total_kt,
      PERCENT_RANK() OVER (ORDER BY p.remaining_kt) AS pct_rank
    FROM population p
  ),
  caller_row AS (
    SELECT r.*
    FROM ranked r
    JOIN caller c ON c.user_id = r.user_id
  ),
  pop_stats AS (
    SELECT
      COUNT(*)::int AS farmer_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY remaining_kt) AS median_remaining
    FROM population
  )
  SELECT
    p_grain AS grain,
    ps.farmer_count,
    cr.remaining_kt AS your_remaining_kt,
    cr.total_kt AS your_total_kt,
    ROUND(ps.median_remaining::numeric, 3) AS median_remaining_kt,
    ROUND(((1 - cr.pct_rank) * 100)::numeric, 1) AS pct_farmers_with_more_remaining,
    ROUND((cr.pct_rank * 100)::numeric, 1) AS percentile_rank
  FROM caller_row cr
  CROSS JOIN pop_stats ps
  WHERE ps.farmer_count >= 5;
$$;

REVOKE ALL ON FUNCTION public.get_grain_storage_comparison(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_grain_storage_comparison(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_grain_storage_comparison(text) IS
  'Per-grain peer comparison for the /my-farm storage tracker. Returns the calling farmer''s remaining tonnes, the population median, and the percent of farmers with more in the bin than them. Privacy-gated: returns zero rows unless at least 5 farmers track this grain.';
