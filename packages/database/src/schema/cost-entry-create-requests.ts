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
import { costEntryCreateRequestStateEnum } from './enums'
import { costEntries } from './cost-entries'
import { tenants } from './tenants'
import { users } from './users'

/** Server-only idempotency ledger for manual project cost creation. */
export const costEntryCreateRequests = pgTable(
  'cost_entry_create_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: costEntryCreateRequestStateEnum('state')
      .notNull()
      .default('processing'),
    cost_entry_id: uuid('cost_entry_id'),
    result: jsonb('result'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_cost_entry_create_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_cost_entry_create_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantStateIdx: index(
      'idx_cost_entry_create_requests_tenant_state'
    ).on(table.tenant_id, table.state, table.created_at),
    costEntryTenantFk: foreignKey({
      name: 'cost_entry_create_requests_cost_entry_tenant_fk',
      columns: [table.tenant_id, table.cost_entry_id],
      foreignColumns: [costEntries.tenant_id, costEntries.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'cost_entry_create_requests_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    keyCheck: check(
      'cost_entry_create_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'cost_entry_create_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'cost_entry_create_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'cost_entry_create_requests_state_payload',
      sql`(
        (${table.state} = 'processing'
          and ${table.cost_entry_id} is null
          and ${table.result} is null
          and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded'
          and ${table.cost_entry_id} is not null
          and ${table.result} is not null
          and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreatedCheck: check(
      'cost_entry_create_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type CostEntryCreateRequest = typeof costEntryCreateRequests.$inferSelect
export type CostEntryCreateRequestInsert =
  typeof costEntryCreateRequests.$inferInsert
