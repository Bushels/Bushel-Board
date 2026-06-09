-- Include admitted Canada crop-condition rows in Canada thesis packets.
--
-- The canada_crop_progress table and latest view already support
-- condition_good_excellent_pct, but the packet RPC only emitted seeded_pct.
-- This keeps the source authority unchanged while making existing official
-- condition rows available to the deterministic weather/crop-condition mapper.

CREATE OR REPLACE FUNCTION public.get_canada_thesis_packet(
  p_grain text,
  p_crop_year text DEFAULT '2025-2026',
  p_grain_week integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH target AS (
    SELECT coalesce(
      p_grain_week,
      (
        SELECT max(grain_week)
        FROM public.cgc_observations
        WHERE crop_year = p_crop_year
      )
    ) AS grain_week
  ),
  current_delivery AS (
    SELECT to_jsonb(v.*) AS payload
    FROM public.v_country_producer_deliveries v, target t
    WHERE v.crop_year = p_crop_year
      AND v.grain_week = t.grain_week
      AND lower(v.grain) = lower(p_grain)
      AND v.period = 'Current Week'
    LIMIT 1
  ),
  crop_year_delivery AS (
    SELECT to_jsonb(v.*) AS payload
    FROM public.v_country_producer_deliveries v, target t
    WHERE v.crop_year = p_crop_year
      AND v.grain_week = t.grain_week
      AND lower(v.grain) = lower(p_grain)
      AND v.period = 'Crop Year'
    LIMIT 1
  ),
  supply AS (
    SELECT to_jsonb(s.*) AS payload
    FROM public.v_supply_disposition_current s
    WHERE s.grain_slug = lower(replace(p_grain, ' ', '-'))
    ORDER BY
      CASE WHEN s.crop_year = p_crop_year THEN 0 ELSE 1 END,
      s.crop_year DESC,
      s.created_at DESC
    LIMIT 1
  ),
  overview AS (
    SELECT to_jsonb(o.*) AS payload
    FROM public.v_grain_overview o
    WHERE lower(o.grain) = lower(p_grain)
    LIMIT 1
  ),
  cgc_exports AS (
    SELECT jsonb_build_object(
      'current_week_kt', sum(ktonnes) FILTER (WHERE period = 'Current Week'),
      'crop_year_kt', sum(ktonnes) FILTER (WHERE period = 'Crop Year')
    ) AS payload
    FROM public.cgc_observations c, target t
    WHERE c.crop_year = p_crop_year
      AND c.grain_week = t.grain_week
      AND lower(c.grain) = lower(p_grain)
      AND c.worksheet IN ('Terminal Exports', 'Terminal Disposition', 'Producer Cars')
      AND c.metric IN ('Exports', 'Export Destinations', 'Shipment Destinations')
  ),
  canada_crop_progress AS (
    SELECT coalesce(jsonb_agg(to_jsonb(cp.*) ORDER BY cp.report_date DESC, cp.metric, cp.province_code), '[]'::jsonb) AS payload
    FROM (
      SELECT *
      FROM public.v_canada_crop_progress_latest cp
      WHERE cp.crop_year = NULLIF(split_part(p_crop_year, '-', 2), '')::smallint
        AND cp.metric IN ('seeded_pct', 'condition_good_excellent_pct')
        AND (
          lower(cp.canonical_grain) = lower(p_grain)
          OR (lower(p_grain) = 'amber durum' AND lower(cp.canonical_grain) = 'durum')
        )
        AND cp.region_scope = 'province'
      ORDER BY cp.report_date DESC, cp.metric, cp.province_code
      LIMIT 12
    ) cp
  ),
  logistics AS (
    SELECT jsonb_build_object(
      'grain_monitor',
        (
          SELECT to_jsonb(gm.*)
          FROM public.grain_monitor_snapshots gm, target t
          WHERE gm.crop_year = p_crop_year
            AND gm.grain_week <= t.grain_week
          ORDER BY gm.grain_week DESC, gm.report_date DESC
          LIMIT 1
        ),
      'producer_cars',
        coalesce(
          (
            SELECT jsonb_agg(to_jsonb(pc.*) ORDER BY pc.grain_week DESC)
            FROM (
              SELECT pc.*
              FROM public.producer_car_allocations pc, target t
              WHERE pc.crop_year = p_crop_year
                AND lower(pc.grain) = lower(p_grain)
                AND pc.grain_week >= greatest(t.grain_week - 2, 1)
              ORDER BY pc.grain_week DESC
              LIMIT 6
            ) pc
          ),
          '[]'::jsonb
        )
    ) AS payload
  ),
  prices AS (
    SELECT coalesce(jsonb_agg(to_jsonb(p.*) ORDER BY p.price_date DESC, p.imported_at DESC), '[]'::jsonb) AS payload
    FROM (
      SELECT *
      FROM public.grain_prices gp
      WHERE lower(gp.grain) = lower(p_grain)
         OR (lower(p_grain) = 'wheat' AND gp.grain IN ('Wheat', 'HRW Wheat', 'Spring Wheat'))
         OR (lower(p_grain) = 'canola' AND gp.grain IN ('Canola', 'Soybean Oil', 'Soybean Meal'))
      ORDER BY gp.price_date DESC, gp.imported_at DESC
      LIMIT 12
    ) p
  ),
  positioning AS (
    SELECT coalesce(jsonb_agg(to_jsonb(c.*) ORDER BY c.report_date DESC), '[]'::jsonb) AS payload
    FROM (
      SELECT *
      FROM public.cftc_cot_positions c
      WHERE lower(c.cgc_grain) = lower(p_grain)
      ORDER BY c.report_date DESC
      LIMIT 12
    ) c
  ),
  farmer_behavior AS (
    SELECT jsonb_build_object(
      'crop_plan_count', count(*),
      'user_count', count(DISTINCT user_id),
      'starting_grain_kt', sum(starting_grain_kt),
      'remaining_grain_kt', sum(volume_left_to_sell_kt),
      'contracted_kt', sum(contracted_kt),
      'uncontracted_kt', sum(uncontracted_kt)
    ) AS payload
    FROM public.crop_plans
    WHERE crop_year = p_crop_year
      AND lower(grain) = lower(p_grain)
  ),
  freshness AS (
    SELECT coalesce(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb) AS payload
    FROM public.get_thesis_data_freshness(p_grain, NULL) f
    WHERE f.source_lane IN ('canada', 'cross_border', 'farmer_local', 'international')
  ),
  quality_warnings AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source_name', f.source_name,
          'status', f.freshness_status,
          'action_hint', f.action_hint
        )
      ) FILTER (WHERE f.freshness_status <> 'strong'),
      '[]'::jsonb
    ) AS payload
    FROM public.get_thesis_data_freshness(p_grain, NULL) f
    WHERE f.source_lane IN ('canada', 'cross_border', 'farmer_local', 'international')
  )
  SELECT jsonb_build_object(
    'lane', 'canada',
    'grain', p_grain,
    'crop_year', p_crop_year,
    'grain_week', (SELECT grain_week FROM target),
    'packet_generated_at', now(),
    'supply', coalesce((SELECT payload FROM supply), '{}'::jsonb) || jsonb_build_object(
      'canada_crop_progress', coalesce((SELECT payload FROM canada_crop_progress), '[]'::jsonb)
    ),
    'demand', jsonb_build_object(
      'producer_deliveries_current_week', coalesce((SELECT payload FROM current_delivery), '{}'::jsonb),
      'producer_deliveries_crop_year', coalesce((SELECT payload FROM crop_year_delivery), '{}'::jsonb),
      'exports', coalesce((SELECT payload FROM cgc_exports), '{}'::jsonb)
    ),
    'logistics', coalesce((SELECT payload FROM logistics), '{}'::jsonb),
    'prices', coalesce((SELECT payload FROM prices), '[]'::jsonb),
    'positioning', coalesce((SELECT payload FROM positioning), '[]'::jsonb),
    'farmer_behavior', coalesce((SELECT payload FROM farmer_behavior), '{}'::jsonb),
    'overview_metrics', coalesce((SELECT payload FROM overview), '{}'::jsonb),
    'weather', jsonb_build_object('status', 'empty', 'source_table', 'weather_cache'),
    'international_context', jsonb_build_object('scope', 'bounded_v1', 'sources', jsonb_build_array('usda_wasde_mapped', 'grain_prices', 'cftc_cot_positions')),
    'freshness', coalesce((SELECT payload FROM freshness), '[]'::jsonb),
    'quality_warnings', coalesce((SELECT payload FROM quality_warnings), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_canada_thesis_packet(text, text, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.get_canada_thesis_packet(text, text, integer) IS
  'Facts-only Canada source packet for a grain/crop_year/grain_week. Separates source facts from AI interpretation. Supply rows prefer the requested packet crop year and include latest province-level Canada seeded and crop-condition rows where directly mapped.';

NOTIFY pgrst, 'reload schema';
