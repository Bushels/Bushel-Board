-- Monthly U.S. Canola oil consumed as a biofuel feedstock.
--
-- Official source:
--   U.S. Energy Information Administration, Monthly Biofuels Capacity and
--   Feedstocks Update, series M_EPOOBDCO_YIFBP_NUS_MMLB.
--
-- Interpretation contract:
--   This is U.S. biofuel demand confirmation in million pounds. EIA does not
--   identify the country of origin of the Canola oil in this series, so these
--   rows must never be represented as Canadian exports or Canadian demand.

create table public.eia_canola_biofuel_feedstock_raw (
  id uuid primary key default gen_random_uuid(),
  report_month date not null,
  geography text not null,
  feedstock text not null,
  consumed_million_lb numeric(14, 3) not null,
  unit text not null,
  series_id text not null,
  source_page_release_date date not null,
  next_release_date date not null,
  source_url text not null,
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint eia_canola_biofuel_month_start_check
    check (report_month = date_trunc('month', report_month)::date),
  constraint eia_canola_biofuel_geography_check
    check (geography = 'United States'),
  constraint eia_canola_biofuel_feedstock_check
    check (feedstock = 'Canola oil'),
  constraint eia_canola_biofuel_value_check
    check (consumed_million_lb >= 0),
  constraint eia_canola_biofuel_unit_check
    check (unit = 'million pounds'),
  constraint eia_canola_biofuel_series_check
    check (series_id = 'M_EPOOBDCO_YIFBP_NUS_MMLB'),
  constraint eia_canola_biofuel_release_check
    check (
      source_page_release_date >= report_month
      and next_release_date > source_page_release_date
    ),
  constraint eia_canola_biofuel_source_check
    check (
      source_url =
        'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm'
    ),
  constraint eia_canola_biofuel_unique
    unique (series_id, report_month)
);

create index eia_canola_biofuel_report_month_idx
  on public.eia_canola_biofuel_feedstock_raw (report_month desc);

alter table public.eia_canola_biofuel_feedstock_raw enable row level security;

-- Raw rows are private. Browser roles only receive the bounded, interpreted
-- function below. Service collectors must use the atomic ingest function.
revoke all on table public.eia_canola_biofuel_feedstock_raw from public;
revoke all on table public.eia_canola_biofuel_feedstock_raw from anon;
revoke all on table public.eia_canola_biofuel_feedstock_raw
  from authenticated;
grant select on table public.eia_canola_biofuel_feedstock_raw
  to service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.eia_canola_biofuel_feedstock_raw
  from service_role;

comment on table public.eia_canola_biofuel_feedstock_raw is
  'Private EIA monthly U.S. Canola oil consumed for biofuels, in million pounds. Demand confirmation only; country of origin is not reported.';
comment on column
  public.eia_canola_biofuel_feedstock_raw.source_page_release_date is
  'Release date of the rolling EIA page edition in which this observation was accepted, not a claim about first publication.';
comment on column
  public.eia_canola_biofuel_feedstock_raw.consumed_million_lb is
  'U.S. Canola oil consumed as biofuel feedstock, in million pounds. Not Canadian-origin volume.';

