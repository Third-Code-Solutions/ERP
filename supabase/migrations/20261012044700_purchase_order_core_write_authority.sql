-- Approval and price changes must pass capability-checked, audited server commands.
begin;

create or replace function public.auth_can_read_purchase_orders()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users app_user
    where app_user.id = auth.uid()
      and app_user.tenant_id = public.auth_tenant_id()
      and app_user.role::text in (
        'owner', 'admin', 'estimator', 'pm', 'commercial',
        'sd_pm_pe', 'procurement', 'viewer'
      )
  )
$$;

revoke execute on function public.auth_can_read_purchase_orders() from public, anon;
grant execute on function public.auth_can_read_purchase_orders() to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['purchase_orders', 'po_line_items'] loop
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_delete', table_name);
    execute format('create policy purchase_order_authorized_read on public.%I as restrictive for select to authenticated using (tenant_id = public.auth_tenant_id() and public.auth_can_read_purchase_orders())', table_name);
    execute format('create policy purchase_order_deny_client_insert on public.%I as restrictive for insert to anon, authenticated with check (false)', table_name);
    execute format('create policy purchase_order_deny_client_update on public.%I as restrictive for update to anon, authenticated using (false) with check (false)', table_name);
    execute format('create policy purchase_order_deny_client_delete on public.%I as restrictive for delete to anon, authenticated using (false)', table_name);
  end loop;
end
$$;

commit;

-- Recovery: retain client denial and roll server changes forward. Regranting
-- browser writes would reopen approval, pricing and audit bypasses.
