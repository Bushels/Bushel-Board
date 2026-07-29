-- Run after 20260729064947_get_canola_us_balance.sql.
-- Rollback-only fixture proving raw-table privacy and bounded anon RPC output.

begin;

do $test$
begin
  if has_table_privilege('anon', 'public.usda_wasde_raw', 'SELECT') then
    raise exception 'privacy regression: anon can read raw USDA WASDE rows';
  end if;

  if has_table_privilege('anon', 'public.usda_wasde_mapped', 'SELECT') then
    raise exception 'privacy regression: anon can bypass the bounded RPC through the mapped USDA view';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_canola_us_balance(text)',
    'EXECUTE'
  ) then
    raise exception 'public Canola balance regression: anon cannot execute RPC';
  end if;
end;
$test$;

insert into public.usda_wasde_raw (
  crop_year,
  market_name,
  commodity_code,
  commodity_name,
  country_code,
  market_year,
  calendar_year,
  month,
  attribute_id,
  unit_id,
  value
)
select
  '2099-2100',
  fixture.market_name,
  fixture.commodity_code,
  fixture.commodity_name,
  'US',
  '2099',
  2099,
  1,
  fixture.attribute_id,
  4,
  fixture.value
from (
  values
    ('US Rapeseed', '2226000', 'Oilseed, Rapeseed', 28, 2484::numeric),
    ('US Rapeseed', '2226000', 'Oilseed, Rapeseed', 57, 215::numeric),
    ('US Rapeseed', '2226000', 'Oilseed, Rapeseed', 7, 2419::numeric),
    ('US Rapeseed', '2226000', 'Oilseed, Rapeseed', 88, 345::numeric),
    ('US Rapeseed', '2226000', 'Oilseed, Rapeseed', 125, 2110::numeric),
    ('US Rapeseed', '2226000', 'Oilseed, Rapeseed', 176, 244::numeric),
    ('US Rapeseed Oil', '4239100', 'Oil, Rapeseed', 28, 996::numeric),
    ('US Rapeseed Oil', '4239100', 'Oil, Rapeseed', 57, 3850::numeric),
    ('US Rapeseed Oil', '4239100', 'Oil, Rapeseed', 88, 0::numeric),
    ('US Rapeseed Oil', '4239100', 'Oil, Rapeseed', 125, 4778::numeric),
    ('US Rapeseed Oil', '4239100', 'Oil, Rapeseed', 176, 73::numeric)
) as fixture(
  market_name,
  commodity_code,
  commodity_name,
  attribute_id,
  value
);

-- A newer seed-only month must not produce a half-populated public snapshot.
insert into public.usda_wasde_raw (
  crop_year,
  market_name,
  commodity_code,
  commodity_name,
  country_code,
  market_year,
  calendar_year,
  month,
  attribute_id,
  unit_id,
  value
)
values (
  '2099-2100',
  'US Rapeseed',
  '2226000',
  'Oilseed, Rapeseed',
  'US',
  '2099',
  2099,
  2,
  28,
  4,
  2500
);

set local role anon;

do $test$
declare
  result record;
begin
  select *
  into strict result
  from public.get_canola_us_balance('2099');

  if result.report_month is distinct from date '2099-01-01'
     or result.market_year is distinct from '2099'
     or result.seed_imports_kt is distinct from 215
     or result.seed_crush_kt is distinct from 2419
     or result.oil_imports_kt is distinct from 3850
     or result.oil_domestic_consumption_kt is distinct from 4778 then
    raise exception 'bounded Canola U.S. balance returned unexpected data: %', result;
  end if;

  raise notice 'PASS: raw USDA rows are private and bounded Canola RPC is readable';
end;
$test$;

reset role;

rollback;
