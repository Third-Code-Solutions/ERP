-- Cost-bounded, tenant-scoped semantic indexing state.
-- PostgreSQL is authoritative; Redis carries only opaque job identities.

create table public.cortex_semantic_index_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid not null,
  idempotency_key varchar(256) not null,
  request_hash varchar(64) not null,
  status varchar(20) not null default 'queued',
  max_nodes integer not null default 64,
  backlog_at_request integer not null,
  processed_nodes integer not null default 0,
  attempt_count integer not null default 0,
  provider_call_count integer not null default 0,
  failure_code varchar(100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cortex_semantic_index_jobs_idempotency_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint cortex_semantic_index_jobs_request_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cortex_semantic_index_jobs_status_allowed check (
    status in ('queued', 'processing', 'succeeded', 'failed')
  ),
  constraint cortex_semantic_index_jobs_bounds check (
    max_nodes = 64
    and backlog_at_request >= 0
    and processed_nodes between 0 and max_nodes
    and attempt_count between 0 and 3
    and provider_call_count between 0 and 1
  ),
  constraint cortex_semantic_index_jobs_failure_code_bounded check (
    failure_code is null
    or length(btrim(failure_code)) between 1 and 100
  ),
  constraint cortex_semantic_index_jobs_state_timestamps check (
    (status in ('queued', 'processing') and completed_at is null)
    or (status in ('succeeded', 'failed') and completed_at is not null)
  ),
  constraint cortex_semantic_index_jobs_terminal_state check (
    status <> 'succeeded'
    or (failure_code is null and processed_nodes <= backlog_at_request)
  ),
  constraint cortex_semantic_index_jobs_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index ux_cortex_semantic_index_jobs_tenant_id_id
  on public.cortex_semantic_index_jobs (tenant_id, id);

create unique index ux_cortex_semantic_index_jobs_tenant_idempotency
  on public.cortex_semantic_index_jobs (tenant_id, idempotency_key);

create unique index ux_cortex_semantic_index_jobs_one_active_tenant
  on public.cortex_semantic_index_jobs (tenant_id)
  where status in ('queued', 'processing');

create index idx_cortex_semantic_index_jobs_tenant_status
  on public.cortex_semantic_index_jobs (tenant_id, status, updated_at);

alter table public.cortex_semantic_index_jobs
  add constraint cortex_semantic_index_jobs_requested_by_tenant_fk
  foreign key (tenant_id, requested_by)
  references public.users (tenant_id, id)
  on delete restrict
  not valid;

alter table public.cortex_semantic_index_jobs
  validate constraint cortex_semantic_index_jobs_requested_by_tenant_fk;

alter table public.cortex_semantic_index_jobs enable row level security;
alter table public.cortex_semantic_index_jobs force row level security;

revoke all privileges on table public.cortex_semantic_index_jobs
  from public, anon, authenticated;

grant all privileges on table public.cortex_semantic_index_jobs
  to service_role;
