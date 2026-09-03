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

import { tenantLifecycleStatusEnum } from './enums'
import { users } from './users'

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
    status: tenantLifecycleStatusEnum('status').notNull().default('active'),
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
    slugIdx: uniqueIndex('idx_tenants_slug').on(table.slug),
    statusIdx: index('idx_tenants_status').on(table.status, table.created_at),
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
    inactiveStatusReasonCheck: check(
      'tenants_inactive_status_reason_check',
      sql`${table.status} = 'active' or (
        ${table.status_reason} = btrim(${table.status_reason})
        and length(${table.status_reason}) > 0
        and ${table.status_changed_at} is not null
        and ${table.status_changed_by} is not null
      )`
    ),
  })
)

export type Tenant = typeof tenants.$inferSelect
export type TenantInsert = typeof tenants.$inferInsert
