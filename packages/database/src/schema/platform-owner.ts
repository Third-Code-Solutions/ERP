import { sql } from 'drizzle-orm'
import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Platform-owned records exist before a prospective customer belongs to a
 * tenant. ADR-027 requires that these tables remain server-only and must not
 * be treated as a second tenant model.
 */
export const platformDemoRequests = pgTable(
  'platform_demo_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contact_name: varchar('contact_name', { length: 255 }).notNull(),
    work_email: varchar('work_email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 64 }),
    job_title: varchar('job_title', { length: 120 }),
    company_name: varchar('company_name', { length: 255 }).notNull(),
    organization_type: varchar('organization_type', { length: 64 }).notNull(),
    company_size: varchar('company_size', { length: 64 }),
    team_size: integer('team_size'),
    use_case: text('use_case').notNull(),
    preferred_demo_window: varchar('preferred_demo_window', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull().default('new'),
    review_notes: text('review_notes'),
    reviewed_by: uuid('reviewed_by'),
    reviewed_by_email: varchar('reviewed_by_email', { length: 255 }),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    consent_recorded_at: timestamp('consent_recorded_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCreatedIdx: index('idx_platform_demo_requests_status_created_at').on(
      table.status,
      table.created_at
    ),
    companyCreatedIdx: index('idx_platform_demo_requests_company_created_at').on(
      table.company_name,
      table.created_at
    ),
    statusCheck: check(
      'platform_demo_requests_status_check',
      sql`${table.status} in ('new', 'contacted', 'demo_scheduled', 'converted', 'declined')`
    ),
    contactNameCheck: check(
      'platform_demo_requests_contact_name_nonempty',
      sql`length(btrim(${table.contact_name})) > 0`
    ),
    companyNameCheck: check(
      'platform_demo_requests_company_name_nonempty',
      sql`length(btrim(${table.company_name})) > 0`
    ),
    teamSizeCheck: check(
      'platform_demo_requests_team_size_nonnegative',
      sql`${table.team_size} is null or ${table.team_size} >= 1`
    ),
  })
)

/**
 * Append-only audit evidence for privileged platform operations. This is
 * intentionally separate from tenant-scoped audit_log because pre-tenant
 * demo requests do not have a truthful tenant_id.
 */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actor_id: uuid('actor_id'),
    actor_email: varchar('actor_email', { length: 255 }),
    entity_type: varchar('entity_type', { length: 100 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    action: varchar('action', { length: 80 }).notNull(),
    details: jsonb('details').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    entityIdx: index('idx_platform_audit_log_entity').on(
      table.entity_type,
      table.entity_id
    ),
    createdIdx: index('idx_platform_audit_log_created_at').on(table.created_at),
    actorIdx: index('idx_platform_audit_log_actor_id').on(table.actor_id),
    entityTypeCheck: check(
      'platform_audit_log_entity_type_nonempty',
      sql`length(btrim(${table.entity_type})) > 0`
    ),
    actionCheck: check(
      'platform_audit_log_action_nonempty',
      sql`length(btrim(${table.action})) > 0`
    ),
  })
)

export type PlatformDemoRequest = typeof platformDemoRequests.$inferSelect
export type PlatformDemoRequestInsert = typeof platformDemoRequests.$inferInsert
export type PlatformAuditLogEntry = typeof platformAuditLog.$inferSelect
export type PlatformAuditLogInsert = typeof platformAuditLog.$inferInsert
