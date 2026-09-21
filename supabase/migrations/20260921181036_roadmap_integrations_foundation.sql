-- Remaining roadmap foundation (2026-09-22).
-- Additive only: existing PO, receipt, bill, ledger, and notification rows are
-- never rewritten. New evidence is tenant scoped and dark-by-default.

alter type public.stock_ledger_event_type add value if not exists 'landed_cost';
alter table public.stock_ledger_entries
  add column if not exists landed_cost_document_id uuid,
  add column if not exists landed_cost_allocation_id uuid;
alter table public.stock_ledger_entries
  drop constraint if exists stock_ledger_entries_signed_values;
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_signed_values check (
    (
      quantity_delta_micros <> 0 and value_delta_cents <> 0
      and (
        (quantity_delta_micros > 0 and value_delta_cents > 0)
        or (quantity_delta_micros < 0 and value_delta_cents < 0)
      )
    )
    or (event_type::text = 'landed_cost' and quantity_delta_micros = 0 and value_delta_cents > 0)
  );
alter table public.stock_ledger_entries
  drop constraint if exists stock_ledger_entries_single_source;

create table if not exists public.tenant_feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_key varchar(100) not null,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  enabled_by uuid,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_feature_flags_key_nonempty check (length(btrim(feature_key)) > 0),
  constraint tenant_feature_flags_enabled_evidence check (
    (enabled = false and enabled_by is null and enabled_at is null)
    or (enabled = true and enabled_by is not null and enabled_at is not null)
  ),
  constraint tenant_feature_flags_enabled_by_tenant_fk foreign key (tenant_id, enabled_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_tenant_feature_flags_key
  on public.tenant_feature_flags(tenant_id, feature_key);

create table if not exists public.procurement_requisitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  requester_id uuid not null,
  requisition_number varchar(40) not null,
  status varchar(24) not null default 'draft',
  needed_by date,
  purpose text not null,
  currency char(3) not null default 'PHP',
  estimated_total_cents bigint not null default 0,
  approved_by uuid,
  approved_at timestamptz,
  converted_purchase_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procurement_requisitions_status_check check (status in ('draft','pending_approval','approved','rejected','converted','cancelled')),
  constraint procurement_requisitions_number_check check (length(btrim(requisition_number)) > 0),
  constraint procurement_requisitions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint procurement_requisitions_total_check check (estimated_total_cents >= 0),
  constraint procurement_requisitions_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete restrict,
  constraint procurement_requisitions_requester_tenant_fk foreign key (tenant_id, requester_id)
    references public.users(tenant_id, id) on delete restrict,
  constraint procurement_requisitions_approver_tenant_fk foreign key (tenant_id, approved_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint procurement_requisitions_po_tenant_fk foreign key (tenant_id, converted_purchase_order_id)
    references public.purchase_orders(tenant_id, id) on delete restrict
);
create unique index if not exists ux_procurement_requisitions_number
  on public.procurement_requisitions(tenant_id, requisition_number);
create unique index if not exists ux_procurement_requisitions_tenant_id
  on public.procurement_requisitions(tenant_id, id);
create index if not exists idx_procurement_requisitions_status
  on public.procurement_requisitions(tenant_id, status, created_at desc);

create table if not exists public.procurement_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requisition_id uuid not null,
  line_number integer not null,
  description text not null,
  material_item_id uuid,
  bom_line_item_id uuid,
  cost_code_id uuid,
  uom_id uuid,
  quantity_micros bigint not null,
  estimated_unit_cost_cents bigint not null default 0,
  estimated_total_cents bigint not null default 0,
  selected_rfq_id uuid,
  selected_quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procurement_requisition_lines_line_check check (line_number > 0),
  constraint procurement_requisition_lines_description_check check (length(btrim(description)) > 0),
  constraint procurement_requisition_lines_quantity_check check (quantity_micros > 0),
  constraint procurement_requisition_lines_unit_cost_check check (estimated_unit_cost_cents >= 0),
  constraint procurement_requisition_lines_total_check check (estimated_total_cents >= 0),
  constraint procurement_requisition_lines_requisition_tenant_fk foreign key (tenant_id, requisition_id)
    references public.procurement_requisitions(tenant_id, id) on delete cascade,
  constraint procurement_requisition_lines_material_tenant_fk foreign key (tenant_id, material_item_id)
    references public.material_items(tenant_id, id) on delete restrict,
  constraint procurement_requisition_lines_bom_tenant_fk foreign key (tenant_id, bom_line_item_id)
    references public.bom_line_items(tenant_id, id) on delete restrict,
  constraint procurement_requisition_lines_cost_code_tenant_fk foreign key (tenant_id, cost_code_id)
    references public.cost_codes(tenant_id, id) on delete restrict,
  constraint procurement_requisition_lines_uom_tenant_fk foreign key (tenant_id, uom_id)
    references public.units_of_measure(tenant_id, id) on delete restrict,
  constraint procurement_requisition_lines_rfq_tenant_fk foreign key (tenant_id, selected_rfq_id)
    references public.rfqs(tenant_id, id) on delete restrict,
  constraint procurement_requisition_lines_quote_tenant_fk foreign key (tenant_id, selected_quote_id)
    references public.rfq_quotes(tenant_id, id) on delete restrict
);
create unique index if not exists ux_procurement_requisition_lines_number
  on public.procurement_requisition_lines(requisition_id, line_number);
