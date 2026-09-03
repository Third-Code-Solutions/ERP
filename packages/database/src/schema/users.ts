import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { roleEnum, userAccountStatusEnum } from './enums'
import { tenants } from './tenants'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    full_name: varchar('full_name', { length: 255 }).notNull(),
    role: roleEnum('role').notNull().default('viewer'),
    account_status: userAccountStatusEnum('account_status')
      .notNull()
      .default('active'),
    invited_at: timestamp('invited_at', { withTimezone: true }),
    last_active_at: timestamp('last_active_at', { withTimezone: true }),
    status_reason: varchar('status_reason', { length: 500 }),
    status_changed_at: timestamp('status_changed_at', { withTimezone: true }),
    status_changed_by: uuid('status_changed_by').references(
      (): AnyPgColumn => users.id,
      { onDelete: 'restrict' }
    ),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantEmailIdx: uniqueIndex('idx_users_tenant_email').on(table.tenant_id, table.email),
    tenantIdUniqueIdx: uniqueIndex('ux_users_tenant_id_id').on(table.tenant_id, table.id),
    tenantIdx: index('idx_users_tenant_id').on(table.tenant_id),
    tenantStatusIdx: index('idx_users_tenant_account_status').on(
      table.tenant_id,
      table.account_status
    ),
    accountStatusIdx: index('idx_users_account_status').on(
      table.account_status,
      table.created_at
    ),
    inactiveStatusReasonCheck: check(
      'users_inactive_status_reason_check',
      sql`${table.account_status} in ('active', 'invited') or (
        ${table.status_reason} = btrim(${table.status_reason})
        and length(${table.status_reason}) > 0
        and ${table.status_changed_at} is not null
        and ${table.status_changed_by} is not null
      )`
    ),
  })
)

export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
