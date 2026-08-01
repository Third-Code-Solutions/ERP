-- Durable, tenant-scoped CAD processing intake. This migration creates no
-- worker credentials and grants no browser mutation authority. BullMQ carries
-- only the opaque job ID; NestJS remains the database authority.

do $$
begin
  create type public.document_processing_mode as enum ('cad');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.document_processing_requested_format as enum (
    'auto',
    'dxf',
    'dwg'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.document_processing_status as enum (
    'queued',
    'processing',
    'succeeded',
    'failed'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  document_id uuid not null,
  project_id uuid not null,
  created_by uuid not null,
  mode public.document_processing_mode not null default 'cad',
  requested_format public.document_processing_requested_format
    not null default 'auto',
  create_draft_bom boolean not null default true,
  idempotency_key varchar(256) not null,
  request_hash varchar(64) not null,
  status public.document_processing_status not null default 'queued',
  attempt_count integer not null default 0,
  scope_item_count integer,
  draft_bom_id uuid,
  warnings jsonb not null default '[]'::jsonb,
  failure_code varchar(100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint document_processing_jobs_idempotency_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint document_processing_jobs_request_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint document_processing_jobs_attempt_count_nonnegative
    check (attempt_count >= 0),
  constraint document_processing_jobs_scope_item_count_range
    check (scope_item_count is null or scope_item_count between 0 and 5000),
  constraint document_processing_jobs_warnings_array
    check (
      jsonb_typeof(warnings) = 'array'
      and jsonb_array_length(warnings) <= 100
    ),
  constraint document_processing_jobs_failure_code_bounded
    check (
      failure_code is null
      or length(btrim(failure_code)) between 1 and 100
    ),
  constraint document_processing_jobs_state_timestamps
    check (
      (
        status in ('queued', 'processing')
        and completed_at is null
      )
      or (
        status in ('succeeded', 'failed')
        and completed_at is not null
      )
    ),
  constraint document_processing_jobs_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_document_processing_jobs_tenant_id_id
  on public.document_processing_jobs (tenant_id, id);

create unique index if not exists
  ux_document_processing_jobs_tenant_idempotency
  on public.document_processing_jobs (tenant_id, idempotency_key);

create index if not exists
  idx_document_processing_jobs_tenant_status
  on public.document_processing_jobs (tenant_id, status, updated_at);

create index if not exists
  idx_document_processing_jobs_tenant_document
  on public.document_processing_jobs (tenant_id, document_id, created_at);

alter table public.document_processing_jobs
  drop constraint if exists document_processing_jobs_document_tenant_fk,
  drop constraint if exists document_processing_jobs_project_tenant_fk,
  drop constraint if exists document_processing_jobs_created_by_tenant_fk,
  drop constraint if exists document_processing_jobs_draft_bom_tenant_fk;

alter table public.document_processing_jobs
  add constraint document_processing_jobs_document_tenant_fk
    foreign key (tenant_id, document_id)
    references public.documents (tenant_id, id)
    on delete restrict
    not valid,
  add constraint document_processing_jobs_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict
    not valid,
  add constraint document_processing_jobs_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid,
  add constraint document_processing_jobs_draft_bom_tenant_fk
    foreign key (tenant_id, draft_bom_id)
    references public.boms (tenant_id, id)
    on delete restrict
    not valid;

alter table public.document_processing_jobs
  validate constraint document_processing_jobs_document_tenant_fk,
  validate constraint document_processing_jobs_project_tenant_fk,
  validate constraint document_processing_jobs_created_by_tenant_fk,
  validate constraint document_processing_jobs_draft_bom_tenant_fk;

alter table public.document_processing_jobs enable row level security;

revoke all privileges on table public.document_processing_jobs
  from public, anon, authenticated;

grant all privileges on table public.document_processing_jobs
  to service_role;
