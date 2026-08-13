-- ABI OPS proposal workflow: append-only change-request history.
-- A change request may be general feedback (no design version) or may point
-- at the latest affected design version. Resolution adds a second log entry.

begin;

do $$
begin
  create type public.change_log_event_type as enum ('created', 'resolved');
exception
  when duplicate_object then null;
end
$$;

-- Composite tenant references below require stable tenant/id identities.
create unique index if not exists
  ux_design_file_versions_tenant_id_id
  on public.design_file_versions (tenant_id, id);

create unique index if not exists
  ux_change_requests_tenant_id_id
  on public.change_requests (tenant_id, id);

create table if not exists public.change_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  change_request_id uuid not null,
  design_file_version_id uuid,
  event_type public.change_log_event_type not null,
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_change_logs_tenant_id
  on public.change_logs (tenant_id);
create index if not exists idx_change_logs_change_request_id
  on public.change_logs (change_request_id);
create index if not exists idx_change_logs_design_file_version_id
  on public.change_logs (design_file_version_id);
create index if not exists idx_change_logs_tenant_created_at
  on public.change_logs (tenant_id, created_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_logs_change_request_tenant_fk'
      and conrelid = 'public.change_logs'::regclass
  ) then
    alter table public.change_logs
      add constraint change_logs_change_request_tenant_fk
      foreign key (tenant_id, change_request_id)
      references public.change_requests (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'change_logs_design_version_tenant_fk'
      and conrelid = 'public.change_logs'::regclass
  ) then
    alter table public.change_logs
      add constraint change_logs_design_version_tenant_fk
      foreign key (tenant_id, design_file_version_id)
      references public.design_file_versions (tenant_id, id)
      on delete set null (design_file_version_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'change_logs_created_by_tenant_fk'
      and conrelid = 'public.change_logs'::regclass
  ) then
    alter table public.change_logs
      add constraint change_logs_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

alter table public.change_logs enable row level security;
alter table public.change_logs force row level security;

revoke all privileges on table public.change_logs from public, anon, authenticated;
grant select on table public.change_logs to authenticated;
grant all privileges on table public.change_logs to service_role;

drop policy if exists change_logs_tenant_read on public.change_logs;
create policy change_logs_tenant_read
  on public.change_logs for select to authenticated
  using (tenant_id = public.auth_tenant_id());

drop trigger if exists audit_change_logs on public.change_logs;
create trigger audit_change_logs
  after insert on public.change_logs
  for each row execute function public.audit_log_trigger();

commit;
