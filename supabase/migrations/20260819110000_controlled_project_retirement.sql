-- Controlled project retirement. The user-facing Delete Project command is a
-- logical deletion: it hides the record from ordinary operation without
-- destroying child financial, procurement, drawing, document, or audit data.
begin;

do $$
begin
  create type public.project_retirement_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.projects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deletion_reason text;

alter table public.projects
  drop constraint if exists projects_deleted_by_tenant_fk,
  drop constraint if exists projects_retirement_metadata_consistent;

alter table public.projects
  add constraint projects_deleted_by_tenant_fk
    foreign key (tenant_id, deleted_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid,
  add constraint projects_retirement_metadata_consistent
    check (
      (
        deleted_at is null
        and deleted_by is null
        and deletion_reason is null
      )
      or
      (
        deleted_at is not null
        and deleted_by is not null
        and length(btrim(deletion_reason)) > 0
      )
    ) not valid;

alter table public.projects
  validate constraint projects_deleted_by_tenant_fk,
  validate constraint projects_retirement_metadata_consistent;

create index if not exists idx_projects_tenant_active
  on public.projects (tenant_id, deleted_at);
create index if not exists idx_projects_deleted_by
  on public.projects (deleted_by);

create table if not exists public.project_retirement_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  project_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.project_retirement_request_state not null default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint project_retirement_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint project_retirement_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint project_retirement_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint project_retirement_requests_state_payload
    check (
      (
        state = 'processing'
        and result is null
        and completed_at is null
      )
      or
      (
        state = 'succeeded'
        and result is not null
        and completed_at is not null
      )
    ),
  constraint project_retirement_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists ux_project_retirement_requests_tenant_id_id
  on public.project_retirement_requests (tenant_id, id);
create unique index if not exists ux_project_retirement_requests_tenant_key
  on public.project_retirement_requests (tenant_id, idempotency_key);
create index if not exists idx_project_retirement_requests_tenant_state
  on public.project_retirement_requests (tenant_id, state, created_at);

alter table public.project_retirement_requests
  drop constraint if exists project_retirement_requests_project_tenant_fk,
  drop constraint if exists project_retirement_requests_created_by_tenant_fk;

alter table public.project_retirement_requests
  add constraint project_retirement_requests_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict
    not valid,
  add constraint project_retirement_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.project_retirement_requests
  validate constraint project_retirement_requests_project_tenant_fk,
  validate constraint project_retirement_requests_created_by_tenant_fk;

alter table public.project_retirement_requests enable row level security;
alter table public.project_retirement_requests force row level security;
revoke all privileges on table public.project_retirement_requests
  from public, anon, authenticated;
grant all privileges on table public.project_retirement_requests to service_role;

-- Existing Project create/update paths are Core-owned. Closing browser DML
-- prevents a direct logical deletion or a stale compatibility write from
-- bypassing idempotency and semantic auditing.
revoke insert, update, delete on table public.projects from anon, authenticated;

commit;
