import { pgTable, uuid, varchar, text, bigint, integer, timestamp, index } from 'drizzle-orm/pg-core'
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
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_invoices_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_invoices_project_id').on(table.project_id),
    tenantStatusIdx: index('idx_invoices_tenant_status').on(table.tenant_id, table.status),
    invoiceNumberIdx: index('idx_invoices_invoice_number').on(table.tenant_id, table.invoice_number),
    dueDateIdx: index('idx_invoices_due_date').on(table.tenant_id, table.due_date),
  })
)

export type Invoice = typeof invoices.$inferSelect
export type InvoiceInsert = typeof invoices.$inferInsert
