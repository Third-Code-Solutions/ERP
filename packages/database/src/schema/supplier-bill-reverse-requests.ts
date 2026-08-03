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
import { supplierBillReverseRequestStateEnum } from './enums'
import { supplierBills } from './supplier-bills'
import { tenants } from './tenants'
import { users } from './users'

export const supplierBillReverseRequests = pgTable(
  'supplier_bill_reverse_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    supplier_bill_id: uuid('supplier_bill_id').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: supplierBillReverseRequestStateEnum('state')
      .notNull()
      .default('processing'),
    result: jsonb('result'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_supplier_bill_reverse_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_supplier_bill_reverse_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantStateIdx: index(
      'idx_supplier_bill_reverse_requests_tenant_state'
    ).on(table.tenant_id, table.state, table.created_at),
    billTenantFk: foreignKey({
      name: 'supplier_bill_reverse_requests_bill_tenant_fk',
      columns: [table.tenant_id, table.supplier_bill_id],
      foreignColumns: [supplierBills.tenant_id, supplierBills.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'supplier_bill_reverse_requests_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    keyCheck: check(
      'supplier_bill_reverse_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'supplier_bill_reverse_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'supplier_bill_reverse_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'supplier_bill_reverse_requests_state_payload',
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
      'supplier_bill_reverse_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type SupplierBillReverseRequest =
  typeof supplierBillReverseRequests.$inferSelect
export type SupplierBillReverseRequestInsert =
  typeof supplierBillReverseRequests.$inferInsert
