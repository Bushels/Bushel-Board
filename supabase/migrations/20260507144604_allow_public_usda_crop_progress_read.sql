-- /seeding is a public page, and USDA crop progress is public source data.
-- Keep writes service-role-only; allow anonymous read access through RLS.

revoke insert, update, delete, truncate
on public.usda_crop_progress
from anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'usda_crop_progress'
      and policyname = 'Anon can read USDA crop progress'
  ) then
    create policy "Anon can read USDA crop progress"
      on public.usda_crop_progress
      for select
      to anon
      using (true);
  end if;
end $$;
