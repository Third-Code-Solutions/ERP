-- WO-06 / M-03 + M-04: DUPA engine and rate libraries.
--
-- Additive only. Existing bom_line_items IDs remain the commercial spine. No
-- legacy row is deleted or re-keyed. New money columns are BIGINT centavos;
-- measured quantities use explicitly scaled NUMERIC values.

create table if not exists public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code varchar(64) not null,
  description text not null,
  base_uom varchar(20) not null,
  current_rate_centavos bigint not null default 0,
  rate_source text not null default 'manual',
  last_updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_catalog_rate_source_check
    check (rate_source in ('rfq', 'po', 'manual', 'history')),
  constraint material_catalog_rate_non_negative_check
    check (current_rate_centavos >= 0)
);

create unique index if not exists ux_material_catalog_tenant_code
  on public.material_catalog (tenant_id, code);
create unique index if not exists ux_material_catalog_tenant_id_id
  on public.material_catalog (tenant_id, id);
create index if not exists idx_material_catalog_tenant
  on public.material_catalog (tenant_id);

create table if not exists public.crew_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name varchar(120) not null,
  description text,
  hourly_rate_centavos bigint not null default 0,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crew_roles_rate_non_negative_check
    check (hourly_rate_centavos >= 0),
  constraint crew_roles_effective_range_check
    check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists ux_crew_roles_tenant_name_effective_from
  on public.crew_roles (tenant_id, name, effective_from);
create unique index if not exists ux_crew_roles_tenant_id_id
  on public.crew_roles (tenant_id, id);
create index if not exists idx_crew_roles_tenant_active
  on public.crew_roles (tenant_id, is_active);

create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code varchar(64) not null,
  description text not null,
  hourly_rate_centavos bigint not null default 0,
  default_productivity_per_hour numeric(18,4) not null,
  rate_source text not null default 'manual',
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_catalog_rate_source_check
    check (rate_source in ('manual', 'history', 'po')),
  constraint equipment_catalog_rate_non_negative_check
    check (hourly_rate_centavos >= 0),
  constraint equipment_catalog_productivity_positive_check
    check (default_productivity_per_hour > 0)
);

create unique index if not exists ux_equipment_catalog_tenant_code
  on public.equipment_catalog (tenant_id, code);
create unique index if not exists ux_equipment_catalog_tenant_id_id
  on public.equipment_catalog (tenant_id, id);
create index if not exists idx_equipment_catalog_tenant_active
  on public.equipment_catalog (tenant_id, is_active);

create table if not exists public.assemblies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code varchar(64) not null,
  name varchar(255) not null,
  uom varchar(20) not null,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_assemblies_tenant_code
  on public.assemblies (tenant_id, code);
create unique index if not exists ux_assemblies_tenant_id_id
  on public.assemblies (tenant_id, id);
create index if not exists idx_assemblies_tenant_active
  on public.assemblies (tenant_id, is_active);

create table if not exists public.assembly_material_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assembly_id uuid not null,
  catalog_item_id uuid,
  description text not null,
  quantity numeric(18,4) not null,
  uom varchar(20) not null,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assembly_material_templates_quantity_positive_check
    check (quantity > 0)
);

create unique index if not exists ux_assembly_material_templates_tenant_id_id
  on public.assembly_material_templates (tenant_id, id);
create index if not exists idx_assembly_material_templates_tenant_assembly
  on public.assembly_material_templates (tenant_id, assembly_id, sort_order);

create table if not exists public.assembly_labour_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assembly_id uuid not null,
  crew_role_id uuid,
  description text not null,
  no_of_persons numeric(10,2) not null,
  productivity_per_hour numeric(18,4) not null,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assembly_labour_templates_persons_positive_check
    check (no_of_persons > 0),
  constraint assembly_labour_templates_productivity_positive_check
    check (productivity_per_hour > 0)
);

create unique index if not exists ux_assembly_labour_templates_tenant_id_id
  on public.assembly_labour_templates (tenant_id, id);
create index if not exists idx_assembly_labour_templates_tenant_assembly
  on public.assembly_labour_templates (tenant_id, assembly_id, sort_order);

