import { sql } from 'drizzle-orm'
import {
  bigint,
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
import { journalEntries } from './accounting'
import { invoiceStatusEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    account_id: uuid('account_id'),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    invoice_number: varchar('invoice_number', { length: 50 }).notNull(),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    // Philippine billing fields
    // Progress billing % (basis points: 0-10000 = 0%-100%)
    billing_percent_bps: integer('billing_percent_bps').notNull().default(0),
    // 10% retention (standard Philippine construction billing)
    retention_bps: integer('retention_bps').notNull().default(1000),
    // All monetary values in PHP centavos
    subtotal_cents: bigint('subtotal_cents', { mode: 'number' }).notNull().default(0),
    retention_cents: bigint('retention_cents', { mode: 'number' }).notNull().default(0),
    // 12% VAT
    vat_cents: bigint('vat_cents', { mode: 'number' }).notNull().default(0),
    // 2% withholding tax (BIR 2307)
    withholding_tax_cents: bigint('withholding_tax_cents', { mode: 'number' }).notNull().default(0),
    net_amount_cents: bigint('net_amount_cents', { mode: 'number' }).notNull().default(0),
    due_date: timestamp('due_date', { withTimezone: true }),
    paid_at: timestamp('paid_at', { withTimezone: true }),
    issued_by: uuid('issued_by'),
    issued_at: timestamp('issued_at', { withTimezone: true }),
    issuance_journal_entry_id: uuid('issuance_journal_entry_id'),
    reversed_by: uuid('reversed_by'),
    reversed_at: timestamp('reversed_at', { withTimezone: true }),
    reversal_reason: text('reversal_reason'),
    reversal_journal_entry_id: uuid('reversal_journal_entry_id'),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_invoices_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantIdx: index('idx_invoices_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_invoices_project_id').on(table.project_id),
    tenantStatusIdx: index('idx_invoices_tenant_status').on(table.tenant_id, table.status),
    invoiceNumberIdx: index('idx_invoices_invoice_number').on(table.tenant_id, table.invoice_number),
    dueDateIdx: index('idx_invoices_due_date').on(table.tenant_id, table.due_date),
    tenantAccountIdx: index('idx_invoices_tenant_account')
      .on(table.tenant_id, table.account_id)
      .where(sql`${table.account_id} is not null`),
    issuanceJournalIdx: uniqueIndex('ux_invoices_tenant_issuance_journal')
      .on(table.tenant_id, table.issuance_journal_entry_id)
      .where(sql`${table.issuance_journal_entry_id} is not null`),
    reversalJournalIdx: uniqueIndex('ux_invoices_tenant_reversal_journal')
      .on(table.tenant_id, table.reversal_journal_entry_id)
      .where(sql`${table.reversal_journal_entry_id} is not null`),
    projectTenantFk: foreignKey({
      name: 'invoices_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    accountTenantFk: foreignKey({
      name: 'invoices_account_tenant_fk',
      columns: [table.tenant_id, table.account_id],
      foreignColumns: [accounts.tenant_id, accounts.id],
    }).onDelete('restrict'),
    issuedByTenantFk: foreignKey({
      name: 'invoices_issued_by_tenant_fk',
      columns: [table.tenant_id, table.issued_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    issuanceJournalTenantFk: foreignKey({
      name: 'invoices_issuance_journal_tenant_fk',
      columns: [table.tenant_id, table.issuance_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    reversedByTenantFk: foreignKey({
      name: 'invoices_reversed_by_tenant_fk',
      columns: [table.tenant_id, table.reversed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reversalJournalTenantFk: foreignKey({
      name: 'invoices_reversal_journal_tenant_fk',
      columns: [table.tenant_id, table.reversal_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
  })
)

export type Invoice = typeof invoices.$inferSelect
export type InvoiceInsert = typeof invoices.$inferInsert
