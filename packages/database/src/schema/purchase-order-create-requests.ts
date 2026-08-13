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
import { purchaseOrderCreateRequestStateEnum } from './enums'
import { purchaseOrders } from './purchase-orders'
import { tenants } from './tenants'
import { users } from './users'

export const purchaseOrderCreateRequests = pgTable(
  'purchase_order_create_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: purchaseOrderCreateRequestStateEnum('state')
      .notNull()
      .default('processing'),
    purchase_order_id: uuid('purchase_order_id'),
    result: jsonb('result'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_purchase_order_create_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_purchase_order_create_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantStateIdx: index(
      'idx_purchase_order_create_requests_tenant_state'
    ).on(table.tenant_id, table.state, table.created_at),
    purchaseOrderTenantFk: foreignKey({
      name: 'purchase_order_create_requests_purchase_order_tenant_fk',
      columns: [table.tenant_id, table.purchase_order_id],
      foreignColumns: [purchaseOrders.tenant_id, purchaseOrders.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'purchase_order_create_requests_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    keyCheck: check(
      'purchase_order_create_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'purchase_order_create_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'purchase_order_create_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'purchase_order_create_requests_state_payload',
      sql`(
        (${table.state} = 'processing'
          and ${table.purchase_order_id} is null
          and ${table.result} is null
          and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded'
          and ${table.purchase_order_id} is not null
          and ${table.result} is not null
          and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreatedCheck: check(
      'purchase_order_create_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type PurchaseOrderCreateRequest =
  typeof purchaseOrderCreateRequests.$inferSelect
export type PurchaseOrderCreateRequestInsert =
  typeof purchaseOrderCreateRequests.$inferInsert
