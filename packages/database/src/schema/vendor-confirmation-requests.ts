import { sql } from 'drizzle-orm'
import {
  char,
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
import { tenants } from './tenants'
import { purchaseOrders } from './purchase-orders'
import { vendorConfirmationRequestStateEnum } from './enums'
import { vendorConfirmationSessions } from './vendor-confirmation-sessions'

/** Durable replay evidence for unauthenticated supplier responses. */
export const vendorConfirmationRequests = pgTable(
  'vendor_confirmation_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    vendor_confirmation_session_id: uuid(
      'vendor_confirmation_session_id'
    ).notNull(),
    purchase_order_id: uuid('purchase_order_id').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: vendorConfirmationRequestStateEnum('state')
      .notNull()
      .default('processing'),
    result: jsonb('result'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_vendor_confirmation_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_vendor_confirmation_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantSessionIdx: index('idx_vendor_confirmation_requests_tenant_session').on(
      table.tenant_id,
      table.vendor_confirmation_session_id
    ),
    tenantStateIdx: index('idx_vendor_confirmation_requests_tenant_state').on(
      table.tenant_id,
      table.state,
      table.created_at
    ),
    sessionTenantFk: foreignKey({
      name: 'vendor_confirmation_requests_session_tenant_fk',
      columns: [table.tenant_id, table.vendor_confirmation_session_id],
      foreignColumns: [
        vendorConfirmationSessions.tenant_id,
        vendorConfirmationSessions.id,
      ],
    }).onDelete('cascade'),
    purchaseOrderTenantFk: foreignKey({
      name: 'vendor_confirmation_requests_purchase_order_tenant_fk',
      columns: [table.tenant_id, table.purchase_order_id],
      foreignColumns: [purchaseOrders.tenant_id, purchaseOrders.id],
    }).onDelete('cascade'),
    keyCheck: check(
      'vendor_confirmation_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'vendor_confirmation_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'vendor_confirmation_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'vendor_confirmation_requests_state_payload',
      sql`(
        (${table.state} = 'processing'
          and ${table.result} is null
          and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded'
          and ${table.result} is not null
          and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreatedCheck: check(
      'vendor_confirmation_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type VendorConfirmationRequest =
  typeof vendorConfirmationRequests.$inferSelect
export type VendorConfirmationRequestInsert =
  typeof vendorConfirmationRequests.$inferInsert
