import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  notificationDeliveries,
  notificationOutbox,
  notifications,
} from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260729233017_notification_outbox_foundation.sql'
  ),
  'utf8'
).toLowerCase()
const workflowMigrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260801110000_purchase_order_workflow_notifications.sql'
  ),
  'utf8'
).toLowerCase()

describe('notification outbox foundation', () => {
  it('creates durable tenant-scoped intent and delivery state', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.notification_outbox'
    )
    expect(migrationSql).toContain(
      'create table if not exists public.notification_deliveries'
    )
    expect(migrationSql).toContain(
      'ux_notification_outbox_tenant_event'
    )
    expect(migrationSql).toContain(
      'ux_notification_deliveries_recipient_channel'
    )
    expect(migrationSql).toContain(
      'notification_deliveries_state_timestamps'
    )
  })

  it('enforces tenant-composite parents and idempotent in-app rows', () => {
    expect(migrationSql).toMatch(
      /notification_deliveries_outbox_tenant_fk[\s\S]*?foreign key \(tenant_id, outbox_id\)[\s\S]*?references public\.notification_outbox \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /notification_deliveries_recipient_tenant_fk[\s\S]*?foreign key \(tenant_id, recipient_user_id\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /notifications_source_delivery_tenant_fk[\s\S]*?foreign key \(tenant_id, source_delivery_id\)[\s\S]*?references public\.notification_deliveries \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'ux_notifications_tenant_source_delivery'
    )
  })

  it('keeps outbox state and notification writes out of browser roles', () => {
    expect(migrationSql).toMatch(
      /revoke all privileges on table[\s\S]*?public\.notification_outbox,[\s\S]*?public\.notification_deliveries[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /revoke insert, update, delete on table public\.notifications[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toContain(
      'alter table public.notification_outbox enable row level security'
    )
    expect(migrationSql).toContain(
      'alter table public.notification_deliveries enable row level security'
    )
  })

  it('constrains Purchase Order workflow payloads without changing RFQ events', () => {
    expect(workflowMigrationSql).toContain(
      'notification_outbox_purchase_order_workflow_payload'
    )
    expect(workflowMigrationSql).toContain(
      "event_type <> 'purchase_order.workflow_changed'"
    )
    expect(workflowMigrationSql).toContain(
      "payload->>'purchase_order_id' = aggregate_id::text"
    )
  })

  it('keeps Drizzle names aligned with database constraints', () => {
    expect(
      getTableConfig(notificationOutbox).uniqueConstraints
    ).toEqual([])
    expect(
      getTableConfig(notificationOutbox).indexes.map(
        (index) => index.config.name
      )
    ).toContain('ux_notification_outbox_tenant_event')
    expect(
      getTableConfig(notificationDeliveries).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'notification_deliveries_outbox_tenant_fk',
        'notification_deliveries_recipient_tenant_fk',
      ])
    )
    expect(
      getTableConfig(notifications).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toContain('notifications_source_delivery_tenant_fk')
  })
})
