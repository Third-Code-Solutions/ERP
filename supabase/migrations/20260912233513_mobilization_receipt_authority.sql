-- ADR-033: only controlled server commands record mobilization evidence.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke insert, update, delete, truncate, references, trigger
  on public.mobilization_readiness from public, anon, authenticated;
do $$
declare columns_sql text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum)
    into columns_sql from pg_attribute
    where attrelid = 'public.mobilization_readiness'::regclass
      and attnum > 0 and not attisdropped;
  execute format(
    'revoke insert (%1$s), update (%1$s), references (%1$s) on public.mobilization_readiness from public, anon, authenticated',
    columns_sql
  );
end $$;

drop policy if exists mobilization_readiness_tenant_insert on public.mobilization_readiness;
drop policy if exists mobilization_readiness_tenant_update on public.mobilization_readiness;
create policy mobilization_readiness_deny_client_insert on public.mobilization_readiness
  as restrictive for insert to anon, authenticated with check (false);
create policy mobilization_readiness_deny_client_update on public.mobilization_readiness
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy mobilization_readiness_deny_client_delete on public.mobilization_readiness
  as restrictive for delete to anon, authenticated using (false);

create or replace function public.guard_mobilization_readiness()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
begin
  -- NOWAIT avoids a row-trigger lock-order inversion with lifecycle commands.
  select role::text into actor_role from public.users
    where id = actor_id and tenant_id = new.tenant_id and account_status = 'active'
    for share nowait;
  if actor_role is null or actor_role not in ('owner', 'admin', 'commercial', 'sd_pm_pe', 'pm') then
    raise exception using errcode = '42501', message = 'Current mobilization authority required';
  end if;
  perform 1 from public.tenants where id = new.tenant_id and status = 'active' for share nowait;
  if not found then
    raise exception using errcode = '42501', message = 'Active tenant required';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
       or new.project_id is distinct from old.project_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Mobilization identity is immutable';
    end if;
    if old.started_at is not null and (
      new.started_at is distinct from old.started_at or new.started_by is distinct from old.started_by
      or new.commented_fcd_received_at is distinct from old.commented_fcd_received_at
      or new.po_copies_received_at is distinct from old.po_copies_received_at
      or new.cari_received_at is distinct from old.cari_received_at
      or new.ntp_received_at is distinct from old.ntp_received_at
      or new.override_reason is distinct from old.override_reason
      or new.override_at is distinct from old.override_at
      or new.override_by is distinct from old.override_by
    ) then
      raise exception 'Mobilization start and evidence are immutable once recorded';
    end if;
  elsif new.created_by is distinct from actor_id then
    raise exception using errcode = '42501', message = 'Mobilization creator must match current actor';
  end if;

  if new.updated_by is distinct from actor_id then
    raise exception using errcode = '42501', message = 'Mobilization updater must match current actor';
  end if;
  if new.started_at is not null and (tg_op = 'INSERT' or old.started_at is null) then
    if new.started_by is distinct from actor_id then
      raise exception using errcode = '42501', message = 'Mobilization starter must match current actor';
    end if;
    if new.override_reason is not null and (
      actor_role not in ('owner', 'admin', 'commercial', 'pm') or new.override_by is distinct from actor_id
    ) then
      raise exception using errcode = '42501', message = 'Current mobilization override authority required';
    end if;
  end if;
  return new;
end $$;

commit;
-- Recovery: compatible application or reviewed fix-forward. Never reopen direct
-- client mutations. No historical rows, audit entries, keys or columns change.
