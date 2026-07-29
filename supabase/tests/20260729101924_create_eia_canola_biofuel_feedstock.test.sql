-- Run after 20260729101924_create_eia_canola_biofuel_feedstock.sql.
-- Rollback-only proof of raw-row privacy, atomic freshness, bounded output,
-- and the demand-confirmation/no-origin interpretation contract.

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
        'public.eia_canola_biofuel_feedstock_raw',
        checked_privilege
      ) then
        raise exception
          'privacy regression: % has % on raw EIA rows',
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
    where relation.oid =
            'public.eia_canola_biofuel_feedstock_raw'::regclass
      and privilege.grantee = 0
      and privilege.privilege_type in (
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE'
      )
  ) then
    raise exception 'privacy regression: PUBLIC has raw EIA privileges';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_canola_eia_biofuel_feedstock(integer)',
    'EXECUTE'
  ) then
    raise exception 'EIA RPC regression: anon cannot execute bounded read';
  end if;

  if has_function_privilege(
    'anon',
    'public.ingest_eia_canola_biofuel_feedstock(jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ingest_eia_canola_biofuel_feedstock(jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'privacy regression: browser role can execute EIA ingest';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ingest_eia_canola_biofuel_feedstock(jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'ingest regression: service_role cannot execute EIA ingest';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.eia_canola_biofuel_feedstock_raw',
    'SELECT'
  ) or has_table_privilege(
    'service_role',
    'public.eia_canola_biofuel_feedstock_raw',
    'INSERT'
  ) or has_table_privilege(
    'service_role',
    'public.eia_canola_biofuel_feedstock_raw',
    'UPDATE'
  ) or has_table_privilege(
    'service_role',
    'public.eia_canola_biofuel_feedstock_raw',
    'DELETE'
  ) then
    raise exception
      'ingest regression: service_role must be read-only on raw EIA table';
  end if;
end;
$test$;

-- Force source_runs to reject its timestamp after the raw-table upsert begins.
-- The raw rows must roll back with the freshness row.
do $test$
declare
  fixture_rows jsonb;
  future_source_run jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'report_month', fixture.report_month,
      'geography', 'United States',
      'feedstock', 'Canola oil',
      'consumed_million_lb', fixture.value,
      'unit', 'million pounds',
      'series_id', 'M_EPOOBDCO_YIFBP_NUS_MMLB',
      'source_page_release_date', '2098-08-15',
      'next_release_date', '2098-09-30',
      'source_url',
        'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm',
      'retrieved_at', '2098-08-15T12:00:00+00:00'
    )
    order by fixture.report_month
  )
  into fixture_rows
  from (
    values
      (date '2098-01-01', 101),
      (date '2098-02-01', 102),
      (date '2098-03-01', 103),
      (date '2098-04-01', 104),
      (date '2098-05-01', 105),
      (date '2098-06-01', 106)
  ) as fixture(report_month, value);

  future_source_run := jsonb_build_object(
    'source_name', 'us_eia_canola_biofuel_feedstock',
    'source_lane', 'us',
    'collector_name', 'import-eia-canola-biofuel',
    'status', 'success',
    'source_period_start', '2098-01-01',
    'source_period_end', '2098-06-01',
    'latest_source_label', 'atomic rollback fixture',
    'rows_updated', 6,
    'source_url',
      'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm',
    'started_at', '2100-01-01T00:00:00+00:00',
    'metadata', jsonb_build_object(
      'series_id', 'M_EPOOBDCO_YIFBP_NUS_MMLB',
      'unit', 'million pounds',
      'release_date', '2098-08-15',
      'next_release_date', '2098-09-30',
      'origin_scope', 'not_reported',
      'demand_confirmation_only', true
    )
  );

  begin
    perform public.ingest_eia_canola_biofuel_feedstock(
      fixture_rows,
      future_source_run
    );
    raise exception 'atomicity regression: invalid source_run succeeded';
  exception
    when check_violation then
      null;
  end;

  if exists (
    select 1
    from public.eia_canola_biofuel_feedstock_raw
    where report_month between date '2098-01-01' and date '2098-06-01'
  ) then
    raise exception 'atomicity regression: EIA rows survived ledger failure';
  end if;

  if exists (
    select 1
    from public.source_runs
    where latest_source_label = 'atomic rollback fixture'
  ) then
    raise exception 'atomicity regression: failed source_run survived';
  end if;
