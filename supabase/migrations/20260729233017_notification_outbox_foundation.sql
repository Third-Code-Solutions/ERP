-- Durable, tenant-scoped notification intent and delivery evidence for the
-- disabled approved-BOM RFQ BullMQ path.

do $$
begin
  create type public.notification_delivery_status as enum (
    'pending',
    'processing',
    'delivered',
    'dead_letter'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  event_key varchar(255) not null,
  event_type varchar(100) not null,
  aggregate_type varchar(64) not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint notification_outbox_payload_object
    check (jsonb_typeof(payload) = 'object'),
  constraint notification_outbox_rfq_payload
    check (
      event_type <> 'rfq.created'
      or (
        aggregate_type = 'rfq'
        and payload ?& array[
          'schemaVersion',
          'project_id',
          'line_count'
        ]
        and payload - array[
          'schemaVersion',
          'project_id',
          'line_count'
        ] = '{}'::jsonb
        and payload->>'schemaVersion' = '1'
        and jsonb_typeof(payload->'project_id') = 'string'
        and jsonb_typeof(payload->'line_count') = 'number'
        and (payload->>'line_count')::integer > 0
      )
    )
);

create unique index if not exists ux_notification_outbox_tenant_id_id
  on public.notification_outbox (tenant_id, id);

create unique index if not exists ux_notification_outbox_tenant_event
  on public.notification_outbox (tenant_id, event_key);

create index if not exists idx_notification_outbox_tenant_aggregate
  on public.notification_outbox (
    tenant_id,
    aggregate_type,
    aggregate_id
  );

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  outbox_id uuid not null,
  recipient_user_id uuid not null,
  recipient_email varchar(255) not null,
  channel public.notification_channel not null,
  status public.notification_delivery_status not null default 'pending',
  idempotency_key varchar(256) not null,
  attempt_count integer not null default 0,
  provider_message_id varchar(255),
  last_error text,
  processing_started_at timestamptz,
  delivered_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_supported_channel
    check (channel in ('in_app', 'email')),
  constraint notification_deliveries_attempt_count_nonnegative
    check (attempt_count >= 0),
  constraint notification_deliveries_last_error_bounded
    check (last_error is null or length(last_error) <= 1000),
  constraint notification_deliveries_state_timestamps
    check (
      (
        status = 'pending'
        and delivered_at is null
        and dead_lettered_at is null
      )
      or (
        status = 'processing'
        and processing_started_at is not null
        and delivered_at is null
        and dead_lettered_at is null
      )
      or (
        status = 'delivered'
        and delivered_at is not null
        and dead_lettered_at is null
      )
      or (
        status = 'dead_letter'
        and dead_lettered_at is not null
        and delivered_at is null
      )
    )
);

create unique index if not exists
  ux_notification_deliveries_tenant_id_id
  on public.notification_deliveries (tenant_id, id);

create unique index if not exists
  ux_notification_deliveries_recipient_channel
  on public.notification_deliveries (
    tenant_id,
    outbox_id,
    recipient_user_id,
    channel
  );

create unique index if not exists
  ux_notification_deliveries_tenant_idempotency
  on public.notification_deliveries (tenant_id, idempotency_key);

create index if not exists
  idx_notification_deliveries_tenant_status
  on public.notification_deliveries (
    tenant_id,
    status,
    updated_at
  );

alter table public.notification_deliveries
  drop constraint if exists
    notification_deliveries_outbox_tenant_fk,
  drop constraint if exists
    notification_deliveries_recipient_tenant_fk;

alter table public.notification_deliveries
  add constraint notification_deliveries_outbox_tenant_fk
    foreign key (tenant_id, outbox_id)
    references public.notification_outbox (tenant_id, id)
    on delete cascade
    not valid,
  add constraint notification_deliveries_recipient_tenant_fk
    foreign key (tenant_id, recipient_user_id)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.notification_deliveries
  validate constraint notification_deliveries_outbox_tenant_fk,
  validate constraint notification_deliveries_recipient_tenant_fk;

alter table public.notifications
  add column if not exists source_delivery_id uuid;

create unique index if not exists
  ux_notifications_tenant_source_delivery
  on public.notifications (tenant_id, source_delivery_id);

alter table public.notifications
  drop constraint if exists notifications_source_delivery_tenant_fk;

alter table public.notifications
  add constraint notifications_source_delivery_tenant_fk
    foreign key (tenant_id, source_delivery_id)
    references public.notification_deliveries (tenant_id, id)
    on delete restrict
    not valid;

alter table public.notifications
  validate constraint notifications_source_delivery_tenant_fk;

alter table public.notification_outbox enable row level security;
alter table public.notification_deliveries enable row level security;

revoke all privileges on table
  public.notification_outbox,
  public.notification_deliveries
from public, anon, authenticated;

grant all privileges on table
  public.notification_outbox,
  public.notification_deliveries
to service_role;

drop policy if exists notifications_tenant_insert
  on public.notifications;
drop policy if exists notifications_tenant_update
  on public.notifications;
drop policy if exists notifications_tenant_delete
  on public.notifications;

revoke insert, update, delete on table public.notifications
  from public, anon, authenticated;

grant select on table public.notifications to authenticated;
grant all privileges on table public.notifications to service_role;
