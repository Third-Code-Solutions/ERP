import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { deliveryWorkflowRequests } from '../schema/delivery-workflow-requests'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260802170000_delivery_inspection_complete_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('Delivery inspection-complete workflow migration', () => {
  it('extends the existing tenant-scoped delivery action enum', () => {
    expect(migrationSql).toContain('alter type public.delivery_workflow_action')
    expect(migrationSql).toContain("add value if not exists 'complete_inspection'")
    expect(migrationSql).toContain('begin;')
    expect(migrationSql).toContain('commit;')
  })

  it('keeps the existing request ledger tenant/idempotency boundary', () => {
    expect(Object.values(deliveryWorkflowRequests).length).toBeGreaterThan(0)
    expect(migrationSql).not.toContain('create table')
    expect(migrationSql).not.toContain('grant anon')
    expect(migrationSql).not.toContain('grant authenticated')
  })
})
