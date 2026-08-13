import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { cortexAssistantProviderPolicies } from './cortex-assistant-provider-budget'

/** Service-only, aggregate-only circuit transition and local sink ledger. */
export const cortexAssistantProviderCircuitAlerts = pgTable(
  'cortex_assistant_provider_circuit_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    policy_id: uuid('policy_id').notNull(),
    source_event_id: uuid('source_event_id'),
    event_key: varchar('event_key', { length: 64 }).notNull(),
    event_type: varchar('event_type', { length: 16 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    failure_count: smallint('failure_count').notNull(),
    retry_at: timestamp('retry_at', { withTimezone: true }),
    as_of: timestamp('as_of', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempt_count: integer('attempt_count').notNull().default(0),
    last_error: varchar('last_error', { length: 100 }),
    processing_started_at: timestamp('processing_started_at', {
      withTimezone: true,
    }),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_cortex_asst_provider_alert_tenant_id'
    ).on(table.tenant_id, table.id),
    eventUniqueIdx: uniqueIndex('ux_cortex_asst_provider_alert_event').on(
      table.tenant_id,
      table.event_key
    ),
    sourceEventUniqueIdx: uniqueIndex(
      'ux_cortex_asst_provider_alert_source_event'
    ).on(table.tenant_id, table.source_event_id, table.event_type),
    pendingIdx: index('idx_cortex_asst_provider_alert_status').on(
      table.tenant_id,
      table.status,
      table.updated_at
    ),
    policyIdx: index('idx_cortex_asst_provider_alert_policy').on(
      table.tenant_id,
      table.policy_id,
      table.created_at
    ),
    policyTenantFk: foreignKey({
      name: 'cortex_asst_provider_alert_policy_tenant_fk',
      columns: [table.tenant_id, table.policy_id],
      foreignColumns: [
        cortexAssistantProviderPolicies.tenant_id,
        cortexAssistantProviderPolicies.id,
      ],
    }).onDelete('restrict'),
    sourceTenantFk: foreignKey({
      name: 'cortex_asst_provider_alert_source_tenant_fk',
      columns: [table.tenant_id, table.source_event_id],
      foreignColumns: [table.tenant_id, table.id],
    }).onDelete('restrict'),
    eventKeyCheck: check(
      'cortex_asst_provider_alert_event_key_hex',
      sql`${table.event_key} ~ '^[0-9a-f]{64}$'`
    ),
    scopeCheck: check(
      'cortex_asst_provider_alert_scope_valid',
      sql`${table.provider} ~ '^[a-z0-9][a-z0-9._-]{0,49}$'
        and ${table.model} ~ '^[a-z0-9][a-z0-9._:/-]{0,99}$'`
    ),
    eventCheck: check(
      'cortex_asst_provider_alert_event_valid',
      sql`(
        ${table.event_type} = 'opened'
        and ${table.source_event_id} is null
        and ${table.failure_count} between 1 and 20
        and ${table.retry_at} is not null
      ) or (
        ${table.event_type} = 'recovered'
        and ${table.source_event_id} is not null
        and ${table.failure_count} = 0
        and ${table.retry_at} is null
      )`
    ),
    statusCheck: check(
      'cortex_asst_provider_alert_status_valid',
      sql`(
        ${table.status} = 'pending'
        and ${table.processing_started_at} is null
        and ${table.delivered_at} is null
      ) or (
        ${table.status} = 'processing'
        and ${table.processing_started_at} is not null
        and ${table.delivered_at} is null
      ) or (
        ${table.status} = 'delivered'
        and ${table.delivered_at} is not null
        and ${table.last_error} is null
      ) or (
        ${table.status} = 'failed'
        and ${table.processing_started_at} is null
        and ${table.last_error} is not null
        and ${table.delivered_at} is null
      )`
    ),
    statusEnumCheck: check(
      'cortex_asst_provider_alert_status_enum',
      sql`${table.status} in ('pending', 'processing', 'delivered', 'failed')`
    ),
    attemptCheck: check(
      'cortex_asst_provider_alert_attempt_nonnegative',
      sql`${table.attempt_count} >= 0`
    ),
    timestampCheck: check(
      'cortex_asst_provider_alert_updated_after_created',
      sql`${table.updated_at} >= ${table.created_at}`
    ),
  })
)

export type CortexAssistantProviderCircuitAlert =
  typeof cortexAssistantProviderCircuitAlerts.$inferSelect
