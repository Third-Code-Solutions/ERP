import { pgTable, uuid, bigint, integer, timestamp, index, check, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { opportunityStageEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { accounts } from './accounts'
import { users } from './users'

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    // REFACTOR.md M1: opportunities are owned by an Account. `project_id`
    // remains for back-compat and is auto-populated on Won (US-005). Both
    // are nullable individually but at least one must be present (enforced
    // in business logic + a CHECK constraint in SQL migration).
    account_id: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
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
    // Captured when an opportunity transitions to closed_lost so reps and
    // leadership can analyze loss patterns. Free-text on purpose; can be
    // bucketed via UI dropdown later.
    lost_reason: text('lost_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_opportunities_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantIdx: index('idx_opportunities_tenant_id').on(table.tenant_id),
    accountIdx: index('idx_opportunities_account_id').on(table.account_id),
    projectIdx: index('idx_opportunities_project_id').on(table.project_id),
    repIdx: index('idx_opportunities_rep_id').on(table.rep_id),
    tenantStageIdx: index('idx_opportunities_tenant_stage').on(table.tenant_id, table.stage),
    probCheck: check('prob_range', sql`${table.probability} >= 0 AND ${table.probability} <= 100`),
    // At least one of account_id or project_id must be present — once the
    // Account model is fully adopted (Phase 1) every new opp will have
    // account_id; legacy rows have project_id only.
    accountOrProjectCheck: check(
      'opp_account_or_project',
      sql`${table.account_id} IS NOT NULL OR ${table.project_id} IS NOT NULL`
    ),
  })
)

export type Opportunity = typeof opportunities.$inferSelect
export type OpportunityInsert = typeof opportunities.$inferInsert
