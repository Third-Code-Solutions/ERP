-- Project RFI register: a Core-owned, tenant-safe correspondence spine for
-- execution projects. Pre-Won site-inspection RFIs remain separate.

begin;

do $$ begin
  create type public.project_rfi_status as enum ('open', 'answered', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_rfi_priority as enum ('low', 'normal', 'high', 'critical');
exception when duplicate_object then null;
end $$;

create table if not exists public.project_rfis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  rfi_number varchar(40) not null,
  subject varchar(200) not null,
  question text not null,
  priority public.project_rfi_priority not null default 'normal',
  status public.project_rfi_status not null default 'open',
  requested_by uuid not null,
  assigned_to uuid,
  due_at timestamptz,
  response text,
  responded_at timestamptz,
  responded_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  client_request_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_rfis_subject_nonempty check (subject = btrim(subject) and length(subject) > 0),
  constraint project_rfis_question_nonempty check (question = btrim(question) and length(question) > 0),
  constraint project_rfis_version_positive check (version >= 1),
  constraint project_rfis_response_metadata_consistent check (
    (responded_at is null and responded_by is null and response is null)
    or
    (responded_at is not null and responded_by is not null and response is not null and length(btrim(response)) > 0)
  ),
  constraint project_rfis_closed_metadata_consistent check (
    (status = 'closed' and closed_at is not null and closed_by is not null)
    or
    (status <> 'closed' and closed_at is null and closed_by is null)
  ),
  constraint project_rfis_answered_state_consistent check (
    status <> 'answered'
    or (response is not null and responded_at is not null and responded_by is not null)
  ),
  constraint project_rfis_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint project_rfis_requested_by_tenant_fk foreign key (tenant_id, requested_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint project_rfis_assigned_to_tenant_fk foreign key (tenant_id, assigned_to)
    references public.users(tenant_id, id) on delete set null,
  constraint project_rfis_responded_by_tenant_fk foreign key (tenant_id, responded_by)
    references public.users(tenant_id, id) on delete set null,
  constraint project_rfis_closed_by_tenant_fk foreign key (tenant_id, closed_by)
    references public.users(tenant_id, id) on delete set null
);

create unique index if not exists ux_project_rfis_tenant_id_id
  on public.project_rfis (tenant_id, id);
create unique index if not exists ux_project_rfis_tenant_project_number
  on public.project_rfis (tenant_id, project_id, rfi_number);
create unique index if not exists ux_project_rfis_tenant_client_request
  on public.project_rfis (tenant_id, client_request_id)
  where client_request_id is not null;
create index if not exists idx_project_rfis_tenant_id
  on public.project_rfis (tenant_id);
create index if not exists idx_project_rfis_project_status
  on public.project_rfis (tenant_id, project_id, status);
create index if not exists idx_project_rfis_assigned_due
  on public.project_rfis (tenant_id, assigned_to, due_at);

alter table public.project_rfis enable row level security;
alter table public.project_rfis force row level security;
revoke all privileges on table public.project_rfis from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'project_rfis'
       and policyname = 'project_rfis_deny_direct_client_access'
  ) then
    create policy project_rfis_deny_direct_client_access
      on public.project_rfis
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'audit_project_rfis'
       and tgrelid = 'public.project_rfis'::regclass
       and not tgisinternal
  ) then
    create trigger audit_project_rfis
      after insert or update or delete on public.project_rfis
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
