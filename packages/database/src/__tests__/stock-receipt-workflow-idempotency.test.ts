import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { stockReceiptWorkflowRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260802130000_stock_receipt_workflow_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('Stock Receipt post/reverse idempotency foundation', () => {
  it('creates one tenant-scoped request record for both workflow actions', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.stock_receipt_workflow_requests'
    )
    expect(migrationSql).toContain(
      'stock_receipt_workflow_action'
    )
    expect(migrationSql).toContain(
      'ux_stock_receipt_workflow_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'stock_receipt_workflow_requests_state_payload'
    )
  })

  it('requires tenant-composite parents and browser-denied server state', () => {
    expect(migrationSql).toMatch(
      /stock_receipt_workflow_requests_receipt_tenant_fk[\s\S]*?foreign key \(tenant_id, stock_receipt_id\)[\s\S]*?references public\.stock_receipts \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /stock_receipt_workflow_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.stock_receipt_workflow_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.stock_receipt_workflow_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle table names aligned with migration constraints', () => {
    expect(
      getTableConfig(stockReceiptWorkflowRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_stock_receipt_workflow_requests_tenant_key',
        'idx_stock_receipt_workflow_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(stockReceiptWorkflowRequests).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'stock_receipt_workflow_requests_receipt_tenant_fk',
        'stock_receipt_workflow_requests_created_by_tenant_fk',
      ])
    )
  })
})
