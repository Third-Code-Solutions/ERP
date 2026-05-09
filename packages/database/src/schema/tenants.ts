import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    pcab_license: varchar('pcab_license', { length: 50 }),
    bir_tin: varchar('bir_tin', { length: 20 }),
    dpo_contact: varchar('dpo_contact', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('idx_tenants_slug').on(table.slug),
  })
)

export type Tenant = typeof tenants.$inferSelect
export type TenantInsert = typeof tenants.$inferInsert
