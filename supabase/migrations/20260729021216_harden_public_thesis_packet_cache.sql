-- Keep the thesis packet cache as a service-owned internal table.
-- Public readers use the bounded RPC, which removes all aggregated farmer
-- behaviour before returning packets. Presentation-layer suppression is not
-- a privacy boundary when the underlying JSON remains anonymously readable.

CREATE OR REPLACE FUNCTION public.get_thesis_board_cached(
  p_crop_year text DEFAULT '2025-2026',
  p_market_year integer DEFAULT 2025
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
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
        AND c.item_name = ANY (
          ARRAY['Corn', 'Soybeans', 'Wheat', 'Amber Durum', 'Canola', 'Barley', 'Oats']
        )
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
        AND c.item_name = ANY (
          ARRAY['Corn', 'Soybeans', 'Wheat', 'Barley', 'Oats']
        )
    ) ranked
    WHERE row_number = 1
  ),
  canada_packets AS (
    SELECT
      coalesce(
        jsonb_agg((packet - 'farmer_behavior') ORDER BY display_order, item_name),
        '[]'::jsonb
      ) AS packets,
      max(refreshed_at) AS refreshed_at,
      max(source_run_watermark) AS source_run_watermark,
      count(*) AS item_count
    FROM canada
  ),
  us_packets AS (
    SELECT
      coalesce(
        jsonb_agg((packet - 'farmer_behavior') ORDER BY display_order, item_name),
        '[]'::jsonb
      ) AS packets,
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

DROP POLICY IF EXISTS "thesis_packet_cache_select_all"
  ON public.thesis_packet_cache;

REVOKE ALL ON public.thesis_packet_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.thesis_packet_cache
  TO service_role;

REVOKE ALL
  ON FUNCTION public.get_thesis_board_cached(text, integer)
  FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.get_thesis_board_cached(text, integer)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_thesis_board_cached(text, integer) IS
  'Security-definer public thesis read. Returns bounded packets with farmer_behavior removed; the base cache is service-role only.';

NOTIFY pgrst, 'reload schema';
