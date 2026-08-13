import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { purchaseOrders } from './purchase-orders'
import { tenants } from './tenants'
import { users } from './users'
import { vendors } from './vendors'
import { purchaseOrderWorkflowRequests } from './purchase-order-workflow-requests'
import { vendorConfirmationStateEnum } from './enums'

/** Single-purpose, hashed-token supplier response sessions. */
export const vendorConfirmationSessions = pgTable(
  'vendor_confirmation_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    purchase_order_id: uuid('purchase_order_id').notNull(),
    vendor_id: uuid('vendor_id').notNull(),
    source_workflow_request_id: uuid('source_workflow_request_id'),
    token_hash: varchar('token_hash', { length: 64 }).notNull(),
    state: vendorConfirmationStateEnum('state').notNull().default('pending'),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    responder_name: varchar('responder_name', { length: 255 }),
    responder_email: varchar('responder_email', { length: 255 }),
    response_note: varchar('response_note', { length: 2_000 }),
    responder_ip: varchar('responder_ip', { length: 45 }),
    responder_user_agent: varchar('responder_user_agent', { length: 1_000 }),
    responded_at: timestamp('responded_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_vendor_confirmation_sessions_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tokenHashUq: uniqueIndex('ux_vendor_confirmation_sessions_token_hash').on(
      table.token_hash
    ),
    tenantPoIdx: index('idx_vendor_confirmation_sessions_tenant_po').on(
      table.tenant_id,
      table.purchase_order_id
    ),
    pendingPurchaseOrderUniqueIdx: uniqueIndex(
      'ux_vendor_confirmation_sessions_pending_tenant_po'
    )
      .on(table.tenant_id, table.purchase_order_id)
      .where(sql`${table.state} = 'pending'`),
    sourceWorkflowRequestUniqueIdx: uniqueIndex(
      'ux_vendor_confirmation_sessions_tenant_source_request'
    ).on(table.tenant_id, table.source_workflow_request_id),
    tenantStateIdx: index('idx_vendor_confirmation_sessions_tenant_state').on(
      table.tenant_id,
      table.state,
      table.expires_at
    ),
    purchaseOrderTenantFk: foreignKey({
      name: 'vendor_confirmation_sessions_purchase_order_tenant_fk',
      columns: [table.tenant_id, table.purchase_order_id],
      foreignColumns: [purchaseOrders.tenant_id, purchaseOrders.id],
    }).onDelete('cascade'),
    vendorTenantFk: foreignKey({
      name: 'vendor_confirmation_sessions_vendor_tenant_fk',
      columns: [table.tenant_id, table.vendor_id],
      foreignColumns: [vendors.tenant_id, vendors.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'vendor_confirmation_sessions_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    sourceWorkflowRequestTenantFk: foreignKey({
      name: 'vendor_confirmation_sessions_source_workflow_request_tenant_fk',
      columns: [table.tenant_id, table.source_workflow_request_id],
      foreignColumns: [
        purchaseOrderWorkflowRequests.tenant_id,
        purchaseOrderWorkflowRequests.id,
      ],
    }).onDelete('restrict'),
    tokenHashCheck: check(
      'vendor_confirmation_sessions_token_hash_hex',
      sql`${table.token_hash} ~ '^[0-9a-f]{64}$'`
    ),
    stateResponseCheck: check(
      'vendor_confirmation_sessions_state_response',
      sql`(
        (${table.state} = 'pending'
          and ${table.responded_at} is null
          and ${table.responder_name} is null
          and ${table.response_note} is null)
        or
        (${table.state} in ('accepted', 'declined', 'changes_requested')
          and ${table.responded_at} is not null
          and ${table.responder_name} is not null
          and length(btrim(${table.responder_name})) > 0)
      )`
    ),
    decisionNoteCheck: check(
      'vendor_confirmation_sessions_decision_note',
      sql`(
        ${table.state} = 'pending'
        or ${table.state} = 'accepted'
        or (
          ${table.state} in ('declined', 'changes_requested')
          and ${table.response_note} is not null
          and length(btrim(${table.response_note})) > 0
        )
      )`
    ),
    responderEmailCheck: check(
      'vendor_confirmation_sessions_responder_email',
      sql`${table.responder_email} is null or (
        ${table.responder_email} = btrim(${table.responder_email})
        and length(${table.responder_email}) between 3 and 255
        and position('@' in ${table.responder_email}) > 1
      )`
    ),
    expiryCheck: check(
      'vendor_confirmation_sessions_expiry_after_created',
      sql`${table.expires_at} > ${table.created_at}`
    ),
  })
)

export type VendorConfirmationSession =
  typeof vendorConfirmationSessions.$inferSelect
export type VendorConfirmationSessionInsert =
  typeof vendorConfirmationSessions.$inferInsert
