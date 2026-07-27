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
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  fiscalPeriodStatusEnum,
  journalEntryStatusEnum,
  journalSourceEnum,
  ledgerAccountTypeEnum,
  normalBalanceEnum,
} from './enums'
import { accounts } from './accounts'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'
import { vendors } from './vendors'

export const fiscalPeriods = pgTable(
  'fiscal_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    starts_on: date('starts_on').notNull(),
    ends_on: date('ends_on').notNull(),
    status: fiscalPeriodStatusEnum('status').notNull().default('open'),
    created_by: uuid('created_by').notNull(),
    closed_by: uuid('closed_by'),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantNameIdx: uniqueIndex('ux_fiscal_periods_tenant_name').on(
      table.tenant_id,
      table.name
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_fiscal_periods_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantDatesIdx: index('idx_fiscal_periods_tenant_dates').on(
      table.tenant_id,
      table.starts_on,
      table.ends_on
    ),
    tenantStatusIdx: index('idx_fiscal_periods_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    dateOrderCheck: check(
      'fiscal_periods_date_order',
      sql`${table.starts_on} <= ${table.ends_on}`
    ),
    createdByTenantFk: foreignKey({
      name: 'fiscal_periods_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    closedByTenantFk: foreignKey({
      name: 'fiscal_periods_closed_by_tenant_fk',
      columns: [table.tenant_id, table.closed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  })
)

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    account_type: ledgerAccountTypeEnum('account_type').notNull(),
    normal_balance: normalBalanceEnum('normal_balance').notNull(),
    parent_id: uuid('parent_id'),
    system_key: varchar('system_key', { length: 60 }),
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
    tenantCodeIdx: uniqueIndex('ux_ledger_accounts_tenant_code').on(
      table.tenant_id,
      table.code
    ),
    tenantIdUniqueIdx: uniqueIndex('ux_ledger_accounts_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantSystemKeyIdx: uniqueIndex(
      'ux_ledger_accounts_tenant_system_key'
    )
      .on(table.tenant_id, table.system_key)
      .where(sql`${table.system_key} is not null`),
    tenantTypeIdx: index('idx_ledger_accounts_tenant_type').on(
      table.tenant_id,
      table.account_type
    ),
    parentIdx: index('idx_ledger_accounts_parent_id').on(table.parent_id),
    parentTenantFk: foreignKey({
      name: 'ledger_accounts_parent_tenant_fk',
      columns: [table.tenant_id, table.parent_id],
      foreignColumns: [table.tenant_id, table.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'ledger_accounts_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  })
)

export const financialSequences = pgTable(
  'financial_sequences',
  {
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sequence_key: varchar('sequence_key', { length: 80 }).notNull(),
    next_value: bigint('next_value', { mode: 'number' }).notNull().default(1),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'financial_sequences_pkey',
      columns: [table.tenant_id, table.sequence_key],
    }),
    positiveCheck: check(
      'financial_sequences_positive',
      sql`${table.next_value} > 0`
    ),
  })
)

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    fiscal_period_id: uuid('fiscal_period_id'),
    entry_number: varchar('entry_number', { length: 40 }),
    status: journalEntryStatusEnum('status').notNull().default('draft'),
    source_type: journalSourceEnum('source_type').notNull().default('manual'),
    posting_date: date('posting_date').notNull(),
    description: text('description').notNull(),
    reference_type: varchar('reference_type', { length: 80 }),
    reference_id: uuid('reference_id'),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    reverses_entry_id: uuid('reverses_entry_id'),
    created_by: uuid('created_by').notNull(),
    posted_by: uuid('posted_by'),
    posted_at: timestamp('posted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_journal_entries_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantNumberIdx: uniqueIndex('ux_journal_entries_tenant_number')
      .on(table.tenant_id, table.entry_number)
      .where(sql`${table.entry_number} is not null`),
    reversesEntryIdx: uniqueIndex('ux_journal_entries_reverses_entry')
      .on(table.tenant_id, table.reverses_entry_id)
      .where(sql`${table.reverses_entry_id} is not null`),
    postingDateIdx: index('idx_journal_entries_tenant_posting_date').on(
      table.tenant_id,
      table.posting_date
    ),
    tenantStatusIdx: index('idx_journal_entries_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    referenceIdx: index('idx_journal_entries_reference').on(
      table.tenant_id,
      table.reference_type,
      table.reference_id
    ),
    createdByTenantFk: foreignKey({
      name: 'journal_entries_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    postedByTenantFk: foreignKey({
      name: 'journal_entries_posted_by_tenant_fk',
      columns: [table.tenant_id, table.posted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    periodTenantFk: foreignKey({
      name: 'journal_entries_period_tenant_fk',
      columns: [table.tenant_id, table.fiscal_period_id],
      foreignColumns: [fiscalPeriods.tenant_id, fiscalPeriods.id],
    }).onDelete('restrict'),
    reversesTenantFk: foreignKey({
      name: 'journal_entries_reverses_tenant_fk',
      columns: [table.tenant_id, table.reverses_entry_id],
      foreignColumns: [table.tenant_id, table.id],
    }).onDelete('restrict'),
  })
)

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    journal_entry_id: uuid('journal_entry_id').notNull(),
    ledger_account_id: uuid('ledger_account_id').notNull(),
    project_id: uuid('project_id'),
    business_account_id: uuid('business_account_id'),
    vendor_id: uuid('vendor_id'),
    line_number: integer('line_number').notNull(),
    description: text('description'),
    debit_cents: bigint('debit_cents', { mode: 'number' }).notNull().default(0),
    credit_cents: bigint('credit_cents', { mode: 'number' }).notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    entryLineIdx: uniqueIndex('ux_journal_lines_entry_line').on(
      table.journal_entry_id,
      table.line_number
    ),
    tenantAccountIdx: index('idx_journal_lines_tenant_account').on(
      table.tenant_id,
      table.ledger_account_id
    ),
    tenantProjectIdx: index('idx_journal_lines_tenant_project')
      .on(table.tenant_id, table.project_id)
      .where(sql`${table.project_id} is not null`),
    tenantBusinessAccountIdx: index(
      'idx_journal_lines_tenant_business_account'
    )
      .on(table.tenant_id, table.business_account_id)
      .where(sql`${table.business_account_id} is not null`),
    tenantVendorIdx: index('idx_journal_lines_tenant_vendor')
      .on(table.tenant_id, table.vendor_id)
      .where(sql`${table.vendor_id} is not null`),
    entryIdx: index('idx_journal_lines_entry').on(table.journal_entry_id),
    entryTenantFk: foreignKey({
      name: 'journal_lines_entry_tenant_fk',
      columns: [table.tenant_id, table.journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('cascade'),
    accountTenantFk: foreignKey({
      name: 'journal_lines_account_tenant_fk',
      columns: [table.tenant_id, table.ledger_account_id],
      foreignColumns: [ledgerAccounts.tenant_id, ledgerAccounts.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'journal_lines_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    businessAccountTenantFk: foreignKey({
      name: 'journal_lines_business_account_tenant_fk',
      columns: [table.tenant_id, table.business_account_id],
      foreignColumns: [accounts.tenant_id, accounts.id],
    }).onDelete('restrict'),
    vendorTenantFk: foreignKey({
      name: 'journal_lines_vendor_tenant_fk',
      columns: [table.tenant_id, table.vendor_id],
      foreignColumns: [vendors.tenant_id, vendors.id],
    }).onDelete('restrict'),
    lineNumberCheck: check(
      'journal_lines_line_number_positive',
      sql`${table.line_number} > 0`
    ),
    oneSidedAmountCheck: check(
      'journal_lines_one_sided_positive_amount',
      sql`(
        (${table.debit_cents} > 0 and ${table.credit_cents} = 0)
        or
        (${table.credit_cents} > 0 and ${table.debit_cents} = 0)
      )`
    ),
  })
)

export type FiscalPeriod = typeof fiscalPeriods.$inferSelect
export type FiscalPeriodInsert = typeof fiscalPeriods.$inferInsert
export type LedgerAccount = typeof ledgerAccounts.$inferSelect
export type LedgerAccountInsert = typeof ledgerAccounts.$inferInsert
export type JournalEntry = typeof journalEntries.$inferSelect
export type JournalEntryInsert = typeof journalEntries.$inferInsert
export type JournalLine = typeof journalLines.$inferSelect
export type JournalLineInsert = typeof journalLines.$inferInsert
