-- Canada-origin U.S. Canola customs quantities.
--
-- Official source:
--   U.S. Census International Trade API, imports/hs, country 1220 (Canada).
--
-- Measurement contract:
--   CON_QY1_MO is canonical U.S. imports for consumption.
--   GEN_QY1_MO is retained only as a bonded-entry timing cross-check.
--   Values are kilograms and must carry blank missing-value flags.
--   Trade values are intentionally absent: value / weight is not a farm,
--   elevator, or futures price.

create table public.us_canola_customs_raw (
  id uuid primary key default gen_random_uuid(),
  report_month date not null,
  country_code text not null,
  country_name text not null,
  product_code text not null,
  product_kind text not null,
  product_description text not null,
  unit_qy1 text not null,
  consumption_qty_kg bigint not null,
  consumption_qty_flag text,
  general_qty_kg bigint not null,
  general_qty_flag text,
  record_status text not null,
  api_last_update text not null,
  source_api text not null default 'us_census_intltrade_imports_hs',
  source_url text not null,
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint us_canola_customs_raw_month_start_check
    check (report_month = date_trunc('month', report_month)::date),
  constraint us_canola_customs_raw_canada_check
    check (country_code = '1220' and upper(country_name) = 'CANADA'),
  constraint us_canola_customs_raw_product_mapping_check
    check (
      (
        product_kind = 'seed'
        and product_code in ('1205100010', '1205100020', '1205100090')
      )
      or (
        product_kind = 'oil'
        and product_code in ('1514110000', '1514190000')
      )
    ),
  constraint us_canola_customs_raw_description_check
    check (length(btrim(product_description)) > 0),
  constraint us_canola_customs_raw_kg_check
    check (unit_qy1 = 'KG'),
  constraint us_canola_customs_raw_consumption_present_check
    check (
      consumption_qty_kg >= 0
      and consumption_qty_flag is null
    ),
  constraint us_canola_customs_raw_general_crosscheck_present_check
    check (
      general_qty_kg >= 0
      and general_qty_flag is null
    ),
  constraint us_canola_customs_raw_record_status_check
    check (record_status in ('reported', 'confirmed_no_trade')),
  constraint us_canola_customs_raw_no_trade_zero_check
    check (
      record_status <> 'confirmed_no_trade'
      or (consumption_qty_kg = 0 and general_qty_kg = 0)
    ),
  constraint us_canola_customs_raw_source_check
    check (source_api = 'us_census_intltrade_imports_hs'),
  constraint us_canola_customs_raw_source_url_check
    check (
      source_url =
        'https://api.census.gov/data/timeseries/intltrade/imports/hs.html'
    ),
  constraint us_canola_customs_raw_unique
    unique (report_month, country_code, product_code)
);

create index us_canola_customs_raw_report_month_idx
  on public.us_canola_customs_raw (report_month desc);

alter table public.us_canola_customs_raw enable row level security;

-- The raw rows are a private ingestion contract. No browser role receives
-- direct table access; the bounded function below is the only public surface.
revoke all on table public.us_canola_customs_raw from public;
revoke all on table public.us_canola_customs_raw from anon;
revoke all on table public.us_canola_customs_raw from authenticated;
-- Service collectors can inspect raw rows, but all mutation must pass through
-- ingest_canola_us_customs so data and source_runs cannot diverge.
grant select on table public.us_canola_customs_raw to service_role;

comment on table public.us_canola_customs_raw is
  'Private U.S. Census monthly Canada-origin Canola seed/oil customs quantities. CON_QY1_MO is canonical; GEN_QY1_MO is cross-check only.';
comment on column public.us_canola_customs_raw.consumption_qty_kg is
  'Canonical CON_QY1_MO imports-for-consumption quantity in kilograms.';
comment on column public.us_canola_customs_raw.general_qty_kg is
  'GEN_QY1_MO general-import quantity in kilograms; cross-check only, never additive to consumption quantity.';

