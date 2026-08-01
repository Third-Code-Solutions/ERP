-- Durable, tenant-scoped idempotency for the disabled NestJS CAD evidence
-- commit command. Python remains document-processing-only; this table records
-- only the application transaction that commits derived scope rows.

create unique index if not exists
  ux_documents_tenant_id_id
  on public.documents (tenant_id, id);

do $$
begin
  create type public.cad_evidence_commit_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.cad_evidence_commit_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  document_id uuid not null,
  project_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.cad_evidence_commit_request_state not null
    default 'processing',
  scope_item_count integer,
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cad_evidence_commit_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint cad_evidence_commit_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint cad_evidence_commit_requests_count_range
    check (scope_item_count is null or scope_item_count between 0 and 5000),
  constraint cad_evidence_commit_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint cad_evidence_commit_requests_state_payload
    check (
      (
        state = 'processing'
        and scope_item_count is null
        and result is null
        and completed_at is null
      )
      or (
        state = 'succeeded'
        and scope_item_count is not null
        and result is not null
        and completed_at is not null
      )
    ),
  constraint cad_evidence_commit_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_cad_evidence_commit_requests_tenant_id_id
  on public.cad_evidence_commit_requests (tenant_id, id);

create unique index if not exists
  ux_cad_evidence_commit_requests_tenant_key
  on public.cad_evidence_commit_requests (tenant_id, idempotency_key);

create index if not exists
  idx_cad_evidence_commit_requests_tenant_state
  on public.cad_evidence_commit_requests (tenant_id, state, created_at);

alter table public.cad_evidence_commit_requests
  drop constraint if exists cad_evidence_commit_requests_document_tenant_fk,
  drop constraint if exists cad_evidence_commit_requests_project_tenant_fk,
  drop constraint if exists cad_evidence_commit_requests_created_by_tenant_fk;

alter table public.cad_evidence_commit_requests
  add constraint cad_evidence_commit_requests_document_tenant_fk
    foreign key (tenant_id, document_id)
    references public.documents (tenant_id, id)
    on delete restrict
    not valid,
  add constraint cad_evidence_commit_requests_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict
    not valid,
  add constraint cad_evidence_commit_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.cad_evidence_commit_requests
  validate constraint cad_evidence_commit_requests_document_tenant_fk,
  validate constraint cad_evidence_commit_requests_project_tenant_fk,
  validate constraint cad_evidence_commit_requests_created_by_tenant_fk;

alter table public.cad_evidence_commit_requests enable row level security;

revoke all privileges on table public.cad_evidence_commit_requests
  from public, anon, authenticated;

grant all privileges on table public.cad_evidence_commit_requests
  to service_role;
