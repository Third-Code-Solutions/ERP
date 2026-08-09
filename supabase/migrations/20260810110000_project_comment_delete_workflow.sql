-- Core-owned, tenant-scoped project comment deletion ledger.
-- Hard deletion remains compatibility-compatible; the durable result keeps
-- retries deterministic after the comment row is removed.

-- A comment may be removed only after its creation/deletion evidence is
-- retained. Nulling the target reference preserves the immutable command
-- result without blocking the requested comment deletion.
alter table public.project_comment_create_requests
  drop constraint if exists project_comment_create_requests_state_payload,
  drop constraint if exists project_comment_create_requests_comment_tenant_fk;

alter table public.project_comment_create_requests
  add constraint project_comment_create_requests_state_payload
    check (
      (
        state = 'processing'
        and comment_id is null
        and result is null
        and completed_at is null
      )
      or (
        state = 'succeeded'
        and result is not null
        and completed_at is not null
      )
    ),
  add constraint project_comment_create_requests_comment_tenant_fk
    foreign key (tenant_id, comment_id)
    references public.project_comments (tenant_id, id)
    on delete set null
    not valid;

alter table public.project_comment_create_requests
  validate constraint project_comment_create_requests_comment_tenant_fk;

create table if not exists public.project_comment_delete_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  project_id uuid not null,
  comment_id uuid,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.project_comment_create_request_state not null default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint project_comment_delete_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint project_comment_delete_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint project_comment_delete_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint project_comment_delete_requests_state_payload
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
  constraint project_comment_delete_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_project_comment_delete_requests_tenant_id_id
  on public.project_comment_delete_requests (tenant_id, id);
create unique index if not exists
  ux_project_comment_delete_requests_tenant_key
  on public.project_comment_delete_requests (tenant_id, idempotency_key);
create index if not exists
  idx_project_comment_delete_requests_tenant_state
  on public.project_comment_delete_requests (tenant_id, state, created_at);

alter table public.project_comment_delete_requests
  add constraint project_comment_delete_requests_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict
    not valid,
  add constraint project_comment_delete_requests_comment_tenant_fk
    foreign key (tenant_id, comment_id)
    references public.project_comments (tenant_id, id)
    on delete set null
    not valid,
  add constraint project_comment_delete_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.project_comment_delete_requests
  validate constraint project_comment_delete_requests_project_tenant_fk,
  validate constraint project_comment_delete_requests_comment_tenant_fk,
  validate constraint project_comment_delete_requests_created_by_tenant_fk;

alter table public.project_comment_delete_requests enable row level security;
alter table public.project_comment_delete_requests force row level security;
revoke all privileges on table public.project_comment_delete_requests
  from public, anon, authenticated;
grant all privileges on table public.project_comment_delete_requests to service_role;

-- The Core authority remains the only mutator for discussion records.
revoke insert, update, delete on table public.project_comments
  from anon, authenticated;
