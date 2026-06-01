-- Hard-gate thesis packet cache reads and default refresh inputs to the source-backed V1 board lanes.
-- Spring/Winter Wheat remain parked until class-safe source mappings are admitted.

CREATE OR REPLACE FUNCTION public.refresh_thesis_packet_cache(
  p_canada_grains text[] DEFAULT ARRAY['Corn', 'Soybeans', 'Wheat', 'Amber Durum', 'Canola', 'Barley', 'Oats'],
  p_us_markets text[] DEFAULT ARRAY['Corn', 'Soybeans', 'Wheat', 'Oats', 'Barley'],
  p_crop_year text DEFAULT '2025-2026',
  p_grain_week integer DEFAULT NULL,
  p_market_year integer DEFAULT 2025
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
        AND c.item_name = ANY (ARRAY['Corn', 'Soybeans', 'Wheat', 'Amber Durum', 'Canola', 'Barley', 'Oats'])
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
        AND c.item_name = ANY (ARRAY['Corn', 'Soybeans', 'Wheat', 'Barley', 'Oats'])
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

NOTIFY pgrst, 'reload schema';
