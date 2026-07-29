import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'email',
  'sms',
])

export const notificationDeliveryStatusEnum = pgEnum(
  'notification_delivery_status',
  ['pending', 'processing', 'delivered', 'dead_letter']
)

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    event_key: varchar('event_key', { length: 255 }).notNull(),
    event_type: varchar('event_type', { length: 100 }).notNull(),
    aggregate_type: varchar('aggregate_type', {
      length: 64,
    }).notNull(),
    aggregate_id: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    created_at: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_notification_outbox_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantEventUniqueIdx: uniqueIndex(
      'ux_notification_outbox_tenant_event'
    ).on(table.tenant_id, table.event_key),
    aggregateIdx: index(
      'idx_notification_outbox_tenant_aggregate'
    ).on(
      table.tenant_id,
      table.aggregate_type,
      table.aggregate_id
    ),
  })
)

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    outbox_id: uuid('outbox_id').notNull(),
    recipient_user_id: uuid('recipient_user_id').notNull(),
    recipient_email: varchar('recipient_email', {
      length: 255,
    }).notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    status: notificationDeliveryStatusEnum('status')
      .notNull()
      .default('pending'),
    idempotency_key: varchar('idempotency_key', {
      length: 256,
    }).notNull(),
    attempt_count: integer('attempt_count').notNull().default(0),
    provider_message_id: varchar('provider_message_id', {
      length: 255,
    }),
    last_error: text('last_error'),
    processing_started_at: timestamp('processing_started_at', {
      withTimezone: true,
    }),
    delivered_at: timestamp('delivered_at', {
      withTimezone: true,
    }),
    dead_lettered_at: timestamp('dead_lettered_at', {
      withTimezone: true,
    }),
    created_at: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_notification_deliveries_tenant_id_id'
    ).on(table.tenant_id, table.id),
    recipientChannelUniqueIdx: uniqueIndex(
      'ux_notification_deliveries_recipient_channel'
    ).on(
      table.tenant_id,
      table.outbox_id,
      table.recipient_user_id,
      table.channel
    ),
    idempotencyUniqueIdx: uniqueIndex(
      'ux_notification_deliveries_tenant_idempotency'
    ).on(table.tenant_id, table.idempotency_key),
    pendingIdx: index(
      'idx_notification_deliveries_tenant_status'
    ).on(table.tenant_id, table.status, table.updated_at),
    outboxTenantFk: foreignKey({
      name: 'notification_deliveries_outbox_tenant_fk',
      columns: [table.tenant_id, table.outbox_id],
      foreignColumns: [
        notificationOutbox.tenant_id,
        notificationOutbox.id,
      ],
    }).onDelete('cascade'),
    recipientTenantFk: foreignKey({
      name: 'notification_deliveries_recipient_tenant_fk',
      columns: [table.tenant_id, table.recipient_user_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    supportedChannelCheck: check(
      'notification_deliveries_supported_channel',
      sql`${table.channel} in ('in_app', 'email')`
    ),
    attemptCountCheck: check(
      'notification_deliveries_attempt_count_nonnegative',
      sql`${table.attempt_count} >= 0`
    ),
  })
)

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
    source_delivery_id: uuid('source_delivery_id'),
    is_read: boolean('is_read').notNull().default(false),
    read_at: timestamp('read_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_notifications_tenant_id').on(table.tenant_id),
    recipientIdx: index('idx_notifications_recipient_unread').on(table.recipient_user_id, table.is_read),
    sourceDeliveryUniqueIdx: uniqueIndex(
      'ux_notifications_tenant_source_delivery'
    ).on(table.tenant_id, table.source_delivery_id),
    sourceDeliveryTenantFk: foreignKey({
      name: 'notifications_source_delivery_tenant_fk',
      columns: [table.tenant_id, table.source_delivery_id],
      foreignColumns: [
        notificationDeliveries.tenant_id,
        notificationDeliveries.id,
      ],
    }).onDelete('restrict'),
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
    sla_seconds: jsonb('sla_seconds').notNull(), // {warning_at_pct: 0.8, breach_at_seconds: 86400}
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
export type NotificationOutbox = typeof notificationOutbox.$inferSelect
export type NotificationDelivery =
  typeof notificationDeliveries.$inferSelect
export type SlaLog = typeof slaLogs.$inferSelect