create or replace function public.ingest_eia_canola_biofuel_feedstock(
  p_rows jsonb,
  p_source_run jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row_count integer;
  v_distinct_month_count integer;
  v_period_start date;
  v_period_end date;
  v_expected_month_count integer;
  v_release_date date;
  v_next_release_date date;
  v_source_run_id uuid;
  v_source_run jsonb;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) <> 6 then
    raise exception
      'p_rows must contain the six complete months displayed by the EIA page'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_source_run) is distinct from 'object' then
    raise exception 'p_source_run must be a JSON object'
      using errcode = '22023';
  end if;

  if p_source_run->>'source_name' is distinct from
       'us_eia_canola_biofuel_feedstock'
     or p_source_run->>'source_lane' is distinct from 'us'
     or p_source_run->>'collector_name' is distinct from
       'import-eia-canola-biofuel'
     or p_source_run->>'status' is distinct from 'success'
     or p_source_run->>'source_url' is distinct from
       'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm'
     or jsonb_typeof(p_source_run->'metadata') is distinct from 'object'
     or p_source_run->'metadata'->>'series_id' is distinct from
       'M_EPOOBDCO_YIFBP_NUS_MMLB'
     or p_source_run->'metadata'->>'unit' is distinct from
       'million pounds'
     or p_source_run->'metadata'->>'origin_scope' is distinct from
       'not_reported'
     or coalesce(
       (p_source_run->'metadata'->>'demand_confirmation_only')::boolean,
       false
     ) is not true then
    raise exception
      'p_source_run violates the EIA Canola biofuel source contract'
      using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(distinct input.report_month)::integer,
    min(input.report_month),
    max(input.report_month),
    min(input.source_page_release_date),
    min(input.next_release_date)
  into
    v_row_count,
    v_distinct_month_count,
    v_period_start,
    v_period_end,
    v_release_date,
    v_next_release_date
  from jsonb_to_recordset(p_rows) as input (
    report_month date,
    geography text,
    feedstock text,
    consumed_million_lb numeric,
    unit text,
    series_id text,
    source_page_release_date date,
    next_release_date date,
    source_url text,
    retrieved_at timestamptz
  );

  v_expected_month_count :=
    (
      (extract(year from v_period_end) - extract(year from v_period_start)) * 12
      + extract(month from v_period_end)
      - extract(month from v_period_start)
      + 1
    )::integer;

  if v_row_count <> 6
     or v_distinct_month_count <> 6
     or v_expected_month_count <> 6 then
    raise exception
      'p_rows must contain six unique consecutive report months'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as input (
      report_month date,
      geography text,
      feedstock text,
      consumed_million_lb numeric,
      unit text,
      series_id text,
      source_page_release_date date,
      next_release_date date,
      source_url text,
      retrieved_at timestamptz
    )
    where input.geography is distinct from 'United States'
       or input.feedstock is distinct from 'Canola oil'
       or input.consumed_million_lb is null
       or input.consumed_million_lb < 0
       or input.unit is distinct from 'million pounds'
       or input.series_id is distinct from
            'M_EPOOBDCO_YIFBP_NUS_MMLB'
       or input.source_url is distinct from
            'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm'
       or input.retrieved_at is null
  ) then
    raise exception 'p_rows violates the EIA Canola observation contract'
      using errcode = '22023';
  end if;

  if (
    select count(distinct input.source_page_release_date)
    from jsonb_to_recordset(p_rows) as input (
      source_page_release_date date
    )
  ) <> 1
     or (
       select count(distinct input.next_release_date)
       from jsonb_to_recordset(p_rows) as input (
         next_release_date date
       )
     ) <> 1
     or v_release_date < v_period_end
     or v_next_release_date <= v_release_date then
    raise exception
      'p_rows must share one valid EIA release and next-release date'
      using errcode = '22023';
  end if;

  if (p_source_run->>'source_period_start')::date
       is distinct from v_period_start
     or (p_source_run->>'source_period_end')::date
       is distinct from v_period_end
     or coalesce((p_source_run->>'rows_updated')::integer, -1)
       <> v_row_count
     or (p_source_run->'metadata'->>'release_date')::date
       is distinct from v_release_date
     or (p_source_run->'metadata'->>'next_release_date')::date
       is distinct from v_next_release_date then
    raise exception
      'p_source_run period, release dates, or row count does not match p_rows'
      using errcode = '22023';
  end if;

  insert into public.eia_canola_biofuel_feedstock_raw (
    report_month,
    geography,
    feedstock,
    consumed_million_lb,
    unit,
    series_id,
    source_page_release_date,
    next_release_date,
    source_url,
    retrieved_at
  )
  select
    input.report_month,
    input.geography,
    input.feedstock,
    input.consumed_million_lb,
    input.unit,
    input.series_id,
    input.source_page_release_date,
    input.next_release_date,
    input.source_url,
    input.retrieved_at
  from jsonb_to_recordset(p_rows) as input (
    report_month date,
    geography text,
    feedstock text,
    consumed_million_lb numeric,
    unit text,
    series_id text,
    source_page_release_date date,
    next_release_date date,
    source_url text,
    retrieved_at timestamptz
  )
  on conflict (series_id, report_month)
  do update set
    geography = excluded.geography,
    feedstock = excluded.feedstock,
    consumed_million_lb = excluded.consumed_million_lb,
    unit = excluded.unit,
    source_page_release_date = excluded.source_page_release_date,
    next_release_date = excluded.next_release_date,
    source_url = excluded.source_url,
    retrieved_at = excluded.retrieved_at,
    updated_at = clock_timestamp();

  insert into public.source_runs (
    source_name,
    source_lane,
    collector_name,
    status,
    source_period_start,
    source_period_end,
    latest_source_label,
    rows_updated,
    source_url,
    started_at,
    finished_at,
    metadata
  )
  values (
    'us_eia_canola_biofuel_feedstock',
    'us',
    'import-eia-canola-biofuel',
    'success',
    v_period_start,
    v_period_end,
    nullif(p_source_run->>'latest_source_label', ''),
    v_row_count,
    'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm',
    (p_source_run->>'started_at')::timestamptz,
    clock_timestamp(),
    p_source_run->'metadata'
  )
  returning id into v_source_run_id;

  select to_jsonb(source_run)
  into strict v_source_run
  from public.source_runs as source_run
  where source_run.id = v_source_run_id;

  return v_source_run;
