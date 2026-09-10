-- Project document-control register: submittal review lifecycle.

begin;

do $$ begin
  create type public.project_submittal_status as enum (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.project_submittals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  submittal_number varchar(40) not null,
  title varchar(200) not null,
  description text not null,
  spec_section varchar(120) not null default '',
  discipline varchar(120) not null default '',
  plan_reference varchar(200) not null default '',
  due_date date,
  status public.project_submittal_status not null default 'draft',
  submission_notes text not null default '',
  review_notes text not null default '',
  rejection_reason text not null default '',
  requested_by uuid not null,
  assigned_to uuid,
  submitted_at timestamptz,
  submitted_by uuid,
  review_started_at timestamptz,
  review_started_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  client_request_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_submittals_title_nonempty check (title = btrim(title) and length(title) > 0),
  constraint project_submittals_description_nonempty check (description = btrim(description) and length(description) > 0),
  constraint project_submittals_version_positive check (version >= 1),
  constraint project_submittals_lifecycle_metadata_consistent check (
    (status = 'draft' and submitted_at is null and submitted_by is null and review_started_at is null and review_started_by is null and reviewed_at is null and reviewed_by is null)
    or
    (status = 'submitted' and submitted_at is not null and submitted_by is not null and review_started_at is null and review_started_by is null and reviewed_at is null and reviewed_by is null)
    or
    (status = 'under_review' and submitted_at is not null and submitted_by is not null and review_started_at is not null and review_started_by is not null and reviewed_at is null and reviewed_by is null)
    or
    (status = 'approved' and submitted_at is not null and submitted_by is not null and review_started_at is not null and review_started_by is not null and reviewed_at is not null and reviewed_by is not null and rejection_reason = '')
    or
    (status = 'rejected' and submitted_at is not null and submitted_by is not null and review_started_at is not null and review_started_by is not null and reviewed_at is not null and reviewed_by is not null and length(btrim(rejection_reason)) > 0)
  ),
  constraint project_submittals_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint project_submittals_requested_by_tenant_fk foreign key (tenant_id, requested_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint project_submittals_assigned_to_tenant_fk foreign key (tenant_id, assigned_to)
    references public.users(tenant_id, id) on delete set null,
  constraint project_submittals_submitted_by_tenant_fk foreign key (tenant_id, submitted_by)
    references public.users(tenant_id, id) on delete set null,
  constraint project_submittals_review_started_by_tenant_fk foreign key (tenant_id, review_started_by)
    references public.users(tenant_id, id) on delete set null,
  constraint project_submittals_reviewed_by_tenant_fk foreign key (tenant_id, reviewed_by)
    references public.users(tenant_id, id) on delete set null
);

create unique index if not exists ux_project_submittals_tenant_id_id
  on public.project_submittals (tenant_id, id);
create unique index if not exists ux_project_submittals_tenant_project_number
  on public.project_submittals (tenant_id, project_id, submittal_number);
create unique index if not exists ux_project_submittals_tenant_client_request
  on public.project_submittals (tenant_id, client_request_id);
create index if not exists idx_project_submittals_project_status
  on public.project_submittals (tenant_id, project_id, status);
create index if not exists idx_project_submittals_assigned_due
  on public.project_submittals (tenant_id, assigned_to, due_date);

create or replace function public.prevent_approved_project_submittal_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved project submittals are immutable';
  end if;
  return new;
end;
$$;

alter table public.project_submittals enable row level security;
alter table public.project_submittals force row level security;
revoke all privileges on table public.project_submittals from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'project_submittals'
       and policyname = 'project_submittals_deny_direct_client_access'
  ) then
    create policy project_submittals_deny_direct_client_access
      on public.project_submittals
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'prevent_approved_project_submittal_update'
       and tgrelid = 'public.project_submittals'::regclass
       and not tgisinternal
  ) then
    create trigger prevent_approved_project_submittal_update
      before update or delete on public.project_submittals
      for each row execute function public.prevent_approved_project_submittal_update();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_project_submittals'
       and tgrelid = 'public.project_submittals'::regclass
       and not tgisinternal
  ) then
    create trigger audit_project_submittals
      after insert or update or delete on public.project_submittals
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
