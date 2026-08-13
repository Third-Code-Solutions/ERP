import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  assetMaintenanceCreateRequestStateEnum,
  assetMaintenanceTypeEnum,
} from './enums'
import { assets } from './assets'
import { tenants } from './tenants'
import { users } from './users'

/** Append-only service history for an operational asset. */
export const assetMaintenanceRecords = pgTable(
  'asset_maintenance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    asset_id: uuid('asset_id').notNull(),
    maintenance_type: assetMaintenanceTypeEnum('maintenance_type').notNull(),
    summary: varchar('summary', { length: 200 }).notNull(),
    performed_on: date('performed_on').notNull(),
    next_due_on: date('next_due_on'),
    vendor_name: varchar('vendor_name', { length: 160 }),
    cost_cents: bigint('cost_cents', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_asset_maintenance_records_tenant_id_id'
    ).on(table.tenant_id, table.id),
    assetTimelineIdx: index('idx_asset_maintenance_records_asset_date').on(
      table.tenant_id,
      table.asset_id,
      table.performed_on
    ),
    dueDateIdx: index('idx_asset_maintenance_records_due_date').on(
      table.tenant_id,
      table.next_due_on
    ),
    assetTenantFk: foreignKey({
      name: 'asset_maintenance_records_asset_tenant_fk',
      columns: [table.tenant_id, table.asset_id],
      foreignColumns: [assets.tenant_id, assets.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'asset_maintenance_records_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    summaryNonempty: check(
      'asset_maintenance_records_summary_nonempty',
      sql`${table.summary} = btrim(${table.summary}) and length(${table.summary}) between 1 and 200`
    ),
    vendorNameTrimmed: check(
      'asset_maintenance_records_vendor_name_trimmed',
      sql`${table.vendor_name} is null or (${table.vendor_name} = btrim(${table.vendor_name}) and length(${table.vendor_name}) between 1 and 160)`
    ),
    costNonnegative: check(
      'asset_maintenance_records_cost_nonnegative',
      sql`${table.cost_cents} >= 0`
    ),
    dueDateOrder: check(
      'asset_maintenance_records_due_date_order',
      sql`${table.next_due_on} is null or ${table.next_due_on} >= ${table.performed_on}`
    ),
  })
)

/** Server-only idempotency ledger for maintenance history creation. */
export const assetMaintenanceCreateRequests = pgTable(
  'asset_maintenance_create_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: assetMaintenanceCreateRequestStateEnum('state')
      .notNull()
      .default('processing'),
    maintenance_record_id: uuid('maintenance_record_id'),
    result: jsonb('result'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_asset_maintenance_create_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_asset_maintenance_create_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantStateIdx: index(
      'idx_asset_maintenance_create_requests_tenant_state'
    ).on(table.tenant_id, table.state, table.created_at),
    maintenanceRecordTenantFk: foreignKey({
      name: 'asset_maintenance_create_requests_record_tenant_fk',
      columns: [table.tenant_id, table.maintenance_record_id],
      foreignColumns: [assetMaintenanceRecords.tenant_id, assetMaintenanceRecords.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'asset_maintenance_create_requests_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    keyNonempty: check(
      'asset_maintenance_create_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key}) and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashHex: check(
      'asset_maintenance_create_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    resultObject: check(
      'asset_maintenance_create_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayload: check(
      'asset_maintenance_create_requests_state_payload',
      sql`(
        (${table.state} = 'processing' and ${table.maintenance_record_id} is null and ${table.result} is null and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded' and ${table.maintenance_record_id} is not null and ${table.result} is not null and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreated: check(
      'asset_maintenance_create_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type AssetMaintenanceRecord = typeof assetMaintenanceRecords.$inferSelect
export type AssetMaintenanceRecordInsert = typeof assetMaintenanceRecords.$inferInsert
export type AssetMaintenanceCreateRequest = typeof assetMaintenanceCreateRequests.$inferSelect
export type AssetMaintenanceCreateRequestInsert = typeof assetMaintenanceCreateRequests.$inferInsert
