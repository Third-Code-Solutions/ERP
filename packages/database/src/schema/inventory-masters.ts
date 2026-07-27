import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const unitsOfMeasure = pgTable(
  'units_of_measure',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    decimal_places: integer('decimal_places').notNull().default(0),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_units_of_measure_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantCodeIdx: uniqueIndex('ux_units_of_measure_tenant_code').on(
      table.tenant_id,
      table.code
    ),
    createdByTenantFk: foreignKey({
      name: 'units_of_measure_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  })
)

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    project_id: uuid('project_id'),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_warehouses_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantCodeIdx: uniqueIndex('ux_warehouses_tenant_code').on(
      table.tenant_id,
      table.code
    ),
    tenantProjectIdx: index('idx_warehouses_tenant_project').on(
      table.tenant_id,
      table.project_id
    ),
    projectTenantFk: foreignKey({
      name: 'warehouses_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'warehouses_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  })
)

export type UnitOfMeasure = typeof unitsOfMeasure.$inferSelect
export type UnitOfMeasureInsert = typeof unitsOfMeasure.$inferInsert
export type Warehouse = typeof warehouses.$inferSelect
export type WarehouseInsert = typeof warehouses.$inferInsert
