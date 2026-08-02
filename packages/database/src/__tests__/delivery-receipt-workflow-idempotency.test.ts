import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { deliveryWorkflowRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260802140000_delivery_receipt_workflow_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('Delivery receipt idempotency foundation', () => {
  it('creates one tenant-scoped request record for receipt transitions', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.delivery_workflow_requests'
    )
    expect(migrationSql).toContain('delivery_workflow_action')
    expect(migrationSql).toContain(
      'ux_delivery_workflow_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'delivery_workflow_requests_state_payload'
    )
  })

  it('requires tenant-composite parents and browser-denied server state', () => {
    expect(migrationSql).toMatch(
      /delivery_workflow_requests_schedule_tenant_fk[\s\S]*?foreign key \(tenant_id, delivery_schedule_id\)[\s\S]*?references public\.delivery_schedules \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /delivery_workflow_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.delivery_workflow_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.delivery_workflow_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle table names aligned with migration constraints', () => {
    expect(
      getTableConfig(deliveryWorkflowRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_delivery_workflow_requests_tenant_key',
        'idx_delivery_workflow_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(deliveryWorkflowRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'delivery_workflow_requests_schedule_tenant_fk',
        'delivery_workflow_requests_created_by_tenant_fk',
      ])
    )
  })
})
