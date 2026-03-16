-- Exclude selected farmer accounts from shared AI/community aggregates
-- while still allowing them to use the product normally for testing.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS exclude_from_ai boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_exclude_from_ai
  ON public.profiles (exclude_from_ai);

COMMENT ON COLUMN public.profiles.exclude_from_ai IS
  'When true, the account keeps normal farmer write access but is excluded from shared AI/community aggregates.';

CREATE OR REPLACE VIEW public.v_community_stats AS
WITH current_cy AS (
  SELECT CASE
    WHEN EXTRACT(MONTH FROM now()) >= 8
      THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
    ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
  END AS crop_year
),
delivery_rollup AS (
  SELECT
    cpd.crop_plan_id,
    COALESCE(SUM(cpd.amount_kt), 0) AS delivered_kt
  FROM public.crop_plan_deliveries cpd
  GROUP BY cpd.crop_plan_id
),
normalized AS (
  SELECT
    cp.user_id,
    cp.grain,
    COALESCE(cp.acres_seeded, 0) AS acres_seeded,
    GREATEST(
      COALESCE(cp.starting_grain_kt, 0),
      COALESCE(cp.volume_left_to_sell_kt, 0) + COALESCE(dr.delivered_kt, 0),
      COALESCE(cp.volume_left_to_sell_kt, 0)
    ) AS tracked_kt
  FROM public.crop_plans cp
  JOIN public.profiles pr
    ON pr.id = cp.user_id
   AND pr.role = 'farmer'
   AND COALESCE(pr.exclude_from_ai, false) = false
  LEFT JOIN delivery_rollup dr
    ON dr.crop_plan_id = cp.id
  JOIN current_cy cy
    ON cp.crop_year = cy.crop_year
)
SELECT
  COALESCE(SUM(acres_seeded), 0)::numeric AS total_acres,
  COALESCE(SUM(tracked_kt), 0)::numeric * 1000 AS total_tonnes,
  COUNT(DISTINCT grain)::bigint AS grain_count,
  COUNT(DISTINCT user_id)::bigint AS farmer_count
FROM normalized;