create or replace function public.ingest_canola_us_customs(
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
  v_distinct_key_count integer;
  v_month_count integer;
  v_expected_month_count integer;
  v_period_start date;
  v_period_end date;
  v_source_run_id uuid;
  v_source_run jsonb;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) < 1
     or jsonb_array_length(p_rows) > 600 then
    raise exception 'p_rows must be a JSON array containing 1 to 600 rows'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_source_run) is distinct from 'object' then
    raise exception 'p_source_run must be a JSON object'
      using errcode = '22023';
  end if;

  if p_source_run->>'source_name' is distinct from
       'us_census_canola_customs'
     or p_source_run->>'source_lane' is distinct from 'cross_border'
     or p_source_run->>'collector_name' is distinct from
       'import-us-canola-customs'
     or p_source_run->>'status' is distinct from 'success'
     or p_source_run->>'source_url' is distinct from
       'https://api.census.gov/data/timeseries/intltrade/imports/hs.html'
     or jsonb_typeof(p_source_run->'metadata') is distinct from 'object' then
    raise exception 'p_source_run violates the Canola customs source contract'
      using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(
      distinct (
        input.report_month,
        input.country_code,
        input.product_code
      )
    )::integer,
    count(distinct input.report_month)::integer,
    min(input.report_month),
    max(input.report_month)
  into
    v_row_count,
    v_distinct_key_count,
    v_month_count,
    v_period_start,
    v_period_end
  from jsonb_to_recordset(p_rows) as input (
    report_month date,
    country_code text,
    country_name text,
    product_code text,
    product_kind text,
    product_description text,
    unit_qy1 text,
    consumption_qty_kg bigint,
    consumption_qty_flag text,
    general_qty_kg bigint,
    general_qty_flag text,
    record_status text,
    api_last_update text,
    source_api text,
    source_url text,
    retrieved_at timestamptz
  );

  if v_row_count < 5
     or v_row_count % 5 <> 0
     or v_distinct_key_count <> v_row_count then
    raise exception 'p_rows must contain five unique HTS rows per month'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as input (
      report_month date,
      country_code text,
      product_code text,
      product_kind text
    )
    group by input.report_month
    having count(*) <> 5
       or count(distinct input.product_code) <> 5
       or count(*) filter (where input.product_kind = 'seed') <> 3
       or count(*) filter (where input.product_kind = 'oil') <> 2
  ) then
    raise exception 'p_rows contains an incomplete HTS month'
      using errcode = '22023';
  end if;

  v_expected_month_count :=
    (
      (extract(year from v_period_end) - extract(year from v_period_start)) * 12
      + extract(month from v_period_end)
      - extract(month from v_period_start)
      + 1
    )::integer;

  if v_month_count <> v_expected_month_count then
    raise exception 'p_rows contains a gap in the monthly release series'
      using errcode = '22023';
  end if;

  if (p_source_run->>'source_period_start')::date
       is distinct from v_period_start
     or (p_source_run->>'source_period_end')::date
       is distinct from v_period_end
     or coalesce((p_source_run->>'rows_updated')::integer, -1)
       <> v_row_count then
    raise exception 'p_source_run period or row count does not match p_rows'
      using errcode = '22023';
  end if;

  insert into public.us_canola_customs_raw (
    report_month,
    country_code,
    country_name,
    product_code,
    product_kind,
    product_description,
    unit_qy1,
    consumption_qty_kg,
    consumption_qty_flag,
    general_qty_kg,
    general_qty_flag,
    record_status,
    api_last_update,
    source_api,
    source_url,
    retrieved_at
  )
  select
    input.report_month,
    input.country_code,
    input.country_name,
    input.product_code,
    input.product_kind,
    input.product_description,
    input.unit_qy1,
    input.consumption_qty_kg,
    input.consumption_qty_flag,
    input.general_qty_kg,
    input.general_qty_flag,
    input.record_status,
    input.api_last_update,
    input.source_api,
    input.source_url,
    input.retrieved_at
  from jsonb_to_recordset(p_rows) as input (
    report_month date,
    country_code text,
    country_name text,
    product_code text,
    product_kind text,
    product_description text,
    unit_qy1 text,
    consumption_qty_kg bigint,
    consumption_qty_flag text,
    general_qty_kg bigint,
    general_qty_flag text,
    record_status text,
    api_last_update text,
    source_api text,
    source_url text,
    retrieved_at timestamptz
  )
  on conflict (report_month, country_code, product_code)
  do update set
    country_name = excluded.country_name,
    product_kind = excluded.product_kind,
    product_description = excluded.product_description,
    unit_qy1 = excluded.unit_qy1,
    consumption_qty_kg = excluded.consumption_qty_kg,
    consumption_qty_flag = excluded.consumption_qty_flag,
    general_qty_kg = excluded.general_qty_kg,
    general_qty_flag = excluded.general_qty_flag,
    record_status = excluded.record_status,
    api_last_update = excluded.api_last_update,
    source_api = excluded.source_api,
    source_url = excluded.source_url,
    retrieved_at = excluded.retrieved_at;

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
    'us_census_canola_customs',
    'cross_border',
    'import-us-canola-customs',
    'success',
    v_period_start,
    v_period_end,
    nullif(p_source_run->>'latest_source_label', ''),
    v_row_count,
    'https://api.census.gov/data/timeseries/intltrade/imports/hs.html',
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

