import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { awardHandoffStatusEnum } from './enums'
import { boms } from './boms'
import { invoices } from './invoices'
import { masterSchedules } from './construction'
import { opportunities } from './opportunities'
import { projectBudgets } from './budgets'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

/**
 * Durable WO-13 handoff ledger. It is the idempotency boundary between a
 * signed BOM and the execution artifacts created from that BOM.
 */
export const awardHandoffs = pgTable(
  'award_handoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    source_bom_id: uuid('source_bom_id').notNull(),
    opportunity_id: uuid('opportunity_id'),
    project_id: uuid('project_id').notNull(),
    project_code: varchar('project_code', { length: 40 }).notNull(),
    /** False for the current project-bound BOM contract; retained for a future nullable-BOM migration. */
    project_was_created: boolean('project_was_created').notNull().default(false),
    budget_id: uuid('budget_id').notNull(),
    dp_invoice_id: uuid('dp_invoice_id').notNull(),
    project_tracker_id: uuid('project_tracker_id').notNull(),
    task_ids: jsonb('task_ids').$type<Record<string, string>>().notNull().default({}),
    status: awardHandoffStatusEnum('status').notNull().default('active'),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reversed_at: timestamp('reversed_at', { withTimezone: true }),
    reversed_by: uuid('reversed_by'),
    reversal_reason: varchar('reversal_reason', { length: 500 }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_award_handoffs_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    sourceBomUniqueIdx: uniqueIndex('ux_award_handoffs_tenant_source_bom').on(
      table.tenant_id,
      table.source_bom_id
    ),
    projectIdx: index('idx_award_handoffs_tenant_project').on(
      table.tenant_id,
      table.project_id,
      table.status
    ),
    statusIdx: index('idx_award_handoffs_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    sourceBomTenantFk: foreignKey({
      name: 'award_handoffs_source_bom_tenant_fk',
      columns: [table.tenant_id, table.source_bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('restrict'),
    opportunityTenantFk: foreignKey({
      name: 'award_handoffs_opportunity_tenant_fk',
      columns: [table.tenant_id, table.opportunity_id],
      foreignColumns: [opportunities.tenant_id, opportunities.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'award_handoffs_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    budgetTenantFk: foreignKey({
      name: 'award_handoffs_budget_tenant_fk',
      columns: [table.tenant_id, table.budget_id],
      foreignColumns: [projectBudgets.tenant_id, projectBudgets.id],
    }).onDelete('restrict'),
    invoiceTenantFk: foreignKey({
      name: 'award_handoffs_invoice_tenant_fk',
      columns: [table.tenant_id, table.dp_invoice_id],
      foreignColumns: [invoices.tenant_id, invoices.id],
    }).onDelete('restrict'),
    trackerTenantFk: foreignKey({
      name: 'award_handoffs_tracker_tenant_fk',
      columns: [table.tenant_id, table.project_tracker_id],
      foreignColumns: [masterSchedules.tenant_id, masterSchedules.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'award_handoffs_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reversedByTenantFk: foreignKey({
      name: 'award_handoffs_reversed_by_tenant_fk',
      columns: [table.tenant_id, table.reversed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    taskIdsObjectCheck: check(
      'award_handoffs_task_ids_object',
      sql`jsonb_typeof(${table.task_ids}) = 'object'`
    ),
    projectCodeCheck: check(
      'award_handoffs_project_code_nonempty',
      sql`${table.project_code} = btrim(${table.project_code}) and length(${table.project_code}) > 0`
    ),
    reversalStateCheck: check(
      'award_handoffs_reversal_state',
      sql`(
        (${table.status} = 'active' and ${table.reversed_at} is null and ${table.reversed_by} is null and ${table.reversal_reason} is null)
        or
        (${table.status} = 'reversed' and ${table.reversed_at} is not null and ${table.reversed_by} is not null and ${table.reversal_reason} is not null and length(btrim(${table.reversal_reason})) > 0)
      )`
    ),
  })
)

export type AwardHandoff = typeof awardHandoffs.$inferSelect
export type AwardHandoffInsert = typeof awardHandoffs.$inferInsert
