import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { kycStatusEnum, accountIndustryEnum } from './enums'

// REFACTOR.md M1 US-001 — Account is the top-level commercial entity in
// Third Code ERP. An Account holds the client/company record; opportunities and
// projects hang off it. KYC fields live on the account so Finance can
// gate the pipeline.
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    industry: accountIndustryEnum('industry').notNull().default('other'),
    billing_address: text('billing_address'),
    // Optional convenience email/phone — full contact list lives in `contacts`.
    primary_email: varchar('primary_email', { length: 255 }),
    primary_phone: varchar('primary_phone', { length: 64 }),
    // KYC lifecycle (US-001..US-003). Finance is the sole writer of `kyc_status`.
    kyc_status: kycStatusEnum('kyc_status').notNull().default('pending'),
    kyc_notes: text('kyc_notes'),
    kyc_decided_at: timestamp('kyc_decided_at', { withTimezone: true }),
    kyc_decided_by: uuid('kyc_decided_by').references(() => users.id, { onDelete: 'set null' }),
    // CNPS rolling average (US-WA-003 #3). 0-1000 = 0-10.0 NPS scale.
    cnps_score_x10: varchar('cnps_score_x10', { length: 8 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_accounts_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantIdx: index('idx_accounts_tenant_id').on(table.tenant_id),
    tenantKycIdx: index('idx_accounts_tenant_kyc').on(table.tenant_id, table.kyc_status),
    tenantNameIdx: uniqueIndex('idx_accounts_tenant_name').on(table.tenant_id, table.name),
  })
)

export type Account = typeof accounts.$inferSelect
export type AccountInsert = typeof accounts.$inferInsert