create table if not exists public.assembly_equipment_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assembly_id uuid not null,
  equipment_id uuid,
  description text not null,
  no_of_units numeric(10,2) not null,
  productivity_per_hour numeric(18,4) not null,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assembly_equipment_templates_units_positive_check
    check (no_of_units > 0),
  constraint assembly_equipment_templates_productivity_positive_check
    check (productivity_per_hour > 0)
);

create unique index if not exists ux_assembly_equipment_templates_tenant_id_id
  on public.assembly_equipment_templates (tenant_id, id);
create index if not exists idx_assembly_equipment_templates_tenant_assembly
  on public.assembly_equipment_templates (tenant_id, assembly_id, sort_order);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  catalog_item_id uuid not null,
  vendor_id uuid,
  quoted_rate_centavos bigint not null,
  awarded_rate_centavos bigint,
  source_type text not null,
  source_document text,
  occurred_at date not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_history_source_type_check
    check (source_type in ('quote', 'award', 'po', 'manual')),
  constraint price_history_quoted_rate_non_negative_check
    check (quoted_rate_centavos >= 0),
  constraint price_history_awarded_rate_non_negative_check
    check (awarded_rate_centavos is null or awarded_rate_centavos >= 0)
);

create unique index if not exists ux_price_history_tenant_id_id
  on public.price_history (tenant_id, id);
create index if not exists idx_price_history_tenant_catalog_date
  on public.price_history (tenant_id, catalog_item_id, occurred_at);

create table if not exists public.dupas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_line_item_id uuid not null,
  assembly_id uuid,
  header_quantity numeric(18,4) not null,
  uom varchar(20) not null,
  ocm_bps integer not null default 800,
  profit_bps integer not null default 700,
  vat_bps integer not null default 1200,
  vat_base text not null default 'direct_only',
  direct_cost_centavos bigint not null default 0,
  indirect_cost_centavos bigint not null default 0,
  vat_centavos bigint not null default 0,
  total_cost_centavos bigint not null default 0,
  unit_rate_centavos bigint not null default 0,
  computed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dupas_header_quantity_positive_check
    check (header_quantity > 0),
  constraint dupas_ocm_bps_check
    check (ocm_bps between 0 and 10000),
  constraint dupas_profit_bps_check
    check (profit_bps between 0 and 10000),
  constraint dupas_vat_bps_check
    check (vat_bps between 0 and 10000),
  constraint dupas_vat_base_check
    check (vat_base in ('direct_only', 'direct_plus_indirect')),
  constraint dupas_direct_non_negative_check
    check (direct_cost_centavos >= 0),
  constraint dupas_indirect_non_negative_check
    check (indirect_cost_centavos >= 0),
  constraint dupas_vat_non_negative_check
    check (vat_centavos >= 0),
  constraint dupas_total_non_negative_check
    check (total_cost_centavos >= 0),
  constraint dupas_unit_rate_non_negative_check
    check (unit_rate_centavos >= 0)
);

create unique index if not exists ux_dupas_tenant_bom_line_item
  on public.dupas (tenant_id, bom_line_item_id);
create unique index if not exists ux_dupas_tenant_id_id
  on public.dupas (tenant_id, id);
create index if not exists idx_dupas_tenant_assembly
  on public.dupas (tenant_id, assembly_id);

create table if not exists public.dupa_material_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dupa_id uuid not null,
  catalog_item_id uuid,
  description text not null,
  quantity numeric(18,4) not null,
  uom varchar(20) not null,
  unit_rate_centavos bigint not null,
  rate_source text not null,
  rate_as_of date,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dupa_material_lines_quantity_positive_check
    check (quantity > 0),
  constraint dupa_material_lines_rate_non_negative_check
    check (unit_rate_centavos >= 0),
  constraint dupa_material_lines_rate_source_check
    check (rate_source in ('catalog', 'rfq', 'history', 'manual'))
);

create unique index if not exists ux_dupa_material_lines_tenant_id_id
  on public.dupa_material_lines (tenant_id, id);
