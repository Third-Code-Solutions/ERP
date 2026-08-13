import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { tenants } from './tenants'
import { users } from './users'

export const businessCalendarHolidays = pgTable(
  'business_calendar_holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    holiday_date: date('holiday_date', { mode: 'string' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 32 }).notNull(),
    source: text('source').notNull(),
    is_enabled: boolean('is_enabled').notNull().default(true),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_business_calendar_holidays_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantDateUniqueIdx: uniqueIndex(
      'business_calendar_holidays_tenant_date_unique'
    ).on(table.tenant_id, table.holiday_date),
    tenantDateIdx: index('idx_business_calendar_holidays_tenant_date').on(
      table.tenant_id,
      table.holiday_date
    ),
    kindCheck: check(
      'business_calendar_holidays_kind',
      sql`${table.kind} in ('regular', 'special_non_working', 'local')`
    ),
    nameNonemptyCheck: check(
      'business_calendar_holidays_name_nonempty',
      sql`length(btrim(${table.name})) > 0`
    ),
    sourceNonemptyCheck: check(
      'business_calendar_holidays_source_nonempty',
      sql`length(btrim(${table.source})) > 0`
    ),
    createdByTenantFk: foreignKey({
      name: 'business_calendar_holidays_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'business_calendar_holidays_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  })
)

export type BusinessCalendarHoliday = typeof businessCalendarHolidays.$inferSelect
export type BusinessCalendarHolidayInsert = typeof businessCalendarHolidays.$inferInsert
