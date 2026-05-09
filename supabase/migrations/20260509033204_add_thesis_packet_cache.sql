-- Data Layer Foundation V1: cached thesis packet board.
--
-- The /thesis page should read current facts quickly. This cache preserves the
-- existing packet RPCs as the source of truth, but moves the expensive fan-out
-- into a refresh step that can run after source collectors update source_runs.

CREATE TABLE IF NOT EXISTS public.thesis_packet_cache (
  cache_key text PRIMARY KEY,
  lane text NOT NULL CHECK (lane IN ('canada', 'us')),
  item_name text NOT NULL,
  item_slug text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  crop_year text,
  grain_week integer,
  market_year integer,
  packet jsonb NOT NULL,
  packet_generated_at timestamptz,
  source_run_watermark timestamptz,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (lane = 'canada' AND crop_year IS NOT NULL AND market_year IS NULL)
    OR
    (lane = 'us' AND market_year IS NOT NULL AND crop_year IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_thesis_packet_cache_lane_order
  ON public.thesis_packet_cache (lane, display_order, item_name);

CREATE INDEX IF NOT EXISTS idx_thesis_packet_cache_canada_read
  ON public.thesis_packet_cache (lane, crop_year, item_slug, refreshed_at DESC)
  WHERE lane = 'canada';

CREATE INDEX IF NOT EXISTS idx_thesis_packet_cache_us_read
  ON public.thesis_packet_cache (lane, market_year, item_slug, refreshed_at DESC)
  WHERE lane = 'us';

CREATE INDEX IF NOT EXISTS idx_thesis_packet_cache_source_watermark
  ON public.thesis_packet_cache (source_run_watermark DESC NULLS LAST, refreshed_at DESC);

ALTER TABLE public.thesis_packet_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "thesis_packet_cache_select_all" ON public.thesis_packet_cache;
CREATE POLICY "thesis_packet_cache_select_all"
  ON public.thesis_packet_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.thesis_packet_cache FROM anon, authenticated;
GRANT SELECT ON public.thesis_packet_cache TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thesis_packet_cache TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_thesis_packet_cache(
  p_canada_grains text[] DEFAULT ARRAY[
    'Wheat',
    'Amber Durum',
    'Canola',
    'Barley',
    'Oats',
    'Peas',
    'Lentils',
    'Flaxseed',
    'Soybeans',
    'Corn',
    'Rye',
    'Mustard Seed',
    'Canaryseed',
    'Chick Peas',
    'Sunflower',
    'Beans'
  ],
  p_us_markets text[] DEFAULT ARRAY['Corn', 'Soybeans', 'Wheat', 'Oats', 'Barley'],
  p_crop_year text DEFAULT '2025-2026',
  p_grain_week integer DEFAULT NULL,
  p_market_year integer DEFAULT 2025
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_refreshed_at timestamptz := now();
  v_source_run_watermark timestamptz;
  v_packet jsonb;
  v_name text;
  v_slug text;
  v_cache_key text;
  v_index integer;
  v_canada_count integer := 0;
  v_us_count integer := 0;
BEGIN
  IF p_crop_year IS NULL OR btrim(p_crop_year) = '' THEN
    RAISE EXCEPTION 'p_crop_year is required';
  END IF;

  IF p_market_year IS NULL THEN
    RAISE EXCEPTION 'p_market_year is required';
  END IF;

  SELECT max(coalesce(finished_at, started_at, created_at))
    INTO v_source_run_watermark
  FROM public.source_runs
  WHERE status IN ('success', 'partial')
    AND source_name <> 'thesis-packet-cache';

  IF array_length(p_canada_grains, 1) IS NOT NULL THEN
    FOR v_index IN array_lower(p_canada_grains, 1)..array_upper(p_canada_grains, 1) LOOP
      v_name := btrim(p_canada_grains[v_index]);
      CONTINUE WHEN v_name IS NULL OR v_name = '';

      v_slug := lower(regexp_replace(v_name, '\s+', '-', 'g'));
      v_cache_key := concat('canada:', v_slug, ':', p_crop_year, ':', coalesce(p_grain_week::text, 'latest'));
      v_packet := public.get_canada_thesis_packet(v_name, p_crop_year, p_grain_week);
      CONTINUE WHEN v_packet IS NULL;

      INSERT INTO public.thesis_packet_cache (
        cache_key,
        lane,
        item_name,
        item_slug,
        display_order,
        crop_year,
        grain_week,
        market_year,
        packet,
        packet_generated_at,
        source_run_watermark,
        refreshed_at,
        updated_at
      )
      VALUES (
        v_cache_key,
        'canada',
        v_name,
        v_slug,
        v_index,
        p_crop_year,
        NULLIF(v_packet->>'grain_week', '')::integer,
        NULL,
        v_packet,
        NULLIF(v_packet->>'packet_generated_at', '')::timestamptz,
        v_source_run_watermark,
        v_refreshed_at,
        v_refreshed_at
      )
      ON CONFLICT (cache_key) DO UPDATE
      SET
        item_name = EXCLUDED.item_name,
        item_slug = EXCLUDED.item_slug,
        display_order = EXCLUDED.display_order,
        grain_week = EXCLUDED.grain_week,
        packet = EXCLUDED.packet,
        packet_generated_at = EXCLUDED.packet_generated_at,
        source_run_watermark = EXCLUDED.source_run_watermark,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = EXCLUDED.updated_at;

      v_canada_count := v_canada_count + 1;
    END LOOP;
  END IF;

  IF array_length(p_us_markets, 1) IS NOT NULL THEN
    FOR v_index IN array_lower(p_us_markets, 1)..array_upper(p_us_markets, 1) LOOP
      v_name := btrim(p_us_markets[v_index]);
      CONTINUE WHEN v_name IS NULL OR v_name = '';

      v_slug := lower(regexp_replace(v_name, '\s+', '-', 'g'));
      v_cache_key := concat('us:', v_slug, ':', p_market_year::text);
      v_packet := public.get_us_thesis_packet(v_name, p_market_year);
      CONTINUE WHEN v_packet IS NULL;

      INSERT INTO public.thesis_packet_cache (
        cache_key,
        lane,
        item_name,
        item_slug,
        display_order,
        crop_year,
        grain_week,
        market_year,
        packet,
        packet_generated_at,
        source_run_watermark,
        refreshed_at,
        updated_at
      )
      VALUES (
        v_cache_key,
        'us',
        v_name,
        v_slug,
        v_index,
        NULL,
        NULL,
        p_market_year,
        v_packet,
        NULLIF(v_packet->>'packet_generated_at', '')::timestamptz,
        v_source_run_watermark,
        v_refreshed_at,
        v_refreshed_at
      )
      ON CONFLICT (cache_key) DO UPDATE
      SET
        item_name = EXCLUDED.item_name,
        item_slug = EXCLUDED.item_slug,
        display_order = EXCLUDED.display_order,
        packet = EXCLUDED.packet,
        packet_generated_at = EXCLUDED.packet_generated_at,
        source_run_watermark = EXCLUDED.source_run_watermark,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = EXCLUDED.updated_at;

      v_us_count := v_us_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'refreshed_at', v_refreshed_at,
    'source_run_watermark', v_source_run_watermark,
    'canada_count', v_canada_count,
    'us_count', v_us_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_thesis_board_cached(
  p_crop_year text DEFAULT '2025-2026',
  p_market_year integer DEFAULT 2025
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH canada AS (
    SELECT *
    FROM (
      SELECT
        c.*,
        row_number() OVER (
          PARTITION BY c.item_slug
          ORDER BY c.refreshed_at DESC, c.grain_week DESC NULLS LAST
        ) AS row_number
      FROM public.thesis_packet_cache c
      WHERE c.lane = 'canada'
        AND c.crop_year = p_crop_year
    ) ranked
    WHERE row_number = 1
  ),
  us AS (
    SELECT *
    FROM (
      SELECT
        c.*,
        row_number() OVER (
          PARTITION BY c.item_slug
          ORDER BY c.refreshed_at DESC
        ) AS row_number
      FROM public.thesis_packet_cache c
      WHERE c.lane = 'us'
        AND c.market_year = p_market_year
    ) ranked
    WHERE row_number = 1
  ),
  canada_packets AS (
    SELECT
      coalesce(jsonb_agg(packet ORDER BY display_order, item_name), '[]'::jsonb) AS packets,
      max(refreshed_at) AS refreshed_at,
      max(source_run_watermark) AS source_run_watermark,
      count(*) AS item_count
    FROM canada
  ),
  us_packets AS (
    SELECT
      coalesce(jsonb_agg(packet ORDER BY display_order, item_name), '[]'::jsonb) AS packets,
      max(refreshed_at) AS refreshed_at,
      max(source_run_watermark) AS source_run_watermark,
      count(*) AS item_count
    FROM us
  ),
  cache_meta AS (
    SELECT
      max(refreshed_at) AS generated_at,
      max(source_run_watermark) AS source_run_watermark
    FROM (
      SELECT refreshed_at, source_run_watermark FROM canada
      UNION ALL
      SELECT refreshed_at, source_run_watermark FROM us
    ) rows
  )
  SELECT jsonb_build_object(
    'generated_at', coalesce((SELECT generated_at FROM cache_meta), now()),
    'source_run_watermark', (SELECT source_run_watermark FROM cache_meta),
    'cache_item_count',
      coalesce((SELECT item_count FROM canada_packets), 0)
      + coalesce((SELECT item_count FROM us_packets), 0),
    'canada', (SELECT packets FROM canada_packets),
    'us', (SELECT packets FROM us_packets)
  );
$$;

REVOKE ALL ON FUNCTION public.refresh_thesis_packet_cache(text[], text[], text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_thesis_packet_cache(text[], text[], text, integer, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_thesis_board_cached(text, integer) TO anon, authenticated, service_role;

COMMENT ON TABLE public.thesis_packet_cache IS
  'Cached facts-only thesis packets for the /thesis board. Refreshed after source_runs move so the UI reads quickly without changing packet source-of-truth.';

COMMENT ON FUNCTION public.refresh_thesis_packet_cache(text[], text[], text, integer, integer) IS
  'Refreshes cached Canada and US thesis packets by calling the existing packet RPCs. Intended for service_role/server-side collector follow-up only.';

COMMENT ON FUNCTION public.get_thesis_board_cached(text, integer) IS
  'Read-only cached packet board for /thesis. Returns Canada and US packet arrays plus cache/source-run watermarks.';

NOTIFY pgrst, 'reload schema';