CREATE OR REPLACE FUNCTION public.calculate_delivery_percentiles(
  p_crop_year text DEFAULT NULL
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
  WITH current_cy AS (
    SELECT CASE
      WHEN EXTRACT(MONTH FROM now()) >= 8
        THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
      ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
    END AS crop_year
  ),
  delivery_rollup AS (
    SELECT
      cpd.crop_plan_id,
      COALESCE(SUM(cpd.amount_kt), 0) AS total_delivered_kt
    FROM public.crop_plan_deliveries cpd
    GROUP BY cpd.crop_plan_id
  ),
  subject_plans AS (
    SELECT
      cp.id,
      cp.user_id,
      cp.grain,
      COALESCE(pr.exclude_from_ai, false) AS exclude_from_ai,
      GREATEST(
        COALESCE(cp.starting_grain_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0) + COALESCE(dr.total_delivered_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0)
      ) AS starting_kt,
      COALESCE(cp.volume_left_to_sell_kt, 0) AS remaining_kt,
      LEAST(COALESCE(cp.contracted_kt, 0), COALESCE(cp.volume_left_to_sell_kt, 0)) AS contracted_kt,
      COALESCE(dr.total_delivered_kt, 0) AS total_delivered_kt
    FROM public.crop_plans cp
    JOIN public.profiles pr
      ON pr.id = cp.user_id
     AND pr.role = 'farmer'
    LEFT JOIN delivery_rollup dr
      ON dr.crop_plan_id = cp.id
    WHERE cp.crop_year = COALESCE(p_crop_year, (SELECT crop_year FROM current_cy))
  ),
  pace_base AS (
    SELECT
      sp.user_id,
      sp.grain,
      sp.exclude_from_ai,
      sp.total_delivered_kt,
      CASE
        WHEN sp.starting_kt > 0
          THEN ((GREATEST(sp.starting_kt - sp.remaining_kt, 0) + sp.contracted_kt) / sp.starting_kt) * 100
        ELSE 0
      END AS pace_pct
    FROM subject_plans sp
  ),
  ranked_participants AS (
    SELECT
      pb.user_id,
      pb.grain,
      pb.total_delivered_kt,
      ROUND(pb.pace_pct::numeric, 1) AS delivery_pace_pct,
      ROUND(
        (
          PERCENT_RANK() OVER (
            PARTITION BY pb.grain
            ORDER BY pb.pace_pct
          ) * 100
        )::numeric,
        1
      ) AS percentile_rank
    FROM pace_base pb
    WHERE pb.exclude_from_ai = false
  ),
  excluded_subjects AS (
    SELECT
      pb.user_id,
      pb.grain,
      pb.total_delivered_kt,
      ROUND(pb.pace_pct::numeric, 1) AS delivery_pace_pct,
      CASE
        WHEN COALESCE(peers.peer_count, 0) = 0 THEN 0::numeric
        ELSE ROUND(
          (
            peers.peers_at_or_below::numeric
            / peers.peer_count::numeric
          ) * 100,
          1
        )
      END AS percentile_rank
    FROM pace_base pb
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS peer_count,
        COUNT(*) FILTER (WHERE peer.pace_pct <= pb.pace_pct)::int AS peers_at_or_below
      FROM pace_base peer
      WHERE peer.grain = pb.grain
        AND peer.exclude_from_ai = false
    ) peers ON true
    WHERE pb.exclude_from_ai = true
  )
  SELECT * FROM ranked_participants
  UNION ALL
  SELECT * FROM excluded_subjects;
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
  p75_pace_pct numeric,
  total_starting_kt numeric,
  total_remaining_kt numeric,
  total_contracted_kt numeric,
  total_uncontracted_kt numeric,
  mean_priced_pct numeric,
  mean_contracted_pct numeric,
  mean_open_pct numeric,
  mean_left_to_sell_pct numeric,
  farmers_with_contracts int,
  contracting_farmer_pct numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH delivery_rollup AS (
    SELECT
      cpd.crop_plan_id,
      COALESCE(SUM(cpd.amount_kt), 0) AS total_delivered_kt,
      COALESCE(SUM(CASE WHEN cpd.marketing_type = 'contracted' THEN cpd.amount_kt ELSE 0 END), 0)
        AS contracted_delivered_kt
    FROM public.crop_plan_deliveries cpd
    GROUP BY cpd.crop_plan_id
  ),
  user_stats AS (
    SELECT
      cp.grain,
      cp.user_id,
      GREATEST(
        COALESCE(cp.starting_grain_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0) + COALESCE(dr.total_delivered_kt, 0),
        COALESCE(cp.volume_left_to_sell_kt, 0)
      ) AS starting_kt,
      COALESCE(cp.volume_left_to_sell_kt, 0) AS remaining_kt,
      LEAST(COALESCE(cp.contracted_kt, 0), COALESCE(cp.volume_left_to_sell_kt, 0)) AS contracted_kt,
      GREATEST(
        COALESCE(cp.volume_left_to_sell_kt, 0)
        - LEAST(COALESCE(cp.contracted_kt, 0), COALESCE(cp.volume_left_to_sell_kt, 0)),
        0
      ) AS uncontracted_kt,
      COALESCE(dr.total_delivered_kt, 0) AS delivered_kt,
      COALESCE(dr.contracted_delivered_kt, 0) AS contracted_delivered_kt
    FROM public.crop_plans cp
    JOIN public.profiles pr
      ON pr.id = cp.user_id
     AND pr.role = 'farmer'
     AND COALESCE(pr.exclude_from_ai, false) = false
    LEFT JOIN delivery_rollup dr
      ON dr.crop_plan_id = cp.id
    WHERE cp.crop_year = p_crop_year
      AND (p_grain IS NULL OR cp.grain = p_grain)
  ),
  pace_base AS (
    SELECT
      us.grain,
      us.user_id,
      us.starting_kt,
      us.remaining_kt,
      us.contracted_kt,
      us.uncontracted_kt,
      us.delivered_kt,
      us.contracted_delivered_kt,
      GREATEST(us.starting_kt - us.remaining_kt, 0) AS marketed_kt,
      CASE
        WHEN us.starting_kt > 0
          THEN ((GREATEST(us.starting_kt - us.remaining_kt, 0) + us.contracted_kt) / us.starting_kt) * 100
        ELSE 0
      END AS pace_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN ((GREATEST(us.starting_kt - us.remaining_kt, 0) + us.contracted_kt) / us.starting_kt) * 100
        ELSE 0
      END AS priced_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN (us.contracted_kt / us.starting_kt) * 100
        ELSE 0
      END AS contracted_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN (us.uncontracted_kt / us.starting_kt) * 100
        ELSE 0
      END AS open_pct,
      CASE
        WHEN us.starting_kt > 0
          THEN (us.remaining_kt / us.starting_kt) * 100
        ELSE 0
      END AS left_to_sell_pct,
      CASE
        WHEN us.contracted_kt > 0 OR us.contracted_delivered_kt > 0 THEN true
        ELSE false
      END AS uses_contracts
    FROM user_stats us
  )
  SELECT
    pb.grain,
    COUNT(DISTINCT pb.user_id)::int AS farmer_count,
    ROUND(SUM(pb.delivered_kt)::numeric, 3) AS total_delivered_kt,
    ROUND(AVG(pb.delivered_kt)::numeric, 3) AS mean_delivered_kt,
    ROUND(
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.delivered_kt))::numeric,
      3
    ) AS median_delivered_kt,
    ROUND(AVG(pb.pace_pct)::numeric, 1) AS mean_pace_pct,
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
    ) AS p75_pace_pct,
    ROUND(SUM(pb.starting_kt)::numeric, 3) AS total_starting_kt,
    ROUND(SUM(pb.remaining_kt)::numeric, 3) AS total_remaining_kt,
    ROUND(SUM(pb.contracted_kt)::numeric, 3) AS total_contracted_kt,
    ROUND(SUM(pb.uncontracted_kt)::numeric, 3) AS total_uncontracted_kt,
    ROUND(AVG(pb.priced_pct)::numeric, 1) AS mean_priced_pct,
    ROUND(AVG(pb.contracted_pct)::numeric, 1) AS mean_contracted_pct,
    ROUND(AVG(pb.open_pct)::numeric, 1) AS mean_open_pct,
    ROUND(AVG(pb.left_to_sell_pct)::numeric, 1) AS mean_left_to_sell_pct,
    COUNT(DISTINCT pb.user_id) FILTER (WHERE pb.uses_contracts)::int AS farmers_with_contracts,
    ROUND(
      (
        COUNT(DISTINCT pb.user_id) FILTER (WHERE pb.uses_contracts)::numeric
        / NULLIF(COUNT(DISTINCT pb.user_id), 0)
      ) * 100,
      1
    ) AS contracting_farmer_pct
  FROM pace_base pb
  GROUP BY pb.grain
  HAVING COUNT(DISTINCT pb.user_id) >= 5;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_analytics(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_analytics(text, text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_signal_relevance_scores AS
SELECT
  sf.signal_id,
  xs.grain,
  xs.crop_year,
  xs.grain_week,
  xs.post_summary,
  xs.sentiment,
  xs.category,
  xs.source,
  xs.search_mode,
  xs.searched_at,
  xs.relevance_score AS grok_relevance,
  COUNT(*) AS total_votes,
  COUNT(*) FILTER (WHERE sf.relevant = true) AS relevant_votes,
  COUNT(*) FILTER (WHERE sf.relevant = false) AS not_relevant_votes,
  ROUND(
    COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100
  ) AS farmer_relevance_pct,
  CASE
    WHEN COUNT(*) >= 3 THEN
      LEAST(100, GREATEST(0, ROUND(
        GREATEST(0,
          xs.relevance_score - EXTRACT(EPOCH FROM (now() - xs.searched_at)) / 86400.0 * 5
        ) * 0.50
        + (COUNT(*) FILTER (WHERE sf.relevant = true)::numeric / NULLIF(COUNT(*), 0) * 100) * 0.40
        + LEAST(10,
            CASE
              WHEN COUNT(*) >= 2
                AND EXTRACT(EPOCH FROM (MAX(sf.voted_at) - MIN(sf.voted_at))) < 3600
              THEN 5 ELSE 0
            END
            + CASE WHEN xs.search_mode = 'deep' THEN 3 ELSE 0 END
          )
      )))::int
    ELSE
      LEAST(100, GREATEST(0,
        xs.relevance_score
        - EXTRACT(EPOCH FROM (now() - xs.searched_at)) / 86400.0 * 5
        + CASE WHEN xs.search_mode = 'deep' THEN 3 ELSE 0 END
      ))::int
  END AS blended_relevance
FROM public.signal_feedback sf
JOIN public.profiles pr
  ON pr.id = sf.user_id
 AND pr.role = 'farmer'
 AND COALESCE(pr.exclude_from_ai, false) = false
JOIN public.x_market_signals xs ON xs.id = sf.signal_id
GROUP BY sf.signal_id, xs.id, xs.grain, xs.crop_year, xs.grain_week,
         xs.post_summary, xs.sentiment, xs.category, xs.relevance_score,
         xs.source, xs.search_mode, xs.searched_at;

CREATE OR REPLACE VIEW public.v_grain_sentiment AS
SELECT
  gsv.grain,
  gsv.crop_year,
  gsv.grain_week,
  COUNT(*)::int AS vote_count,
  ROUND(AVG(gsv.sentiment)::numeric, 2) AS avg_sentiment,
  ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment >= 4) / NULLIF(COUNT(*), 0), 1) AS pct_hauling,
  ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment <= 2) / NULLIF(COUNT(*), 0), 1) AS pct_holding,
  ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment = 3) / NULLIF(COUNT(*), 0), 1) AS pct_neutral
