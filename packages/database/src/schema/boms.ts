import {
  pgTable,
  uuid,
  varchar,
  text,
  bigint,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { bomStatusEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { opportunities } from './opportunities'
import { users } from './users'

export const boms = pgTable(
  'boms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    approved_by: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    label: varchar('label', { length: 255 }),
    status: bomStatusEnum('status').notNull().default('draft'),
    // Totals (in PHP centavos, computed from line items)
    total_cost_cents: bigint('total_cost_cents', { mode: 'number' }).notNull().default(0),
    tcv_cents: bigint('tcv_cents', { mode: 'number' }).notNull().default(0),
    gp_cents: bigint('gp_cents', { mode: 'number' }).notNull().default(0),
    // Margin in basis points (0-10000 = 0%-100%)
    gp_margin_bps: integer('gp_margin_bps').notNull().default(0),
    notes: text('notes'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    locked_at: timestamp('locked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_boms_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_boms_project_id').on(table.project_id),
    opportunityIdx: index('idx_boms_opportunity_id').on(table.opportunity_id),
    tenantStatusIdx: index('idx_boms_tenant_status').on(table.tenant_id, table.status),
    tenantIdUniqueIdx: uniqueIndex('ux_boms_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
  })
)

export type Bom = typeof boms.$inferSelect
export type BomInsert = typeof boms.$inferInsert
