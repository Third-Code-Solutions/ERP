-- Server-owned SCM issuance side effects.
-- The Purchase Order status transition is committed first; supplier email is
-- an idempotent, retryable outbox child and is never sent in that transaction.

alter type public.purchase_order_workflow_action
  add value if not exists 'scm_issue';

create table if not exists public.purchase_order_supplier_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  outbox_id uuid not null,
  purchase_order_id uuid not null,
  created_by uuid not null,
  recipient_email varchar(255) not null,
  supplier_name varchar(255) not null,
  po_number varchar(50) not null,
  project_name varchar(255) not null,
  total_cents bigint not null,
  idempotency_key varchar(256) not null,
  status public.notification_delivery_status not null default 'pending',
  attempt_count bigint not null default 0,
  provider_message_id varchar(255),
  last_error varchar(1000),
  processing_started_at timestamptz,
  delivered_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_supplier_email_deliveries_recipient_email
    check (
      recipient_email = btrim(recipient_email)
      and length(recipient_email) between 3 and 255
      and position('@' in recipient_email) > 1
    ),
  constraint purchase_order_supplier_email_deliveries_total_cents_nonnegative
    check (total_cents >= 0),
  constraint purchase_order_supplier_email_deliveries_attempt_count_nonnegative
    check (attempt_count >= 0),
  constraint purchase_order_supplier_email_deliveries_state_timestamps
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
  ux_purchase_order_supplier_email_deliveries_tenant_id_id
  on public.purchase_order_supplier_email_deliveries (tenant_id, id);

create unique index if not exists
  ux_purchase_order_supplier_email_deliveries_tenant_outbox
  on public.purchase_order_supplier_email_deliveries (tenant_id, outbox_id);

create unique index if not exists
  ux_purchase_order_supplier_email_deliveries_tenant_idempotency
  on public.purchase_order_supplier_email_deliveries (tenant_id, idempotency_key);

create index if not exists
  idx_purchase_order_supplier_email_deliveries_tenant_status
  on public.purchase_order_supplier_email_deliveries (
    tenant_id,
    status,
    updated_at
  );

alter table public.purchase_order_supplier_email_deliveries
  drop constraint if exists
    purchase_order_supplier_email_deliveries_outbox_tenant_fk,
  drop constraint if exists
    purchase_order_supplier_email_deliveries_purchase_order_tenant_fk,
  drop constraint if exists
    purchase_order_supplier_email_deliveries_created_by_tenant_fk;

alter table public.purchase_order_supplier_email_deliveries
  add constraint purchase_order_supplier_email_deliveries_outbox_tenant_fk
    foreign key (tenant_id, outbox_id)
    references public.notification_outbox (tenant_id, id)
    on delete cascade
    not valid,
  add constraint purchase_order_supplier_email_deliveries_purchase_order_tenant_fk
    foreign key (tenant_id, purchase_order_id)
    references public.purchase_orders (tenant_id, id)
    on delete cascade
    not valid,
  add constraint purchase_order_supplier_email_deliveries_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.purchase_order_supplier_email_deliveries
  validate constraint purchase_order_supplier_email_deliveries_outbox_tenant_fk,
  validate constraint purchase_order_supplier_email_deliveries_purchase_order_tenant_fk,
  validate constraint purchase_order_supplier_email_deliveries_created_by_tenant_fk;

alter table public.purchase_order_supplier_email_deliveries enable row level security;

revoke all privileges on table public.purchase_order_supplier_email_deliveries
  from public, anon, authenticated;

grant all privileges on table public.purchase_order_supplier_email_deliveries
  to service_role;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_purchase_order_workflow_payload,
  drop constraint if exists notification_outbox_purchase_order_supplier_issued_payload;

alter table public.notification_outbox
  add constraint notification_outbox_purchase_order_workflow_payload
  check (
    event_type <> 'purchase_order.workflow_changed'
    or (
      aggregate_type = 'purchase_order'
      and payload ?& array[
        'schemaVersion',
        'purchase_order_id',
        'action',
        'from_status',
        'to_status'
      ]
      and payload - array[
        'schemaVersion',
        'purchase_order_id',
        'action',
        'from_status',
        'to_status'
      ] = '{}'::jsonb
      and payload->>'schemaVersion' = '1'
      and payload->>'purchase_order_id' = aggregate_id::text
      and payload->>'action' in (
        'submit_pm_approval',
        'pm_approve',
        'commercial_approve',
        'reject',
        'scm_issue'
      )
      and payload->>'from_status' in (
        'draft',
        'pending_pm_approval',
        'pending_commercial_approval',
        'pending_scm_issuance'
      )
      and payload->>'to_status' in (
        'draft',
        'pending_pm_approval',
        'pending_commercial_approval',
        'pending_scm_issuance',
        'issued'
      )
    )
  ),
  add constraint notification_outbox_purchase_order_supplier_issued_payload
  check (
    event_type <> 'purchase_order.supplier_issued'
    or (
      aggregate_type = 'purchase_order'
      and payload ?& array['schemaVersion', 'purchase_order_id']
      and payload - array['schemaVersion', 'purchase_order_id'] = '{}'::jsonb
      and payload->>'schemaVersion' = '1'
      and payload->>'purchase_order_id' = aggregate_id::text
    )
  );
