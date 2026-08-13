-- Durable, tenant-scoped idempotency for the Nest document-intake command.
-- Browser storage upload happens before this command. Nest owns the canonical
-- documents row and audit event; this ledger only preserves replay evidence.

do $$
begin
  create type public.document_intake_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.document_intake_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  project_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.document_intake_request_state not null default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint document_intake_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint document_intake_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint document_intake_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint document_intake_requests_state_payload
    check (
      (
        state = 'processing'
        and result is null
        and completed_at is null
      )
      or (
        state = 'succeeded'
        and result is not null
        and completed_at is not null
      )
    ),
  constraint document_intake_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_document_intake_requests_tenant_id_id
  on public.document_intake_requests (tenant_id, id);

create unique index if not exists
  ux_document_intake_requests_tenant_key
  on public.document_intake_requests (tenant_id, idempotency_key);

create index if not exists
  idx_document_intake_requests_tenant_state
  on public.document_intake_requests (tenant_id, state, created_at);

alter table public.document_intake_requests
  drop constraint if exists document_intake_requests_project_tenant_fk,
  drop constraint if exists document_intake_requests_created_by_tenant_fk;

alter table public.document_intake_requests
  add constraint document_intake_requests_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict
    not valid,
  add constraint document_intake_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.document_intake_requests
  validate constraint document_intake_requests_project_tenant_fk,
  validate constraint document_intake_requests_created_by_tenant_fk;

alter table public.document_intake_requests enable row level security;
alter table public.document_intake_requests force row level security;
revoke all privileges on table public.document_intake_requests
  from public, anon, authenticated;
grant all privileges on table public.document_intake_requests to service_role;
