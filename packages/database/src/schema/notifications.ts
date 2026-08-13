import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, index, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'email',
  'sms',
])

// REFACTOR.md §6.3 + M8 cross-cutting — in-app + email + SMS notifications.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    recipient_user_id: uuid('recipient_user_id').references(() => users.id, { onDelete: 'cascade' }),
    recipient_email: varchar('recipient_email', { length: 255 }),
    channel: notificationChannelEnum('channel').notNull().default('in_app'),
    subject: varchar('subject', { length: 255 }).notNull(),
    body: text('body'),
    link_url: varchar('link_url', { length: 512 }),
    payload: jsonb('payload'),
    is_read: boolean('is_read').notNull().default(false),
    read_at: timestamp('read_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_notifications_tenant_id').on(table.tenant_id),
    recipientIdx: index('idx_notifications_recipient_unread').on(table.recipient_user_id, table.is_read),
  })
)

// REFACTOR.md cross-cutting — SLA timer state used by sla-checker edge function.
export const slaLogs = pgTable(
  'sla_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entity_type: varchar('entity_type', { length: 64 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    sla_label: varchar('sla_label', { length: 120 }).notNull(),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    // Legacy calendar-hour rows use breach_at_seconds; process rows use
    // {clock_type: 'business_days', breach_business_days, warning_at_pct}.
    sla_seconds: jsonb('sla_seconds').notNull(),
    warned_at: timestamp('warned_at', { withTimezone: true }),
    breached_at: timestamp('breached_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index('idx_sla_logs_tenant_id').on(table.tenant_id),
    entityIdx: index('idx_sla_logs_entity').on(table.entity_type, table.entity_id),
    openIdx: index('idx_sla_logs_open').on(table.tenant_id, table.completed_at),
  })
)

export type Notification = typeof notifications.$inferSelect
export type SlaLog = typeof slaLogs.$inferSelect
