-- Tender mutations belong to Core's capability-checked, audited commands.
-- Keep tenant reads; deny browser writes even if a future grant is too broad.
begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tender_packages', 'tender_deviations', 'tender_evaluation_criteria',
    'tender_vendor_profiles', 'tender_evaluation_scores'
  ] loop
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_delete', table_name);
    execute format('create policy tender_deny_client_insert on public.%I as restrictive for insert to anon, authenticated with check (false)', table_name);
    execute format('create policy tender_deny_client_update on public.%I as restrictive for update to anon, authenticated using (false) with check (false)', table_name);
    execute format('create policy tender_deny_client_delete on public.%I as restrictive for delete to anon, authenticated using (false)', table_name);
  end loop;
end
$$;

commit;

-- Recovery: retain this denial and roll application changes forward. Restoring
-- direct browser mutations would reopen the authorization bypass.
