import { pgTable, uuid, bigint, integer, timestamp, index, check, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { opportunityStageEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    rep_id: uuid('rep_id').references(() => users.id, { onDelete: 'set null' }),
    stage: opportunityStageEnum('stage').notNull().default('opportunity_creation'),
    // All monetary values in integer cents (PHP centavos)
    tcv_cents: bigint('tcv_cents', { mode: 'number' }).notNull().default(0),
    gp_cents: bigint('gp_cents', { mode: 'number' }).notNull().default(0),
    // Probability 0-100 integer
    probability: integer('probability').notNull().default(0),
    // weighted_tcv_cents = tcv_cents * probability / 100 (computed in app)
    weighted_tcv_cents: bigint('weighted_tcv_cents', { mode: 'number' }).notNull().default(0),
    closing_date: timestamp('closing_date', { withTimezone: true }),
    area_sqm: integer('area_sqm'),
    opportunity_type: text('opportunity_type'),
    remarks: text('remarks'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_opportunities_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_opportunities_project_id').on(table.project_id),
    repIdx: index('idx_opportunities_rep_id').on(table.rep_id),
    tenantStageIdx: index('idx_opportunities_tenant_stage').on(table.tenant_id, table.stage),
    probCheck: check('prob_range', sql`${table.probability} >= 0 AND ${table.probability} <= 100`),
  })
)

export type Opportunity = typeof opportunities.$inferSelect
export type OpportunityInsert = typeof opportunities.$inferInsert
