-- GEE satellite crop-stress lane (Stance Model V2 §16.3, P-G2)
-- NDVI (MODIS, CDL winter-wheat-masked) + root-zone soil moisture (SMAP) per wheat
-- belt/region, z-scored vs a trailing 5-year same-calendar-window baseline.
-- negative stress_index = stressed = BULLISH supply. WATCH-ONLY until validated
-- against NASS ratings; NOT wired to any stance score yet.

create table if not exists public.gee_crop_stress (
  id uuid primary key default gen_random_uuid(),
  crop_belt text not null,                 -- e.g. 'US_HRW'
  region_code text not null,               -- state abbrev (KS/OK/TX/NE/CO) or 'BELT'
  region_name text not null,
  grain text not null default 'Wheat',
  week_ending date not null,               -- composite window end (NASS-aligned Sunday)
  ndvi_current numeric,
  ndvi_baseline_mean numeric,
  ndvi_baseline_std numeric,
  ndvi_z numeric,
  sm_current numeric,
  sm_baseline_mean numeric,
  sm_baseline_std numeric,
  sm_z numeric,
  stress_index numeric,                    -- [-1, +1]; negative = stressed = bullish supply
  reading text,
  baseline_years int[],
  cdl_year int,
  data_quality jsonb not null default '{}'::jsonb,
  source_datasets text[] not null default '{}'::text[],
  computed_at timestamptz not null default now(),
  unique (crop_belt, region_code, grain, week_ending)
);

create index if not exists gee_crop_stress_lookup_idx
  on public.gee_crop_stress (crop_belt, grain, week_ending desc);

comment on table public.gee_crop_stress is
  'GEE satellite crop-stress (MODIS NDVI + SMAP root-zone soil moisture) z-scored vs trailing 5yr baseline, per wheat belt/region. Stance Model V2 §16.3 (P-G2). negative stress_index = stressed = bullish supply. Watch-only; not wired to scoring until validated vs NASS.';

-- Aggregate satellite crop-stress is non-sensitive: public read, service-role writes.
alter table public.gee_crop_stress enable row level security;

drop policy if exists "gee_crop_stress public read" on public.gee_crop_stress;
create policy "gee_crop_stress public read"
  on public.gee_crop_stress for select
  using (true);
