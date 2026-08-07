import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { cortexAssistantGenerationJobs } from './cortex-assistant-generation-jobs'
import { tenants } from './tenants'

/** Inert, DBA-provisioned provider/model ceilings for one exact tenant. */
export const cortexAssistantProviderPolicies = pgTable(
  'cortex_assistant_provider_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    request_limit_micros: bigint('request_limit_micros', {
      mode: 'number',
    }).notNull(),
    daily_limit_micros: bigint('daily_limit_micros', {
      mode: 'number',
    }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_cortex_asst_provider_policy_tenant_id'
    ).on(table.tenant_id, table.id),
    scopeUniqueIdx: uniqueIndex('ux_cortex_asst_provider_policy_scope').on(
      table.tenant_id,
      table.provider,
      table.model
    ),
    providerCheck: check(
      'cortex_asst_provider_policies_provider_valid',
      sql`${table.provider} ~ '^[a-z0-9][a-z0-9._-]{0,49}$'`
    ),
    modelCheck: check(
      'cortex_asst_provider_policies_model_valid',
      sql`${table.model} ~ '^[a-z0-9][a-z0-9._:/-]{0,99}$'`
    ),
    limitCheck: check(
      'cortex_asst_provider_policies_limit_bounds',
      sql`${table.request_limit_micros} between 1 and 999999999999
        and ${table.daily_limit_micros} between ${table.request_limit_micros}
          and 999999999999`
    ),
    updatedAfterCreatedCheck: check(
      'cortex_asst_provider_policies_updated_after_created',
      sql`${table.updated_at} >= ${table.created_at}`
    ),
  })
)

/** Durable reservation and terminal settlement for one provider attempt. */
export const cortexAssistantProviderAttempts = pgTable(
  'cortex_assistant_provider_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    policy_id: uuid('policy_id').notNull(),
    job_id: uuid('job_id').notNull(),
    attempt_number: integer('attempt_number').notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('reserved'),
    reserved_cost_micros: bigint('reserved_cost_micros', {
      mode: 'number',
    }).notNull(),
    consumed_cost_micros: bigint('consumed_cost_micros', {
      mode: 'number',
    }),
    outcome_code: varchar('outcome_code', { length: 100 }),
    budget_date: date('budget_date')
      .notNull()
      .default(sql`(pg_catalog.timezone('UTC', transaction_timestamp()))::date`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatched_at: timestamp('dispatched_at', { withTimezone: true }),
    terminal_at: timestamp('terminal_at', { withTimezone: true }),
  },
  (table) => ({
    jobAttemptUniqueIdx: uniqueIndex(
      'ux_cortex_asst_provider_attempt_job_attempt'
    ).on(table.tenant_id, table.job_id, table.attempt_number),
    dailyIdx: index('idx_cortex_asst_provider_attempt_daily').on(
      table.tenant_id,
      table.policy_id,
      table.budget_date,
      table.status
    ),
    tenantJobFk: foreignKey({
      name: 'cortex_asst_provider_attempts_tenant_job_fk',
      columns: [table.tenant_id, table.job_id],
      foreignColumns: [
        cortexAssistantGenerationJobs.tenant_id,
        cortexAssistantGenerationJobs.id,
      ],
    }).onDelete('restrict'),
    tenantPolicyFk: foreignKey({
      name: 'cortex_asst_provider_attempts_tenant_policy_fk',
      columns: [table.tenant_id, table.policy_id],
      foreignColumns: [
        cortexAssistantProviderPolicies.tenant_id,
        cortexAssistantProviderPolicies.id,
      ],
    }).onDelete('restrict'),
    attemptCheck: check(
      'cortex_asst_provider_attempts_attempt_bounds',
      sql`${table.attempt_number} between 1 and 3`
    ),
    requestHashCheck: check(
      'cortex_asst_provider_attempts_request_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    statusCheck: check(
      'cortex_asst_provider_attempts_status_allowed',
      sql`${table.status} in ('reserved', 'dispatched', 'settled', 'released')`
    ),
    costCheck: check(
      'cortex_asst_provider_attempts_cost_bounds',
      sql`${table.reserved_cost_micros} between 1 and 999999999999
        and (${table.consumed_cost_micros} is null
          or ${table.consumed_cost_micros} between 0
            and ${table.reserved_cost_micros})`
    ),
    outcomeCheck: check(
      'cortex_asst_provider_attempts_outcome_valid',
      sql`${table.outcome_code} is null
        or ${table.outcome_code} ~ '^[a-z0-9][a-z0-9:_-]{0,99}$'`
    ),
    statePayloadCheck: check(
      'cortex_asst_provider_attempts_state_payload',
      sql`(
        (${table.status} = 'reserved'
          and ${table.consumed_cost_micros} is null
          and ${table.outcome_code} is null
          and ${table.dispatched_at} is null
          and ${table.terminal_at} is null)
        or
        (${table.status} = 'dispatched'
          and ${table.consumed_cost_micros} is null
          and ${table.outcome_code} is null
          and ${table.dispatched_at} is not null
          and ${table.terminal_at} is null)
        or
        (${table.status} = 'settled'
          and ${table.consumed_cost_micros} is not null
          and ${table.outcome_code} is not null
          and ${table.dispatched_at} is not null
          and ${table.terminal_at} is not null)
        or
        (${table.status} = 'released'
          and ${table.consumed_cost_micros} = 0
          and ${table.outcome_code} is not null
          and ${table.dispatched_at} is null
          and ${table.terminal_at} is not null)
      )`
    ),
    timestampCheck: check(
      'cortex_asst_provider_attempts_timestamp_order',
      sql`${table.updated_at} >= ${table.created_at}
        and (${table.dispatched_at} is null
          or ${table.dispatched_at} >= ${table.created_at})
        and (${table.terminal_at} is null
          or ${table.terminal_at} >= ${table.created_at})
        and (${table.status} <> 'settled'
          or ${table.terminal_at} >= ${table.dispatched_at})`
    ),
  })
)

export type CortexAssistantProviderPolicy =
  typeof cortexAssistantProviderPolicies.$inferSelect
export type CortexAssistantProviderAttempt =
  typeof cortexAssistantProviderAttempts.$inferSelect
