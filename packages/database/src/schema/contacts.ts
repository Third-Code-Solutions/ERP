import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { accounts } from './accounts'

// REFACTOR.md M1 — contacts are people inside an Account.
// Used as recipients for BOM portal email, warranty acknowledgments,
// CNPS surveys, and signing flows.
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    full_name: varchar('full_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 64 }),
    role_title: varchar('role_title', { length: 120 }),
    is_primary: boolean('is_primary').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_contacts_tenant_id').on(table.tenant_id),
    accountIdx: index('idx_contacts_account_id').on(table.account_id),
    // Postgres unique indexes treat NULL as distinct, so multiple contacts
    // without an email are allowed per account. A "primary contact" guard
    // is enforced in business logic (server actions) rather than via
    // partial unique constraints.
    accountEmailIdx: uniqueIndex('idx_contacts_account_email').on(table.account_id, table.email),
  })
)

export type Contact = typeof contacts.$inferSelect
export type ContactInsert = typeof contacts.$inferInsert