FROM public.grain_sentiment_votes gsv
JOIN public.profiles pr
  ON pr.id = gsv.user_id
 AND pr.role = 'farmer'
 AND COALESCE(pr.exclude_from_ai, false) = false
GROUP BY gsv.grain, gsv.crop_year, gsv.grain_week;

GRANT SELECT ON public.v_grain_sentiment TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sentiment_overview(
  p_crop_year text,
  p_grain_week integer
)
RETURNS TABLE (
  grain text,
  vote_count int,
  avg_sentiment numeric,
  pct_holding numeric,
  pct_hauling numeric,
  pct_neutral numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    gsv.grain,
    COUNT(*)::int AS vote_count,
    ROUND(AVG(gsv.sentiment)::numeric, 2) AS avg_sentiment,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment <= 2) / NULLIF(COUNT(*), 0), 1) AS pct_holding,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment >= 4) / NULLIF(COUNT(*), 0), 1) AS pct_hauling,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment = 3) / NULLIF(COUNT(*), 0), 1) AS pct_neutral
  FROM public.grain_sentiment_votes gsv
  JOIN public.profiles pr
    ON pr.id = gsv.user_id
   AND pr.role = 'farmer'
   AND COALESCE(pr.exclude_from_ai, false) = false
  WHERE gsv.crop_year = p_crop_year
    AND gsv.grain_week = p_grain_week
  GROUP BY gsv.grain;
