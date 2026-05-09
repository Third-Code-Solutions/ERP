import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    contact_name: varchar('contact_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    address: text('address'),
    bir_tin: varchar('bir_tin', { length: 20 }),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_vendors_tenant_id').on(table.tenant_id),
    tenantNameIdx: uniqueIndex('idx_vendors_tenant_name').on(table.tenant_id, table.name),
  })
)

export type Vendor = typeof vendors.$inferSelect
export type VendorInsert = typeof vendors.$inferInsert