end;
$test$;

do $test$
declare
  fixture_rows jsonb;
  valid_source_run jsonb;
  inserted_source_run jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'report_month', fixture.report_month,
      'geography', 'United States',
      'feedstock', 'Canola oil',
      'consumed_million_lb', fixture.value,
      'unit', 'million pounds',
      'series_id', 'M_EPOOBDCO_YIFBP_NUS_MMLB',
      'source_page_release_date', '2099-08-15',
      'next_release_date', '2099-09-30',
      'source_url',
        'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm',
      'retrieved_at', '2099-08-15T12:00:00+00:00'
    )
    order by fixture.report_month
  )
  into fixture_rows
  from (
    values
      (date '2099-01-01', 100),
      (date '2099-02-01', 200),
      (date '2099-03-01', 300),
      (date '2099-04-01', 400),
      (date '2099-05-01', 500),
      (date '2099-06-01', 600)
  ) as fixture(report_month, value);

  valid_source_run := jsonb_build_object(
    'source_name', 'us_eia_canola_biofuel_feedstock',
    'source_lane', 'us',
    'collector_name', 'import-eia-canola-biofuel',
    'status', 'success',
    'source_period_start', '2099-01-01',
    'source_period_end', '2099-06-01',
    'latest_source_label', 'bounded EIA fixture',
    'rows_updated', 6,
    'source_url',
      'https://www.eia.gov/dnav/pet/pet_pnp_feedbiofuel_a_EPOOBDCO_YIFBP_mmlb_m.htm',
    'started_at', now() - interval '1 minute',
    'metadata', jsonb_build_object(
      'series_id', 'M_EPOOBDCO_YIFBP_NUS_MMLB',
      'unit', 'million pounds',
      'release_date', '2099-08-15',
      'next_release_date', '2099-09-30',
      'origin_scope', 'not_reported',
      'demand_confirmation_only', true
    )
  );

  inserted_source_run :=
    public.ingest_eia_canola_biofuel_feedstock(
      fixture_rows,
      valid_source_run
    );

  if inserted_source_run->>'status' is distinct from 'success'
     or inserted_source_run->>'source_name' is distinct from
          'us_eia_canola_biofuel_feedstock' then
    raise exception 'unexpected EIA source_run: %', inserted_source_run;
  end if;
end;
$test$;

set local role anon;

do $test$
declare
  result_count integer;
  latest_result record;
begin
  select count(*)
  into result_count
  from public.get_canola_eia_biofuel_feedstock(1);

  if result_count <> 1 then
    raise exception
      'bounded EIA RPC expected one row, received %',
      result_count;
  end if;

  select *
  into strict latest_result
  from public.get_canola_eia_biofuel_feedstock(1);

  if latest_result.report_month is distinct from date '2099-06-01'
     or latest_result.canola_oil_consumed_million_lb
          is distinct from 600.000
     or latest_result.geography is distinct from 'United States'
     or latest_result.unit is distinct from 'million pounds'
     or latest_result.demand_role is distinct from
          'U.S. biofuel demand confirmation only'
     or latest_result.origin_scope is distinct from
          'Country of origin is not reported by this EIA series' then
    raise exception 'unexpected bounded EIA result: %', latest_result;
  end if;

  begin
    perform * from public.get_canola_eia_biofuel_feedstock(0);
    raise exception 'bounded EIA RPC accepted p_months=0';
  exception
    when sqlstate '22023' then
      null;
  end;

  raise notice
    'PASS: EIA raw rows are private and published as origin-neutral U.S. demand confirmation';
end;
$test$;

reset role;

rollback;