create index if not exists idx_dupa_material_lines_tenant_dupa
  on public.dupa_material_lines (tenant_id, dupa_id, sort_order);

create table if not exists public.dupa_labour_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dupa_id uuid not null,
  crew_role_id uuid,
  description text not null,
  no_of_persons numeric(10,2) not null,
  hourly_rate_centavos bigint not null,
  productivity_per_hour numeric(18,4) not null,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dupa_labour_lines_persons_positive_check
    check (no_of_persons > 0),
  constraint dupa_labour_lines_rate_non_negative_check
    check (hourly_rate_centavos >= 0),
  constraint dupa_labour_lines_productivity_positive_check
    check (productivity_per_hour > 0)
);

create unique index if not exists ux_dupa_labour_lines_tenant_id_id
  on public.dupa_labour_lines (tenant_id, id);
create index if not exists idx_dupa_labour_lines_tenant_dupa
  on public.dupa_labour_lines (tenant_id, dupa_id, sort_order);
create index if not exists idx_dupa_labour_lines_tenant_crew_role
  on public.dupa_labour_lines (tenant_id, crew_role_id);

create table if not exists public.dupa_equipment_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dupa_id uuid not null,
  equipment_id uuid,
  description text not null,
  no_of_units numeric(10,2) not null,
  hourly_rate_centavos bigint not null,
  productivity_per_hour numeric(18,4) not null,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dupa_equipment_lines_units_positive_check
    check (no_of_units > 0),
  constraint dupa_equipment_lines_rate_non_negative_check
    check (hourly_rate_centavos >= 0),
  constraint dupa_equipment_lines_productivity_positive_check
    check (productivity_per_hour > 0)
);

create unique index if not exists ux_dupa_equipment_lines_tenant_id_id
  on public.dupa_equipment_lines (tenant_id, id);
