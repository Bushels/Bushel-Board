-- ============================================================
-- Grain Monitor Snapshots — system-wide logistics per grain week
-- Source: Government of Canada Grain Monitoring Program PDFs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.grain_monitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  report_date date NOT NULL,

  -- 1. Stocks in Store
  country_stocks_kt numeric,
  country_capacity_pct numeric,
  terminal_stocks_kt numeric,
  terminal_capacity_pct numeric,
  country_stocks_mb_kt numeric,
  country_stocks_sk_kt numeric,
  country_stocks_ab_kt numeric,
  terminal_stocks_vancouver_kt numeric,
  terminal_stocks_prince_rupert_kt numeric,
  terminal_stocks_thunder_bay_kt numeric,
  terminal_stocks_churchill_kt numeric,

  -- 2. Country Deliveries
  country_deliveries_kt numeric,
  country_deliveries_yoy_pct numeric,

  -- 3. Port Performance (cars)
  vancouver_unloads_cars integer,
  prince_rupert_unloads_cars integer,
  thunder_bay_unloads_cars integer,
  churchill_unloads_cars integer,
  total_unloads_cars integer,
  four_week_avg_unloads integer,
  var_to_four_week_avg_pct numeric,
  ytd_unloads_cars integer,
  out_of_car_time_pct numeric,
  out_of_car_time_vancouver_pct numeric,
  out_of_car_time_prince_rupert_pct numeric,

  -- 4. Shipments YTD
  ytd_shipments_vancouver_kt numeric,
  ytd_shipments_prince_rupert_kt numeric,
  ytd_shipments_thunder_bay_kt numeric,
  ytd_shipments_total_kt numeric,
  ytd_shipments_yoy_pct numeric,
  ytd_shipments_vs_3yr_avg_pct numeric,

  -- 5. Vessels
  vessels_vancouver integer,
  vessels_prince_rupert integer,
  vessels_cleared_vancouver integer,
  vessels_cleared_prince_rupert integer,
  vessels_inbound_next_week integer,
  vessel_avg_one_year_vancouver integer,
  vessel_avg_one_year_prince_rupert integer,

  -- 6. Weather & notes
  weather_notes text,
  source_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT grain_monitor_unique_week UNIQUE (crop_year, grain_week)
);

ALTER TABLE public.grain_monitor_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read grain_monitor_snapshots" ON public.grain_monitor_snapshots
  FOR SELECT USING (true);
CREATE POLICY "Service role writes grain_monitor_snapshots" ON public.grain_monitor_snapshots
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_grain_monitor_week ON public.grain_monitor_snapshots (crop_year, grain_week);

-- ============================================================
-- Producer Car Allocations — per-grain per-province forward data
-- Source: CGC Producer Car Allocations weekly reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.producer_car_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_year text NOT NULL,
  grain_week smallint NOT NULL,
  report_covers_weeks text,
  grain text NOT NULL,

  cy_cars_manitoba integer DEFAULT 0,
  cy_cars_saskatchewan integer DEFAULT 0,
  cy_cars_alberta_bc integer DEFAULT 0,
  cy_cars_total integer DEFAULT 0,
  week_cars integer DEFAULT 0,

  dest_canada_licensed integer DEFAULT 0,
  dest_canada_unlicensed integer DEFAULT 0,
  dest_united_states integer DEFAULT 0,
  dest_unknown integer DEFAULT 0,
  dest_pacific integer DEFAULT 0,
  dest_process_elevators integer DEFAULT 0,
  dest_thunder_bay integer DEFAULT 0,
  dest_bay_lakes integer DEFAULT 0,

  source_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT producer_cars_unique UNIQUE (crop_year, grain_week, grain)
);

ALTER TABLE public.producer_car_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read producer_car_allocations" ON public.producer_car_allocations
  FOR SELECT USING (true);
CREATE POLICY "Service role writes producer_car_allocations" ON public.producer_car_allocations
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_producer_cars_grain_week ON public.producer_car_allocations (crop_year, grain_week);
CREATE INDEX idx_producer_cars_grain ON public.producer_car_allocations (grain, crop_year);

-- ============================================================
-- RPC: Get logistics snapshot for a grain week
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_logistics_snapshot(
  p_crop_year text,
  p_grain_week smallint
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'grain_monitor', (
      SELECT jsonb_build_object(
        'grain_week', gm.grain_week,
        'report_date', gm.report_date,
        'country_stocks_kt', gm.country_stocks_kt,
        'country_capacity_pct', gm.country_capacity_pct,
        'terminal_stocks_kt', gm.terminal_stocks_kt,
        'terminal_capacity_pct', gm.terminal_capacity_pct,
        'country_deliveries_kt', gm.country_deliveries_kt,
        'country_deliveries_yoy_pct', gm.country_deliveries_yoy_pct,
        'total_unloads_cars', gm.total_unloads_cars,
        'var_to_four_week_avg_pct', gm.var_to_four_week_avg_pct,
        'out_of_car_time_pct', gm.out_of_car_time_pct,
        'ytd_shipments_total_kt', gm.ytd_shipments_total_kt,
        'ytd_shipments_yoy_pct', gm.ytd_shipments_yoy_pct,
        'vessels_vancouver', gm.vessels_vancouver,
        'vessels_prince_rupert', gm.vessels_prince_rupert,
        'vessel_avg_one_year_vancouver', gm.vessel_avg_one_year_vancouver,
        'weather_notes', gm.weather_notes,
        'provincial_stocks', jsonb_build_object(
          'mb_kt', gm.country_stocks_mb_kt,
          'sk_kt', gm.country_stocks_sk_kt,
          'ab_kt', gm.country_stocks_ab_kt
        ),
        'port_stocks', jsonb_build_object(
          'vancouver_kt', gm.terminal_stocks_vancouver_kt,
          'prince_rupert_kt', gm.terminal_stocks_prince_rupert_kt,
          'thunder_bay_kt', gm.terminal_stocks_thunder_bay_kt
        )
      )
      FROM public.grain_monitor_snapshots gm
      WHERE gm.crop_year = p_crop_year
        AND gm.grain_week <= p_grain_week
      ORDER BY gm.grain_week DESC
      LIMIT 1
    ),
    'producer_cars', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'grain', pc.grain,
          'grain_week', pc.grain_week,
          'cy_cars_total', pc.cy_cars_total,
          'week_cars', pc.week_cars,
          'dest_united_states', pc.dest_united_states,
          'dest_canada_licensed', pc.dest_canada_licensed,
          'dest_canada_unlicensed', pc.dest_canada_unlicensed,
          'by_province', jsonb_build_object(
            'mb', pc.cy_cars_manitoba,
            'sk', pc.cy_cars_saskatchewan,
            'ab_bc', pc.cy_cars_alberta_bc
          )
        )
      )
      FROM public.producer_car_allocations pc
      WHERE pc.crop_year = p_crop_year
        AND pc.grain_week = (
          SELECT MAX(pc2.grain_week)
          FROM public.producer_car_allocations pc2
          WHERE pc2.crop_year = p_crop_year
            AND pc2.grain_week <= p_grain_week + 3
        )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_logistics_snapshot(text, smallint) TO anon, authenticated, service_role;
