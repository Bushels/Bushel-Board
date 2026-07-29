-- Force all U.S. Canola customs mutation through the audited atomic ingest RPC.
revoke insert, update, delete, truncate, references, trigger
  on table public.us_canola_customs_raw
  from service_role;
grant select on table public.us_canola_customs_raw to service_role;

notify pgrst, 'reload schema';
