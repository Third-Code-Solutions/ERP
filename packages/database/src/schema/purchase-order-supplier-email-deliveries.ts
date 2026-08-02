import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { notificationDeliveryStatusEnum, notificationOutbox } from './notifications'
import { purchaseOrders } from './purchase-orders'
import { tenants } from './tenants'
import { users } from './users'

export const purchaseOrderSupplierEmailDeliveries = pgTable(
  'purchase_order_supplier_email_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    outbox_id: uuid('outbox_id').notNull(),
    purchase_order_id: uuid('purchase_order_id').notNull(),
    created_by: uuid('created_by').notNull(),
    recipient_email: varchar('recipient_email', { length: 255 }).notNull(),
    supplier_name: varchar('supplier_name', { length: 255 }).notNull(),
    po_number: varchar('po_number', { length: 50 }).notNull(),
    project_name: varchar('project_name', { length: 255 }).notNull(),
    total_cents: bigint('total_cents', { mode: 'number' }).notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    status: notificationDeliveryStatusEnum('status')
      .notNull()
      .default('pending'),
    attempt_count: bigint('attempt_count', { mode: 'number' })
      .notNull()
      .default(0),
    provider_message_id: varchar('provider_message_id', { length: 255 }),
    last_error: varchar('last_error', { length: 1_000 }),
    processing_started_at: timestamp('processing_started_at', {
      withTimezone: true,
    }),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    dead_lettered_at: timestamp('dead_lettered_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_purchase_order_supplier_email_deliveries_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantOutboxUniqueIdx: uniqueIndex(
      'ux_purchase_order_supplier_email_deliveries_tenant_outbox'
    ).on(table.tenant_id, table.outbox_id),
    tenantIdempotencyUniqueIdx: uniqueIndex(
      'ux_purchase_order_supplier_email_deliveries_tenant_idempotency'
    ).on(table.tenant_id, table.idempotency_key),
    statusIdx: index(
      'idx_purchase_order_supplier_email_deliveries_tenant_status'
    ).on(table.tenant_id, table.status, table.updated_at),
    outboxTenantFk: foreignKey({
      name: 'purchase_order_supplier_email_deliveries_outbox_tenant_fk',
      columns: [table.tenant_id, table.outbox_id],
      foreignColumns: [notificationOutbox.tenant_id, notificationOutbox.id],
    }).onDelete('cascade'),
    purchaseOrderTenantFk: foreignKey({
      name: 'purchase_order_supplier_email_deliveries_purchase_order_tenant_fk',
      columns: [table.tenant_id, table.purchase_order_id],
      foreignColumns: [purchaseOrders.tenant_id, purchaseOrders.id],
    }).onDelete('cascade'),
    createdByTenantFk: foreignKey({
      name: 'purchase_order_supplier_email_deliveries_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    recipientEmailCheck: check(
      'purchase_order_supplier_email_deliveries_recipient_email',
      sql`${table.recipient_email} = btrim(${table.recipient_email})
        and length(${table.recipient_email}) between 3 and 255
        and position('@' in ${table.recipient_email}) > 1`
    ),
    totalCentsCheck: check(
      'purchase_order_supplier_email_deliveries_total_cents_nonnegative',
      sql`${table.total_cents} >= 0`
    ),
    attemptCountCheck: check(
      'purchase_order_supplier_email_deliveries_attempt_count_nonnegative',
      sql`${table.attempt_count} >= 0`
    ),
    stateTimestampsCheck: check(
      'purchase_order_supplier_email_deliveries_state_timestamps',
      sql`(
        (${table.status} = 'pending'
          and ${table.delivered_at} is null
          and ${table.dead_lettered_at} is null)
        or
        (${table.status} = 'processing'
          and ${table.processing_started_at} is not null
          and ${table.delivered_at} is null
          and ${table.dead_lettered_at} is null)
        or
        (${table.status} = 'delivered'
          and ${table.delivered_at} is not null
          and ${table.dead_lettered_at} is null)
        or
        (${table.status} = 'dead_letter'
          and ${table.dead_lettered_at} is not null
          and ${table.delivered_at} is null)
      )`
    ),
  })
)

export type PurchaseOrderSupplierEmailDelivery =
  typeof purchaseOrderSupplierEmailDeliveries.$inferSelect
export type PurchaseOrderSupplierEmailDeliveryInsert =
  typeof purchaseOrderSupplierEmailDeliveries.$inferInsert
