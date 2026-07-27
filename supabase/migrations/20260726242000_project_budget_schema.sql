-- Third Code ERP versioned Project Budget and Cost Code schema.

do $$
begin
  create type public.project_budget_status as enum (
    'draft',
    'pending_approval',
    'approved',
    'superseded',
    'rejected'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.budget_control_mode as enum (
    'monitor',
    'warn',
    'block'
  );
exception
  when duplicate_object then null;
end
$$;

alter type public.cortex_node_type
  add value if not exists 'cost_code';
alter type public.cortex_node_type
  add value if not exists 'project_budget';

create unique index if not exists ux_boms_tenant_id_id
  on public.boms (tenant_id, id);

create table if not exists public.cost_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  parent_id uuid,
  code varchar(40) not null,
  name varchar(160) not null,
  category public.cost_category not null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_codes_code_nonempty
    check (code = btrim(code) and length(code) > 0),
  constraint cost_codes_name_nonempty
    check (name = btrim(name) and length(name) > 0),
  constraint cost_codes_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_cost_codes_tenant_id_id
  on public.cost_codes (tenant_id, id);
create unique index if not exists ux_cost_codes_tenant_code
  on public.cost_codes (tenant_id, lower(code));
create index if not exists idx_cost_codes_tenant_category
  on public.cost_codes (tenant_id, category);
alter table public.cost_codes
  add constraint cost_codes_parent_tenant_fk
  foreign key (tenant_id, parent_id)
  references public.cost_codes(tenant_id, id)
  on delete restrict;

create table if not exists public.project_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  project_id uuid not null,
  source_bom_id uuid,
  supersedes_budget_id uuid,
  revision integer not null,
  status public.project_budget_status not null default 'draft',
  control_mode public.budget_control_mode not null default 'warn',
  commitment_tolerance_bps integer not null default 0,
  currency char(3) not null default 'PHP',
  effective_from date not null,
  revision_reason text not null,
  total_budget_cents bigint not null default 0,
  submitted_by uuid,
  submitted_at timestamptz,
  commercial_approved_by uuid,
  commercial_approved_at timestamptz,
  finance_approved_by uuid,
  finance_approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_budgets_revision_positive
    check (revision > 0),
  constraint project_budgets_tolerance_range
    check (commitment_tolerance_bps between 0 and 10000),
  constraint project_budgets_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint project_budgets_reason_nonempty
    check (length(btrim(revision_reason)) > 0),
  constraint project_budgets_total_nonnegative
    check (total_budget_cents >= 0),
  constraint project_budgets_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete restrict,
  constraint project_budgets_source_bom_tenant_fk
    foreign key (tenant_id, source_bom_id)
    references public.boms(tenant_id, id)
    on delete restrict,
  constraint project_budgets_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint project_budgets_submitted_by_tenant_fk
    foreign key (tenant_id, submitted_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint project_budgets_commercial_by_tenant_fk
    foreign key (tenant_id, commercial_approved_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint project_budgets_finance_by_tenant_fk
    foreign key (tenant_id, finance_approved_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint project_budgets_rejected_by_tenant_fk
    foreign key (tenant_id, rejected_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_project_budgets_tenant_id_id
  on public.project_budgets (tenant_id, id);
create unique index if not exists ux_project_budgets_project_revision
  on public.project_budgets (tenant_id, project_id, revision);
create unique index if not exists ux_project_budgets_current_approved
  on public.project_budgets (tenant_id, project_id)
  where status = 'approved';
create unique index if not exists ux_project_budgets_open_revision
  on public.project_budgets (tenant_id, project_id)
  where status in ('draft', 'pending_approval');
create index if not exists idx_project_budgets_tenant_status
  on public.project_budgets (tenant_id, status);
alter table public.project_budgets
  add constraint project_budgets_supersedes_tenant_fk
  foreign key (tenant_id, supersedes_budget_id)
  references public.project_budgets(tenant_id, id)
  on delete restrict;

create table if not exists public.project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  project_budget_id uuid not null,
  cost_code_id uuid not null,
  bom_line_item_id uuid,
  line_number integer not null,
  description text not null,
  amount_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_budget_lines_number_positive
    check (line_number > 0),
  constraint project_budget_lines_description_nonempty
    check (length(btrim(description)) > 0),
  constraint project_budget_lines_amount_positive
    check (amount_cents > 0),
  constraint project_budget_lines_budget_tenant_fk
    foreign key (tenant_id, project_budget_id)
    references public.project_budgets(tenant_id, id)
    on delete cascade,
  constraint project_budget_lines_cost_code_tenant_fk
    foreign key (tenant_id, cost_code_id)
    references public.cost_codes(tenant_id, id)
    on delete restrict,
  constraint project_budget_lines_bom_line_tenant_fk
    foreign key (tenant_id, bom_line_item_id)
    references public.bom_line_items(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_project_budget_lines_tenant_id_id
  on public.project_budget_lines (tenant_id, id);
create unique index if not exists ux_project_budget_lines_budget_line
  on public.project_budget_lines (project_budget_id, line_number);
create unique index if not exists ux_project_budget_lines_budget_cost_code
  on public.project_budget_lines (project_budget_id, cost_code_id);

alter table public.po_line_items
  add column if not exists bom_line_item_id uuid;
alter table public.po_line_items
  add column if not exists cost_code_id uuid;
alter table public.po_line_items
  drop constraint if exists po_line_items_bom_line_tenant_fk;
alter table public.po_line_items
  add constraint po_line_items_bom_line_tenant_fk
  foreign key (tenant_id, bom_line_item_id)
  references public.bom_line_items(tenant_id, id)
  on delete restrict;
alter table public.po_line_items
  drop constraint if exists po_line_items_cost_code_tenant_fk;
alter table public.po_line_items
  add constraint po_line_items_cost_code_tenant_fk
  foreign key (tenant_id, cost_code_id)
  references public.cost_codes(tenant_id, id)
  on delete restrict;
create index if not exists idx_po_line_items_cost_code
  on public.po_line_items (tenant_id, cost_code_id);

alter table public.supplier_bill_lines
  add column if not exists cost_code_id uuid;
alter table public.supplier_bill_lines
  drop constraint if exists supplier_bill_lines_cost_code_tenant_fk;
alter table public.supplier_bill_lines
  add constraint supplier_bill_lines_cost_code_tenant_fk
  foreign key (tenant_id, cost_code_id)
  references public.cost_codes(tenant_id, id)
  on delete restrict;
create index if not exists idx_supplier_bill_lines_cost_code
  on public.supplier_bill_lines (tenant_id, cost_code_id);

alter table public.cost_entries
  add column if not exists cost_code_id uuid;
alter table public.cost_entries
  drop constraint if exists cost_entries_cost_code_tenant_fk;
alter table public.cost_entries
  add constraint cost_entries_cost_code_tenant_fk
  foreign key (tenant_id, cost_code_id)
  references public.cost_codes(tenant_id, id)
  on delete restrict;
create index if not exists idx_cost_entries_cost_code
  on public.cost_entries (tenant_id, cost_code_id);
