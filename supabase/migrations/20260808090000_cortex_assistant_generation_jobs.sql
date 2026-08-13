-- Provider-free Cortex analysis jobs. PostgreSQL is authority; Redis is delivery only.

begin;

create unique index if not exists
  ux_cortex_assistant_turn_requests_tenant_id_id
  on public.cortex_assistant_turn_requests (tenant_id, id);

create table if not exists public.cortex_assistant_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  user_id uuid not null,
  request_id uuid not null,
  claim_token_hash char(64) not null,
  status varchar(20) not null default 'queued',
  attempt_count integer not null default 0,
  failure_code varchar(100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cortex_assistant_generation_jobs_tenant_user_fk
    foreign key (tenant_id, user_id)
    references public.users(tenant_id, id) on delete cascade,
  constraint cortex_assistant_generation_jobs_tenant_request_fk
    foreign key (tenant_id, request_id)
    references public.cortex_assistant_turn_requests(tenant_id, id)
    on delete cascade,
  constraint cortex_assistant_generation_jobs_claim_hash_hex check (
    claim_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cortex_assistant_generation_jobs_status_allowed check (
    status in ('queued', 'processing', 'succeeded', 'failed', 'cancelled')
  ),
  constraint cortex_assistant_generation_jobs_attempt_bounds check (
    attempt_count between 0 and 3
  ),
  constraint cortex_assistant_generation_jobs_failure_code_bounded check (
    failure_code is null or (
      failure_code = btrim(failure_code)
      and length(failure_code) between 1 and 100
    )
  ),
  constraint cortex_assistant_generation_jobs_state_payload check (
    (
      status in ('queued', 'processing')
      and completed_at is null
      and failure_code is null
    )
    or (
      status = 'succeeded'
      and completed_at is not null
      and failure_code is null
    )
    or (
      status in ('failed', 'cancelled')
      and completed_at is not null
      and failure_code is not null
    )
  ),
  constraint cortex_assistant_generation_jobs_updated_after_created check (
    updated_at >= created_at
  ),
  constraint cortex_assistant_generation_jobs_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index if not exists
  ux_cortex_assistant_generation_jobs_tenant_id_id
  on public.cortex_assistant_generation_jobs (tenant_id, id);
create unique index if not exists
  ux_cortex_assistant_generation_jobs_tenant_request
  on public.cortex_assistant_generation_jobs (tenant_id, request_id);
create index if not exists
  idx_cortex_assistant_generation_jobs_tenant_status
  on public.cortex_assistant_generation_jobs (
    tenant_id,
    status,
    updated_at
  );

alter table public.cortex_assistant_generation_jobs enable row level security;
alter table public.cortex_assistant_generation_jobs force row level security;
revoke all privileges on table public.cortex_assistant_generation_jobs
  from public, anon, authenticated;
grant all privileges on table public.cortex_assistant_generation_jobs
  to service_role;

commit;