create index if not exists idx_procurement_requisition_lines_item
  on public.procurement_requisition_lines(tenant_id, material_item_id);

create table if not exists public.procurement_requisition_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requisition_id uuid not null,
  action varchar(32) not null,
  from_status varchar(24),
  to_status varchar(24),
  reason text,
  actor_id uuid not null,
  idempotency_key varchar(256) not null,
  created_at timestamptz not null default now(),
  constraint procurement_requisition_events_requisition_tenant_fk foreign key (tenant_id, requisition_id)
    references public.procurement_requisitions(tenant_id, id) on delete cascade,
  constraint procurement_requisition_events_actor_tenant_fk foreign key (tenant_id, actor_id)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_procurement_requisition_events_idempotency
  on public.procurement_requisition_events(tenant_id, idempotency_key);
create index if not exists idx_procurement_requisition_events_requisition
  on public.procurement_requisition_events(tenant_id, requisition_id, created_at);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  warehouse_id uuid not null,
  material_item_id uuid not null,
  uom_id uuid not null,
  project_id uuid,
  cost_code_id uuid,
  po_line_item_id uuid,
  quantity_micros bigint not null,
  status varchar(16) not null default 'active',
  source_type varchar(32) not null default 'procurement_requisition',
  source_id uuid,
  expires_at timestamptz,
  requested_by uuid not null,
  released_by uuid,
  released_at timestamptz,
  consumed_at timestamptz,
  idempotency_key varchar(256) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_reservations_quantity_check check (quantity_micros > 0),
  constraint inventory_reservations_status_check check (status in ('active','released','consumed','expired')),
  constraint inventory_reservations_warehouse_tenant_fk foreign key (tenant_id, warehouse_id)
    references public.warehouses(tenant_id, id) on delete restrict,
  constraint inventory_reservations_item_tenant_fk foreign key (tenant_id, material_item_id)
    references public.material_items(tenant_id, id) on delete restrict,
  constraint inventory_reservations_uom_tenant_fk foreign key (tenant_id, uom_id)
    references public.units_of_measure(tenant_id, id) on delete restrict,
  constraint inventory_reservations_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete restrict,
  constraint inventory_reservations_cost_code_tenant_fk foreign key (tenant_id, cost_code_id)
    references public.cost_codes(tenant_id, id) on delete restrict,
  constraint inventory_reservations_po_line_tenant_fk foreign key (tenant_id, po_line_item_id)
    references public.po_line_items(tenant_id, id) on delete restrict,
  constraint inventory_reservations_requester_tenant_fk foreign key (tenant_id, requested_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint inventory_reservations_releaser_tenant_fk foreign key (tenant_id, released_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_inventory_reservations_idempotency
  on public.inventory_reservations(tenant_id, idempotency_key);
create unique index if not exists ux_inventory_reservations_tenant_id
  on public.inventory_reservations(tenant_id, id);
create index if not exists idx_inventory_reservations_balance
  on public.inventory_reservations(tenant_id, warehouse_id, material_item_id, status);

create table if not exists public.inventory_reservation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_id uuid not null,
  action varchar(16) not null,
  quantity_micros bigint not null,
  actor_id uuid not null,
  reason text,
  idempotency_key varchar(256) not null,
  created_at timestamptz not null default now(),
  constraint inventory_reservation_events_quantity_check check (quantity_micros > 0),
  constraint inventory_reservation_events_reservation_tenant_fk foreign key (tenant_id, reservation_id)
    references public.inventory_reservations(tenant_id, id) on delete restrict,
  constraint inventory_reservation_events_actor_tenant_fk foreign key (tenant_id, actor_id)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_inventory_reservation_events_idempotency
  on public.inventory_reservation_events(tenant_id, idempotency_key);

create table if not exists public.landed_cost_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stock_receipt_id uuid not null,
  document_number varchar(80) not null,
  idempotency_key varchar(256) not null,
  status varchar(16) not null default 'draft',
  currency char(3) not null default 'PHP',
  total_cents bigint not null default 0,
  allocation_basis varchar(16) not null default 'value',
  source_document text,
  created_by uuid not null,
  applied_by uuid,
  applied_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landed_cost_documents_status_check check (status in ('draft','applied','reversed')),
  constraint landed_cost_documents_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint landed_cost_documents_total_check check (total_cents >= 0),
  constraint landed_cost_documents_basis_check check (allocation_basis in ('quantity','value','weight')),
  constraint landed_cost_documents_receipt_tenant_fk foreign key (tenant_id, stock_receipt_id)
    references public.stock_receipts(tenant_id, id) on delete restrict,
  constraint landed_cost_documents_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint landed_cost_documents_applied_by_tenant_fk foreign key (tenant_id, applied_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint landed_cost_documents_reversed_by_tenant_fk foreign key (tenant_id, reversed_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_landed_cost_documents_number
  on public.landed_cost_documents(tenant_id, document_number);
create unique index if not exists ux_landed_cost_documents_tenant_id
  on public.landed_cost_documents(tenant_id, id);
create unique index if not exists ux_landed_cost_documents_idempotency
  on public.landed_cost_documents(tenant_id, idempotency_key);

create table if not exists public.landed_cost_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  landed_cost_document_id uuid not null,
  line_number integer not null,
  component_type varchar(24) not null,
  description text not null,
  amount_cents bigint not null,
  created_at timestamptz not null default now(),
  constraint landed_cost_lines_line_check check (line_number > 0),
  constraint landed_cost_lines_amount_check check (amount_cents > 0),
  constraint landed_cost_lines_document_tenant_fk foreign key (tenant_id, landed_cost_document_id)
    references public.landed_cost_documents(tenant_id, id) on delete cascade
);
create unique index if not exists ux_landed_cost_lines_number
  on public.landed_cost_lines(landed_cost_document_id, line_number);
create unique index if not exists ux_landed_cost_lines_tenant_id
  on public.landed_cost_lines(tenant_id, id);

create table if not exists public.landed_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  landed_cost_document_id uuid not null,
  landed_cost_line_id uuid not null,
  stock_receipt_line_id uuid not null,
  allocation_basis_value bigint not null,
  allocated_cents bigint not null,
  created_at timestamptz not null default now(),
  constraint landed_cost_allocations_basis_check check (allocation_basis_value > 0),
  constraint landed_cost_allocations_amount_check check (allocated_cents >= 0),
  constraint landed_cost_allocations_document_tenant_fk foreign key (tenant_id, landed_cost_document_id)
    references public.landed_cost_documents(tenant_id, id) on delete restrict,
  constraint landed_cost_allocations_line_tenant_fk foreign key (tenant_id, landed_cost_line_id)
    references public.landed_cost_lines(tenant_id, id) on delete restrict,
  constraint landed_cost_allocations_receipt_line_tenant_fk foreign key (tenant_id, stock_receipt_line_id)
    references public.stock_receipt_lines(tenant_id, id) on delete restrict
);
create unique index if not exists ux_landed_cost_allocations_line_receipt
  on public.landed_cost_allocations(landed_cost_line_id, stock_receipt_line_id);
create unique index if not exists ux_landed_cost_allocations_tenant_id
  on public.landed_cost_allocations(tenant_id, id);
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_landed_cost_document_fk
    foreign key (tenant_id, landed_cost_document_id)
    references public.landed_cost_documents(tenant_id, id) on delete restrict,
  add constraint stock_ledger_entries_landed_cost_allocation_fk
    foreign key (tenant_id, landed_cost_allocation_id)
    references public.landed_cost_allocations(tenant_id, id) on delete restrict;
create index if not exists idx_stock_ledger_entries_landed_cost
  on public.stock_ledger_entries(tenant_id, landed_cost_document_id)
  where landed_cost_document_id is not null;
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_single_source check (
    (
      stock_receipt_id is not null
      and stock_receipt_line_id is not null
      and stock_movement_id is null
      and stock_movement_line_id is null
      and reverses_stock_ledger_entry_id is null
      and landed_cost_document_id is null
      and landed_cost_allocation_id is null
    )
    or (
      stock_receipt_id is null
      and stock_receipt_line_id is null
      and stock_movement_id is not null
      and stock_movement_line_id is not null
      and landed_cost_document_id is null
      and landed_cost_allocation_id is null
    )
    or (
      event_type::text = 'landed_cost'
      and stock_receipt_id is null
      and stock_receipt_line_id is null
      and stock_movement_id is null
      and stock_movement_line_id is null
      and reverses_stock_ledger_entry_id is null
      and landed_cost_document_id is not null
      and landed_cost_allocation_id is not null
    )
  );

-- Extend the existing append-only ledger trigger with a controlled landed-cost
-- branch. Existing receipt and movement branches remain unchanged; the writer
-- must set app.stock_ledger_write to the landed-cost document id and the
-- allocation must match the posted receipt line exactly.
create or replace function public.guard_stock_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_line public.stock_receipt_lines%rowtype;
  v_movement public.stock_movements%rowtype;
  v_movement_line public.stock_movement_lines%rowtype;
  v_original public.stock_ledger_entries%rowtype;
  v_landed_document public.landed_cost_documents%rowtype;
  v_landed_allocation public.landed_cost_allocations%rowtype;
  v_landed_receipt public.stock_receipts%rowtype;
  v_write_id text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Stock Ledger Entries are append-only'
      using errcode = '55000';
  end if;

  v_write_id := coalesce(
    pg_catalog.current_setting('app.stock_ledger_write', true),
    ''
  );

  if new.event_type::text = 'landed_cost' then
    if new.landed_cost_document_id is null
       or new.landed_cost_allocation_id is null
       or v_write_id <> new.landed_cost_document_id::text then
      raise exception 'Use a Landed Cost workflow to write the Stock Ledger'
        using errcode = '42501';
    end if;
    select document.*
      into v_landed_document
      from public.landed_cost_documents document
     where document.id = new.landed_cost_document_id
       and document.tenant_id = new.tenant_id;
    select allocation.*
      into v_landed_allocation
      from public.landed_cost_allocations allocation
     where allocation.id = new.landed_cost_allocation_id
       and allocation.tenant_id = new.tenant_id;
    select line.*
      into v_receipt_line
      from public.stock_receipt_lines line
     where line.id = v_landed_allocation.stock_receipt_line_id
       and line.tenant_id = new.tenant_id;
    select receipt.*
      into v_landed_receipt
      from public.stock_receipts receipt
     where receipt.id = v_landed_document.stock_receipt_id
       and receipt.tenant_id = new.tenant_id;
    if v_landed_document.id is null
       or v_landed_document.status <> 'applied'
       or v_landed_allocation.id is null
       or v_landed_allocation.landed_cost_document_id <> v_landed_document.id
       or v_receipt_line.id is null
       or v_landed_receipt.id is null
       or v_receipt_line.stock_receipt_id <> v_landed_document.stock_receipt_id
       or new.warehouse_id <> v_landed_receipt.warehouse_id
       or v_receipt_line.material_item_id <> new.material_item_id
       or v_receipt_line.uom_id <> new.uom_id
       or new.warehouse_id is null
       or new.quantity_delta_micros <> 0
       or new.value_delta_cents <> v_landed_allocation.allocated_cents
       or new.value_delta_cents <= 0 then
      raise exception 'Stock Ledger landed cost entry must match its allocation'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.stock_receipt_id is not null then
    if v_write_id <> new.stock_receipt_id::text then
      raise exception 'Use a Stock Receipt workflow to write the Stock Ledger'
        using errcode = '42501';
    end if;
    select line.*
      into v_receipt_line
      from public.stock_receipt_lines line
     where line.id = new.stock_receipt_line_id
       and line.tenant_id = new.tenant_id;
    if not found
       or v_receipt_line.stock_receipt_id <> new.stock_receipt_id
       or v_receipt_line.material_item_id <> new.material_item_id
       or v_receipt_line.uom_id <> new.uom_id
       or pg_catalog.abs(new.quantity_delta_micros)
          <> v_receipt_line.quantity_micros
       or pg_catalog.abs(new.value_delta_cents)
          <> v_receipt_line.line_total_cents
       or (
         new.event_type = 'receipt'
         and (new.quantity_delta_micros <= 0 or new.value_delta_cents <= 0)
       )
       or (
         new.event_type = 'receipt_reversal'
         and (new.quantity_delta_micros >= 0 or new.value_delta_cents >= 0)
       )
       or new.event_type not in ('receipt', 'receipt_reversal') then
      raise exception 'Stock Ledger Entry must exactly mirror its receipt line'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.stock_movement_id is null
     or v_write_id <> new.stock_movement_id::text then
    raise exception 'Use a Stock Movement workflow to write the Stock Ledger'
      using errcode = '42501';
  end if;

  select movement.*
    into v_movement
    from public.stock_movements movement
   where movement.id = new.stock_movement_id
     and movement.tenant_id = new.tenant_id;
  select line.*
    into v_movement_line
    from public.stock_movement_lines line
   where line.id = new.stock_movement_line_id
     and line.tenant_id = new.tenant_id;

  if v_movement.id is null
     or v_movement_line.id is null
     or v_movement_line.stock_movement_id <> v_movement.id
     or v_movement_line.material_item_id <> new.material_item_id
     or v_movement_line.uom_id <> new.uom_id
     or v_movement_line.posted_value_cents is null
     or pg_catalog.abs(new.quantity_delta_micros)
        <> pg_catalog.abs(v_movement_line.quantity_micros)
     or pg_catalog.abs(new.value_delta_cents)
        <> v_movement_line.posted_value_cents then
    raise exception 'Stock Ledger Entry must exactly mirror its movement line'
      using errcode = '23514';
  end if;

  if new.event_type = 'movement_reversal' then
    if new.reverses_stock_ledger_entry_id is null then
      raise exception 'Movement reversal requires original Stock Ledger evidence'
        using errcode = '23514';
    end if;
    select original.*
      into v_original
      from public.stock_ledger_entries original
     where original.id = new.reverses_stock_ledger_entry_id
       and original.tenant_id = new.tenant_id;
    if not found
       or v_original.event_type = 'movement_reversal'
       or v_original.stock_movement_id <> new.stock_movement_id
       or v_original.stock_movement_line_id <> new.stock_movement_line_id
       or v_original.warehouse_id <> new.warehouse_id
       or v_original.material_item_id <> new.material_item_id
       or v_original.uom_id <> new.uom_id
       or new.quantity_delta_micros <> -v_original.quantity_delta_micros
       or new.value_delta_cents <> -v_original.value_delta_cents then
      raise exception 'Movement reversal must negate original Stock Ledger evidence'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.reverses_stock_ledger_entry_id is not null or (
    v_movement.movement_type = 'transfer'
    and not (
      (new.event_type = 'transfer_out' and new.warehouse_id = v_movement.source_warehouse_id and new.quantity_delta_micros < 0 and new.value_delta_cents < 0)
      or (new.event_type = 'transfer_in' and new.warehouse_id = v_movement.target_warehouse_id and new.quantity_delta_micros > 0 and new.value_delta_cents > 0)
    )
  ) or (
    v_movement.movement_type = 'consumption'
    and not (new.event_type = 'consumption' and new.warehouse_id = v_movement.source_warehouse_id and new.quantity_delta_micros < 0 and new.value_delta_cents < 0)
  ) or (
    v_movement.movement_type = 'adjustment'
    and not (
      (v_movement_line.quantity_micros > 0 and new.quantity_delta_micros > 0 and new.value_delta_cents > 0)
      or (v_movement_line.quantity_micros < 0 and new.quantity_delta_micros < 0 and new.value_delta_cents < 0)
    )
  ) then
    raise exception 'Stock Ledger movement event is invalid'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(160) not null,
  vendor_id uuid,
  currency char(3) not null default 'PHP',
  valid_from date not null,
  valid_to date,
  status varchar(16) not null default 'draft',
  source varchar(32) not null default 'manual',
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_lists_code_check check (length(btrim(code)) > 0),
  constraint price_lists_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint price_lists_status_check check (status in ('draft','active','retired')),
  constraint price_lists_date_check check (valid_to is null or valid_to >= valid_from),
  constraint price_lists_vendor_tenant_fk foreign key (tenant_id, vendor_id)
    references public.vendors(tenant_id, id) on delete restrict,
  constraint price_lists_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint price_lists_approved_by_tenant_fk foreign key (tenant_id, approved_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_price_lists_code on public.price_lists(tenant_id, code);
create unique index if not exists ux_price_lists_tenant_id on public.price_lists(tenant_id, id);

create table if not exists public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  price_list_id uuid not null,
  material_item_id uuid not null,
  uom_id uuid not null,
  minimum_quantity_micros bigint not null default 1,
  unit_price_cents bigint not null,
  lead_time_days integer,
  source_reference text,
  created_at timestamptz not null default now(),
  constraint price_list_items_min_qty_check check (minimum_quantity_micros > 0),
  constraint price_list_items_price_check check (unit_price_cents >= 0),
  constraint price_list_items_lead_time_check check (lead_time_days is null or lead_time_days >= 0),
  constraint price_list_items_list_tenant_fk foreign key (tenant_id, price_list_id)
    references public.price_lists(tenant_id, id) on delete cascade,
  constraint price_list_items_material_tenant_fk foreign key (tenant_id, material_item_id)
    references public.material_items(tenant_id, id) on delete restrict,
  constraint price_list_items_uom_tenant_fk foreign key (tenant_id, uom_id)
    references public.units_of_measure(tenant_id, id) on delete restrict
);
create unique index if not exists ux_price_list_items_tier
  on public.price_list_items(price_list_id, material_item_id, uom_id, minimum_quantity_micros);

create table if not exists public.tenant_currencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  currency_code char(3) not null,
  decimal_places smallint not null default 2,
  is_base boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint tenant_currencies_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint tenant_currencies_decimal_check check (decimal_places between 0 and 6),
  constraint tenant_currencies_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_tenant_currencies_code
  on public.tenant_currencies(tenant_id, currency_code);
create unique index if not exists ux_tenant_currencies_base
  on public.tenant_currencies(tenant_id) where is_base;

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_currency char(3) not null,
  to_currency char(3) not null,
  rate_numerator bigint not null,
  rate_denominator bigint not null,
  effective_on date not null,
  source varchar(64) not null,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint exchange_rates_currency_check check (
    from_currency ~ '^[A-Z]{3}$' and to_currency ~ '^[A-Z]{3}$' and from_currency <> to_currency
  ),
  constraint exchange_rates_ratio_check check (rate_numerator > 0 and rate_denominator > 0),
  constraint exchange_rates_source_check check (length(btrim(source)) > 0),
  constraint exchange_rates_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint exchange_rates_approved_by_tenant_fk foreign key (tenant_id, approved_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_exchange_rates_effective
  on public.exchange_rates(tenant_id, from_currency, to_currency, effective_on);

create table if not exists public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(160) not null,
  valid_from date not null,
  valid_to date,
  vat_rate_bps integer not null default 1200,
  withholding_rate_bps integer not null default 200,
  retention_rate_bps integer not null default 0,
  vat_registered boolean not null default true,
  bir_form_version varchar(40),
  statutory_configuration jsonb not null default '{}'::jsonb,
  status varchar(16) not null default 'draft',
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_profiles_code_check check (length(btrim(code)) > 0),
  constraint tax_profiles_date_check check (valid_to is null or valid_to >= valid_from),
  constraint tax_profiles_rates_check check (
    vat_rate_bps between 0 and 10000 and withholding_rate_bps between 0 and 10000 and retention_rate_bps between 0 and 10000
  ),
  constraint tax_profiles_status_check check (status in ('draft','active','retired')),
  constraint tax_profiles_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint tax_profiles_approved_by_tenant_fk foreign key (tenant_id, approved_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_tax_profiles_code on public.tax_profiles(tenant_id, code);
create unique index if not exists ux_tax_profiles_tenant_id on public.tax_profiles(tenant_id, id);

create table if not exists public.statutory_outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tax_profile_id uuid not null,
  document_type varchar(40) not null,
  document_id uuid not null,
  output_type varchar(40) not null,
  template_version varchar(40) not null,
  payload jsonb not null,
  content_hash varchar(64) not null,
  generated_by uuid not null,
  generated_at timestamptz not null default now(),
  constraint statutory_outputs_profile_tenant_fk foreign key (tenant_id, tax_profile_id)
    references public.tax_profiles(tenant_id, id) on delete restrict,
  constraint statutory_outputs_generated_by_tenant_fk foreign key (tenant_id, generated_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_statutory_outputs_document
  on public.statutory_outputs(tenant_id, document_type, document_id, output_type, template_version);

create table if not exists public.fiscal_period_close_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fiscal_period_id uuid not null,
  status varchar(16) not null default 'blocked',
  checks jsonb not null default '[]'::jsonb,
  blocking_count integer not null default 0,
  run_by uuid not null,
  idempotency_key varchar(256) not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fiscal_period_close_runs_status_check check (status in ('blocked','ready','closed')),
  constraint fiscal_period_close_runs_blocking_check check (blocking_count >= 0),
  constraint fiscal_period_close_runs_period_tenant_fk foreign key (tenant_id, fiscal_period_id)
    references public.fiscal_periods(tenant_id, id) on delete restrict,
  constraint fiscal_period_close_runs_run_by_tenant_fk foreign key (tenant_id, run_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_fiscal_period_close_runs_idempotency
  on public.fiscal_period_close_runs(tenant_id, idempotency_key);
create index if not exists idx_fiscal_period_close_runs_period
  on public.fiscal_period_close_runs(tenant_id, fiscal_period_id, created_at desc);

create table if not exists public.sap_posting_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  aggregate_type varchar(40) not null,
  aggregate_id uuid not null,
  posting_type varchar(24) not null,
  idempotency_key varchar(256) not null,
  payload jsonb not null,
  status varchar(16) not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_document_id varchar(120),
  last_error text,
  posted_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sap_posting_outbox_type_check check (posting_type in ('goods_receipt','invoice_receipt','cost_posting')),
  constraint sap_posting_outbox_status_check check (status in ('pending','processing','succeeded','dead_letter')),
  constraint sap_posting_outbox_attempt_check check (attempt_count >= 0),
  constraint sap_posting_outbox_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_sap_posting_outbox_idempotency
  on public.sap_posting_outbox(tenant_id, idempotency_key);
create unique index if not exists ux_sap_posting_outbox_tenant_id
  on public.sap_posting_outbox(tenant_id, id);
create index if not exists idx_sap_posting_outbox_pending
  on public.sap_posting_outbox(status, next_attempt_at);

create table if not exists public.sap_posting_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sap_posting_id uuid not null,
  attempt_number integer not null,
  outcome varchar(16) not null,
  provider_status integer,
  response jsonb,
  error text,
  created_at timestamptz not null default now(),
  constraint sap_posting_attempts_outcome_check check (outcome in ('accepted','retryable','rejected')),
  constraint sap_posting_attempts_number_check check (attempt_number > 0),
  constraint sap_posting_attempts_outbox_tenant_fk foreign key (tenant_id, sap_posting_id)
    references public.sap_posting_outbox(tenant_id, id) on delete restrict
);
create unique index if not exists ux_sap_posting_attempts_number
  on public.sap_posting_attempts(sap_posting_id, attempt_number);

create table if not exists public.provider_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel varchar(8) not null,
  provider varchar(32) not null,
  event_type varchar(100) not null,
  aggregate_type varchar(64) not null,
  aggregate_id uuid not null,
  recipient varchar(320) not null,
  subject varchar(255),
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  template_version varchar(40) not null,
  idempotency_key varchar(256) not null,
  status varchar(16) not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id varchar(255),
  provider_response_code integer,
  provider_response_hash varchar(64),
  last_error text,
  delivered_at timestamptz,
  dead_lettered_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_delivery_outbox_channel_check check (channel in ('email','sms')),
  constraint provider_delivery_outbox_status_check check (status in ('pending','processing','delivered','dead_letter')),
  constraint provider_delivery_outbox_attempt_check check (attempt_count >= 0),
  constraint provider_delivery_outbox_recipient_check check (length(btrim(recipient)) > 0),
  constraint provider_delivery_outbox_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_provider_delivery_outbox_idempotency
  on public.provider_delivery_outbox(tenant_id, idempotency_key);
create unique index if not exists ux_provider_delivery_outbox_tenant_id
  on public.provider_delivery_outbox(tenant_id, id);
create index if not exists idx_provider_delivery_outbox_pending
  on public.provider_delivery_outbox(status, next_attempt_at);

create table if not exists public.provider_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  delivery_id uuid not null,
  attempt_number integer not null,
  outcome varchar(16) not null,
  provider_status integer,
  response_hash varchar(64),
  error text,
  created_at timestamptz not null default now(),
  constraint provider_delivery_attempts_outcome_check check (outcome in ('accepted','retryable','rejected')),
  constraint provider_delivery_attempts_number_check check (attempt_number > 0),
  constraint provider_delivery_attempts_delivery_tenant_fk foreign key (tenant_id, delivery_id)
    references public.provider_delivery_outbox(tenant_id, id) on delete restrict
);
create unique index if not exists ux_provider_delivery_attempts_number
  on public.provider_delivery_attempts(delivery_id, attempt_number);

create table if not exists public.roadmap_workflow_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type varchar(40) not null,
  entity_id uuid not null,
  action varchar(32) not null,
  from_status varchar(24),
  to_status varchar(24),
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid not null,
  idempotency_key varchar(256) not null,
  created_at timestamptz not null default now(),
  constraint roadmap_workflow_events_entity_check check (length(btrim(entity_type)) > 0),
  constraint roadmap_workflow_events_action_check check (length(btrim(action)) > 0),
  constraint roadmap_workflow_events_actor_tenant_fk foreign key (tenant_id, actor_id)
    references public.users(tenant_id, id) on delete restrict
);
create unique index if not exists ux_roadmap_workflow_events_idempotency
  on public.roadmap_workflow_events(tenant_id, idempotency_key);
create index if not exists idx_roadmap_workflow_events_entity
  on public.roadmap_workflow_events(tenant_id, entity_type, entity_id, created_at);

-- All new tables are tenant-isolated. Append-only event/attempt tables receive
-- insert/select access only; mutations are performed by audited server commands.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenant_feature_flags',
    'procurement_requisitions',
    'procurement_requisition_lines',
    'procurement_requisition_events',
    'inventory_reservations',
    'inventory_reservation_events',
    'landed_cost_documents',
    'landed_cost_lines',
    'landed_cost_allocations',
    'price_lists',
    'price_list_items',
    'tenant_currencies',
    'exchange_rates',
    'tax_profiles',
    'statutory_outputs',
    'fiscal_period_close_runs',
    'sap_posting_outbox',
    'sap_posting_attempts',
    'provider_delivery_outbox',
    'provider_delivery_attempts',
    'roadmap_workflow_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop policy if exists %I_tenant_select on public.%I', table_name, table_name);
    execute format('create policy %I_tenant_select on public.%I for select to authenticated using (tenant_id = public.auth_tenant_id())', table_name, table_name);
    execute format('drop policy if exists %I_tenant_insert on public.%I', table_name, table_name);
    execute format('create policy %I_tenant_insert on public.%I for insert to authenticated with check (tenant_id = public.auth_tenant_id())', table_name, table_name);
  end loop;
end
$$;

revoke all privileges on table
  public.tenant_feature_flags,
  public.procurement_requisitions,
  public.procurement_requisition_lines,
  public.procurement_requisition_events,
  public.inventory_reservations,
  public.inventory_reservation_events,
  public.landed_cost_documents,
  public.landed_cost_lines,
  public.landed_cost_allocations,
  public.price_lists,
  public.price_list_items,
  public.tenant_currencies,
  public.exchange_rates,
  public.tax_profiles,
  public.statutory_outputs,
  public.fiscal_period_close_runs,
  public.sap_posting_outbox,
  public.sap_posting_attempts,
  public.provider_delivery_outbox,
  public.provider_delivery_attempts,
  public.roadmap_workflow_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.tenant_feature_flags,
  public.procurement_requisitions,
  public.procurement_requisition_lines,
  public.inventory_reservations,
  public.landed_cost_documents,
  public.landed_cost_lines,
  public.landed_cost_allocations,
  public.price_lists,
  public.price_list_items,
  public.tenant_currencies,
  public.exchange_rates,
  public.tax_profiles,
  public.statutory_outputs,
  public.fiscal_period_close_runs,
  public.sap_posting_outbox,
  public.provider_delivery_outbox
to authenticated;
grant select, insert on table
  public.procurement_requisition_events,
  public.inventory_reservation_events,
  public.sap_posting_attempts,
  public.provider_delivery_attempts,
  public.roadmap_workflow_events
to authenticated;
