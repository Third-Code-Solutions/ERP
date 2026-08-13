import { sql } from 'drizzle-orm'
import {
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { cortexAssistantTurnRequests } from './cortex-assistant-turn-requests'
import { tenants } from './tenants'
import { users } from './users'

/** PostgreSQL authority for retryable, cancelable assistant generation jobs. */
export const cortexAssistantGenerationJobs = pgTable(
  'cortex_assistant_generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull(),
    request_id: uuid('request_id').notNull(),
    claim_token_hash: char('claim_token_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    attempt_count: integer('attempt_count').notNull().default(0),
    failure_code: varchar('failure_code', { length: 100 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_cortex_assistant_generation_jobs_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantRequestUniqueIdx: uniqueIndex(
      'ux_cortex_assistant_generation_jobs_tenant_request'
    ).on(table.tenant_id, table.request_id),
    tenantStatusIdx: index(
      'idx_cortex_assistant_generation_jobs_tenant_status'
    ).on(table.tenant_id, table.status, table.updated_at),
    tenantUserFk: foreignKey({
      name: 'cortex_assistant_generation_jobs_tenant_user_fk',
      columns: [table.tenant_id, table.user_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('cascade'),
    tenantRequestFk: foreignKey({
      name: 'cortex_assistant_generation_jobs_tenant_request_fk',
      columns: [table.tenant_id, table.request_id],
      foreignColumns: [
        cortexAssistantTurnRequests.tenant_id,
        cortexAssistantTurnRequests.id,
      ],
    }).onDelete('cascade'),
    claimHashCheck: check(
      'cortex_assistant_generation_jobs_claim_hash_hex',
      sql`${table.claim_token_hash} ~ '^[0-9a-f]{64}$'`
    ),
    statusCheck: check(
      'cortex_assistant_generation_jobs_status_allowed',
      sql`${table.status} in (
        'queued', 'processing', 'succeeded', 'failed', 'cancelled'
      )`
    ),
    attemptCheck: check(
      'cortex_assistant_generation_jobs_attempt_bounds',
      sql`${table.attempt_count} between 0 and 3`
    ),
    failureCodeCheck: check(
      'cortex_assistant_generation_jobs_failure_code_bounded',
      sql`${table.failure_code} is null or (
        ${table.failure_code} = btrim(${table.failure_code})
        and length(${table.failure_code}) between 1 and 100
      )`
    ),
    statePayloadCheck: check(
      'cortex_assistant_generation_jobs_state_payload',
      sql`(
        (${table.status} in ('queued', 'processing')
          and ${table.completed_at} is null
          and ${table.failure_code} is null)
        or
        (${table.status} = 'succeeded'
          and ${table.completed_at} is not null
          and ${table.failure_code} is null)
        or
        (${table.status} in ('failed', 'cancelled')
          and ${table.completed_at} is not null
          and ${table.failure_code} is not null)
      )`
    ),
    updatedAfterCreatedCheck: check(
      'cortex_assistant_generation_jobs_updated_after_created',
      sql`${table.updated_at} >= ${table.created_at}`
    ),
    completedAfterCreatedCheck: check(
      'cortex_assistant_generation_jobs_completed_after_created',
      sql`${table.completed_at} is null
        or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type CortexAssistantGenerationJob =
  typeof cortexAssistantGenerationJobs.$inferSelect
export type CortexAssistantGenerationJobInsert =
  typeof cortexAssistantGenerationJobs.$inferInsert
