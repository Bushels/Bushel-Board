-- Admit the world vegetable-oil complex as bounded Canola demand context.
--
-- Source admission (2026-06-09): scripts/import-usda-wasde.py now imports
-- world-level USDA PSD balance rows (country_code '00') for Oilseed Rapeseed
-- (2226000), Oil Rapeseed (4239100), Oil Palm (4243000), and Oil Soybean
-- (4232000) via the PSD /world/ endpoint. This migration:
--   1. Adds a Canola-only `demand.global_veg_oil` block to the Canada thesis
--      packet: latest world stocks/use per commodity plus the prior marketing
--      year at the same report month for a YoY balance comparison.
--   2. Registers the four world commodities in grain_market_mappings as
--      Canola CONTEXT mappings (never primary source truth).
--
-- Boundary: the TypeScript mapper (lib/thesis/rating-domain-mappers.ts) keeps
-- this lane bounded — low-confidence demand tilt only, capped magnitude, only
-- when the CGC demand primary already fired, and only when usda_wasde_raw
-- freshness is strong. The usda_wasde_raw freshness row (lane 'international',
-- monthly 45/75-day thresholds) already feeds Canada packets, so no freshness
-- function change is needed here.

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
        AND cp.region_scope = 'province'
        AND (
          (
            cp.metric IN ('seeded_pct', 'condition_good_excellent_pct')
            AND (
              lower(cp.canonical_grain) = lower(p_grain)
              OR (lower(p_grain) = 'amber durum' AND lower(cp.canonical_grain) = 'durum')
            )
          )
          OR (
            cp.metric IN ('development_normal_pct', 'development_ahead_pct', 'development_behind_pct')
            AND (
              (lower(p_grain) = 'canola' AND lower(cp.crop_name) = 'oilseeds')
              OR (lower(p_grain) IN ('wheat', 'durum', 'amber durum', 'barley', 'oats') AND lower(cp.crop_name) = 'spring cereals')
            )
          )
          OR (
            cp.metric = 'soil_moisture_adequate_surplus_pct'
            AND lower(p_grain) IN ('canola', 'wheat', 'durum', 'amber durum', 'barley', 'oats')
            AND lower(cp.crop_name) IN ('cropland', 'all crops')
          )
        )
      ORDER BY cp.report_date DESC, cp.metric, cp.province_code
      LIMIT 24
    ) cp
  ),
  global_veg_oil AS (
    -- World vegetable-oil balance facts for the bounded Canola demand-context
    -- lane. Latest report month per commodity, paired with the prior marketing
    -- year at the SAME report month so YoY stocks/use comparison works from the
    -- first imported snapshot. Canola-gated: every other grain gets [].
    SELECT coalesce(jsonb_agg(to_jsonb(v.*) ORDER BY v.market_name), '[]'::jsonb) AS payload
    FROM (
      SELECT
        cur.market_name,
        cur.commodity_code,
        cur.market_year,
        cur.report_month,
        cur.ending_stocks_kt,
        cur.stocks_to_use_pct,
        prior.market_year AS prior_market_year,
        prior.ending_stocks_kt AS prior_ending_stocks_kt,
        prior.stocks_to_use_pct AS prior_stocks_to_use_pct
      FROM (
        SELECT DISTINCT ON (m.commodity_code)
          m.market_name,
          m.commodity_code,
          m.market_year,
          m.report_month,
          m.ending_stocks_kt,
          m.stocks_to_use_pct
        FROM public.usda_wasde_mapped m
        WHERE lower(p_grain) = 'canola'
          AND m.country_code = '00'
          AND m.commodity_code IN ('2226000', '4239100', '4243000', '4232000')
          AND m.market_year ~ '^\d{4}$'
          AND m.stocks_to_use_pct IS NOT NULL
        ORDER BY m.commodity_code, m.report_month DESC, m.market_year DESC
      ) cur
      LEFT JOIN public.usda_wasde_mapped prior
        ON prior.commodity_code = cur.commodity_code
        AND prior.country_code = '00'
        AND prior.report_month = cur.report_month
        AND prior.market_year = ((cur.market_year)::int - 1)::text
    ) v
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
    ) || CASE
      WHEN lower(p_grain) = 'canola'
        THEN jsonb_build_object('global_veg_oil', coalesce((SELECT payload FROM global_veg_oil), '[]'::jsonb))
      ELSE '{}'::jsonb
    END,
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
  'Facts-only Canada source packet for a grain/crop_year/grain_week. Separates source facts from AI interpretation. Supply rows prefer the requested packet crop year and include latest province-level seeded, crop-condition, bounded crop-development timing, and bounded cropland/surface-soil moisture rows where mapped. Canola packets additionally carry demand.global_veg_oil: world PSD stocks/use for rapeseed, rapeseed oil, palm oil, and soybean oil as bounded low-confidence demand context.';

-- Visible registry rows: world veg-oil complex is Canola CONTEXT, never
-- primary source truth. These also scope the usda_wasde_raw freshness row to
-- Canola packets via the get_thesis_data_freshness mapping filter (US lanes
-- keep their own usda_wasde_mapped rows).
INSERT INTO public.grain_market_mappings (
  canonical_grain,
  market_lane,
  source_name,
  source_commodity,
  source_class,
  source_region,
  mapping_type,
  mapping_confidence,
  notes
)
VALUES
  (
    'Canola',
    'international',
    'usda_wasde_raw',
    'Oilseed, Rapeseed',
    'official',
    'WORLD',
    'context',
    0.65,
    'World rapeseed PSD balance (code 2226000, country 00). Bounded low-confidence Canola demand context; cannot act as Canola source truth or primary score driver.'
  ),
  (
    'Canola',
    'international',
    'usda_wasde_raw',
    'Oil, Rapeseed',
    'official',
    'WORLD',
    'context',
    0.60,
    'World rapeseed-oil PSD balance (code 4239100, country 00). Bounded low-confidence Canola demand context.'
  ),
  (
    'Canola',
    'international',
    'usda_wasde_raw',
    'Oil, Palm',
    'official',
    'WORLD',
    'context',
    0.50,
    'World palm-oil PSD balance (code 4243000, country 00). Bounded low-confidence Canola demand context; substitutes for canola oil in global veg-oil demand.'
  ),
  (
    'Canola',
    'international',
    'usda_wasde_raw',
    'Oil, Soybean',
    'official',
    'WORLD',
    'context',
    0.55,
    'World soybean-oil PSD balance (code 4232000, country 00). Bounded low-confidence Canola demand context beside the existing soy price/positioning proxies.'
  )
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
