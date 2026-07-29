-- Run after 20260729021216_harden_public_thesis_packet_cache.sql.
-- This is rollback-only: it creates one synthetic sensitive packet, validates
-- privileges and the public RPC projection, then removes the fixture.

begin;

do $test$
begin
  if has_table_privilege('anon', 'public.thesis_packet_cache', 'SELECT') then
    raise exception 'privacy regression: anon still has SELECT on thesis_packet_cache';
  end if;

  if has_table_privilege('authenticated', 'public.thesis_packet_cache', 'SELECT') then
    raise exception 'privacy regression: authenticated still has SELECT on thesis_packet_cache';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_thesis_board_cached(text,integer)',
    'EXECUTE'
  ) then
    raise exception 'public board regression: anon cannot execute get_thesis_board_cached';
  end if;

end;
$test$;

insert into public.thesis_packet_cache (
  cache_key,
  lane,
  item_name,
  item_slug,
  display_order,
  crop_year,
  grain_week,
  packet,
  packet_generated_at,
  source_run_watermark
) values (
  '__privacy_test_canola__',
  'canada',
  'Canola',
  'canola',
  999,
  '2099-2100',
  1,
  jsonb_build_object(
    'grain', 'Canola',
    'crop_year', '2099-2100',
    'grain_week', 1,
    'demand', jsonb_build_object(),
    'farmer_behavior', jsonb_build_object(
      'user_count', 2,
      'remaining_grain_kt', 99
    )
  ),
  now(),
  now()
);

do $test$
begin
  if not (
    select packet ? 'farmer_behavior'
    from public.thesis_packet_cache
    where cache_key = '__privacy_test_canola__'
  ) then
    raise exception 'test setup failed: fixture does not contain farmer_behavior';
  end if;
end;
$test$;

set local role anon;

do $test$
declare
  v_result jsonb;
  v_packet jsonb;
  v_packet_count integer;
begin
  v_result := public.get_thesis_board_cached('2099-2100', 2099);
  v_packet_count :=
    jsonb_array_length(coalesce(v_result->'canada', '[]'::jsonb))
    + jsonb_array_length(coalesce(v_result->'us', '[]'::jsonb));

  if v_packet_count <> 1 then
    raise exception 'test precondition failed: expected 1 fixture packet, got %', v_packet_count;
  end if;

  for v_packet in
    select value
    from jsonb_array_elements(
      coalesce(v_result->'canada', '[]'::jsonb)
      || coalesce(v_result->'us', '[]'::jsonb)
    )
  loop
    if v_packet ? 'farmer_behavior' then
      raise exception 'privacy regression: public packet still contains farmer_behavior';
    end if;
  end loop;

  raise notice 'PASS: cache table is private and public packets contain no farmer_behavior';
end;
$test$;

reset role;

rollback;
