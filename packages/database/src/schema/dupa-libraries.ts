import {
  bigint,
  boolean,
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

import { tenants } from './tenants'
import { users } from './users'
import { vendors } from './vendors'
import { rfqQuotes, rfqs } from './bom-extras'

export const materialCatalog = pgTable(
  'material_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    description: text('description').notNull(),
    base_uom: varchar('base_uom', { length: 20 }).notNull(),
    current_rate_centavos: bigint('current_rate_centavos', { mode: 'bigint' }).notNull().default(0n),
    rate_source: text('rate_source').notNull().default('manual'),
    last_updated_at: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCodeUniqueIdx: uniqueIndex('ux_material_catalog_tenant_code').on(table.tenant_id, table.code),
    tenantIdUniqueIdx: uniqueIndex('ux_material_catalog_tenant_id_id').on(table.tenant_id, table.id),
    tenantIdx: index('idx_material_catalog_tenant').on(table.tenant_id),
    rateSourceCheck: check(
      'material_catalog_rate_source_check',
      sql`${table.rate_source} in ('rfq', 'po', 'manual', 'history')`,
    ),
    rateNonNegativeCheck: check(
      'material_catalog_rate_non_negative_check',
      sql`${table.current_rate_centavos} >= 0`,
    ),
    createdByTenantFk: foreignKey({
      name: 'material_catalog_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'material_catalog_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const crewRoles = pgTable(
  'crew_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    hourly_rate_centavos: bigint('hourly_rate_centavos', { mode: 'bigint' }).notNull().default(0n),
    effective_from: date('effective_from', { mode: 'string' }).notNull(),
    effective_to: date('effective_to', { mode: 'string' }),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameFromUniqueIdx: uniqueIndex('ux_crew_roles_tenant_name_effective_from').on(
      table.tenant_id,
      table.name,
      table.effective_from,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_crew_roles_tenant_id_id').on(table.tenant_id, table.id),
    tenantActiveIdx: index('idx_crew_roles_tenant_active').on(table.tenant_id, table.is_active),
    rateNonNegativeCheck: check(
      'crew_roles_rate_non_negative_check',
      sql`${table.hourly_rate_centavos} >= 0`,
    ),
    effectiveRangeCheck: check(
      'crew_roles_effective_range_check',
      sql`${table.effective_to} is null or ${table.effective_to} >= ${table.effective_from}`,
    ),
    createdByTenantFk: foreignKey({
      name: 'crew_roles_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'crew_roles_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const equipmentCatalog = pgTable(
  'equipment_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    description: text('description').notNull(),
    hourly_rate_centavos: bigint('hourly_rate_centavos', { mode: 'bigint' }).notNull().default(0n),
    default_productivity_per_hour: numeric('default_productivity_per_hour', {
      precision: 18,
      scale: 4,
    }).notNull(),
    rate_source: text('rate_source').notNull().default('manual'),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCodeUniqueIdx: uniqueIndex('ux_equipment_catalog_tenant_code').on(table.tenant_id, table.code),
    tenantIdUniqueIdx: uniqueIndex('ux_equipment_catalog_tenant_id_id').on(table.tenant_id, table.id),
    tenantActiveIdx: index('idx_equipment_catalog_tenant_active').on(table.tenant_id, table.is_active),
    rateSourceCheck: check(
      'equipment_catalog_rate_source_check',
      sql`${table.rate_source} in ('manual', 'history', 'po')`,
    ),
    rateNonNegativeCheck: check(
      'equipment_catalog_rate_non_negative_check',
      sql`${table.hourly_rate_centavos} >= 0`,
    ),
    productivityPositiveCheck: check(
      'equipment_catalog_productivity_positive_check',
      sql`${table.default_productivity_per_hour} > 0`,
    ),
    createdByTenantFk: foreignKey({
      name: 'equipment_catalog_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'equipment_catalog_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const assemblies = pgTable(
  'assemblies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCodeUniqueIdx: uniqueIndex('ux_assemblies_tenant_code').on(table.tenant_id, table.code),
    tenantIdUniqueIdx: uniqueIndex('ux_assemblies_tenant_id_id').on(table.tenant_id, table.id),
    tenantActiveIdx: index('idx_assemblies_tenant_active').on(table.tenant_id, table.is_active),
    createdByTenantFk: foreignKey({
      name: 'assemblies_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'assemblies_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const assemblyMaterialTemplates = pgTable(
  'assembly_material_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    assembly_id: uuid('assembly_id').notNull(),
    catalog_item_id: uuid('catalog_item_id'),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantAssemblyIdx: index('idx_assembly_material_templates_tenant_assembly').on(
      table.tenant_id,
      table.assembly_id,
      table.sort_order,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_assembly_material_templates_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    quantityPositiveCheck: check(
      'assembly_material_templates_quantity_positive_check',
      sql`${table.quantity} > 0`,
    ),
    assemblyTenantFk: foreignKey({
      name: 'assembly_material_templates_assembly_tenant_fk',
      columns: [table.tenant_id, table.assembly_id],
      foreignColumns: [assemblies.tenant_id, assemblies.id],
    }).onDelete('cascade'),
    catalogTenantFk: foreignKey({
      name: 'assembly_material_templates_catalog_tenant_fk',
      columns: [table.tenant_id, table.catalog_item_id],
      foreignColumns: [materialCatalog.tenant_id, materialCatalog.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'assembly_material_templates_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'assembly_material_templates_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const assemblyLabourTemplates = pgTable(
  'assembly_labour_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    assembly_id: uuid('assembly_id').notNull(),
    crew_role_id: uuid('crew_role_id'),
    description: text('description').notNull(),
    no_of_persons: numeric('no_of_persons', { precision: 10, scale: 2 }).notNull(),
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
    tenantAssemblyIdx: index('idx_assembly_labour_templates_tenant_assembly').on(
      table.tenant_id,
      table.assembly_id,
      table.sort_order,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_assembly_labour_templates_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    personsPositiveCheck: check(
      'assembly_labour_templates_persons_positive_check',
      sql`${table.no_of_persons} > 0`,
    ),
    productivityPositiveCheck: check(
      'assembly_labour_templates_productivity_positive_check',
      sql`${table.productivity_per_hour} > 0`,
    ),
    assemblyTenantFk: foreignKey({
      name: 'assembly_labour_templates_assembly_tenant_fk',
      columns: [table.tenant_id, table.assembly_id],
      foreignColumns: [assemblies.tenant_id, assemblies.id],
    }).onDelete('cascade'),
    crewRoleTenantFk: foreignKey({
      name: 'assembly_labour_templates_crew_role_tenant_fk',
      columns: [table.tenant_id, table.crew_role_id],
      foreignColumns: [crewRoles.tenant_id, crewRoles.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'assembly_labour_templates_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'assembly_labour_templates_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const assemblyEquipmentTemplates = pgTable(
  'assembly_equipment_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    assembly_id: uuid('assembly_id').notNull(),
    equipment_id: uuid('equipment_id'),
    description: text('description').notNull(),
    no_of_units: numeric('no_of_units', { precision: 10, scale: 2 }).notNull(),
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
    tenantAssemblyIdx: index('idx_assembly_equipment_templates_tenant_assembly').on(
      table.tenant_id,
      table.assembly_id,
      table.sort_order,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_assembly_equipment_templates_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    unitsPositiveCheck: check(
      'assembly_equipment_templates_units_positive_check',
      sql`${table.no_of_units} > 0`,
    ),
    productivityPositiveCheck: check(
      'assembly_equipment_templates_productivity_positive_check',
      sql`${table.productivity_per_hour} > 0`,
    ),
    assemblyTenantFk: foreignKey({
      name: 'assembly_equipment_templates_assembly_tenant_fk',
      columns: [table.tenant_id, table.assembly_id],
      foreignColumns: [assemblies.tenant_id, assemblies.id],
    }).onDelete('cascade'),
    equipmentTenantFk: foreignKey({
      name: 'assembly_equipment_templates_equipment_tenant_fk',
      columns: [table.tenant_id, table.equipment_id],
      foreignColumns: [equipmentCatalog.tenant_id, equipmentCatalog.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'assembly_equipment_templates_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'assembly_equipment_templates_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const priceHistory = pgTable(
  'price_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    catalog_item_id: uuid('catalog_item_id').notNull(),
    vendor_id: uuid('vendor_id'),
    quoted_rate_centavos: bigint('quoted_rate_centavos', { mode: 'bigint' }).notNull(),
    awarded_rate_centavos: bigint('awarded_rate_centavos', { mode: 'bigint' }),
    source_type: text('source_type').notNull(),
    source_document: text('source_document'),
    source_rfq_id: uuid('source_rfq_id'),
    source_rfq_quote_id: uuid('source_rfq_quote_id'),
    occurred_at: date('occurred_at', { mode: 'string' }).notNull(),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCatalogDateIdx: index('idx_price_history_tenant_catalog_date').on(
      table.tenant_id,
      table.catalog_item_id,
      table.occurred_at,
    ),
    tenantRfqIdx: index('idx_price_history_tenant_rfq').on(
      table.tenant_id,
      table.source_rfq_id,
    ),
    tenantRfqQuoteUniqueIdx: uniqueIndex('ux_price_history_tenant_rfq_quote').on(
      table.tenant_id,
      table.source_rfq_quote_id,
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_price_history_tenant_id_id').on(table.tenant_id, table.id),
    sourceTypeCheck: check(
      'price_history_source_type_check',
      sql`${table.source_type} in ('quote', 'award', 'po', 'manual')`,
    ),
    quotedRateNonNegativeCheck: check(
      'price_history_quoted_rate_non_negative_check',
      sql`${table.quoted_rate_centavos} >= 0`,
    ),
    awardedRateNonNegativeCheck: check(
      'price_history_awarded_rate_non_negative_check',
      sql`${table.awarded_rate_centavos} is null or ${table.awarded_rate_centavos} >= 0`,
    ),
    catalogTenantFk: foreignKey({
      name: 'price_history_catalog_tenant_fk',
      columns: [table.tenant_id, table.catalog_item_id],
      foreignColumns: [materialCatalog.tenant_id, materialCatalog.id],
    }).onDelete('cascade'),
    vendorTenantFk: foreignKey({
      name: 'price_history_vendor_tenant_fk',
      columns: [table.tenant_id, table.vendor_id],
      foreignColumns: [vendors.tenant_id, vendors.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'price_history_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'price_history_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    sourceRfqTenantFk: foreignKey({
      name: 'price_history_source_rfq_tenant_fk',
      columns: [table.tenant_id, table.source_rfq_id],
      foreignColumns: [rfqs.tenant_id, rfqs.id],
    }).onDelete('cascade'),
    sourceRfqQuoteTenantFk: foreignKey({
      name: 'price_history_source_rfq_quote_tenant_fk',
      columns: [table.tenant_id, table.source_rfq_quote_id],
      foreignColumns: [rfqQuotes.tenant_id, rfqQuotes.id],
    }).onDelete('cascade'),
  }),
)

export type MaterialCatalog = typeof materialCatalog.$inferSelect
export type CrewRole = typeof crewRoles.$inferSelect
export type EquipmentCatalog = typeof equipmentCatalog.$inferSelect
export type Assembly = typeof assemblies.$inferSelect
export type AssemblyMaterialTemplate = typeof assemblyMaterialTemplates.$inferSelect
export type AssemblyLabourTemplate = typeof assemblyLabourTemplates.$inferSelect
export type AssemblyEquipmentTemplate = typeof assemblyEquipmentTemplates.$inferSelect
export type PriceHistory = typeof priceHistory.$inferSelect
