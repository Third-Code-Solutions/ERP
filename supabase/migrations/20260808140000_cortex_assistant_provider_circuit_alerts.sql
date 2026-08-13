-- Service-only, aggregate-only circuit transition ledger. No external sink or
-- provider activation is enabled by this migration.

begin;

create table public.cortex_assistant_provider_circuit_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  policy_id uuid not null,
  source_event_id uuid,
  event_key varchar(64) not null,
  event_type varchar(16) not null,
  provider varchar(50) not null,
  model varchar(100) not null,
  failure_count smallint not null,
  retry_at timestamptz,
  as_of timestamptz not null,
  status varchar(20) not null default 'pending',
  attempt_count integer not null default 0,
  last_error varchar(100),
  processing_started_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cortex_asst_provider_alert_policy_tenant_fk
    foreign key (tenant_id, policy_id)
    references public.cortex_assistant_provider_policies (tenant_id, id)
    on delete restrict,
  constraint cortex_asst_provider_alert_event_key_hex
    check (event_key ~ '^[0-9a-f]{64}$'),
  constraint cortex_asst_provider_alert_scope_valid
    check (
      provider ~ '^[a-z0-9][a-z0-9._-]{0,49}$'
      and model ~ '^[a-z0-9][a-z0-9._:/-]{0,99}$'
    ),
  constraint cortex_asst_provider_alert_event_valid
    check (
      (
        event_type = 'opened'
        and source_event_id is null
        and failure_count between 1 and 20
        and retry_at is not null
      )
      or (
        event_type = 'recovered'
        and source_event_id is not null
        and failure_count = 0
        and retry_at is null
      )
    ),
  constraint cortex_asst_provider_alert_status_enum
    check (status in ('pending', 'processing', 'delivered', 'failed')),
  constraint cortex_asst_provider_alert_status_valid
    check (
      (
        status = 'pending'
        and processing_started_at is null
        and delivered_at is null
      )
      or (
        status = 'processing'
        and processing_started_at is not null
        and delivered_at is null
      )
      or (
        status = 'delivered'
        and delivered_at is not null
        and last_error is null
      )
      or (
        status = 'failed'
        and processing_started_at is null
        and last_error is not null
        and delivered_at is null
      )
    ),
  constraint cortex_asst_provider_alert_attempt_nonnegative
    check (attempt_count >= 0),
  constraint cortex_asst_provider_alert_updated_after_created
    check (updated_at >= created_at)
);

create unique index ux_cortex_asst_provider_alert_tenant_id
  on public.cortex_assistant_provider_circuit_alerts (tenant_id, id);
alter table public.cortex_assistant_provider_circuit_alerts
  add constraint cortex_asst_provider_alert_source_tenant_fk
    foreign key (tenant_id, source_event_id)
    references public.cortex_assistant_provider_circuit_alerts (tenant_id, id)
    on delete restrict;
create unique index ux_cortex_asst_provider_alert_event
  on public.cortex_assistant_provider_circuit_alerts (tenant_id, event_key);
create unique index ux_cortex_asst_provider_alert_source_event
  on public.cortex_assistant_provider_circuit_alerts (
    tenant_id,
    source_event_id,
    event_type
  );
create index idx_cortex_asst_provider_alert_status
  on public.cortex_assistant_provider_circuit_alerts (
    tenant_id,
    status,
    updated_at
  );
create index idx_cortex_asst_provider_alert_policy
  on public.cortex_assistant_provider_circuit_alerts (
    tenant_id,
    policy_id,
    created_at
  );

alter table public.cortex_assistant_provider_circuit_alerts enable row level security;
alter table public.cortex_assistant_provider_circuit_alerts force row level security;
revoke all privileges on table public.cortex_assistant_provider_circuit_alerts
  from public, anon, authenticated;
grant all privileges on table public.cortex_assistant_provider_circuit_alerts
  to service_role;

commit;
