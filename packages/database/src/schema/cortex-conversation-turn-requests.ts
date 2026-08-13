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
import { cortexConversations, cortexMessages } from './cortex-chat'
import { cortexConversationTurnRequestStateEnum } from './enums'
import { tenants } from './tenants'
import { users } from './users'

/** Service-only replay ledger for tenant- and user-scoped Cortex user turns. */
export const cortexConversationTurnRequests = pgTable(
  'cortex_conversation_turn_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: cortexConversationTurnRequestStateEnum('state')
      .notNull()
      .default('processing'),
    conversation_id: uuid('conversation_id'),
    message_id: uuid('message_id'),
    result: jsonb('result'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantUserFk: foreignKey({
      name: 'cortex_conversation_turn_requests_tenant_user_fk',
      columns: [table.tenant_id, table.user_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('cascade'),
    tenantConversationFk: foreignKey({
      name: 'cortex_conversation_turn_requests_tenant_conversation_fk',
      columns: [table.tenant_id, table.conversation_id],
      foreignColumns: [cortexConversations.tenant_id, cortexConversations.id],
    }).onDelete('cascade'),
    tenantMessageFk: foreignKey({
      name: 'cortex_conversation_turn_requests_tenant_message_fk',
      columns: [table.tenant_id, table.message_id],
      foreignColumns: [cortexMessages.tenant_id, cortexMessages.id],
    }).onDelete('cascade'),
    tenantIdUniqueIdx: uniqueIndex(
      'ux_cortex_conversation_turn_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantUserKeyUniqueIdx: uniqueIndex(
      'ux_cortex_conversation_turn_requests_tenant_user_key'
    ).on(table.tenant_id, table.user_id, table.idempotency_key),
    tenantConversationIdx: index(
      'idx_cortex_conversation_turn_requests_tenant_conversation'
    ).on(table.tenant_id, table.conversation_id, table.created_at),
    keyCheck: check(
      'cortex_conversation_turn_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'cortex_conversation_turn_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'cortex_conversation_turn_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'cortex_conversation_turn_requests_state_payload',
      sql`(
        (${table.state} = 'processing'
          and ${table.conversation_id} is null
          and ${table.message_id} is null
          and ${table.result} is null
          and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded'
          and ${table.conversation_id} is not null
          and ${table.message_id} is not null
          and ${table.result} is not null
          and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreatedCheck: check(
      'cortex_conversation_turn_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type CortexConversationTurnRequest =
  typeof cortexConversationTurnRequests.$inferSelect
export type CortexConversationTurnRequestInsert =
  typeof cortexConversationTurnRequests.$inferInsert
