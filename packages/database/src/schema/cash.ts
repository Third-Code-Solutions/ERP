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
import { accounts } from './accounts'
import { journalEntries, ledgerAccounts } from './accounting'
import {
  cashAccountKindEnum,
  cashAllocationTypeEnum,
  cashTransactionDirectionEnum,
  cashTransactionStatusEnum,
} from './enums'
import { invoices } from './invoices'
import { supplierBills } from './supplier-bills'
import { tenants } from './tenants'
import { users } from './users'
import { vendors } from './vendors'

export const cashAccounts = pgTable(
  'cash_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ledger_account_id: uuid('ledger_account_id').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    account_kind: cashAccountKindEnum('account_kind').notNull(),
    bank_name: varchar('bank_name', { length: 160 }),
    account_identifier_last4: varchar('account_identifier_last4', {
      length: 4,
    }),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
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
    tenantIdUniqueIdx: uniqueIndex('ux_cash_accounts_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantLedgerIdx: uniqueIndex('ux_cash_accounts_tenant_ledger').on(
      table.tenant_id,
      table.ledger_account_id
    ),
    tenantNameIdx: uniqueIndex('ux_cash_accounts_tenant_name').on(
      table.tenant_id,
      sql`lower(btrim(${table.name}))`
    ),
    tenantActiveIdx: index('idx_cash_accounts_tenant_active').on(
      table.tenant_id,
      table.is_active
    ),
    ledgerTenantFk: foreignKey({
      name: 'cash_accounts_ledger_tenant_fk',
      columns: [table.tenant_id, table.ledger_account_id],
      foreignColumns: [ledgerAccounts.tenant_id, ledgerAccounts.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'cash_accounts_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    nameCheck: check(
      'cash_accounts_name_nonempty',
      sql`length(btrim(${table.name})) > 0`
    ),
    currencyCheck: check(
      'cash_accounts_currency_format',
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    identifierCheck: check(
      'cash_accounts_identifier_format',
      sql`${table.account_identifier_last4} is null
        or ${table.account_identifier_last4} ~ '^[A-Za-z0-9]{4}$'`
    ),
  })
)

export const cashTransactions = pgTable(
  'cash_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cash_account_id: uuid('cash_account_id').notNull(),
    direction: cashTransactionDirectionEnum('direction').notNull(),
    business_account_id: uuid('business_account_id'),
    vendor_id: uuid('vendor_id'),
    reference_number: varchar('reference_number', { length: 100 }).notNull(),
    internal_number: varchar('internal_number', { length: 40 }),
    status: cashTransactionStatusEnum('status').notNull().default('draft'),
    transaction_date: date('transaction_date').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    amount_cents: bigint('amount_cents', { mode: 'number' }).notNull(),
    notes: text('notes'),
    posting_journal_entry_id: uuid('posting_journal_entry_id'),
    posted_by: uuid('posted_by'),
    posted_at: timestamp('posted_at', { withTimezone: true }),
    reversal_journal_entry_id: uuid('reversal_journal_entry_id'),
    reversed_by: uuid('reversed_by'),
    reversed_at: timestamp('reversed_at', { withTimezone: true }),
    reversal_reason: text('reversal_reason'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_cash_transactions_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    referenceIdx: uniqueIndex('ux_cash_transactions_reference').on(
      table.tenant_id,
      table.cash_account_id,
      table.direction,
      sql`lower(btrim(${table.reference_number}))`
    ),
    internalNumberIdx: uniqueIndex('ux_cash_transactions_internal_number')
      .on(table.tenant_id, table.internal_number)
      .where(sql`${table.internal_number} is not null`),
    postingJournalIdx: uniqueIndex('ux_cash_transactions_posting_journal')
      .on(table.tenant_id, table.posting_journal_entry_id)
      .where(sql`${table.posting_journal_entry_id} is not null`),
    reversalJournalIdx: uniqueIndex('ux_cash_transactions_reversal_journal')
      .on(table.tenant_id, table.reversal_journal_entry_id)
      .where(sql`${table.reversal_journal_entry_id} is not null`),
    tenantStatusIdx: index('idx_cash_transactions_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    tenantDateIdx: index('idx_cash_transactions_tenant_date').on(
      table.tenant_id,
      table.transaction_date
    ),
    businessAccountIdx: index('idx_cash_transactions_business_account')
      .on(table.tenant_id, table.business_account_id)
      .where(sql`${table.business_account_id} is not null`),
    vendorIdx: index('idx_cash_transactions_vendor')
      .on(table.tenant_id, table.vendor_id)
      .where(sql`${table.vendor_id} is not null`),
    cashAccountTenantFk: foreignKey({
      name: 'cash_transactions_cash_account_tenant_fk',
      columns: [table.tenant_id, table.cash_account_id],
      foreignColumns: [cashAccounts.tenant_id, cashAccounts.id],
    }).onDelete('restrict'),
    businessAccountTenantFk: foreignKey({
      name: 'cash_transactions_business_account_tenant_fk',
      columns: [table.tenant_id, table.business_account_id],
      foreignColumns: [accounts.tenant_id, accounts.id],
    }).onDelete('restrict'),
    vendorTenantFk: foreignKey({
      name: 'cash_transactions_vendor_tenant_fk',
      columns: [table.tenant_id, table.vendor_id],
      foreignColumns: [vendors.tenant_id, vendors.id],
    }).onDelete('restrict'),
    postingJournalTenantFk: foreignKey({
      name: 'cash_transactions_posting_journal_tenant_fk',
      columns: [table.tenant_id, table.posting_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    reversalJournalTenantFk: foreignKey({
      name: 'cash_transactions_reversal_journal_tenant_fk',
      columns: [table.tenant_id, table.reversal_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'cash_transactions_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    postedByTenantFk: foreignKey({
      name: 'cash_transactions_posted_by_tenant_fk',
      columns: [table.tenant_id, table.posted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reversedByTenantFk: foreignKey({
      name: 'cash_transactions_reversed_by_tenant_fk',
      columns: [table.tenant_id, table.reversed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    referenceCheck: check(
      'cash_transactions_reference_nonempty',
      sql`${table.reference_number} = btrim(${table.reference_number})
        and length(${table.reference_number}) > 0`
    ),
    currencyCheck: check(
      'cash_transactions_currency_format',
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    amountCheck: check(
      'cash_transactions_amount_positive',
      sql`${table.amount_cents} > 0`
    ),
    counterpartyCheck: check(
      'cash_transactions_counterparty',
      sql`(
          ${table.direction} = 'receipt'
          and ${table.business_account_id} is not null
          and ${table.vendor_id} is null
        ) or (
          ${table.direction} = 'disbursement'
          and ${table.vendor_id} is not null
          and ${table.business_account_id} is null
        )`
    ),
  })
)

export const cashAllocations = pgTable(
  'cash_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cash_transaction_id: uuid('cash_transaction_id').notNull(),
    allocation_type: cashAllocationTypeEnum('allocation_type').notNull(),
    invoice_id: uuid('invoice_id'),
    supplier_bill_id: uuid('supplier_bill_id'),
    line_number: integer('line_number').notNull(),
    description: text('description'),
    amount_cents: bigint('amount_cents', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    transactionLineIdx: uniqueIndex(
      'ux_cash_allocations_transaction_line'
    ).on(table.cash_transaction_id, table.line_number),
    invoiceIdx: index('idx_cash_allocations_invoice')
      .on(table.tenant_id, table.invoice_id, table.allocation_type)
      .where(sql`${table.invoice_id} is not null`),
    supplierBillIdx: index('idx_cash_allocations_supplier_bill')
      .on(table.tenant_id, table.supplier_bill_id)
      .where(sql`${table.supplier_bill_id} is not null`),
    transactionTenantFk: foreignKey({
      name: 'cash_allocations_transaction_tenant_fk',
      columns: [table.tenant_id, table.cash_transaction_id],
      foreignColumns: [cashTransactions.tenant_id, cashTransactions.id],
    }).onDelete('cascade'),
    invoiceTenantFk: foreignKey({
      name: 'cash_allocations_invoice_tenant_fk',
      columns: [table.tenant_id, table.invoice_id],
      foreignColumns: [invoices.tenant_id, invoices.id],
    }).onDelete('restrict'),
    supplierBillTenantFk: foreignKey({
      name: 'cash_allocations_supplier_bill_tenant_fk',
      columns: [table.tenant_id, table.supplier_bill_id],
      foreignColumns: [supplierBills.tenant_id, supplierBills.id],
    }).onDelete('restrict'),
    lineCheck: check(
      'cash_allocations_line_positive',
      sql`${table.line_number} > 0`
    ),
    amountCheck: check(
      'cash_allocations_amount_positive',
      sql`${table.amount_cents} > 0`
    ),
    targetCheck: check(
      'cash_allocations_target',
      sql`(
          ${table.allocation_type} in (
            'customer_current_due',
            'customer_retention'
          )
          and ${table.invoice_id} is not null
          and ${table.supplier_bill_id} is null
        ) or (
          ${table.allocation_type} = 'supplier_bill'
          and ${table.supplier_bill_id} is not null
          and ${table.invoice_id} is null
        )`
    ),
  })
)

export type CashAccount = typeof cashAccounts.$inferSelect
export type CashAccountInsert = typeof cashAccounts.$inferInsert
export type CashTransaction = typeof cashTransactions.$inferSelect
export type CashTransactionInsert = typeof cashTransactions.$inferInsert
export type CashAllocation = typeof cashAllocations.$inferSelect
export type CashAllocationInsert = typeof cashAllocations.$inferInsert
