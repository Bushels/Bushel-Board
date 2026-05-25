create schema if not exists experimental;

comment on schema experimental is
  'Private sidecar schema for forecast harness experiments. Not part of production dashboard reads.';

create table if not exists experimental.forecast_experiment_runs (
  id uuid primary key default gen_random_uuid(),
  experiment_slug text not null check (experiment_slug ~ '^[a-z0-9][a-z0-9_-]{2,80}$'),
  grain text not null default 'Canola' check (grain = 'Canola'),
  crop_year text not null check (crop_year ~ '^\d{4}-\d{4}$'),
  grain_week smallint not null check (grain_week between 1 and 53),
  as_of_date date not null,
  source_cutoff_at timestamptz not null,
  model_training_cutoff date,
  pretraining_taint_status text not null check (
    pretraining_taint_status in ('not_applicable', 'untainted', 'tainted', 'unknown')
  ),
  snapshot_version text not null,
  snapshot_json jsonb not null check (jsonb_typeof(snapshot_json) = 'object'),
  snapshot_hash text not null,
  prompt_version text not null,
  schema_version text not null default 'canola-forecast-v1' check (
    schema_version = 'canola-forecast-v1'
  ),
  llm_provider text not null,
  llm_model text not null,
  repo_commit text,
  run_status text not null default 'planned' check (
    run_status in ('planned', 'parsed', 'scored', 'rejected')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    experiment_slug,
    grain,
    crop_year,
    grain_week,
    as_of_date,
    source_cutoff_at
  )
);

create table if not exists experimental.forecast_experiment_predictions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references experimental.forecast_experiment_runs(id) on delete cascade,
  horizon_days smallint not null check (horizon_days in (7, 28)),
  price_exchange text not null,
  price_commodity text not null default 'Canola' check (price_commodity = 'Canola'),
  price_contract_code text not null,
  price_contract_month text not null,
  price_roll_policy text not null check (
    price_roll_policy in (
      'fixed_contract_no_roll',
      'front_month_with_declared_roll',
      'continuous_adjusted_series'
    )
  ),
  direction text not null check (direction in ('bullish', 'bearish', 'neutral')),
  stance_score smallint not null check (stance_score between -100 and 100),
  confidence_pct smallint not null check (confidence_pct between 0 and 100),
  expected_move_pct_low numeric(8, 4) not null,
  expected_move_pct_high numeric(8, 4) not null,
  recommendation text not null check (
    recommendation in ('PATIENCE', 'WATCH', 'SCALE_IN', 'ACCELERATE', 'HOLD_FIRM', 'PRICE')
  ),
  forecast_json jsonb not null check (jsonb_typeof(forecast_json) = 'object'),
  raw_model_output text,
  parse_status text not null default 'parsed' check (parse_status in ('parsed', 'rejected')),
  validation_errors jsonb not null default '[]'::jsonb check (
    jsonb_typeof(validation_errors) = 'array'
  ),
  created_at timestamptz not null default now(),
  check (expected_move_pct_low <= expected_move_pct_high),
  unique (run_id, horizon_days, price_contract_code, price_roll_policy)
);

create table if not exists experimental.forecast_experiment_scores (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references experimental.forecast_experiment_predictions(id) on delete cascade,
  eval_window_days smallint not null check (eval_window_days in (7, 28)),
  price_contract_code text not null,
  price_roll_policy text not null check (
    price_roll_policy in (
      'fixed_contract_no_roll',
      'front_month_with_declared_roll',
      'continuous_adjusted_series'
    )
  ),
  start_price numeric(12, 4) not null check (start_price > 0),
  end_price numeric(12, 4) not null check (end_price > 0),
  start_price_at timestamptz not null,
  end_price_at timestamptz not null,
  market_close_at timestamptz,
  price_change_pct numeric(8, 4) not null,
  direction_result text not null check (direction_result in ('correct', 'wrong')),
  magnitude_error_pct numeric(8, 4) not null check (magnitude_error_pct >= 0),
  brier_score numeric(8, 4) not null check (brier_score between 0 and 1),
  confidence_bucket text not null check (
    confidence_bucket in ('0-50', '51-60', '61-70', '71-80', '81-90', '91-100')
  ),
  baseline_results jsonb not null default '{}'::jsonb check (
    jsonb_typeof(baseline_results) = 'object'
  ),
  source_snapshot_hash text,
  score_notes text,
  evaluated_at timestamptz not null default now(),
  check (start_price_at <= end_price_at),
  unique (prediction_id, eval_window_days, price_contract_code, price_roll_policy)
);

create index if not exists forecast_experiment_runs_lookup_idx
  on experimental.forecast_experiment_runs (grain, crop_year, grain_week, as_of_date);

create index if not exists forecast_experiment_predictions_run_idx
  on experimental.forecast_experiment_predictions (run_id);

create index if not exists forecast_experiment_scores_prediction_idx
  on experimental.forecast_experiment_scores (prediction_id);

create index if not exists forecast_experiment_scores_evaluated_idx
  on experimental.forecast_experiment_scores (evaluated_at desc);

alter table experimental.forecast_experiment_runs enable row level security;
alter table experimental.forecast_experiment_predictions enable row level security;
alter table experimental.forecast_experiment_scores enable row level security;

revoke all on schema experimental from public;
revoke all on all tables in schema experimental from public;
revoke all on schema experimental from anon, authenticated;
revoke all on all tables in schema experimental from anon, authenticated;

comment on table experimental.forecast_experiment_runs is
  'Forecast harness run snapshots. Sidecar only; no production dashboard dependency.';
comment on table experimental.forecast_experiment_predictions is
  'Parsed canola forecast outputs for local walk-forward experiments.';
comment on table experimental.forecast_experiment_scores is
  'Pure scoring outcomes for forecast experiment predictions.';
