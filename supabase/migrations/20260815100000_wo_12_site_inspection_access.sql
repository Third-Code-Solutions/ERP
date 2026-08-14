-- WO-12: make the pre-Won site-inspection media surface usable by
-- authenticated tenant members without restoring anonymous or public access.
-- The original M2 migration created RLS policies but did not establish direct
-- Data API table privileges after the repository's later privilege hardening.

begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'site_inspections',
    'site_inspection_photos',
    'site_inspection_rfis'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      table_name
    );
    execute format(
      'grant select, insert, update on table public.%I to authenticated',
      table_name
    );
  end loop;
end
$$;

commit;
