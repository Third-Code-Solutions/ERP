-- M3.118: server-authoritative Won → Project handoff.
-- Keep the Core flag closed until hosted parity, replay, and tenant canary pass.

begin;

do $$
begin
  create type public.opportunity_project_conversion_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

-- Composite tenant references are explicit even though each table also has a
-- UUID primary key. This keeps cross-tenant joins impossible by construction.
create unique index if not exists ux_opportunities_tenant_id_id
  on public.opportunities (tenant_id, id);
create unique index if not exists ux_pre_con_checklists_tenant_id_id
  on public.pre_con_checklists (tenant_id, id);

create table if not exists public.opportunity_project_conversion_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  opportunity_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.opportunity_project_conversion_request_state not null
    default 'processing',
  project_id uuid,
  checklist_id uuid,
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint opportunity_project_conversion_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint opportunity_project_conversion_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint opportunity_project_conversion_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint opportunity_project_conversion_requests_state_payload
    check (
      (
        state = 'processing'
        and project_id is null
        and checklist_id is null
        and result is null
        and completed_at is null
      )
      or (
        state = 'succeeded'
        and project_id is not null
        and checklist_id is not null
        and result is not null
        and completed_at is not null
      )
    ),
  constraint opportunity_project_conversion_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_opportunity_project_conversion_requests_tenant_id_id
  on public.opportunity_project_conversion_requests (tenant_id, id);
create unique index if not exists
  ux_opportunity_project_conversion_requests_tenant_key
  on public.opportunity_project_conversion_requests (tenant_id, idempotency_key);
create index if not exists
  idx_opportunity_project_conversion_requests_tenant_state
  on public.opportunity_project_conversion_requests (tenant_id, state, created_at);

alter table public.opportunity_project_conversion_requests
  drop constraint if exists opportunity_project_conversion_requests_opportunity_tenant_fk,
  drop constraint if exists opportunity_project_conversion_requests_project_tenant_fk,
  drop constraint if exists opportunity_project_conversion_requests_checklist_tenant_fk,
  drop constraint if exists opportunity_project_conversion_requests_created_by_tenant_fk;

alter table public.opportunity_project_conversion_requests
  add constraint opportunity_project_conversion_requests_opportunity_tenant_fk
    foreign key (tenant_id, opportunity_id)
    references public.opportunities (tenant_id, id)
    on delete restrict not valid,
  add constraint opportunity_project_conversion_requests_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict not valid,
  add constraint opportunity_project_conversion_requests_checklist_tenant_fk
    foreign key (tenant_id, checklist_id)
    references public.pre_con_checklists (tenant_id, id)
    on delete restrict not valid,
  add constraint opportunity_project_conversion_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.opportunity_project_conversion_requests
  validate constraint opportunity_project_conversion_requests_opportunity_tenant_fk,
  validate constraint opportunity_project_conversion_requests_project_tenant_fk,
  validate constraint opportunity_project_conversion_requests_checklist_tenant_fk,
  validate constraint opportunity_project_conversion_requests_created_by_tenant_fk;

alter table public.opportunity_project_conversion_requests enable row level security;
alter table public.opportunity_project_conversion_requests force row level security;
revoke all privileges on table public.opportunity_project_conversion_requests
  from public, anon, authenticated;
grant all privileges on table public.opportunity_project_conversion_requests
  to service_role;

commit;
