alter table public.x_market_signals
  add column if not exists scout_run_id uuid references public.x_scout_runs(id),
  add column if not exists source_cred_tier text,
  add column if not exists primary_impact_grain text,
  add column if not exists affected_grains text[] not null default '{}',
  add column if not exists affected_regions text[] not null default '{}',
  add column if not exists affected_decisions text[] not null default '{}',
  add column if not exists seasonal_phase text,
  add column if not exists signal_metadata jsonb not null default '{}'::jsonb,
  add column if not exists signal_hash text;

alter table public.x_market_signals
  drop constraint if exists x_market_signals_category_check;

alter table public.x_market_signals
  add constraint x_market_signals_category_check
  check (category in (
    'farmer_report',
    'analyst_commentary',
    'elevator_bid',
    'export_news',
    'weather',
    'policy',
    'basis',
    'logistics',
    'price',
    'other'
  ));

create unique index if not exists idx_x_market_signals_signal_hash
  on public.x_market_signals(signal_hash)
  where signal_hash is not null;

create index if not exists idx_x_market_signals_scout_run
  on public.x_market_signals(scout_run_id);

create index if not exists idx_x_market_signals_signal_metadata_gin
  on public.x_market_signals using gin(signal_metadata);

create index if not exists idx_x_market_signals_affected_grains_gin
  on public.x_market_signals using gin(affected_grains);

comment on column public.x_market_signals.scout_run_id is
  'Links accepted X signal rows to the audited Grok/X scout run that produced the raw artifact.';

comment on column public.x_market_signals.signal_metadata is
  'Validated X scout metadata: source tier, staleness, corroboration, allowed/blocked claims, and deterministic impact breakdown.';

comment on column public.x_market_signals.signal_hash is
  'Stable hash for deduping accepted X scout signals across reruns.';
