import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { bomLineItems } from './bom-line-items'
import { boms } from './boms'
import {
  budgetControlModeEnum,
  costCategoryEnum,
  projectBudgetStatusEnum,
} from './enums'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const costCodes = pgTable(
  'cost_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    parent_id: uuid('parent_id'),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    category: costCategoryEnum('category').notNull(),
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
    tenantIdUniqueIdx: uniqueIndex('ux_cost_codes_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantCodeIdx: uniqueIndex('ux_cost_codes_tenant_code').on(
      table.tenant_id,
      sql`lower(${table.code})`
    ),
    tenantCategoryIdx: index('idx_cost_codes_tenant_category').on(
      table.tenant_id,
      table.category
    ),
    parentTenantFk: foreignKey({
      name: 'cost_codes_parent_tenant_fk',
      columns: [table.tenant_id, table.parent_id],
      foreignColumns: [table.tenant_id, table.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'cost_codes_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    codeCheck: check(
      'cost_codes_code_nonempty',
      sql`${table.code} = btrim(${table.code}) and length(${table.code}) > 0`
    ),
    nameCheck: check(
      'cost_codes_name_nonempty',
      sql`${table.name} = btrim(${table.name}) and length(${table.name}) > 0`
    ),
  })
)

export const projectBudgets = pgTable(
  'project_budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    source_bom_id: uuid('source_bom_id'),
    supersedes_budget_id: uuid('supersedes_budget_id'),
    revision: integer('revision').notNull(),
    status: projectBudgetStatusEnum('status').notNull().default('draft'),
    control_mode: budgetControlModeEnum('control_mode')
      .notNull()
      .default('warn'),
    commitment_tolerance_bps: integer('commitment_tolerance_bps')
      .notNull()
      .default(0),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    effective_from: date('effective_from').notNull(),
    revision_reason: text('revision_reason').notNull(),
    total_budget_cents: bigint('total_budget_cents', {
      mode: 'number',
    })
      .notNull()
      .default(0),
    submitted_by: uuid('submitted_by'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    commercial_approved_by: uuid('commercial_approved_by'),
    commercial_approved_at: timestamp('commercial_approved_at', {
      withTimezone: true,
    }),
    finance_approved_by: uuid('finance_approved_by'),
    finance_approved_at: timestamp('finance_approved_at', {
      withTimezone: true,
    }),
    rejected_by: uuid('rejected_by'),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    rejection_reason: text('rejection_reason'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_project_budgets_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    projectRevisionIdx: uniqueIndex(
      'ux_project_budgets_project_revision'
    ).on(table.tenant_id, table.project_id, table.revision),
    currentApprovedIdx: uniqueIndex(
      'ux_project_budgets_current_approved'
    )
      .on(table.tenant_id, table.project_id)
      .where(sql`${table.status} = 'approved'`),
    openRevisionIdx: uniqueIndex('ux_project_budgets_open_revision')
      .on(table.tenant_id, table.project_id)
      .where(sql`${table.status} in ('draft', 'pending_approval')`),
    tenantStatusIdx: index('idx_project_budgets_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    projectTenantFk: foreignKey({
      name: 'project_budgets_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    sourceBomTenantFk: foreignKey({
      name: 'project_budgets_source_bom_tenant_fk',
      columns: [table.tenant_id, table.source_bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('restrict'),
    supersedesTenantFk: foreignKey({
      name: 'project_budgets_supersedes_tenant_fk',
      columns: [table.tenant_id, table.supersedes_budget_id],
      foreignColumns: [table.tenant_id, table.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'project_budgets_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    submittedByTenantFk: foreignKey({
      name: 'project_budgets_submitted_by_tenant_fk',
      columns: [table.tenant_id, table.submitted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    commercialByTenantFk: foreignKey({
      name: 'project_budgets_commercial_by_tenant_fk',
      columns: [table.tenant_id, table.commercial_approved_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    financeByTenantFk: foreignKey({
      name: 'project_budgets_finance_by_tenant_fk',
      columns: [table.tenant_id, table.finance_approved_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    rejectedByTenantFk: foreignKey({
      name: 'project_budgets_rejected_by_tenant_fk',
      columns: [table.tenant_id, table.rejected_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    revisionCheck: check(
      'project_budgets_revision_positive',
      sql`${table.revision} > 0`
    ),
    toleranceCheck: check(
      'project_budgets_tolerance_range',
      sql`${table.commitment_tolerance_bps} between 0 and 10000`
    ),
    currencyCheck: check(
      'project_budgets_currency_format',
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    reasonCheck: check(
      'project_budgets_reason_nonempty',
      sql`length(btrim(${table.revision_reason})) > 0`
    ),
    totalCheck: check(
      'project_budgets_total_nonnegative',
      sql`${table.total_budget_cents} >= 0`
    ),
  })
)

export const projectBudgetLines = pgTable(
  'project_budget_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    project_budget_id: uuid('project_budget_id').notNull(),
    cost_code_id: uuid('cost_code_id').notNull(),
    bom_line_item_id: uuid('bom_line_item_id'),
    line_number: integer('line_number').notNull(),
    description: text('description').notNull(),
    amount_cents: bigint('amount_cents', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_project_budget_lines_tenant_id_id'
    ).on(table.tenant_id, table.id),
    budgetLineIdx: uniqueIndex(
      'ux_project_budget_lines_budget_line'
    ).on(table.project_budget_id, table.line_number),
    budgetCostCodeIdx: uniqueIndex(
      'ux_project_budget_lines_budget_cost_code'
    ).on(table.project_budget_id, table.cost_code_id),
    budgetTenantFk: foreignKey({
      name: 'project_budget_lines_budget_tenant_fk',
      columns: [table.tenant_id, table.project_budget_id],
      foreignColumns: [projectBudgets.tenant_id, projectBudgets.id],
    }).onDelete('cascade'),
    costCodeTenantFk: foreignKey({
      name: 'project_budget_lines_cost_code_tenant_fk',
      columns: [table.tenant_id, table.cost_code_id],
      foreignColumns: [costCodes.tenant_id, costCodes.id],
    }).onDelete('restrict'),
    bomLineTenantFk: foreignKey({
      name: 'project_budget_lines_bom_line_tenant_fk',
      columns: [table.tenant_id, table.bom_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.id],
    }).onDelete('restrict'),
    lineNumberCheck: check(
      'project_budget_lines_number_positive',
      sql`${table.line_number} > 0`
    ),
    descriptionCheck: check(
      'project_budget_lines_description_nonempty',
      sql`length(btrim(${table.description})) > 0`
    ),
    amountCheck: check(
      'project_budget_lines_amount_positive',
      sql`${table.amount_cents} > 0`
    ),
  })
)

export type CostCode = typeof costCodes.$inferSelect
export type CostCodeInsert = typeof costCodes.$inferInsert
export type ProjectBudget = typeof projectBudgets.$inferSelect
export type ProjectBudgetInsert = typeof projectBudgets.$inferInsert
export type ProjectBudgetLine = typeof projectBudgetLines.$inferSelect
export type ProjectBudgetLineInsert = typeof projectBudgetLines.$inferInsert