end;
$function$;

revoke all on function
  public.ingest_eia_canola_biofuel_feedstock(jsonb, jsonb)
  from public;
revoke all on function
  public.ingest_eia_canola_biofuel_feedstock(jsonb, jsonb)
  from anon, authenticated;
grant execute on function
  public.ingest_eia_canola_biofuel_feedstock(jsonb, jsonb)
  to service_role;

comment on function
  public.ingest_eia_canola_biofuel_feedstock(jsonb, jsonb) is
  'Service-only atomic ingest. Requires the complete six-month EIA page and writes raw rows plus source_runs in one transaction.';

create or replace function public.get_canola_eia_biofuel_feedstock(
  p_months integer default 24
)
returns table (
  report_month date,
  canola_oil_consumed_million_lb numeric,
  geography text,
  unit text,
  series_id text,
  source_page_release_date date,
  next_release_date date,
  source_url text,
  demand_role text,
  origin_scope text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_months is null or p_months < 1 or p_months > 60 then
    raise exception 'p_months must be between 1 and 60'
      using errcode = '22023';
  end if;

  return query
  select
    accepted.report_month,
    accepted.consumed_million_lb,
    accepted.geography,
    accepted.unit,
    accepted.series_id,
    accepted.source_page_release_date,
    accepted.next_release_date,
    accepted.source_url,
    'U.S. biofuel demand confirmation only'::text as demand_role,
    'Country of origin is not reported by this EIA series'::text
      as origin_scope
  from (
    select raw.*
    from public.eia_canola_biofuel_feedstock_raw as raw
    where exists (
      select 1
      from public.source_runs as source_run
      where source_run.source_name =
              'us_eia_canola_biofuel_feedstock'
        and source_run.source_lane = 'us'
        and source_run.collector_name =
              'import-eia-canola-biofuel'
        and source_run.status = 'success'
        and source_run.source_period_start <= raw.report_month
        and source_run.source_period_end >= raw.report_month
        and (source_run.metadata->>'release_date')::date =
              raw.source_page_release_date
        and source_run.metadata->>'series_id' = raw.series_id
        and source_run.metadata->>'origin_scope' = 'not_reported'
        and coalesce(
          (
            source_run.metadata->>'demand_confirmation_only'
          )::boolean,
          false
        ) is true
    )
    order by raw.report_month desc
    limit p_months
  ) as accepted
  order by accepted.report_month desc;
end;
$function$;

revoke all on function
  public.get_canola_eia_biofuel_feedstock(integer)
  from public;
grant execute on function
  public.get_canola_eia_biofuel_feedstock(integer)
  to anon, authenticated, service_role;

comment on function
  public.get_canola_eia_biofuel_feedstock(integer) is
  'Bounded accepted EIA monthly Canola-oil biofuel use. U.S. demand confirmation only; country of origin is not reported.';

notify pgrst, 'reload schema';