$$;

GRANT EXECUTE ON FUNCTION public.get_sentiment_overview(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_weekly_sentiment(
  p_crop_year text,
  p_grain_week integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.sentiment_history (
    grain,
    grain_slug,
    crop_year,
    grain_week,
    total_votes,
    avg_sentiment,
    holding_pct,
    neutral_pct,
    hauling_pct
  )
  SELECT
    gsv.grain,
    g.slug AS grain_slug,
    gsv.crop_year,
    gsv.grain_week,
    COUNT(*) AS total_votes,
    ROUND(AVG(gsv.sentiment)::numeric, 2) AS avg_sentiment,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment <= 2) / NULLIF(COUNT(*), 0), 2) AS holding_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment = 3) / NULLIF(COUNT(*), 0), 2) AS neutral_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE gsv.sentiment >= 4) / NULLIF(COUNT(*), 0), 2) AS hauling_pct
  FROM public.grain_sentiment_votes gsv
  JOIN public.profiles pr
    ON pr.id = gsv.user_id
   AND pr.role = 'farmer'
   AND COALESCE(pr.exclude_from_ai, false) = false
  JOIN public.grains g ON g.name = gsv.grain
  WHERE gsv.crop_year = p_crop_year
    AND gsv.grain_week = p_grain_week
  GROUP BY gsv.grain, g.slug, gsv.crop_year, gsv.grain_week
  ON CONFLICT (grain, crop_year, grain_week) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    avg_sentiment = EXCLUDED.avg_sentiment,
    holding_pct = EXCLUDED.holding_pct,
    neutral_pct = EXCLUDED.neutral_pct,
    hauling_pct = EXCLUDED.hauling_pct,
    snapshot_at = now();
