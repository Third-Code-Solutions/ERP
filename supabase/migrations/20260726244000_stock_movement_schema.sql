-- Third Code ERP controlled Stock Movement schema.

do $$
begin
  create type public.stock_movement_type as enum (
    'transfer',
    'consumption',
    'adjustment'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.stock_movement_status as enum (
    'draft',
    'posted',
    'reversed'
  );
exception
  when duplicate_object then null;
end
$$;

alter type public.stock_ledger_event_type
  add value if not exists 'transfer_out';
alter type public.stock_ledger_event_type
  add value if not exists 'transfer_in';
alter type public.stock_ledger_event_type
  add value if not exists 'consumption';
alter type public.stock_ledger_event_type
  add value if not exists 'adjustment';
alter type public.stock_ledger_event_type
  add value if not exists 'movement_reversal';
alter type public.cortex_node_type
  add value if not exists 'stock_movement';

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  movement_type public.stock_movement_type not null,
  status public.stock_movement_status not null default 'draft',
  internal_number varchar(40),
  source_warehouse_id uuid not null,
  target_warehouse_id uuid,
  project_id uuid,
  movement_date date not null,
  currency char(3) not null default 'PHP',
  reason text not null,
  posting_journal_entry_id uuid,
  reversal_journal_entry_id uuid,
  posted_by uuid,
  posted_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_movements_reason_nonempty
    check (length(btrim(reason)) >= 3),
  constraint stock_movements_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint stock_movements_distinct_warehouses
    check (
      target_warehouse_id is null
      or target_warehouse_id <> source_warehouse_id
    ),
  constraint stock_movements_source_warehouse_tenant_fk
    foreign key (tenant_id, source_warehouse_id)
    references public.warehouses(tenant_id, id)
    on delete restrict,
  constraint stock_movements_target_warehouse_tenant_fk
    foreign key (tenant_id, target_warehouse_id)
    references public.warehouses(tenant_id, id)
    on delete restrict,
  constraint stock_movements_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete restrict,
  constraint stock_movements_posting_journal_tenant_fk
    foreign key (tenant_id, posting_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint stock_movements_reversal_journal_tenant_fk
    foreign key (tenant_id, reversal_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint stock_movements_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint stock_movements_posted_by_tenant_fk
    foreign key (tenant_id, posted_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint stock_movements_reversed_by_tenant_fk
    foreign key (tenant_id, reversed_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_stock_movements_tenant_id_id
  on public.stock_movements (tenant_id, id);
create unique index if not exists ux_stock_movements_tenant_number
  on public.stock_movements (tenant_id, internal_number)
  where internal_number is not null;
create index if not exists idx_stock_movements_tenant_status_date
  on public.stock_movements (tenant_id, status, movement_date);
create index if not exists idx_stock_movements_source_warehouse
  on public.stock_movements (tenant_id, source_warehouse_id);
create index if not exists idx_stock_movements_target_warehouse
  on public.stock_movements (tenant_id, target_warehouse_id)
  where target_warehouse_id is not null;
create index if not exists idx_stock_movements_project
  on public.stock_movements (tenant_id, project_id)
  where project_id is not null;

create table if not exists public.stock_movement_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  stock_movement_id uuid not null,
  material_item_id uuid not null,
  uom_id uuid not null,
  cost_code_id uuid,
  line_number integer not null,
  description text not null,
  quantity_micros bigint not null,
  declared_unit_cost_cents bigint,
  posted_unit_cost_cents bigint,
  posted_value_cents bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_movement_lines_number_positive
    check (line_number > 0),
  constraint stock_movement_lines_description_nonempty
    check (length(btrim(description)) > 0),
  constraint stock_movement_lines_quantity_nonzero
    check (quantity_micros <> 0),
  constraint stock_movement_lines_declared_cost_positive
    check (
      declared_unit_cost_cents is null
      or declared_unit_cost_cents > 0
    ),
  constraint stock_movement_lines_posted_cost_positive
    check (
      (
        posted_unit_cost_cents is null
        and posted_value_cents is null
      )
      or
      (
        posted_unit_cost_cents > 0
        and posted_value_cents > 0
      )
    ),
  constraint stock_movement_lines_movement_tenant_fk
    foreign key (tenant_id, stock_movement_id)
    references public.stock_movements(tenant_id, id)
    on delete cascade,
  constraint stock_movement_lines_material_tenant_fk
    foreign key (tenant_id, material_item_id)
    references public.material_items(tenant_id, id)
    on delete restrict,
  constraint stock_movement_lines_uom_tenant_fk
    foreign key (tenant_id, uom_id)
    references public.units_of_measure(tenant_id, id)
    on delete restrict,
  constraint stock_movement_lines_cost_code_tenant_fk
    foreign key (tenant_id, cost_code_id)
    references public.cost_codes(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_stock_movement_lines_tenant_id_id
  on public.stock_movement_lines (tenant_id, id);
create unique index if not exists ux_stock_movement_lines_movement_line
  on public.stock_movement_lines (stock_movement_id, line_number);
create unique index if not exists ux_stock_movement_lines_movement_item
  on public.stock_movement_lines (stock_movement_id, material_item_id);
create index if not exists idx_stock_movement_lines_item
  on public.stock_movement_lines (tenant_id, material_item_id);
create index if not exists idx_stock_movement_lines_cost_code
  on public.stock_movement_lines (tenant_id, cost_code_id)
  where cost_code_id is not null;

alter table public.stock_ledger_entries
  alter column stock_receipt_id drop not null;
alter table public.stock_ledger_entries
  alter column stock_receipt_line_id drop not null;
alter table public.stock_ledger_entries
  add column if not exists stock_movement_id uuid;
alter table public.stock_ledger_entries
  add column if not exists stock_movement_line_id uuid;
alter table public.stock_ledger_entries
  add column if not exists reverses_stock_ledger_entry_id uuid;

create unique index if not exists ux_stock_ledger_entries_tenant_id_id
  on public.stock_ledger_entries (tenant_id, id);

alter table public.stock_ledger_entries
  drop constraint if exists stock_ledger_entries_signed_values;
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_signed_values
  check (
    quantity_delta_micros <> 0
    and value_delta_cents <> 0
    and (
      (
        quantity_delta_micros > 0
        and value_delta_cents > 0
      )
      or
      (
        quantity_delta_micros < 0
        and value_delta_cents < 0
      )
    )
  );
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_single_source
  check (
    (
      stock_receipt_id is not null
      and stock_receipt_line_id is not null
      and stock_movement_id is null
      and stock_movement_line_id is null
      and reverses_stock_ledger_entry_id is null
    )
    or
    (
      stock_receipt_id is null
      and stock_receipt_line_id is null
      and stock_movement_id is not null
      and stock_movement_line_id is not null
    )
  );
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_movement_tenant_fk
  foreign key (tenant_id, stock_movement_id)
  references public.stock_movements(tenant_id, id)
  on delete restrict;
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_movement_line_tenant_fk
  foreign key (tenant_id, stock_movement_line_id)
  references public.stock_movement_lines(tenant_id, id)
  on delete restrict;
alter table public.stock_ledger_entries
  add constraint stock_ledger_entries_reversal_tenant_fk
  foreign key (tenant_id, reverses_stock_ledger_entry_id)
  references public.stock_ledger_entries(tenant_id, id)
  on delete restrict;

create unique index if not exists
  ux_stock_ledger_movement_line_event_warehouse
  on public.stock_ledger_entries (
    tenant_id,
    stock_movement_line_id,
    event_type,
    warehouse_id
  )
  where stock_movement_line_id is not null;
create unique index if not exists ux_stock_ledger_movement_reversal
  on public.stock_ledger_entries (
    tenant_id,
    reverses_stock_ledger_entry_id
  )
  where reverses_stock_ledger_entry_id is not null;
create index if not exists idx_stock_ledger_movement
  on public.stock_ledger_entries (tenant_id, stock_movement_id)
  where stock_movement_id is not null;
