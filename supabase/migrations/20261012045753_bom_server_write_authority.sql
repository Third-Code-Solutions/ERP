-- Revisions create a new BOM identity; signed/priced history cannot be reopened.
begin;

create function public.guard_bom_revision_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status::text <> 'draft' and new.status::text = 'draft' then
    raise exception 'Approved BOMs cannot return to draft; create a revision' using errcode='23514';
  end if;
  return new;
end
$$;
revoke all on function public.guard_bom_revision_state() from public, anon, authenticated;
create trigger guard_bom_revision_state before update of status on public.boms
for each row execute function public.guard_bom_revision_state();

-- Web server actions and Core already own the audited, capability-checked writes.
-- Preserve browser reads/realtime while denying direct approval and pricing bypasses.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'boms', 'bom_line_items', 'dupas', 'dupa_material_lines',
    'dupa_labour_lines', 'dupa_equipment_lines', 'crew_roles'
  ] loop
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('create policy bom_deny_client_insert on public.%I as restrictive for insert to anon, authenticated with check (false)', table_name);
    execute format('create policy bom_deny_client_update on public.%I as restrictive for update to anon, authenticated using (false) with check (false)', table_name);
    execute format('create policy bom_deny_client_delete on public.%I as restrictive for delete to anon, authenticated using (false)', table_name);
  end loop;
end
$$;
commit;

-- Recovery is forward-only: retain immutable history and client-write denial.
