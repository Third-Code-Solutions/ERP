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
import { opportunityProjectConversionRequestStateEnum } from './enums'
import { opportunities } from './opportunities'
import { preConChecklists } from './pre-con'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

/** Service-only idempotency ledger for Won → Project handoff commands. */
export const opportunityProjectConversionRequests = pgTable(
  'opportunity_project_conversion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: opportunityProjectConversionRequestStateEnum('state')
      .notNull()
      .default('processing'),
    project_id: uuid('project_id'),
    checklist_id: uuid('checklist_id'),
    result: jsonb('result'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_opportunity_project_conversion_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_opportunity_project_conversion_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantStateIdx: index(
      'idx_opportunity_project_conversion_requests_tenant_state'
    ).on(table.tenant_id, table.state, table.created_at),
    opportunityTenantFk: foreignKey({
      name: 'opportunity_project_conversion_requests_opportunity_tenant_fk',
      columns: [table.tenant_id, table.opportunity_id],
      foreignColumns: [opportunities.tenant_id, opportunities.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'opportunity_project_conversion_requests_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    checklistTenantFk: foreignKey({
      name: 'opportunity_project_conversion_requests_checklist_tenant_fk',
      columns: [table.tenant_id, table.checklist_id],
      foreignColumns: [preConChecklists.tenant_id, preConChecklists.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'opportunity_project_conversion_requests_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    keyCheck: check(
      'opportunity_project_conversion_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'opportunity_project_conversion_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObjectCheck: check(
      'opportunity_project_conversion_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'opportunity_project_conversion_requests_state_payload',
      sql`(
        (${table.state} = 'processing'
          and ${table.project_id} is null
          and ${table.checklist_id} is null
          and ${table.result} is null
          and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded'
          and ${table.project_id} is not null
          and ${table.checklist_id} is not null
          and ${table.result} is not null
          and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreatedCheck: check(
      'opportunity_project_conversion_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type OpportunityProjectConversionRequest =
  typeof opportunityProjectConversionRequests.$inferSelect
export type OpportunityProjectConversionRequestInsert =
  typeof opportunityProjectConversionRequests.$inferInsert
