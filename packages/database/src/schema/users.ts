import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { roleEnum } from './enums'
import { tenants } from './tenants'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    full_name: varchar('full_name', { length: 255 }).notNull(),
    role: roleEnum('role').notNull().default('viewer'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantEmailIdx: uniqueIndex('idx_users_tenant_email').on(table.tenant_id, table.email),
    tenantIdUniqueIdx: uniqueIndex('ux_users_tenant_id_id').on(table.tenant_id, table.id),
    tenantIdx: index('idx_users_tenant_id').on(table.tenant_id),
  })
)

export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
