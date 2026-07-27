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
import { journalEntries, ledgerAccounts } from './accounting'
import { supplierBillStatusEnum } from './enums'
import { projects } from './projects'
import { costCodes } from './budgets'
import { stockReceiptLines } from './inventory'
import { poLineItems } from './po-line-items'
import { purchaseOrders } from './purchase-orders'
import { tenants } from './tenants'
import { users } from './users'
import { vendors } from './vendors'

export const supplierBills = pgTable(
  'supplier_bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    purchase_order_id: uuid('purchase_order_id').notNull(),
    project_id: uuid('project_id').notNull(),
    vendor_id: uuid('vendor_id').notNull(),
    vendor_bill_number: varchar('vendor_bill_number', { length: 80 }).notNull(),
    internal_number: varchar('internal_number', { length: 40 }),
    status: supplierBillStatusEnum('status').notNull().default('draft'),
    bill_date: date('bill_date').notNull(),
    due_date: date('due_date'),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    subtotal_cents: bigint('subtotal_cents', { mode: 'number' }).notNull(),
    input_vat_cents: bigint('input_vat_cents', { mode: 'number' })
      .notNull()
      .default(0),
    withholding_tax_cents: bigint('withholding_tax_cents', { mode: 'number' })
      .notNull()
      .default(0),
    total_payable_cents: bigint('total_payable_cents', {
      mode: 'number',
    }).notNull(),
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
    tenantIdUniqueIdx: uniqueIndex('ux_supplier_bills_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    vendorNumberIdx: uniqueIndex('ux_supplier_bills_vendor_number').on(
      table.tenant_id,
      table.vendor_id,
      sql`lower(btrim(${table.vendor_bill_number}))`
    ),
    internalNumberIdx: uniqueIndex(
      'ux_supplier_bills_tenant_internal_number'
    )
      .on(table.tenant_id, table.internal_number)
      .where(sql`${table.internal_number} is not null`),
    postingJournalIdx: uniqueIndex('ux_supplier_bills_posting_journal')
      .on(table.tenant_id, table.posting_journal_entry_id)
      .where(sql`${table.posting_journal_entry_id} is not null`),
    reversalJournalIdx: uniqueIndex('ux_supplier_bills_reversal_journal')
      .on(table.tenant_id, table.reversal_journal_entry_id)
      .where(sql`${table.reversal_journal_entry_id} is not null`),
    tenantStatusIdx: index('idx_supplier_bills_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    tenantDueIdx: index('idx_supplier_bills_tenant_due').on(
      table.tenant_id,
      table.due_date
    ),
    purchaseOrderIdx: index('idx_supplier_bills_purchase_order').on(
      table.tenant_id,
      table.purchase_order_id
    ),
    purchaseOrderTenantFk: foreignKey({
      name: 'supplier_bills_po_tenant_fk',
      columns: [table.tenant_id, table.purchase_order_id],
      foreignColumns: [purchaseOrders.tenant_id, purchaseOrders.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'supplier_bills_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    vendorTenantFk: foreignKey({
      name: 'supplier_bills_vendor_tenant_fk',
      columns: [table.tenant_id, table.vendor_id],
      foreignColumns: [vendors.tenant_id, vendors.id],
    }).onDelete('restrict'),
    postingJournalTenantFk: foreignKey({
      name: 'supplier_bills_posting_journal_tenant_fk',
      columns: [table.tenant_id, table.posting_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    reversalJournalTenantFk: foreignKey({
      name: 'supplier_bills_reversal_journal_tenant_fk',
      columns: [table.tenant_id, table.reversal_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'supplier_bills_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    postedByTenantFk: foreignKey({
      name: 'supplier_bills_posted_by_tenant_fk',
      columns: [table.tenant_id, table.posted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reversedByTenantFk: foreignKey({
      name: 'supplier_bills_reversed_by_tenant_fk',
      columns: [table.tenant_id, table.reversed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    vendorBillNumberCheck: check(
      'supplier_bills_number_nonempty',
      sql`${table.vendor_bill_number} = btrim(${table.vendor_bill_number})
        and length(${table.vendor_bill_number}) > 0`
    ),
    currencyCheck: check(
      'supplier_bills_currency_format',
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    dueDateCheck: check(
      'supplier_bills_due_date_valid',
      sql`${table.due_date} is null or ${table.due_date} >= ${table.bill_date}`
    ),
    amountsCheck: check(
      'supplier_bills_amounts_consistent',
      sql`${table.subtotal_cents} > 0
        and ${table.input_vat_cents} >= 0
        and ${table.withholding_tax_cents} >= 0
        and ${table.total_payable_cents} =
          ${table.subtotal_cents}
          + ${table.input_vat_cents}
          - ${table.withholding_tax_cents}
        and ${table.total_payable_cents} > 0`
    ),
  })
)

export const supplierBillLines = pgTable(
  'supplier_bill_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    supplier_bill_id: uuid('supplier_bill_id').notNull(),
    ledger_account_id: uuid('ledger_account_id').notNull(),
    project_id: uuid('project_id').notNull(),
    po_line_item_id: uuid('po_line_item_id'),
    cost_code_id: uuid('cost_code_id'),
    stock_receipt_line_id: uuid('stock_receipt_line_id'),
    quantity_micros: bigint('quantity_micros', { mode: 'number' }),
    line_number: integer('line_number').notNull(),
    description: text('description').notNull(),
    amount_cents: bigint('amount_cents', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    billLineIdx: uniqueIndex('ux_supplier_bill_lines_bill_line').on(
      table.supplier_bill_id,
      table.line_number
    ),
    tenantAccountIdx: index('idx_supplier_bill_lines_tenant_account').on(
      table.tenant_id,
      table.ledger_account_id
    ),
    tenantProjectIdx: index('idx_supplier_bill_lines_tenant_project').on(
      table.tenant_id,
      table.project_id
    ),
    poLineIdx: index('idx_supplier_bill_lines_po_line').on(
      table.tenant_id,
      table.po_line_item_id
    ),
    costCodeIdx: index('idx_supplier_bill_lines_cost_code').on(
      table.tenant_id,
      table.cost_code_id
    ),
    receiptLineIdx: index('idx_supplier_bill_lines_receipt_line')
      .on(table.tenant_id, table.stock_receipt_line_id)
      .where(sql`${table.stock_receipt_line_id} is not null`),
    billTenantFk: foreignKey({
      name: 'supplier_bill_lines_bill_tenant_fk',
      columns: [table.tenant_id, table.supplier_bill_id],
      foreignColumns: [supplierBills.tenant_id, supplierBills.id],
    }).onDelete('cascade'),
    accountTenantFk: foreignKey({
      name: 'supplier_bill_lines_account_tenant_fk',
      columns: [table.tenant_id, table.ledger_account_id],
      foreignColumns: [ledgerAccounts.tenant_id, ledgerAccounts.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'supplier_bill_lines_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    poLineTenantFk: foreignKey({
      name: 'supplier_bill_lines_po_line_tenant_fk',
      columns: [table.tenant_id, table.po_line_item_id],
      foreignColumns: [poLineItems.tenant_id, poLineItems.id],
    }).onDelete('restrict'),
    costCodeTenantFk: foreignKey({
      name: 'supplier_bill_lines_cost_code_tenant_fk',
      columns: [table.tenant_id, table.cost_code_id],
      foreignColumns: [costCodes.tenant_id, costCodes.id],
    }).onDelete('restrict'),
    receiptLineTenantFk: foreignKey({
      name: 'supplier_bill_lines_receipt_line_tenant_fk',
      columns: [table.tenant_id, table.stock_receipt_line_id],
      foreignColumns: [stockReceiptLines.tenant_id, stockReceiptLines.id],
    }).onDelete('restrict'),
    descriptionCheck: check(
      'supplier_bill_lines_description_nonempty',
      sql`length(btrim(${table.description})) > 0`
    ),
    lineNumberCheck: check(
      'supplier_bill_lines_number_positive',
      sql`${table.line_number} > 0`
    ),
    amountCheck: check(
      'supplier_bill_lines_amount_positive',
      sql`${table.amount_cents} > 0`
    ),
    receiptMatchCheck: check(
      'supplier_bill_lines_receipt_match_complete',
      sql`(
        ${table.stock_receipt_line_id} is null
        and ${table.quantity_micros} is null
      ) or (
        ${table.stock_receipt_line_id} is not null
        and ${table.quantity_micros} > 0
      )`
    ),
  })
)

export type SupplierBill = typeof supplierBills.$inferSelect
export type SupplierBillInsert = typeof supplierBills.$inferInsert
export type SupplierBillLine = typeof supplierBillLines.$inferSelect
export type SupplierBillLineInsert = typeof supplierBillLines.$inferInsert
