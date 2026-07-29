-- Run after 20260729073903_create_us_canola_customs.sql.
-- Rollback-only proof of private raw rows, complete-month fail-closed behavior,
-- bounded anonymous output, and canonical CON_QY1_MO aggregation.

begin;

do $test$
declare
  checked_role text;
  checked_privilege text;
begin
  foreach checked_role in array array['anon', 'authenticated']
  loop
    foreach checked_privilege in array
      array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    loop
      if has_table_privilege(
        checked_role,
        'public.us_canola_customs_raw',
        checked_privilege
      ) then
        raise exception
          'privacy regression: % has % on raw customs rows',
          checked_role,
          checked_privilege;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) as privilege
    where relation.oid = 'public.us_canola_customs_raw'::regclass
      and privilege.grantee = 0
      and privilege.privilege_type in (
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE'
      )
  ) then
    raise exception 'privacy regression: PUBLIC has raw-table DML privileges';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_canola_us_customs(integer)',
    'EXECUTE'
  ) then
    raise exception 'customs RPC regression: anon cannot execute the bounded function';
  end if;

  if has_function_privilege(
    'anon',
    'public.ingest_canola_us_customs(jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ingest_canola_us_customs(jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'privacy regression: browser role can execute customs ingest';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ingest_canola_us_customs(jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'ingest regression: service_role cannot execute atomic customs ingest';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.us_canola_customs_raw',
    'SELECT'
  ) or has_table_privilege(
    'service_role',
    'public.us_canola_customs_raw',
    'INSERT'
  ) or has_table_privilege(
    'service_role',
    'public.us_canola_customs_raw',
    'UPDATE'
  ) or has_table_privilege(
    'service_role',
    'public.us_canola_customs_raw',
    'DELETE'
  ) then
    raise exception
      'ingest regression: service_role must be read-only on raw table';
  end if;
end;
$test$;

-- Force the source_runs insert to fail after raw upsert work has begun.
-- The function call must roll both operations back as one transaction.
do $test$
declare
  fixture_rows jsonb;
  future_source_run jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'report_month', '2098-01-01',
      'country_code', '1220',
      'country_name', 'CANADA',
      'product_code', fixture.product_code,
      'product_kind', fixture.product_kind,
      'product_description', fixture.product_description,
      'unit_qy1', 'KG',
      'consumption_qty_kg', 1,
      'consumption_qty_flag', null,
      'general_qty_kg', 1,
      'general_qty_flag', null,
      'record_status', 'reported',
      'api_last_update', '2098-02-05',
      'source_api', 'us_census_intltrade_imports_hs',
      'source_url',
        'https://api.census.gov/data/timeseries/intltrade/imports/hs.html',
      'retrieved_at', '2098-02-05T12:00:00+00:00'
    )
  )
  into fixture_rows
  from (
    values
      ('1205100010', 'seed', 'Canola seed one'),
      ('1205100020', 'seed', 'Canola seed two'),
      ('1205100090', 'seed', 'Canola seed three'),
      ('1514110000', 'oil', 'Crude canola oil'),
      ('1514190000', 'oil', 'Other canola oil')
  ) as fixture(product_code, product_kind, product_description);

  future_source_run := jsonb_build_object(
    'source_name', 'us_census_canola_customs',
    'source_lane', 'cross_border',
    'collector_name', 'import-us-canola-customs',
    'status', 'success',
    'source_period_start', '2098-01-01',
    'source_period_end', '2098-01-01',
    'latest_source_label', 'atomic rollback fixture',
    'rows_updated', 5,
    'source_url',
      'https://api.census.gov/data/timeseries/intltrade/imports/hs.html',
    'started_at', '2100-01-01T00:00:00+00:00',
    'metadata', jsonb_build_object('fixture', true)
  );

  begin
    perform public.ingest_canola_us_customs(
      fixture_rows,
      future_source_run
    );
    raise exception 'atomicity regression: invalid source_run unexpectedly succeeded';
  exception
    when check_violation then
      null;
  end;

  if exists (
    select 1
    from public.us_canola_customs_raw
    where report_month = date '2098-01-01'
  ) then
    raise exception 'atomicity regression: raw rows survived source_runs failure';
  end if;

  if exists (
    select 1
    from public.source_runs
    where latest_source_label = 'atomic rollback fixture'
  ) then
    raise exception 'atomicity regression: failed source_run row survived';
  end if;