$$;

REVOKE ALL ON FUNCTION public.snapshot_weekly_sentiment(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_weekly_sentiment(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_daily_sentiment(
  p_crop_year text,
  p_grain_week integer,
  p_snapshot_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_stats AS (
    SELECT
      gsv.grain,
      g.slug AS grain_slug,
      gsv.crop_year,
      gsv.grain_week,
      COUNT(*) AS total_votes,
      ROUND(AVG(gsv.sentiment)::numeric, 2) AS avg_sentiment,
      COUNT(*) FILTER (WHERE gsv.voted_at::date = p_snapshot_date) AS new_votes_today
    FROM public.grain_sentiment_votes gsv
    JOIN public.profiles pr
      ON pr.id = gsv.user_id
     AND pr.role = 'farmer'
     AND COALESCE(pr.exclude_from_ai, false) = false
    JOIN public.grains g ON g.name = gsv.grain
    WHERE gsv.crop_year = p_crop_year
      AND gsv.grain_week = p_grain_week
      AND gsv.voted_at::date <= p_snapshot_date
    GROUP BY gsv.grain, g.slug, gsv.crop_year, gsv.grain_week
  ),
  prev_day AS (
    SELECT grain, crop_year, grain_week, avg_sentiment AS prev_avg
    FROM public.sentiment_daily_rollup
    WHERE crop_year = p_crop_year
      AND grain_week = p_grain_week
      AND snapshot_date = p_snapshot_date - interval '1 day'
  )
  INSERT INTO public.sentiment_daily_rollup (
    grain, grain_slug, crop_year, grain_week, snapshot_date,
    total_votes, avg_sentiment, new_votes_today, sentiment_delta
  )
  SELECT
    cs.grain,
    cs.grain_slug,
    cs.crop_year,
    cs.grain_week,
    p_snapshot_date,
    cs.total_votes,
    cs.avg_sentiment,
    cs.new_votes_today,
    CASE
      WHEN pd.prev_avg IS NOT NULL
      THEN ROUND((cs.avg_sentiment - pd.prev_avg)::numeric, 2)
      ELSE NULL
    END
  FROM current_stats cs
  LEFT JOIN prev_day pd
    ON pd.grain = cs.grain
    AND pd.crop_year = cs.crop_year
    AND pd.grain_week = cs.grain_week
  ON CONFLICT (grain, crop_year, grain_week, snapshot_date) DO UPDATE SET
    total_votes = EXCLUDED.total_votes,
    avg_sentiment = EXCLUDED.avg_sentiment,
    new_votes_today = EXCLUDED.new_votes_today,
    sentiment_delta = EXCLUDED.sentiment_delta,
    snapshot_at = now();
$$;

REVOKE ALL ON FUNCTION public.snapshot_daily_sentiment(text, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_daily_sentiment(text, integer, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_metric_sentiment(
  p_grain text,
  p_crop_year text,
  p_grain_week smallint
)
RETURNS TABLE (
  metric text,
  bullish_count bigint,
  bearish_count bigint,
  total_votes bigint,
  bullish_pct numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    msv.metric,
    COUNT(*) FILTER (WHERE msv.sentiment = 'bullish') AS bullish_count,
    COUNT(*) FILTER (WHERE msv.sentiment = 'bearish') AS bearish_count,
    COUNT(*) AS total_votes,
    ROUND(
      (COUNT(*) FILTER (WHERE msv.sentiment = 'bullish') * 100.0 / NULLIF(COUNT(*), 0))::numeric,
      1
    ) AS bullish_pct
  FROM public.metric_sentiment_votes msv
  JOIN public.profiles pr
    ON pr.id = msv.user_id
   AND pr.role = 'farmer'
   AND COALESCE(pr.exclude_from_ai, false) = false
  WHERE msv.grain = p_grain
    AND msv.crop_year = p_crop_year
    AND msv.grain_week = p_grain_week
  GROUP BY msv.metric
  ORDER BY msv.metric;
$$;
