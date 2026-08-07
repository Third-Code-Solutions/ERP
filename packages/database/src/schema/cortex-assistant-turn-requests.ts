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
import { cortexAssistantTurnRequestStateEnum } from './enums'
import { tenants } from './tenants'
import { users } from './users'

/** Durable generation lease and assistant-turn replay authority. */
export const cortexAssistantTurnRequests = pgTable(
  'cortex_assistant_turn_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    completion_hash: char('completion_hash', { length: 64 }),
    state: cortexAssistantTurnRequestStateEnum('state')
      .notNull()
      .default('processing'),
    conversation_id: uuid('conversation_id').notNull(),
    user_message_id: uuid('user_message_id').notNull(),
    claim_token_hash: char('claim_token_hash', { length: 64 }),
    lease_expires_at: timestamp('lease_expires_at', { withTimezone: true }),
    assistant_message_id: uuid('assistant_message_id'),
    outcome: varchar('outcome', { length: 64 }),
    model: varchar('model', { length: 100 }),
    result: jsonb('result'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantUserFk: foreignKey({
      name: 'cortex_assistant_turn_requests_tenant_user_fk',
      columns: [table.tenant_id, table.user_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('cascade'),
    tenantConversationFk: foreignKey({
      name: 'cortex_assistant_turn_requests_tenant_conversation_fk',
      columns: [table.tenant_id, table.conversation_id],
      foreignColumns: [cortexConversations.tenant_id, cortexConversations.id],
    }).onDelete('cascade'),
    tenantUserMessageFk: foreignKey({
      name: 'cortex_assistant_turn_requests_tenant_user_message_fk',
      columns: [table.tenant_id, table.user_message_id],
      foreignColumns: [cortexMessages.tenant_id, cortexMessages.id],
    }).onDelete('cascade'),
    tenantAssistantMessageFk: foreignKey({
      name: 'cortex_assistant_turn_requests_tenant_assistant_message_fk',
      columns: [table.tenant_id, table.assistant_message_id],
      foreignColumns: [cortexMessages.tenant_id, cortexMessages.id],
    }).onDelete('cascade'),
    tenantUserKeyUniqueIdx: uniqueIndex(
      'ux_cortex_assistant_turn_requests_tenant_user_key'
    ).on(table.tenant_id, table.user_id, table.idempotency_key),
    tenantIdUniqueIdx: uniqueIndex(
      'ux_cortex_assistant_turn_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantUserMessageUniqueIdx: uniqueIndex(
      'ux_cortex_assistant_turn_requests_tenant_user_message'
    ).on(table.tenant_id, table.user_message_id),
    tenantConversationIdx: index(
      'idx_cortex_assistant_turn_requests_tenant_conversation'
    ).on(table.tenant_id, table.conversation_id, table.created_at),
    tenantAssistantMessageIdx: index(
      'idx_cortex_assistant_turn_requests_tenant_assistant_message'
    ).on(table.tenant_id, table.assistant_message_id),
    keyCheck: check(
      'cortex_assistant_turn_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    requestHashCheck: check(
      'cortex_assistant_turn_requests_request_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    completionHashCheck: check(
      'cortex_assistant_turn_requests_completion_hash_hex',
      sql`${table.completion_hash} is null
        or ${table.completion_hash} ~ '^[0-9a-f]{64}$'`
    ),
    claimTokenHashCheck: check(
      'cortex_assistant_turn_requests_claim_hash_hex',
      sql`${table.claim_token_hash} is null
        or ${table.claim_token_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'cortex_assistant_turn_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    outcomeCheck: check(
      'cortex_assistant_turn_requests_outcome_valid',
      sql`${table.outcome} is null or ${table.outcome} in (
        'model',
        'model_stream_failed_partial',
        'model_failed_grounded_fallback',
        'deterministic_grounded'
      )`
    ),
    modelCheck: check(
      'cortex_assistant_turn_requests_model_nonempty',
      sql`${table.model} is null or (
        ${table.model} = btrim(${table.model})
        and length(${table.model}) between 1 and 100
      )`
    ),
    statePayloadCheck: check(
      'cortex_assistant_turn_requests_state_payload',
      sql`(
        (${table.state} = 'processing'
          and ${table.completion_hash} is null
          and ${table.claim_token_hash} is not null
          and ${table.lease_expires_at} is not null
          and ${table.assistant_message_id} is null
          and ${table.outcome} is null
          and ${table.model} is null
          and ${table.result} is null
          and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded'
          and ${table.completion_hash} is not null
          and ${table.claim_token_hash} is null
          and ${table.lease_expires_at} is null
          and ${table.assistant_message_id} is not null
          and ${table.outcome} is not null
          and ${table.model} is not null
          and ${table.result} is not null
          and ${table.completed_at} is not null)
      )`
    ),
    leaseAfterCreatedCheck: check(
      'cortex_assistant_turn_requests_lease_after_created',
      sql`${table.lease_expires_at} is null
        or ${table.lease_expires_at} > ${table.created_at}`
    ),
    completedAfterCreatedCheck: check(
      'cortex_assistant_turn_requests_completed_after_created',
      sql`${table.completed_at} is null
        or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type CortexAssistantTurnRequest =
  typeof cortexAssistantTurnRequests.$inferSelect
export type CortexAssistantTurnRequestInsert =
  typeof cortexAssistantTurnRequests.$inferInsert
