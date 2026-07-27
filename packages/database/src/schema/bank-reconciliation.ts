import { sql } from 'drizzle-orm'
import {
  bigint,
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
import { cashAccounts, cashTransactions } from './cash'
import { bankStatementStatusEnum } from './enums'
import { tenants } from './tenants'
import { users } from './users'

export const bankStatements = pgTable(
  'bank_statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cash_account_id: uuid('cash_account_id').notNull(),
    reference_number: varchar('reference_number', { length: 120 }).notNull(),
    source_file_name: varchar('source_file_name', { length: 255 }).notNull(),
    source_sha256: char('source_sha256', { length: 64 }).notNull(),
    status: bankStatementStatusEnum('status').notNull().default('draft'),
    statement_start: date('statement_start').notNull(),
    statement_end: date('statement_end').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    opening_balance_cents: bigint('opening_balance_cents', {
      mode: 'number',
    }).notNull(),
    closing_balance_cents: bigint('closing_balance_cents', {
      mode: 'number',
    }).notNull(),
    reconciled_by: uuid('reconciled_by'),
    reconciled_at: timestamp('reconciled_at', { withTimezone: true }),
    voided_by: uuid('voided_by'),
    voided_at: timestamp('voided_at', { withTimezone: true }),
    void_reason: text('void_reason'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_bank_statements_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    referenceIdx: uniqueIndex('ux_bank_statements_reference').on(
      table.tenant_id,
      table.cash_account_id,
      sql`lower(btrim(${table.reference_number}))`
    ),
    tenantStatusIdx: index('idx_bank_statements_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    tenantPeriodIdx: index('idx_bank_statements_tenant_period').on(
      table.tenant_id,
      table.statement_start,
      table.statement_end
    ),
    cashAccountTenantFk: foreignKey({
      name: 'bank_statements_cash_account_tenant_fk',
      columns: [table.tenant_id, table.cash_account_id],
      foreignColumns: [cashAccounts.tenant_id, cashAccounts.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'bank_statements_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reconciledByTenantFk: foreignKey({
      name: 'bank_statements_reconciled_by_tenant_fk',
      columns: [table.tenant_id, table.reconciled_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    voidedByTenantFk: foreignKey({
      name: 'bank_statements_voided_by_tenant_fk',
      columns: [table.tenant_id, table.voided_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    referenceCheck: check(
      'bank_statements_reference_nonempty',
      sql`${table.reference_number} = btrim(${table.reference_number})
        and length(${table.reference_number}) > 0`
    ),
    sourceFileCheck: check(
      'bank_statements_source_file_nonempty',
      sql`${table.source_file_name} = btrim(${table.source_file_name})
        and length(${table.source_file_name}) > 0`
    ),
    sourceHashCheck: check(
      'bank_statements_source_sha256_format',
      sql`${table.source_sha256} ~ '^[0-9a-f]{64}$'`
    ),
    dateCheck: check(
      'bank_statements_date_order',
      sql`${table.statement_start} <= ${table.statement_end}`
    ),
    currencyCheck: check(
      'bank_statements_currency_format',
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    stateCheck: check(
      'bank_statements_state',
      sql`(
          ${table.status} = 'draft'
          and ${table.reconciled_by} is null
          and ${table.reconciled_at} is null
          and ${table.voided_by} is null
          and ${table.voided_at} is null
          and ${table.void_reason} is null
        ) or (
          ${table.status} = 'reconciled'
          and ${table.reconciled_by} is not null
          and ${table.reconciled_at} is not null
          and ${table.voided_by} is null
          and ${table.voided_at} is null
          and ${table.void_reason} is null
        ) or (
          ${table.status} = 'voided'
          and ${table.reconciled_by} is not null
          and ${table.reconciled_at} is not null
          and ${table.voided_by} is not null
          and ${table.voided_at} is not null
          and length(btrim(${table.void_reason})) >= 3
        )`
    ),
  })
)

export const bankStatementLines = pgTable(
  'bank_statement_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bank_statement_id: uuid('bank_statement_id').notNull(),
    line_number: integer('line_number').notNull(),
    transaction_date: date('transaction_date').notNull(),
    reference_number: varchar('reference_number', { length: 120 }),
    description: text('description').notNull(),
    amount_cents: bigint('amount_cents', { mode: 'number' }).notNull(),
    matched_cash_transaction_id: uuid('matched_cash_transaction_id'),
    matched_by: uuid('matched_by'),
    matched_at: timestamp('matched_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statementLineIdx: uniqueIndex(
      'ux_bank_statement_lines_statement_line'
    ).on(table.bank_statement_id, table.line_number),
    fingerprintIdx: uniqueIndex('ux_bank_statement_lines_fingerprint').on(
      table.bank_statement_id,
      table.transaction_date,
      sql`coalesce(${table.reference_number}, '')`,
      table.amount_cents,
      sql`lower(btrim(${table.description}))`
    ),
    cashTransactionIdx: uniqueIndex(
      'ux_bank_statement_lines_cash_transaction'
    )
      .on(table.tenant_id, table.matched_cash_transaction_id)
      .where(sql`${table.matched_cash_transaction_id} is not null`),
    statementDateIdx: index('idx_bank_statement_lines_statement_date').on(
      table.tenant_id,
      table.bank_statement_id,
      table.transaction_date
    ),
    unmatchedIdx: index('idx_bank_statement_lines_unmatched')
      .on(table.tenant_id, table.bank_statement_id)
      .where(sql`${table.matched_cash_transaction_id} is null`),
    statementTenantFk: foreignKey({
      name: 'bank_statement_lines_statement_tenant_fk',
      columns: [table.tenant_id, table.bank_statement_id],
      foreignColumns: [bankStatements.tenant_id, bankStatements.id],
    }).onDelete('cascade'),
    cashTransactionTenantFk: foreignKey({
      name: 'bank_statement_lines_cash_transaction_tenant_fk',
      columns: [table.tenant_id, table.matched_cash_transaction_id],
      foreignColumns: [cashTransactions.tenant_id, cashTransactions.id],
    }).onDelete('restrict'),
    matchedByTenantFk: foreignKey({
      name: 'bank_statement_lines_matched_by_tenant_fk',
      columns: [table.tenant_id, table.matched_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    lineNumberCheck: check(
      'bank_statement_lines_number_positive',
      sql`${table.line_number} > 0`
    ),
    descriptionCheck: check(
      'bank_statement_lines_description_nonempty',
      sql`length(btrim(${table.description})) > 0`
    ),
    referenceCheck: check(
      'bank_statement_lines_reference_trimmed',
      sql`${table.reference_number} is null
        or (
          ${table.reference_number} = btrim(${table.reference_number})
          and length(${table.reference_number}) > 0
        )`
    ),
    amountCheck: check(
      'bank_statement_lines_amount_nonzero',
      sql`${table.amount_cents} <> 0`
    ),
    matchStateCheck: check(
      'bank_statement_lines_match_state',
      sql`(
          ${table.matched_cash_transaction_id} is null
          and ${table.matched_by} is null
          and ${table.matched_at} is null
        ) or (
          ${table.matched_cash_transaction_id} is not null
          and ${table.matched_by} is not null
          and ${table.matched_at} is not null
        )`
    ),
  })
)

export type BankStatement = typeof bankStatements.$inferSelect
export type BankStatementInsert = typeof bankStatements.$inferInsert
export type BankStatementLine = typeof bankStatementLines.$inferSelect
export type BankStatementLineInsert = typeof bankStatementLines.$inferInsert