create index if not exists idx_dupa_equipment_lines_tenant_dupa
  on public.dupa_equipment_lines (tenant_id, dupa_id, sort_order);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.material_catalog'::regclass and conname = 'material_catalog_created_by_tenant_fk') then
    alter table public.material_catalog add constraint material_catalog_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.material_catalog'::regclass and conname = 'material_catalog_updated_by_tenant_fk') then
    alter table public.material_catalog add constraint material_catalog_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.crew_roles'::regclass and conname = 'crew_roles_created_by_tenant_fk') then
    alter table public.crew_roles add constraint crew_roles_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.crew_roles'::regclass and conname = 'crew_roles_updated_by_tenant_fk') then
    alter table public.crew_roles add constraint crew_roles_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.equipment_catalog'::regclass and conname = 'equipment_catalog_created_by_tenant_fk') then
    alter table public.equipment_catalog add constraint equipment_catalog_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.equipment_catalog'::regclass and conname = 'equipment_catalog_updated_by_tenant_fk') then
    alter table public.equipment_catalog add constraint equipment_catalog_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assemblies'::regclass and conname = 'assemblies_created_by_tenant_fk') then
    alter table public.assemblies add constraint assemblies_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assemblies'::regclass and conname = 'assemblies_updated_by_tenant_fk') then
    alter table public.assemblies add constraint assemblies_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_material_templates'::regclass and conname = 'assembly_material_templates_assembly_tenant_fk') then
    alter table public.assembly_material_templates add constraint assembly_material_templates_assembly_tenant_fk foreign key (tenant_id, assembly_id) references public.assemblies (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_material_templates'::regclass and conname = 'assembly_material_templates_catalog_tenant_fk') then
    alter table public.assembly_material_templates add constraint assembly_material_templates_catalog_tenant_fk foreign key (tenant_id, catalog_item_id) references public.material_catalog (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_material_templates'::regclass and conname = 'assembly_material_templates_created_by_tenant_fk') then
    alter table public.assembly_material_templates add constraint assembly_material_templates_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_material_templates'::regclass and conname = 'assembly_material_templates_updated_by_tenant_fk') then
    alter table public.assembly_material_templates add constraint assembly_material_templates_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_labour_templates'::regclass and conname = 'assembly_labour_templates_assembly_tenant_fk') then
    alter table public.assembly_labour_templates add constraint assembly_labour_templates_assembly_tenant_fk foreign key (tenant_id, assembly_id) references public.assemblies (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_labour_templates'::regclass and conname = 'assembly_labour_templates_crew_role_tenant_fk') then
    alter table public.assembly_labour_templates add constraint assembly_labour_templates_crew_role_tenant_fk foreign key (tenant_id, crew_role_id) references public.crew_roles (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_labour_templates'::regclass and conname = 'assembly_labour_templates_created_by_tenant_fk') then
    alter table public.assembly_labour_templates add constraint assembly_labour_templates_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_labour_templates'::regclass and conname = 'assembly_labour_templates_updated_by_tenant_fk') then
    alter table public.assembly_labour_templates add constraint assembly_labour_templates_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_equipment_templates'::regclass and conname = 'assembly_equipment_templates_assembly_tenant_fk') then
    alter table public.assembly_equipment_templates add constraint assembly_equipment_templates_assembly_tenant_fk foreign key (tenant_id, assembly_id) references public.assemblies (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_equipment_templates'::regclass and conname = 'assembly_equipment_templates_equipment_tenant_fk') then
    alter table public.assembly_equipment_templates add constraint assembly_equipment_templates_equipment_tenant_fk foreign key (tenant_id, equipment_id) references public.equipment_catalog (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_equipment_templates'::regclass and conname = 'assembly_equipment_templates_created_by_tenant_fk') then
    alter table public.assembly_equipment_templates add constraint assembly_equipment_templates_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.assembly_equipment_templates'::regclass and conname = 'assembly_equipment_templates_updated_by_tenant_fk') then
    alter table public.assembly_equipment_templates add constraint assembly_equipment_templates_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.price_history'::regclass and conname = 'price_history_catalog_tenant_fk') then
    alter table public.price_history add constraint price_history_catalog_tenant_fk foreign key (tenant_id, catalog_item_id) references public.material_catalog (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.price_history'::regclass and conname = 'price_history_vendor_tenant_fk') then
    alter table public.price_history add constraint price_history_vendor_tenant_fk foreign key (tenant_id, vendor_id) references public.vendors (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.price_history'::regclass and conname = 'price_history_created_by_tenant_fk') then
    alter table public.price_history add constraint price_history_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.price_history'::regclass and conname = 'price_history_updated_by_tenant_fk') then
    alter table public.price_history add constraint price_history_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupas'::regclass and conname = 'dupas_bom_line_item_tenant_fk') then
    alter table public.dupas add constraint dupas_bom_line_item_tenant_fk foreign key (tenant_id, bom_line_item_id) references public.bom_line_items (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupas'::regclass and conname = 'dupas_assembly_tenant_fk') then
    alter table public.dupas add constraint dupas_assembly_tenant_fk foreign key (tenant_id, assembly_id) references public.assemblies (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupas'::regclass and conname = 'dupas_created_by_tenant_fk') then
    alter table public.dupas add constraint dupas_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupas'::regclass and conname = 'dupas_updated_by_tenant_fk') then
    alter table public.dupas add constraint dupas_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_material_lines'::regclass and conname = 'dupa_material_lines_dupa_tenant_fk') then
    alter table public.dupa_material_lines add constraint dupa_material_lines_dupa_tenant_fk foreign key (tenant_id, dupa_id) references public.dupas (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_material_lines'::regclass and conname = 'dupa_material_lines_catalog_tenant_fk') then
    alter table public.dupa_material_lines add constraint dupa_material_lines_catalog_tenant_fk foreign key (tenant_id, catalog_item_id) references public.material_catalog (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_material_lines'::regclass and conname = 'dupa_material_lines_created_by_tenant_fk') then
    alter table public.dupa_material_lines add constraint dupa_material_lines_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_material_lines'::regclass and conname = 'dupa_material_lines_updated_by_tenant_fk') then
    alter table public.dupa_material_lines add constraint dupa_material_lines_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_labour_lines'::regclass and conname = 'dupa_labour_lines_dupa_tenant_fk') then
    alter table public.dupa_labour_lines add constraint dupa_labour_lines_dupa_tenant_fk foreign key (tenant_id, dupa_id) references public.dupas (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_labour_lines'::regclass and conname = 'dupa_labour_lines_crew_role_tenant_fk') then
    alter table public.dupa_labour_lines add constraint dupa_labour_lines_crew_role_tenant_fk foreign key (tenant_id, crew_role_id) references public.crew_roles (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_labour_lines'::regclass and conname = 'dupa_labour_lines_created_by_tenant_fk') then
    alter table public.dupa_labour_lines add constraint dupa_labour_lines_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_labour_lines'::regclass and conname = 'dupa_labour_lines_updated_by_tenant_fk') then
    alter table public.dupa_labour_lines add constraint dupa_labour_lines_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_equipment_lines'::regclass and conname = 'dupa_equipment_lines_dupa_tenant_fk') then
    alter table public.dupa_equipment_lines add constraint dupa_equipment_lines_dupa_tenant_fk foreign key (tenant_id, dupa_id) references public.dupas (tenant_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_equipment_lines'::regclass and conname = 'dupa_equipment_lines_equipment_tenant_fk') then
    alter table public.dupa_equipment_lines add constraint dupa_equipment_lines_equipment_tenant_fk foreign key (tenant_id, equipment_id) references public.equipment_catalog (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_equipment_lines'::regclass and conname = 'dupa_equipment_lines_created_by_tenant_fk') then
    alter table public.dupa_equipment_lines add constraint dupa_equipment_lines_created_by_tenant_fk foreign key (tenant_id, created_by) references public.users (tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.dupa_equipment_lines'::regclass and conname = 'dupa_equipment_lines_updated_by_tenant_fk') then
    alter table public.dupa_equipment_lines add constraint dupa_equipment_lines_updated_by_tenant_fk foreign key (tenant_id, updated_by) references public.users (tenant_id, id) on delete restrict;
  end if;
end
$$;

create index if not exists idx_dupa_material_lines_tenant_catalog
  on public.dupa_material_lines (tenant_id, catalog_item_id);
create index if not exists idx_dupa_equipment_lines_tenant_equipment
  on public.dupa_equipment_lines (tenant_id, equipment_id);

-- Tenant-safe guard: only classified work items can own a DUPA.
create or replace function public.dupa_work_item_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.bom_line_items line
    where line.tenant_id = new.tenant_id
      and line.id = new.bom_line_item_id
      and line.kind = 'work_item'
      and line.classification_status = 'classified'
  ) then
    raise exception 'DUPA requires a classified work item'
      using errcode = '23514';
  end if;
  return new;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.dupas'::regclass and tgname = 'dupa_work_item_guard') then
    create trigger dupa_work_item_guard
      before insert or update of tenant_id, bom_line_item_id
      on public.dupas
      for each row execute function public.dupa_work_item_guard();
  end if;
end
$$;

-- Exact PostgreSQL numeric cascade. round(numeric) is half-up for positive
-- values. No intermediate is persisted before final centavo rounding.
create or replace function public.recompute_dupa_totals(target_dupa_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dupa public.dupas%rowtype;
  v_material numeric(38,12);
  v_labour numeric(38,12);
  v_equipment numeric(38,12);
  v_direct numeric(38,12);
  v_indirect numeric(38,12);
  v_vat numeric(38,12);
  v_total numeric(38,12);
  v_vat_base numeric(38,12);
  v_unit_rate bigint;
begin
  select * into v_dupa from public.dupas where id = target_dupa_id for update;
  if not found then
    return;
  end if;

  select coalesce(sum((line.quantity * line.unit_rate_centavos)::numeric(38,12)), 0::numeric(38,12))
    into v_material
    from public.dupa_material_lines line
   where line.tenant_id = v_dupa.tenant_id
     and line.dupa_id = v_dupa.id;

  select coalesce(sum((line.no_of_persons * line.hourly_rate_centavos / line.productivity_per_hour)::numeric(38,12)), 0::numeric(38,12))
    into v_labour
    from public.dupa_labour_lines line
   where line.tenant_id = v_dupa.tenant_id
     and line.dupa_id = v_dupa.id;

  select coalesce(sum((line.no_of_units * line.hourly_rate_centavos / line.productivity_per_hour)::numeric(38,12)), 0::numeric(38,12))
    into v_equipment
    from public.dupa_equipment_lines line
   where line.tenant_id = v_dupa.tenant_id
     and line.dupa_id = v_dupa.id;

  v_direct := (v_material + v_labour + v_equipment)::numeric(38,12);
  v_indirect := (v_direct * (v_dupa.ocm_bps + v_dupa.profit_bps) / 10000)::numeric(38,12);
  v_vat_base := case
    when v_dupa.vat_base = 'direct_plus_indirect' then v_direct + v_indirect
    else v_direct
  end;
  v_vat := (v_vat_base * v_dupa.vat_bps / 10000)::numeric(38,12);
  v_total := (v_direct + v_indirect + v_vat)::numeric(38,12);
  v_unit_rate := round(v_total / v_dupa.header_quantity)::bigint;

  update public.dupas
     set direct_cost_centavos = round(v_direct)::bigint,
         indirect_cost_centavos = round(v_indirect)::bigint,
         vat_centavos = round(v_vat)::bigint,
         total_cost_centavos = round(v_total)::bigint,
         unit_rate_centavos = v_unit_rate,
         computed_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where id = v_dupa.id
     and tenant_id = v_dupa.tenant_id;

  -- Existing downstream identity stays intact. BOQ amount derives from H,
  -- with legacy line-level markup removed when DUPA owns the rate.
  update public.bom_line_items
     set unit_rate_source = 'dupa',
         unit_cost_cents = v_unit_rate,
         markup_bps = 0,
         line_total_cents = round(v_unit_rate::numeric * quantity::numeric)::bigint,
         updated_at = clock_timestamp()
   where tenant_id = v_dupa.tenant_id
     and id = v_dupa.bom_line_item_id;
end
$$;

create or replace function public.dupa_recompute_from_child()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_dupa_totals(old.dupa_id);
    return old;
  end if;
  perform public.recompute_dupa_totals(new.dupa_id);
  return new;
end
$$;

create or replace function public.dupa_recompute_from_header()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recompute_dupa_totals(new.id);
  return new;
end
$$;

create or replace function public.dupa_refresh_crew_rates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.dupa_labour_lines
     set hourly_rate_centavos = new.hourly_rate_centavos,
         updated_at = clock_timestamp()
   where tenant_id = new.tenant_id
     and crew_role_id = new.id;
  return new;
end
$$;

create or replace function public.dupa_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'material_catalog',
    'crew_roles',
    'equipment_catalog',
    'assemblies',
    'assembly_material_templates',
    'assembly_labour_templates',
    'assembly_equipment_templates',
    'price_history',
    'dupas',
    'dupa_material_lines',
    'dupa_labour_lines',
    'dupa_equipment_lines'
  ] loop
    if not exists (
      select 1 from pg_trigger
       where tgrelid = format('public.%I', table_name)::regclass
         and tgname = table_name || '_touch_updated_at'
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.dupa_touch_updated_at()',
        table_name || '_touch_updated_at', table_name
      );
    end if;
  end loop;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.dupa_material_lines'::regclass and tgname = 'dupa_material_lines_recompute') then
    create trigger dupa_material_lines_recompute
      after insert or update or delete on public.dupa_material_lines
      for each row execute function public.dupa_recompute_from_child();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.dupa_labour_lines'::regclass and tgname = 'dupa_labour_lines_recompute') then
    create trigger dupa_labour_lines_recompute
      after insert or update or delete on public.dupa_labour_lines
      for each row execute function public.dupa_recompute_from_child();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.dupa_equipment_lines'::regclass and tgname = 'dupa_equipment_lines_recompute') then
    create trigger dupa_equipment_lines_recompute
      after insert or update or delete on public.dupa_equipment_lines
      for each row execute function public.dupa_recompute_from_child();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.dupas'::regclass and tgname = 'dupas_header_recompute') then
    create trigger dupas_header_recompute
      after update of header_quantity, ocm_bps, profit_bps, vat_bps, vat_base
      on public.dupas
      for each row execute function public.dupa_recompute_from_header();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.crew_roles'::regclass and tgname = 'crew_roles_refresh_dupa_rates') then
    create trigger crew_roles_refresh_dupa_rates
      after update of hourly_rate_centavos on public.crew_roles
      for each row execute function public.dupa_refresh_crew_rates();
  end if;
end
$$;

-- Every mutation participates in append-only audit history.
do $$
declare
  table_name text;
begin
  if to_regprocedure('public.audit_log_trigger()') is null then
    raise exception 'WO-06 requires public.audit_log_trigger() before applying'
      using errcode = '55000';
  end if;
  foreach table_name in array array[
    'material_catalog',
    'crew_roles',
    'equipment_catalog',
    'assemblies',
    'assembly_material_templates',
    'assembly_labour_templates',
    'assembly_equipment_templates',
    'price_history',
    'dupas',
    'dupa_material_lines',
    'dupa_labour_lines',
    'dupa_equipment_lines'
  ] loop
    if not exists (
      select 1 from pg_trigger
       where tgrelid = format('public.%I', table_name)::regclass
         and tgname = 'audit_' || table_name
    ) then
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()',
        'audit_' || table_name, table_name
      );
    end if;
  end loop;
end
$$;

-- Explicit grants keep Data API exposure deliberate on current/future
-- Supabase projects. RLS remains the row-level tenant boundary.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'material_catalog',
    'crew_roles',
    'equipment_catalog',
    'assemblies',
    'assembly_material_templates',
    'assembly_labour_templates',
    'assembly_equipment_templates',
    'price_history',
    'dupas',
    'dupa_material_lines',
    'dupa_labour_lines',
    'dupa_equipment_lines'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);

    if not exists (
      select 1 from pg_policies where schemaname = 'public'
        and tablename = table_name and policyname = table_name || '_tenant_read'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (tenant_id = public.auth_tenant_id())',
        table_name || '_tenant_read', table_name
      );
    end if;
    if not exists (
      select 1 from pg_policies where schemaname = 'public'
        and tablename = table_name and policyname = table_name || '_tenant_insert'
    ) then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (tenant_id = public.auth_tenant_id())',
        table_name || '_tenant_insert', table_name
      );
    end if;
    if not exists (
      select 1 from pg_policies where schemaname = 'public'
        and tablename = table_name and policyname = table_name || '_tenant_update'
    ) then
      execute format(
        'create policy %I on public.%I for update to authenticated using (tenant_id = public.auth_tenant_id()) with check (tenant_id = public.auth_tenant_id())',
        table_name || '_tenant_update', table_name
      );
    end if;
  end loop;
end
$$;

revoke execute on function public.recompute_dupa_totals(uuid) from public, anon, authenticated;
grant execute on function public.recompute_dupa_totals(uuid) to service_role;

-- DUPA totals are trigger-owned. Browser roles may supply the header inputs,
-- but cannot forge persisted cascade outputs or move the commercial identity.
revoke insert, update on table public.dupas from authenticated;
grant insert (
  id,
  tenant_id,
  bom_line_item_id,
  assembly_id,
  header_quantity,
  uom,
  ocm_bps,
  profit_bps,
  vat_bps,
  vat_base,
  created_by,
  updated_by
) on table public.dupas to authenticated;
grant update (
  assembly_id,
  header_quantity,
  uom,
  ocm_bps,
  profit_bps,
  vat_bps,
  vat_base,
  updated_by
) on table public.dupas to authenticated;

revoke execute on function public.dupa_work_item_guard() from public, anon, authenticated;
revoke execute on function public.dupa_recompute_from_child() from public, anon, authenticated;
revoke execute on function public.dupa_recompute_from_header() from public, anon, authenticated;
revoke execute on function public.dupa_refresh_crew_rates() from public, anon, authenticated;
grant execute on function public.dupa_work_item_guard() to service_role;
grant execute on function public.dupa_recompute_from_child() to service_role;
grant execute on function public.dupa_recompute_from_header() to service_role;
grant execute on function public.dupa_refresh_crew_rates() to service_role;