revoke all on function public.ingest_canola_us_customs(jsonb, jsonb)
  from public;
revoke all on function public.ingest_canola_us_customs(jsonb, jsonb)
  from anon, authenticated;
grant execute on function public.ingest_canola_us_customs(jsonb, jsonb)
  to service_role;

comment on function public.ingest_canola_us_customs(jsonb, jsonb) is
  'Service-only atomic ingest. Validates complete monthly HTS coverage, upserts private raw rows, and writes source_runs in the same transaction.';

create or replace function public.get_canola_us_customs(
  p_months integer default 24
)
returns table (
  report_month date,
  product_kind text,
  imports_for_consumption_kt numeric,
  general_imports_crosscheck_kt numeric,
  general_minus_consumption_kt numeric,
  product_count integer,
  expected_product_count integer,
  confirmed_no_trade_product_count integer,
  api_last_update text,
  canonical_measure text,
  cross_check_measure text,
  source_url text
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
  with complete_months as (
    select raw.report_month
    from public.us_canola_customs_raw as raw
    where raw.country_code = '1220'
      and raw.product_code in (
        '1205100010',
        '1205100020',
        '1205100090',
        '1514110000',
        '1514190000'
      )
      and raw.unit_qy1 = 'KG'
      and raw.consumption_qty_flag is null
      and raw.general_qty_flag is null
    group by raw.report_month
    having count(*) = 5
       and count(distinct raw.product_code) = 5
       and count(*) filter (where raw.product_kind = 'seed') = 3
       and count(*) filter (where raw.product_kind = 'oil') = 2
    order by raw.report_month desc
    limit p_months
  )
  select
    raw.report_month,
    raw.product_kind,
    round(sum(raw.consumption_qty_kg)::numeric / 1000000, 3)
      as imports_for_consumption_kt,
    round(sum(raw.general_qty_kg)::numeric / 1000000, 3)
      as general_imports_crosscheck_kt,
    round(
      (sum(raw.general_qty_kg) - sum(raw.consumption_qty_kg))::numeric
        / 1000000,
      3
    ) as general_minus_consumption_kt,
    count(distinct raw.product_code)::integer as product_count,
    case when raw.product_kind = 'seed' then 3 else 2 end
      as expected_product_count,
    count(*) filter (
      where raw.record_status = 'confirmed_no_trade'
    )::integer as confirmed_no_trade_product_count,
    max(raw.api_last_update) as api_last_update,
    'CON_QY1_MO'::text as canonical_measure,
    'GEN_QY1_MO'::text as cross_check_measure,
    min(raw.source_url) as source_url
  from public.us_canola_customs_raw as raw
  inner join complete_months as complete
    on complete.report_month = raw.report_month
  group by raw.report_month, raw.product_kind
  order by raw.report_month desc, raw.product_kind;
end;
$function$;

revoke all on function public.get_canola_us_customs(integer) from public;
grant execute on function public.get_canola_us_customs(integer)
  to anon, authenticated, service_role;

comment on function public.get_canola_us_customs(integer) is
  'Bounded complete-month Canola customs weights. CON_QY1_MO is canonical; GEN_QY1_MO is a non-additive cross-check. No value or price measure is exposed.';

notify pgrst, 'reload schema';
