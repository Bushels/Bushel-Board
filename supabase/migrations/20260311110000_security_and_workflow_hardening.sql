-- Security and workflow hardening
-- 1. Make Vercel cron the only public ingress into the Edge Function pipeline
-- 2. Enforce farmer-only writes below the UI boundary
-- 3. Remove caller-supplied user IDs from user-scoped RPCs
-- 4. Fix delivery pace math to use delivered + remaining marketed volume
-- 5. Make v_supply_pipeline return one canonical row per grain/year

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cgc-weekly-import') THEN
    PERFORM cron.unschedule('cgc-weekly-import');
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.is_farmer(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND role = 'farmer'
  );
$$;

REVOKE ALL ON FUNCTION public.is_farmer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_farmer(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can insert own crop plans" ON public.crop_plans;
DROP POLICY IF EXISTS "Users can update own crop plans" ON public.crop_plans;
DROP POLICY IF EXISTS "Users can delete own crop plans" ON public.crop_plans;

CREATE POLICY "Farmers can insert own crop plans"
  ON public.crop_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

CREATE POLICY "Farmers can update own crop plans"
  ON public.crop_plans FOR UPDATE
  USING (auth.uid() = user_id AND public.is_farmer(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

CREATE POLICY "Farmers can delete own crop plans"
  ON public.crop_plans FOR DELETE
  USING (auth.uid() = user_id AND public.is_farmer(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own votes" ON public.grain_sentiment_votes;
DROP POLICY IF EXISTS "Users can update own votes" ON public.grain_sentiment_votes;

CREATE POLICY "Farmers can insert own sentiment votes"
  ON public.grain_sentiment_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

CREATE POLICY "Farmers can update own sentiment votes"
  ON public.grain_sentiment_votes FOR UPDATE
  USING (auth.uid() = user_id AND public.is_farmer(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.signal_feedback;
DROP POLICY IF EXISTS "Users can update own feedback" ON public.signal_feedback;

CREATE POLICY "Farmers can insert own feedback"
  ON public.signal_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

CREATE POLICY "Farmers can update own feedback"
  ON public.signal_feedback FOR UPDATE
  USING (auth.uid() = user_id AND public.is_farmer(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_farmer(auth.uid()));

DROP FUNCTION IF EXISTS public.get_signals_with_feedback(text, text, uuid, int);

CREATE OR REPLACE FUNCTION public.get_signals_with_feedback(
  p_grain text,
  p_crop_year text,
  p_grain_week int DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  grain text,
  post_summary text,
  post_author text,
  post_date timestamptz,
  relevance_score int,
  sentiment text,
  category text,
  confidence_score int,
  search_query text,
  user_voted boolean,
  user_relevant boolean,
  blended_relevance int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    xs.id,
    xs.grain,
    xs.post_summary,
    xs.post_author,
    xs.post_date,
    xs.relevance_score,
    xs.sentiment,
    xs.category,
    xs.confidence_score,
    xs.search_query,
    (sf.id IS NOT NULL) AS user_voted,
    sf.relevant AS user_relevant,
    COALESCE(vrs.blended_relevance, xs.relevance_score)::int AS blended_relevance
  FROM public.x_market_signals xs
  LEFT JOIN public.signal_feedback sf
    ON sf.signal_id = xs.id
   AND sf.user_id = auth.uid()
  LEFT JOIN public.v_signal_relevance_scores vrs
    ON vrs.signal_id = xs.id
  WHERE auth.uid() IS NOT NULL
    AND xs.grain = p_grain
    AND xs.crop_year = p_crop_year
    AND xs.relevance_score >= 60
    AND (p_grain_week IS NULL OR xs.grain_week = p_grain_week)
  ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.get_signals_with_feedback(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_signals_with_feedback(text, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_signals_for_intelligence(
  p_grain text,
  p_crop_year text,
  p_grain_week int
)
RETURNS TABLE (
  id uuid,
  post_summary text,
  post_author text,
  post_date timestamptz,
  relevance_score int,
  sentiment text,
  category text,
  confidence_score int,
  search_query text,
  blended_relevance int,
  total_votes bigint,
  farmer_relevance_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    xs.id,
    xs.post_summary,
    xs.post_author,
    xs.post_date,
    xs.relevance_score,
    xs.sentiment,
    xs.category,
    xs.confidence_score,
    xs.search_query,
    COALESCE(vrs.blended_relevance, xs.relevance_score)::int AS blended_relevance,
    COALESCE(vrs.total_votes, 0) AS total_votes,
    vrs.farmer_relevance_pct
  FROM public.x_market_signals xs
  LEFT JOIN public.v_signal_relevance_scores vrs ON vrs.signal_id = xs.id
  WHERE xs.grain = p_grain
    AND xs.crop_year = p_crop_year
    AND xs.grain_week = p_grain_week
    AND COALESCE(vrs.blended_relevance, xs.relevance_score) >= 60
  ORDER BY COALESCE(vrs.blended_relevance, xs.relevance_score) DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.get_signals_for_intelligence(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_signals_for_intelligence(text, text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.calculate_delivery_percentiles(
  p_crop_year text DEFAULT '2025-26'
)
RETURNS TABLE (
  user_id uuid,
  grain text,
  total_delivered_kt numeric,
  delivery_pace_pct numeric,
  percentile_rank numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH farmer_plans AS (
    SELECT
      cp.user_id,
      cp.grain,
      COALESCE(
        (
          SELECT SUM((d->>'amount_kt')::numeric)
          FROM jsonb_array_elements(COALESCE(cp.deliveries, '[]'::jsonb)) AS d
        ),
        0
      ) AS total_delivered_kt,
      COALESCE(cp.volume_left_to_sell_kt, 0) AS remaining_to_sell_kt
    FROM public.crop_plans cp
    JOIN public.profiles pr
      ON pr.id = cp.user_id
     AND pr.role = 'farmer'
    WHERE cp.crop_year = p_crop_year
  ),
  pace_base AS (
    SELECT
      fp.user_id,
      fp.grain,
      fp.total_delivered_kt,
      fp.remaining_to_sell_kt,
      fp.total_delivered_kt + fp.remaining_to_sell_kt AS marketed_volume_kt
    FROM farmer_plans fp
  )
  SELECT
    pb.user_id,
    pb.grain,
    pb.total_delivered_kt,
    CASE
      WHEN pb.marketed_volume_kt > 0
        THEN ROUND((pb.total_delivered_kt / pb.marketed_volume_kt) * 100, 1)
      ELSE 0
    END AS delivery_pace_pct,
    ROUND(
      (
        PERCENT_RANK() OVER (
          PARTITION BY pb.grain
          ORDER BY
            CASE
              WHEN pb.marketed_volume_kt > 0
                THEN pb.total_delivered_kt / pb.marketed_volume_kt
              ELSE 0
            END
        ) * 100
      )::numeric,
      1
    ) AS percentile_rank
  FROM pace_base pb;
$$;

REVOKE ALL ON FUNCTION public.calculate_delivery_percentiles(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_delivery_percentiles(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_delivery_analytics(
  p_crop_year text,
  p_grain text DEFAULT NULL
)
RETURNS TABLE (
  grain text,
  farmer_count int,
  total_delivered_kt numeric,
  mean_delivered_kt numeric,
  median_delivered_kt numeric,
  mean_pace_pct numeric,
  p25_pace_pct numeric,
  p50_pace_pct numeric,
  p75_pace_pct numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH user_stats AS (
    SELECT
      cp.grain,
      cp.user_id,
      COALESCE(
        (
          SELECT SUM((d->>'amount_kt')::numeric)
          FROM jsonb_array_elements(COALESCE(cp.deliveries, '[]'::jsonb)) AS d
        ),
        0
      ) AS delivered_kt,
      COALESCE(cp.volume_left_to_sell_kt, 0) AS remaining_to_sell_kt
    FROM public.crop_plans cp
    JOIN public.profiles pr
      ON pr.id = cp.user_id
     AND pr.role = 'farmer'
    WHERE cp.crop_year = p_crop_year
      AND (p_grain IS NULL OR cp.grain = p_grain)
  ),
  pace_base AS (
    SELECT
      us.grain,
      us.user_id,
      us.delivered_kt,
      us.delivered_kt + us.remaining_to_sell_kt AS marketed_volume_kt,
      CASE
        WHEN us.delivered_kt + us.remaining_to_sell_kt > 0
          THEN LEAST(
            100,
            (us.delivered_kt / (us.delivered_kt + us.remaining_to_sell_kt)) * 100
          )
        ELSE 0
      END AS pace_pct
    FROM user_stats us
  )
  SELECT
    pb.grain,
    COUNT(DISTINCT pb.user_id)::int AS farmer_count,
    ROUND(SUM(pb.delivered_kt), 3) AS total_delivered_kt,
    ROUND(AVG(pb.delivered_kt), 3) AS mean_delivered_kt,
    ROUND(
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.delivered_kt))::numeric,
      3
    ) AS median_delivered_kt,
    ROUND(AVG(pb.pace_pct), 1) AS mean_pace_pct,
    ROUND(
      (PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY pb.pace_pct))::numeric,
      1
    ) AS p25_pace_pct,
    ROUND(
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.pace_pct))::numeric,
      1
    ) AS p50_pace_pct,
    ROUND(
      (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY pb.pace_pct))::numeric,
      1
    ) AS p75_pace_pct
  FROM pace_base pb
  GROUP BY pb.grain
  HAVING COUNT(DISTINCT pb.user_id) >= 5;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_analytics(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_analytics(text, text) TO authenticated;

DROP VIEW IF EXISTS public.v_supply_pipeline;

CREATE VIEW public.v_supply_pipeline AS
WITH ranked_sources AS (
  SELECT
    sd.id,
    sd.grain_slug,
    sd.crop_year,
    sd.carry_in_kt,
    sd.production_kt,
    sd.imports_kt,
    sd.exports_kt,
    sd.food_industrial_kt,
    sd.feed_waste_kt,
    sd.carry_out_kt,
    sd.source,
    sd.created_at,
    g.name AS grain_name,
    ROW_NUMBER() OVER (
      PARTITION BY sd.grain_slug, sd.crop_year
      ORDER BY
        CASE WHEN sd.source ILIKE 'AAFC%' THEN 0 ELSE 1 END,
        sd.created_at DESC,
        sd.id DESC
    ) AS source_rank
  FROM public.supply_disposition sd
  JOIN public.grains g ON g.slug = sd.grain_slug
)
SELECT
  rs.grain_slug,
  rs.crop_year,
  rs.production_kt,
  rs.carry_in_kt,
  COALESCE(rs.production_kt, 0)
    + COALESCE(rs.carry_in_kt, 0)
    + COALESCE(rs.imports_kt, 0) AS total_supply_kt,
  rs.exports_kt,
  rs.food_industrial_kt,
  rs.feed_waste_kt,
  rs.carry_out_kt,
  rs.grain_name,
  rs.source,
  rs.exports_kt AS projected_exports_kt,
  rs.food_industrial_kt AS projected_crush_kt,
  rs.carry_out_kt AS projected_carry_out_kt
FROM ranked_sources rs
WHERE rs.source_rank = 1;
