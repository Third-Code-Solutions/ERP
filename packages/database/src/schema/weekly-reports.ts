import { pgTable, uuid, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { projects } from './projects'
import { documents } from './documents'
import { users } from './users'

// Snapshot-style weekly report per project.
// `snapshot` JSONB holds the rendered data ({overall_pct, by_category,
// tasks_completed, milestones_done, photos[], notes}). report_document_id
// links to the generated HTML doc in storage so clients can re-download.
export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    week_ending: timestamp('week_ending', { withTimezone: true }).notNull(),
    snapshot: jsonb('snapshot').notNull(),
    report_document_id: uuid('report_document_id').references(() => documents.id, { onDelete: 'set null' }),
    generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    generated_by: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_weekly_reports_tenant').on(table.tenant_id),
    projectIdx: index('idx_weekly_reports_project').on(table.project_id),
    projectWeekUq: uniqueIndex('idx_weekly_reports_project_week').on(table.project_id, table.week_ending),
  })
)

export type WeeklyReport = typeof weeklyReports.$inferSelect
export type WeeklyReportInsert = typeof weeklyReports.$inferInsert
