-- Third Code ERP inventory and perpetual stock schema.
-- Quantities use integer micro-units: one whole UOM = 1,000,000.

do $$
begin
  create type public.stock_receipt_status as enum (
    'draft',
    'posted',
    'reversed'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.stock_ledger_event_type as enum (
    'receipt',
    'receipt_reversal'
  );
exception
  when duplicate_object then null;
end
$$;

alter type public.cortex_node_type
  add value if not exists 'warehouse';
alter type public.cortex_node_type
  add value if not exists 'stock_receipt';
alter type public.cortex_node_type
  add value if not exists 'stock_ledger_entry';

create unique index if not exists ux_material_items_tenant_id_id
  on public.material_items (tenant_id, id);
create unique index if not exists ux_delivery_schedules_tenant_id_id
  on public.delivery_schedules (tenant_id, id);

create table if not exists public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  code varchar(32) not null,
  name varchar(120) not null,
  decimal_places integer not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint units_of_measure_code_nonempty
    check (code = btrim(code) and length(code) > 0),
  constraint units_of_measure_name_nonempty
    check (name = btrim(name) and length(name) > 0),
  constraint units_of_measure_decimal_places_range
    check (decimal_places between 0 and 6),
  constraint units_of_measure_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_units_of_measure_tenant_id_id
  on public.units_of_measure (tenant_id, id);
create unique index if not exists ux_units_of_measure_tenant_code
  on public.units_of_measure (tenant_id, lower(code));

insert into public.units_of_measure (
  tenant_id,
  code,
  name,
  decimal_places
)
select
  source.tenant_id,
  source.code,
  source.code,
  0
from (
  select distinct on (raw.tenant_id, lower(raw.code))
    raw.tenant_id,
    raw.code
  from (
    select
      item.tenant_id,
      case
        when length(btrim(item.unit)) > 0 then btrim(item.unit)
        else 'UNIT'
      end as code
    from public.material_items item

    union all

    select
      line.tenant_id,
      btrim(line.unit) as code
    from public.po_line_items line
    where line.unit is not null
      and length(btrim(line.unit)) > 0
  ) raw
  order by raw.tenant_id, lower(raw.code), raw.code
) source
where not exists (
  select 1
  from public.units_of_measure existing
  where existing.tenant_id = source.tenant_id
    and lower(existing.code) = lower(source.code)
);

alter table public.material_items
  add column if not exists base_uom_id uuid;
alter table public.material_items
  add column if not exists inventory_tracked boolean not null default false;
alter table public.material_items
  add column if not exists created_by uuid;

update public.material_items
   set unit = 'UNIT'
 where length(btrim(unit)) = 0;

update public.material_items item
   set base_uom_id = uom.id
  from public.units_of_measure uom
 where uom.tenant_id = item.tenant_id
   and lower(uom.code) = lower(btrim(item.unit))
   and item.base_uom_id is null;

alter table public.material_items
  alter column base_uom_id set not null;
alter table public.material_items
  drop constraint if exists material_items_base_uom_tenant_fk;
alter table public.material_items
  add constraint material_items_base_uom_tenant_fk
  foreign key (tenant_id, base_uom_id)
  references public.units_of_measure(tenant_id, id)
  on delete restrict;
alter table public.material_items
  drop constraint if exists material_items_created_by_tenant_fk;
alter table public.material_items
  add constraint material_items_created_by_tenant_fk
  foreign key (tenant_id, created_by)
  references public.users(tenant_id, id)
  on delete restrict;

alter table public.po_line_items
  add column if not exists material_item_id uuid;
alter table public.po_line_items
  add column if not exists uom_id uuid;
alter table public.po_line_items
  add column if not exists quantity_micros bigint not null default 0;
alter table public.po_line_items
  add column if not exists received_quantity_micros bigint not null default 0;
alter table public.po_line_items
  add column if not exists legacy_received_quantity_micros bigint
  not null default 0;

update public.po_line_items line
   set material_item_id = item.id
  from public.material_items item
 where item.tenant_id = line.tenant_id
   and item.code = line.code
   and line.code is not null
   and line.material_item_id is null;

update public.po_line_items line
   set uom_id = uom.id
  from public.units_of_measure uom
 where uom.tenant_id = line.tenant_id
   and line.unit is not null
   and lower(uom.code) = lower(btrim(line.unit))
   and line.uom_id is null;

update public.po_line_items
   set quantity_micros = quantity::bigint * 1000000
 where quantity_micros = 0
   and quantity <> 0;

update public.po_line_items
   set legacy_received_quantity_micros = received_qty::bigint * 1000000,
       received_quantity_micros = received_qty::bigint * 1000000
 where received_quantity_micros = 0
   and received_qty <> 0;

alter table public.po_line_items
  drop constraint if exists po_line_items_material_item_tenant_fk;
alter table public.po_line_items
  add constraint po_line_items_material_item_tenant_fk
  foreign key (tenant_id, material_item_id)
  references public.material_items(tenant_id, id)
  on delete restrict;
alter table public.po_line_items
  drop constraint if exists po_line_items_uom_tenant_fk;
alter table public.po_line_items
  add constraint po_line_items_uom_tenant_fk
  foreign key (tenant_id, uom_id)
  references public.units_of_measure(tenant_id, id)
  on delete restrict;
alter table public.po_line_items
  drop constraint if exists po_line_items_quantity_micros_nonnegative;
alter table public.po_line_items
  add constraint po_line_items_quantity_micros_nonnegative
  check (quantity_micros >= 0);
alter table public.po_line_items
  drop constraint if exists po_line_items_received_micros_range;
alter table public.po_line_items
  add constraint po_line_items_received_micros_range
  check (
    legacy_received_quantity_micros >= 0
    and legacy_received_quantity_micros <= quantity_micros
    and received_quantity_micros >= legacy_received_quantity_micros
    and received_quantity_micros <= quantity_micros
  );

create index if not exists idx_po_line_items_material_item
  on public.po_line_items (tenant_id, material_item_id)
  where material_item_id is not null;

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(160) not null,
  project_id uuid,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_code_nonempty
    check (code = btrim(code) and length(code) > 0),
  constraint warehouses_name_nonempty
    check (name = btrim(name) and length(name) > 0),
  constraint warehouses_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete restrict,
  constraint warehouses_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_warehouses_tenant_id_id
  on public.warehouses (tenant_id, id);
create unique index if not exists ux_warehouses_tenant_code
  on public.warehouses (tenant_id, lower(code));
create index if not exists idx_warehouses_tenant_project
  on public.warehouses (tenant_id, project_id)
  where project_id is not null;

create table if not exists public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  warehouse_id uuid not null,
  purchase_order_id uuid not null,
  delivery_schedule_id uuid,
  internal_number varchar(40),
  supplier_delivery_reference varchar(120),
  status public.stock_receipt_status not null default 'draft',
  received_date date not null,
  currency char(3) not null default 'PHP',
  notes text,
  posting_journal_entry_id uuid,
  posted_by uuid,
  posted_at timestamptz,
  reversal_journal_entry_id uuid,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_receipts_delivery_reference_trimmed
    check (
      supplier_delivery_reference is null
      or (
        supplier_delivery_reference = btrim(supplier_delivery_reference)
        and length(supplier_delivery_reference) > 0
      )
    ),
  constraint stock_receipts_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint stock_receipts_state
    check (
      (
        status = 'draft'
        and internal_number is null
        and posting_journal_entry_id is null
        and posted_by is null
        and posted_at is null
        and reversal_journal_entry_id is null
        and reversed_by is null
        and reversed_at is null
        and reversal_reason is null
      )
      or
      (
        status = 'posted'
        and internal_number is not null
        and posting_journal_entry_id is not null
        and posted_by is not null
        and posted_at is not null
        and reversal_journal_entry_id is null
        and reversed_by is null
        and reversed_at is null
        and reversal_reason is null
      )
      or
      (
        status = 'reversed'
        and internal_number is not null
        and posting_journal_entry_id is not null
        and posted_by is not null
        and posted_at is not null
        and reversal_journal_entry_id is not null
        and reversed_by is not null
        and reversed_at is not null
        and length(btrim(reversal_reason)) >= 3
      )
    ),
  constraint stock_receipts_warehouse_tenant_fk
    foreign key (tenant_id, warehouse_id)
    references public.warehouses(tenant_id, id)
    on delete restrict,
  constraint stock_receipts_purchase_order_tenant_fk
    foreign key (tenant_id, purchase_order_id)
    references public.purchase_orders(tenant_id, id)
    on delete restrict,
  constraint stock_receipts_delivery_tenant_fk
    foreign key (tenant_id, delivery_schedule_id)
    references public.delivery_schedules(tenant_id, id)
    on delete restrict,
  constraint stock_receipts_posting_journal_tenant_fk
    foreign key (tenant_id, posting_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint stock_receipts_reversal_journal_tenant_fk
    foreign key (tenant_id, reversal_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint stock_receipts_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint stock_receipts_posted_by_tenant_fk
    foreign key (tenant_id, posted_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint stock_receipts_reversed_by_tenant_fk
    foreign key (tenant_id, reversed_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_stock_receipts_tenant_id_id
  on public.stock_receipts (tenant_id, id);
create unique index if not exists ux_stock_receipts_tenant_number
  on public.stock_receipts (tenant_id, internal_number)
  where internal_number is not null;
create unique index if not exists ux_stock_receipts_posting_journal
  on public.stock_receipts (tenant_id, posting_journal_entry_id)
  where posting_journal_entry_id is not null;
create unique index if not exists ux_stock_receipts_reversal_journal
  on public.stock_receipts (tenant_id, reversal_journal_entry_id)
  where reversal_journal_entry_id is not null;
create index if not exists idx_stock_receipts_tenant_status_date
  on public.stock_receipts (tenant_id, status, received_date desc);
create index if not exists idx_stock_receipts_purchase_order
  on public.stock_receipts (tenant_id, purchase_order_id);
create index if not exists idx_stock_receipts_warehouse
  on public.stock_receipts (tenant_id, warehouse_id);

create table if not exists public.stock_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  stock_receipt_id uuid not null,
  po_line_item_id uuid not null,
  material_item_id uuid not null,
  uom_id uuid not null,
  line_number integer not null,
  description text not null,
  quantity_micros bigint not null,
  unit_cost_cents bigint not null,
  line_total_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_receipt_lines_number_positive
    check (line_number > 0),
  constraint stock_receipt_lines_description_nonempty
    check (length(btrim(description)) > 0),
  constraint stock_receipt_lines_quantity_positive
    check (quantity_micros > 0),
  constraint stock_receipt_lines_unit_cost_nonnegative
    check (unit_cost_cents >= 0),
  constraint stock_receipt_lines_total_positive
    check (line_total_cents > 0),
  constraint stock_receipt_lines_total_exact
    check (
      line_total_cents =
      round(
        quantity_micros::numeric * unit_cost_cents::numeric / 1000000
      )::bigint
    ),
  constraint stock_receipt_lines_receipt_tenant_fk
    foreign key (tenant_id, stock_receipt_id)
    references public.stock_receipts(tenant_id, id)
    on delete cascade,
  constraint stock_receipt_lines_po_line_tenant_fk
    foreign key (tenant_id, po_line_item_id)
    references public.po_line_items(tenant_id, id)
    on delete restrict,
  constraint stock_receipt_lines_material_tenant_fk
    foreign key (tenant_id, material_item_id)
    references public.material_items(tenant_id, id)
    on delete restrict,
  constraint stock_receipt_lines_uom_tenant_fk
    foreign key (tenant_id, uom_id)
    references public.units_of_measure(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_stock_receipt_lines_tenant_id_id
  on public.stock_receipt_lines (tenant_id, id);
create unique index if not exists ux_stock_receipt_lines_receipt_line
  on public.stock_receipt_lines (stock_receipt_id, line_number);
create unique index if not exists ux_stock_receipt_lines_receipt_po_line
  on public.stock_receipt_lines (stock_receipt_id, po_line_item_id);
create index if not exists idx_stock_receipt_lines_po_line
  on public.stock_receipt_lines (tenant_id, po_line_item_id);

create table if not exists public.stock_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  event_type public.stock_ledger_event_type not null,
  stock_receipt_id uuid not null,
  stock_receipt_line_id uuid not null,
  warehouse_id uuid not null,
  material_item_id uuid not null,
  uom_id uuid not null,
  occurred_on date not null,
  quantity_delta_micros bigint not null,
  value_delta_cents bigint not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint stock_ledger_entries_signed_values
    check (
      (
        event_type = 'receipt'
        and quantity_delta_micros > 0
        and value_delta_cents > 0
      )
      or
      (
        event_type = 'receipt_reversal'
        and quantity_delta_micros < 0
        and value_delta_cents < 0
      )
    ),
  constraint stock_ledger_entries_receipt_tenant_fk
    foreign key (tenant_id, stock_receipt_id)
    references public.stock_receipts(tenant_id, id)
    on delete restrict,
  constraint stock_ledger_entries_receipt_line_tenant_fk
    foreign key (tenant_id, stock_receipt_line_id)
    references public.stock_receipt_lines(tenant_id, id)
    on delete restrict,
  constraint stock_ledger_entries_warehouse_tenant_fk
    foreign key (tenant_id, warehouse_id)
    references public.warehouses(tenant_id, id)
    on delete restrict,
  constraint stock_ledger_entries_material_tenant_fk
    foreign key (tenant_id, material_item_id)
    references public.material_items(tenant_id, id)
    on delete restrict,
  constraint stock_ledger_entries_uom_tenant_fk
    foreign key (tenant_id, uom_id)
    references public.units_of_measure(tenant_id, id)
    on delete restrict,
  constraint stock_ledger_entries_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_stock_ledger_receipt_line_event
  on public.stock_ledger_entries (
    tenant_id,
    stock_receipt_line_id,
    event_type
  );
create index if not exists idx_stock_ledger_balance
  on public.stock_ledger_entries (
    tenant_id,
    warehouse_id,
    material_item_id,
    occurred_on,
    id
  );
create index if not exists idx_stock_ledger_receipt
  on public.stock_ledger_entries (tenant_id, stock_receipt_id);
