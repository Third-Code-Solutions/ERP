import { pgTable, uuid, varchar, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { projects } from './projects'
import { accounts } from './accounts'
import { users } from './users'

// Long-lived (default 1 year) read-only access tokens for clients to
// view live project status. Distinct from /portal/sign which is
// short-lived one-shot signing.
export const customerPortalSessions = pgTable(
  'customer_portal_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    account_id: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    viewer_email: varchar('viewer_email', { length: 255 }),
    viewer_name: varchar('viewer_name', { length: 255 }),
    // SHA-256 of the URL token. Plaintext token never stored.
    token_hash: varchar('token_hash', { length: 128 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    last_viewed_at: timestamp('last_viewed_at', { withTimezone: true }),
    view_count: integer('view_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('idx_customer_portal_sessions_tenant').on(table.tenant_id),
    projectIdx: index('idx_customer_portal_sessions_project').on(table.project_id),
    tokenHashUq: uniqueIndex('idx_customer_portal_sessions_hash').on(table.token_hash),
  })
)

export type CustomerPortalSession = typeof customerPortalSessions.$inferSelect
export type CustomerPortalSessionInsert = typeof customerPortalSessions.$inferInsert
