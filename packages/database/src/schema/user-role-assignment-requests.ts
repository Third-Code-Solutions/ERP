import { sql } from 'drizzle-orm'
import {
  char,
  check,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { userRoleAssignmentRequestStateEnum } from './enums'
import { tenants } from './tenants'

/** Server-only replay ledger for tenant-scoped user role assignment. */
export const userRoleAssignmentRequests = pgTable(
  'user_role_assignment_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: userRoleAssignmentRequestStateEnum('state')
      .notNull()
      .default('processing'),
    target_user_id: uuid('target_user_id').notNull(),
    result: jsonb('result'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_user_role_assignment_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_user_role_assignment_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantTargetIdx: index(
      'idx_user_role_assignment_requests_tenant_target'
    ).on(table.tenant_id, table.target_user_id, table.created_at),
    keyCheck: check(
      'user_role_assignment_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'user_role_assignment_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'user_role_assignment_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'user_role_assignment_requests_state_payload',
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
      'user_role_assignment_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type UserRoleAssignmentRequest =
  typeof userRoleAssignmentRequests.$inferSelect
export type UserRoleAssignmentRequestInsert =
  typeof userRoleAssignmentRequests.$inferInsert
