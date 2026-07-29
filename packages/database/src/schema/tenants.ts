import { sql } from 'drizzle-orm'
import {
  check,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    organization_type: varchar('organization_type', { length: 64 })
      .notNull()
      .default('other'),
    pcab_license: varchar('pcab_license', { length: 50 }),
    bir_tin: varchar('bir_tin', { length: 20 }),
    dpo_contact: varchar('dpo_contact', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('idx_tenants_slug').on(table.slug),
    organizationTypeCheck: check(
      'tenants_organization_type_check',
      sql`${table.organization_type} in (
        'construction',
        'developer',
        'design-engineering',
        'supply-manufacturing',
        'professional-services',
        'other'
      )`
    ),
  })
)

export type Tenant = typeof tenants.$inferSelect
export type TenantInsert = typeof tenants.$inferInsert
