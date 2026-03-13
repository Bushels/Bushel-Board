-- Queue internal Edge Function calls through pg_net so pipeline steps can
-- hand off immediately without spending their own wall-clock budget waiting
-- for the downstream function to finish.

create schema if not exists bushel_private;

revoke all on schema bushel_private from public;
revoke all on schema bushel_private from anon;
revoke all on schema bushel_private from authenticated;

create table if not exists bushel_private.runtime_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

revoke all on bushel_private.runtime_config from public;
revoke all on bushel_private.runtime_config from anon;
revoke all on bushel_private.runtime_config from authenticated;

create or replace function public.set_internal_runtime_setting(
  p_key text,
  p_value text
)
returns void
language plpgsql
security definer
set search_path = public, bushel_private
as $$
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'p_key is required';
  end if;

  if p_value is null or length(trim(p_value)) = 0 then
    raise exception 'p_value is required';
  end if;

  insert into bushel_private.runtime_config (key, value, updated_at)
  values (trim(p_key), p_value, timezone('utc', now()))
  on conflict (key)
  do update set
    value = excluded.value,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_internal_runtime_setting(text, text) from public;
revoke all on function public.set_internal_runtime_setting(text, text) from anon;
revoke all on function public.set_internal_runtime_setting(text, text) from authenticated;
grant execute on function public.set_internal_runtime_setting(text, text) to service_role;

create or replace function public.enqueue_internal_function(
  p_function_name text,
  p_body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, bushel_private
as $$
declare
  v_supabase_url text;
  v_internal_secret text;
  v_request_id bigint;
begin
  if p_function_name is null or length(trim(p_function_name)) = 0 then
    raise exception 'p_function_name is required';
  end if;

  select value into v_supabase_url
  from bushel_private.runtime_config
  where key = 'supabase_url';

  select value into v_internal_secret
  from bushel_private.runtime_config
  where key = 'bushel_internal_function_secret';

  if v_supabase_url is null then
    raise exception 'supabase_url is not configured';
  end if;

  if v_internal_secret is null then
    raise exception 'bushel_internal_function_secret is not configured';
  end if;

  select net.http_post(
    url := v_supabase_url || '/functions/v1/' || trim(p_function_name),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bushel-internal-secret', v_internal_secret
    ),
    body := coalesce(p_body, '{}'::jsonb)
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.enqueue_internal_function(text, jsonb) from public;
revoke all on function public.enqueue_internal_function(text, jsonb) from anon;
revoke all on function public.enqueue_internal_function(text, jsonb) from authenticated;
grant execute on function public.enqueue_internal_function(text, jsonb) to service_role;
