import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { assemblies, crewRoles, equipmentCatalog, materialCatalog } from './dupa-libraries'
import { bomLineItems } from './bom-line-items'
import { tenants } from './tenants'
import { users } from './users'

export const dupas = pgTable(
  'dupas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bom_line_item_id: uuid('bom_line_item_id').notNull(),
    assembly_id: uuid('assembly_id'),
    header_quantity: numeric('header_quantity', { precision: 18, scale: 4 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    ocm_bps: integer('ocm_bps').notNull().default(800),
    profit_bps: integer('profit_bps').notNull().default(700),
    vat_bps: integer('vat_bps').notNull().default(1200),
    vat_base: text('vat_base').notNull().default('direct_only'),
    direct_cost_centavos: bigint('direct_cost_centavos', { mode: 'bigint' }).notNull().default(0n),
    indirect_cost_centavos: bigint('indirect_cost_centavos', { mode: 'bigint' }).notNull().default(0n),
    vat_centavos: bigint('vat_centavos', { mode: 'bigint' }).notNull().default(0n),
    total_cost_centavos: bigint('total_cost_centavos', { mode: 'bigint' }).notNull().default(0n),
    unit_rate_centavos: bigint('unit_rate_centavos', { mode: 'bigint' }).notNull().default(0n),
    computed_at: timestamp('computed_at', { withTimezone: true }),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantLineUniqueIdx: uniqueIndex('ux_dupas_tenant_bom_line_item').on(
      table.tenant_id,
      table.bom_line_item_id,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_dupas_tenant_id_id').on(table.tenant_id, table.id),
    tenantAssemblyIdx: index('idx_dupas_tenant_assembly').on(table.tenant_id, table.assembly_id),
    headerQuantityPositiveCheck: check(
      'dupas_header_quantity_positive_check',
      sql`${table.header_quantity} > 0`,
    ),
    ocmBpsCheck: check('dupas_ocm_bps_check', sql`${table.ocm_bps} between 0 and 10000`),
    profitBpsCheck: check('dupas_profit_bps_check', sql`${table.profit_bps} between 0 and 10000`),
    vatBpsCheck: check('dupas_vat_bps_check', sql`${table.vat_bps} between 0 and 10000`),
    vatBaseCheck: check(
      'dupas_vat_base_check',
      sql`${table.vat_base} in ('direct_only', 'direct_plus_indirect')`,
    ),
    directNonNegativeCheck: check('dupas_direct_non_negative_check', sql`${table.direct_cost_centavos} >= 0`),
    indirectNonNegativeCheck: check(
      'dupas_indirect_non_negative_check',
      sql`${table.indirect_cost_centavos} >= 0`,
    ),
    vatNonNegativeCheck: check('dupas_vat_non_negative_check', sql`${table.vat_centavos} >= 0`),
    totalNonNegativeCheck: check('dupas_total_non_negative_check', sql`${table.total_cost_centavos} >= 0`),
    unitRateNonNegativeCheck: check(
      'dupas_unit_rate_non_negative_check',
      sql`${table.unit_rate_centavos} >= 0`,
    ),
    bomLineTenantFk: foreignKey({
      name: 'dupas_bom_line_item_tenant_fk',
      columns: [table.tenant_id, table.bom_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.id],
    }).onDelete('cascade'),
    assemblyTenantFk: foreignKey({
      name: 'dupas_assembly_tenant_fk',
      columns: [table.tenant_id, table.assembly_id],
      foreignColumns: [assemblies.tenant_id, assemblies.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'dupas_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'dupas_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const dupaMaterialLines = pgTable(
  'dupa_material_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    dupa_id: uuid('dupa_id').notNull(),
    catalog_item_id: uuid('catalog_item_id'),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    unit_rate_centavos: bigint('unit_rate_centavos', { mode: 'bigint' }).notNull(),
    rate_source: text('rate_source').notNull(),
    rate_as_of: date('rate_as_of', { mode: 'string' }),
    sort_order: integer('sort_order').notNull().default(0),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantDupaIdx: index('idx_dupa_material_lines_tenant_dupa').on(
      table.tenant_id,
      table.dupa_id,
      table.sort_order,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_dupa_material_lines_tenant_id_id').on(table.tenant_id, table.id),
    quantityPositiveCheck: check('dupa_material_lines_quantity_positive_check', sql`${table.quantity} > 0`),
    rateNonNegativeCheck: check(
      'dupa_material_lines_rate_non_negative_check',
      sql`${table.unit_rate_centavos} >= 0`,
    ),
    sourceCheck: check(
      'dupa_material_lines_rate_source_check',
      sql`${table.rate_source} in ('catalog', 'rfq', 'history', 'manual')`,
    ),
    dupaTenantFk: foreignKey({
      name: 'dupa_material_lines_dupa_tenant_fk',
      columns: [table.tenant_id, table.dupa_id],
      foreignColumns: [dupas.tenant_id, dupas.id],
    }).onDelete('cascade'),
    catalogTenantFk: foreignKey({
      name: 'dupa_material_lines_catalog_tenant_fk',
      columns: [table.tenant_id, table.catalog_item_id],
      foreignColumns: [materialCatalog.tenant_id, materialCatalog.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'dupa_material_lines_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'dupa_material_lines_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const dupaLabourLines = pgTable(
  'dupa_labour_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    dupa_id: uuid('dupa_id').notNull(),
    crew_role_id: uuid('crew_role_id'),
    description: text('description').notNull(),
    no_of_persons: numeric('no_of_persons', { precision: 10, scale: 2 }).notNull(),
    hourly_rate_centavos: bigint('hourly_rate_centavos', { mode: 'bigint' }).notNull(),
    productivity_per_hour: numeric('productivity_per_hour', {
      precision: 18,
      scale: 4,
    }).notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantDupaIdx: index('idx_dupa_labour_lines_tenant_dupa').on(
      table.tenant_id,
      table.dupa_id,
      table.sort_order,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_dupa_labour_lines_tenant_id_id').on(table.tenant_id, table.id),
    personsPositiveCheck: check('dupa_labour_lines_persons_positive_check', sql`${table.no_of_persons} > 0`),
    rateNonNegativeCheck: check(
      'dupa_labour_lines_rate_non_negative_check',
      sql`${table.hourly_rate_centavos} >= 0`,
    ),
    productivityPositiveCheck: check(
      'dupa_labour_lines_productivity_positive_check',
      sql`${table.productivity_per_hour} > 0`,
    ),
    dupaTenantFk: foreignKey({
      name: 'dupa_labour_lines_dupa_tenant_fk',
      columns: [table.tenant_id, table.dupa_id],
      foreignColumns: [dupas.tenant_id, dupas.id],
    }).onDelete('cascade'),
    crewRoleTenantFk: foreignKey({
      name: 'dupa_labour_lines_crew_role_tenant_fk',
      columns: [table.tenant_id, table.crew_role_id],
      foreignColumns: [crewRoles.tenant_id, crewRoles.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'dupa_labour_lines_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'dupa_labour_lines_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const dupaEquipmentLines = pgTable(
  'dupa_equipment_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    dupa_id: uuid('dupa_id').notNull(),
    equipment_id: uuid('equipment_id'),
    description: text('description').notNull(),
    no_of_units: numeric('no_of_units', { precision: 10, scale: 2 }).notNull(),
    hourly_rate_centavos: bigint('hourly_rate_centavos', { mode: 'bigint' }).notNull(),
    productivity_per_hour: numeric('productivity_per_hour', {
      precision: 18,
      scale: 4,
    }).notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantDupaIdx: index('idx_dupa_equipment_lines_tenant_dupa').on(
      table.tenant_id,
      table.dupa_id,
      table.sort_order,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_dupa_equipment_lines_tenant_id_id').on(table.tenant_id, table.id),
    unitsPositiveCheck: check('dupa_equipment_lines_units_positive_check', sql`${table.no_of_units} > 0`),
    rateNonNegativeCheck: check(
      'dupa_equipment_lines_rate_non_negative_check',
      sql`${table.hourly_rate_centavos} >= 0`,
    ),
    productivityPositiveCheck: check(
      'dupa_equipment_lines_productivity_positive_check',
      sql`${table.productivity_per_hour} > 0`,
    ),
    dupaTenantFk: foreignKey({
      name: 'dupa_equipment_lines_dupa_tenant_fk',
      columns: [table.tenant_id, table.dupa_id],
      foreignColumns: [dupas.tenant_id, dupas.id],
    }).onDelete('cascade'),
    equipmentTenantFk: foreignKey({
      name: 'dupa_equipment_lines_equipment_tenant_fk',
      columns: [table.tenant_id, table.equipment_id],
      foreignColumns: [equipmentCatalog.tenant_id, equipmentCatalog.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'dupa_equipment_lines_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'dupa_equipment_lines_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type Dupa = typeof dupas.$inferSelect
export type DupaMaterialLine = typeof dupaMaterialLines.$inferSelect
export type DupaLabourLine = typeof dupaLabourLines.$inferSelect
export type DupaEquipmentLine = typeof dupaEquipmentLines.$inferSelect
