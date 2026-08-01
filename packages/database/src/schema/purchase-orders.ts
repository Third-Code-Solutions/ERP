import {
  pgTable,
  uuid,
  varchar,
  text,
  bigint,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { purchaseOrderStatusEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { vendors } from './vendors'
import { users } from './users'

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    vendor_id: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    po_number: varchar('po_number', { length: 50 }).notNull(),
    status: purchaseOrderStatusEnum('status').notNull().default('draft'),
    // All monetary values in PHP centavos
    subtotal_cents: bigint('subtotal_cents', { mode: 'number' }).notNull().default(0),
    // 12% VAT
    vat_cents: bigint('vat_cents', { mode: 'number' }).notNull().default(0),
    // 2% withholding tax
    withholding_tax_cents: bigint('withholding_tax_cents', { mode: 'number' }).notNull().default(0),
    total_cents: bigint('total_cents', { mode: 'number' }).notNull().default(0),
    delivery_date: timestamp('delivery_date', { withTimezone: true }),
    notes: text('notes'),
    // Current 3-step approval stamps (REFACTOR.md US-Pre-003)
    pm_approved_at: timestamp('pm_approved_at', { withTimezone: true }),
    pm_approved_by: uuid('pm_approved_by').references(() => users.id, { onDelete: 'set null' }),
    commercial_approved_at: timestamp('commercial_approved_at', { withTimezone: true }),
    commercial_approved_by: uuid('commercial_approved_by').references(() => users.id, { onDelete: 'set null' }),
    scm_issued_at: timestamp('scm_issued_at', { withTimezone: true }),
    scm_issued_by: uuid('scm_issued_by').references(() => users.id, { onDelete: 'set null' }),
    supplier_email_sent_at: timestamp('supplier_email_sent_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_purchase_orders_tenant_id').on(table.tenant_id),
    tenantIdUniqueIdx: uniqueIndex(
      'ux_purchase_orders_tenant_id_id'
    ).on(table.tenant_id, table.id),
    projectIdx: index('idx_purchase_orders_project_id').on(table.project_id),
    vendorIdx: index('idx_purchase_orders_vendor_id').on(table.vendor_id),
    tenantStatusIdx: index('idx_purchase_orders_tenant_status').on(table.tenant_id, table.status),
    poNumberIdx: index('idx_purchase_orders_po_number').on(table.tenant_id, table.po_number),
    poNumberUniqueIdx: uniqueIndex('ux_purchase_orders_tenant_po_number').on(
      table.tenant_id,
      table.po_number
    ),
  })
)

export type PurchaseOrder = typeof purchaseOrders.$inferSelect
export type PurchaseOrderInsert = typeof purchaseOrders.$inferInsert
