import {
  foreignKey,
  index,
  pgTable,
  timestamp,
  uuid,
  text,
} from 'drizzle-orm/pg-core'
import { changeLogEventTypeEnum } from './enums'
import { tenants } from './tenants'
import { users } from './users'
import { changeRequests, designFileVersions } from './design'

export const changeLogs = pgTable(
  'change_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    change_request_id: uuid('change_request_id').notNull(),
    design_file_version_id: uuid('design_file_version_id'),
    event_type: changeLogEventTypeEnum('event_type').notNull(),
    note: text('note'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_change_logs_tenant_id').on(table.tenant_id),
    changeRequestIdx: index('idx_change_logs_change_request_id').on(
      table.change_request_id,
    ),
    designVersionIdx: index('idx_change_logs_design_file_version_id').on(
      table.design_file_version_id,
    ),
    tenantCreatedIdx: index('idx_change_logs_tenant_created_at').on(
      table.tenant_id,
      table.created_at,
    ),
    changeRequestTenantFk: foreignKey({
      name: 'change_logs_change_request_tenant_fk',
      columns: [table.tenant_id, table.change_request_id],
      foreignColumns: [changeRequests.tenant_id, changeRequests.id],
    }).onDelete('cascade'),
    designVersionTenantFk: foreignKey({
      name: 'change_logs_design_version_tenant_fk',
      columns: [table.tenant_id, table.design_file_version_id],
      foreignColumns: [designFileVersions.tenant_id, designFileVersions.id],
    }).onDelete('set null'),
    createdByTenantFk: foreignKey({
      name: 'change_logs_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type ChangeLog = typeof changeLogs.$inferSelect
export type ChangeLogInsert = typeof changeLogs.$inferInsert
