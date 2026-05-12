import { pgTable, uuid, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { opportunities } from './opportunities'
import { users } from './users'

// REFACTOR.md M2 US-006 — Project Pre-Requirements Form is the structured
// brief Sales fills in for an Opportunity. Versioned so edits after submit
// produce a new row + diff log.
export const pprfSubmissions = pgTable(
  'pprf_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    // Whole form payload kept as JSONB so the schema is flexible per project type.
    // Required fields per US-006 #2: site_address, floor_area_sqm, landlord_contact, as_built_available.
    payload: jsonb('payload').notNull(),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    submitted_by: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_pprf_tenant_id').on(table.tenant_id),
    oppIdx: index('idx_pprf_opportunity_id').on(table.opportunity_id),
    oppVersionUq: uniqueIndex('idx_pprf_opportunity_version').on(table.opportunity_id, table.version),
  })
)

export type PprfSubmission = typeof pprfSubmissions.$inferSelect
export type PprfSubmissionInsert = typeof pprfSubmissions.$inferInsert
