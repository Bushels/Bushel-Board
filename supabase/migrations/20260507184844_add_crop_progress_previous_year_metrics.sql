-- Admit USDA NASS "PROGRESS, PREVIOUS YEAR" fields into the canonical crop
-- progress row so premium seeding maps can show source-backed year-over-year
-- planting/emergence comparisons on hover.

alter table public.usda_crop_progress
  add column if not exists planted_pct_previous_year numeric,
  add column if not exists planted_pct_yoy_change numeric,
  add column if not exists emerged_pct_previous_year numeric,
  add column if not exists emerged_pct_yoy_change numeric;

comment on column public.usda_crop_progress.planted_pct_previous_year is
  'USDA NASS PROGRESS, PREVIOUS YEAR / PCT PLANTED for the same report week.';
comment on column public.usda_crop_progress.planted_pct_yoy_change is
  'Current planted_pct minus planted_pct_previous_year, in percentage points.';
comment on column public.usda_crop_progress.emerged_pct_previous_year is
  'USDA NASS PROGRESS, PREVIOUS YEAR / PCT EMERGED for the same report week.';
comment on column public.usda_crop_progress.emerged_pct_yoy_change is
  'Current emerged_pct minus emerged_pct_previous_year, in percentage points.';

drop function if exists public.get_seeding_seismograph(text, smallint);

create or replace function public.get_seeding_seismograph(
  p_commodity text,
  p_market_year smallint
)
returns table (
  state_code text,
  state_name text,
  centroid_lng numeric,
  centroid_lat numeric,
  week_ending date,
  planted_pct numeric,
  emerged_pct numeric,
  harvested_pct numeric,
  planted_pct_vs_avg numeric,
  planted_pct_previous_year numeric,
  planted_pct_yoy_change numeric,
  emerged_pct_previous_year numeric,
  emerged_pct_yoy_change numeric,
  good_excellent_pct numeric,
  condition_index numeric,
  ge_pct_yoy_change numeric
)
language sql stable as $$
  select
    c.state_code,
    c.state_name,
    c.centroid_lng,
    c.centroid_lat,
    p.week_ending,
    p.planted_pct,
    p.emerged_pct,
    p.harvested_pct,
    p.planted_pct_vs_avg,
    p.planted_pct_previous_year,
    p.planted_pct_yoy_change,
    p.emerged_pct_previous_year,
    p.emerged_pct_yoy_change,
    p.good_excellent_pct,
    p.condition_index,
    p.ge_pct_yoy_change
  from public.usda_crop_progress p
  join public.us_state_centroids c
    on upper(c.state_name) = upper(p.state)
  where p.commodity = p_commodity
    and extract(year from p.week_ending)::smallint = p_market_year
    and c.is_grain_belt = true
  order by c.state_code, p.week_ending;
$$;

grant execute on function public.get_seeding_seismograph(text, smallint) to anon, authenticated;

notify pgrst, 'reload schema';
