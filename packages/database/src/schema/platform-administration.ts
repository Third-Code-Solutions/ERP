import { sql } from 'drizzle-orm'
import {
  bigserial,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  platformInvitationStatusEnum,
  platformRoleEnum,
  roleEnum,
} from './enums'
import { tenants } from './tenants'
import { users } from './users'

/** True-global identity binding approved as a narrow ADR-027 exception. */
export const platformRoleAssignments = pgTable(
  'platform_role_assignments',
  {
    user_id: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: platformRoleEnum('role').notNull().default('platform_owner'),
    normalized_email: varchar('normalized_email', { length: 255 }).notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revoked_by: uuid('revoked_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    revocation_reason: text('revocation_reason'),
  },
  (table) => ({
    soleActiveRoleIdx: uniqueIndex('ux_platform_role_assignments_active_role')
      .on(table.role)
      .where(sql`${table.revoked_at} is null`),
    exactOwnerEmailCheck: check(
      'platform_role_assignments_exact_owner_email',
      sql`${table.normalized_email} = 'kurt@thirdcodesolutions.com'
        and ${table.normalized_email} = lower(btrim(${table.normalized_email}))`
    ),
    revocationEvidenceCheck: check(
      'platform_role_assignments_revocation_evidence',
      sql`(
        ${table.revoked_at} is null
        and ${table.revoked_by} is null
        and ${table.revocation_reason} is null
      ) or (
        ${table.revoked_at} is not null
        and ${table.revoked_by} is not null
        and ${table.revocation_reason} = btrim(${table.revocation_reason})
        and length(${table.revocation_reason}) > 0
      )`
    ),
  })
)

/** Append-only, global privileged event evidence. */
export const platformAuditEvents = pgTable(
  'platform_audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    trace_id: uuid('trace_id').notNull(),
    actor_id: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: varchar('action', { length: 100 }).notNull(),
    outcome: varchar('outcome', { length: 32 }).notNull(),
    target_type: varchar('target_type', { length: 100 }).notNull(),
    target_id: text('target_id'),
    target_tenant_id: uuid('target_tenant_id').references(() => tenants.id, {
      onDelete: 'restrict',
    }),
    metadata: jsonb('metadata'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    traceIdx: index('idx_platform_audit_events_trace_id').on(
      table.trace_id
    ),
    createdIdx: index('idx_platform_audit_events_created_at').on(
      table.created_at
    ),
    tenantCreatedIdx: index(
      'idx_platform_audit_events_tenant_created_at'
    ).on(table.target_tenant_id, table.created_at),
    actorCreatedIdx: index(
      'idx_platform_audit_events_actor_created_at'
    ).on(table.actor_id, table.created_at),
    outcomeCheck: check(
      'platform_audit_events_outcome_check',
      sql`${table.outcome} in ('succeeded', 'denied', 'failed')`
    ),
  })
)

/** Opaque, bounded support context. It never changes tenant RLS identity. */
export const platformSupportSessions = pgTable(
  'platform_support_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actor_id: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => ({
    actorExpiryIdx: index('idx_platform_support_sessions_actor_expiry').on(
      table.actor_id,
      table.expires_at
    ),
    tenantExpiryIdx: index('idx_platform_support_sessions_tenant_expiry').on(
      table.tenant_id,
      table.expires_at
    ),
    reasonCheck: check(
      'platform_support_sessions_reason_check',
      sql`${table.reason} = btrim(${table.reason}) and length(${table.reason}) > 0`
    ),
    expiryCheck: check(
      'platform_support_sessions_expiry_check',
      sql`${table.expires_at} > ${table.created_at}
        and ${table.expires_at} <= ${table.created_at} + interval '4 hours'`
    ),
    endedCheck: check(
      'platform_support_sessions_ended_check',
      sql`${table.ended_at} is null or ${table.ended_at} >= ${table.created_at}`
    ),
  })
)

/** Server-owned invitation intent consumed by the Auth provisioning trigger. */
export const platformUserInvitations = pgTable(
  'platform_user_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    normalized_email: varchar('normalized_email', { length: 255 }).notNull(),
    full_name: varchar('full_name', { length: 255 }).notNull(),
    role: roleEnum('role').notNull(),
    status: platformInvitationStatusEnum('status')
      .notNull()
      .default('pending'),
    invited_by: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    auth_user_id: uuid('auth_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    failure_reason: varchar('failure_reason', { length: 500 }),
  },
  (table) => ({
    pendingEmailIdx: uniqueIndex(
      'ux_platform_user_invitations_open_email'
    )
      .on(table.normalized_email)
      .where(sql`${table.status} in ('pending', 'sent')`),
    tenantStatusIdx: index(
      'idx_platform_user_invitations_tenant_status'
    ).on(table.tenant_id, table.status, table.created_at),
    normalizedEmailCheck: check(
      'platform_user_invitations_normalized_email_check',
      sql`${table.normalized_email} = lower(btrim(${table.normalized_email}))`
    ),
    fullNameCheck: check(
      'platform_user_invitations_full_name_check',
      sql`${table.full_name} = btrim(${table.full_name})
        and length(${table.full_name}) >= 2`
    ),
  })
)

export type PlatformRoleAssignment =
  typeof platformRoleAssignments.$inferSelect
export type PlatformAuditEvent = typeof platformAuditEvents.$inferSelect
export type PlatformSupportSession =
  typeof platformSupportSessions.$inferSelect
export type PlatformUserInvitation = typeof platformUserInvitations.$inferSelect