end;
$test$;

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
  source_url,
  retrieved_at
)
select
  date '2099-01-01',
  '1220',
  'CANADA',
  fixture.product_code,
  fixture.product_kind,
  fixture.product_description,
  'KG',
  fixture.consumption_qty_kg,
  null,
  fixture.general_qty_kg,
  null,
  'reported',
  '2099-02-05',
  'https://api.census.gov/data/timeseries/intltrade/imports/hs.html',
  timestamptz '2099-02-05 12:00:00+00'
from (
  values
    ('1205100010', 'seed', 'Canola seed one', 1000000::bigint, 1100000::bigint),
    ('1205100020', 'seed', 'Canola seed two', 2000000::bigint, 2100000::bigint),
    ('1205100090', 'seed', 'Canola seed three', 3000000::bigint, 3100000::bigint),
    ('1514110000', 'oil', 'Crude canola oil', 4000000::bigint, 4100000::bigint),
    ('1514190000', 'oil', 'Other canola oil', 5000000::bigint, 5100000::bigint)
) as fixture(
  product_code,
  product_kind,
  product_description,
  consumption_qty_kg,
  general_qty_kg
);

-- A newer partial month must be hidden rather than published as apparent demand.
insert into public.us_canola_customs_raw (
  report_month,
  country_code,
  country_name,
  product_code,
  product_kind,
  product_description,
  unit_qy1,
  consumption_qty_kg,
  general_qty_kg,
  record_status,
  api_last_update,
  source_url,
  retrieved_at
)
values (
  date '2099-02-01',
  '1220',
  'CANADA',
  '1205100010',
  'seed',
  'Partial newer month',
  'KG',
  999999999,
  999999999,
  'reported',
  '2099-03-05',
  'https://api.census.gov/data/timeseries/intltrade/imports/hs.html',
  timestamptz '2099-03-05 12:00:00+00'
);

set local role anon;

do $test$
declare
  result_count integer;
  seed_result record;
  oil_result record;
begin
  select count(*)
  into result_count
  from public.get_canola_us_customs(1);

  if result_count <> 2 then
    raise exception
      'bounded customs RPC expected two category rows, received %',
      result_count;
  end if;

  select *
  into strict seed_result
  from public.get_canola_us_customs(1)
  where product_kind = 'seed';

  select *
  into strict oil_result
  from public.get_canola_us_customs(1)
  where product_kind = 'oil';

  if seed_result.report_month is distinct from date '2099-01-01'
     or seed_result.imports_for_consumption_kt is distinct from 6.000
     or seed_result.general_imports_crosscheck_kt is distinct from 6.300
     or seed_result.product_count is distinct from 3
     or seed_result.expected_product_count is distinct from 3
     or seed_result.confirmed_no_trade_product_count is distinct from 0
     or seed_result.canonical_measure is distinct from 'CON_QY1_MO'
     or seed_result.cross_check_measure is distinct from 'GEN_QY1_MO' then
    raise exception 'unexpected seed customs result: %', seed_result;
  end if;

  if oil_result.report_month is distinct from date '2099-01-01'
     or oil_result.imports_for_consumption_kt is distinct from 9.000
     or oil_result.general_imports_crosscheck_kt is distinct from 9.200
     or oil_result.product_count is distinct from 2
     or oil_result.expected_product_count is distinct from 2 then
    raise exception 'unexpected oil customs result: %', oil_result;
  end if;

  begin
    perform * from public.get_canola_us_customs(0);
    raise exception 'bounded customs RPC accepted p_months=0';
  exception
    when sqlstate '22023' then
      null;
  end;

  raise notice
    'PASS: raw customs rows are private and only complete CON_QY1_MO months are public';
end;
$test$;

reset role;

rollback;
