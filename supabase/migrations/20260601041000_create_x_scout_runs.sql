create table if not exists public.x_scout_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  run_started_at timestamptz not null default now(),
  run_finished_at timestamptz,
  mode text not null check (mode in ('daily_pulse', 'friday_deep', 'manual_test')),
  runner text not null check (runner in ('grok_cli', 'xai_api', 'x_api_direct', 'manual')),
  status text not null check (status in ('started', 'success', 'partial', 'failed', 'rejected')),
  prompt_version text not null,
  artifact_path text,
  artifact_sha256 text,
  raw_signal_count integer not null default 0,
  accepted_signal_count integer not null default 0,
  rejected_signal_count integer not null default 0,
  price_snapshot_required boolean not null default true,
  price_snapshot_status text not null default 'not_checked'
    check (price_snapshot_status in ('not_checked', 'fresh', 'stale', 'missing', 'partial')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.x_scout_runs enable row level security;

drop policy if exists x_scout_runs_public_read on public.x_scout_runs;
create policy x_scout_runs_public_read
  on public.x_scout_runs
  for select
  to anon, authenticated
  using (true);

drop policy if exists x_scout_runs_service_role_write on public.x_scout_runs;
create policy x_scout_runs_service_role_write
  on public.x_scout_runs
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.x_scout_runs to anon, authenticated;
grant all on public.x_scout_runs to service_role;

create index if not exists idx_x_scout_runs_run_date
  on public.x_scout_runs(run_date desc, run_started_at desc);

create index if not exists idx_x_scout_runs_status
  on public.x_scout_runs(status, run_started_at desc);
