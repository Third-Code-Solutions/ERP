import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { supplierBillPostRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260802210000_supplier_bill_post_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('Supplier Bill posting idempotency foundation', () => {
  it('creates one tenant-scoped posting request table', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.supplier_bill_post_requests'
    )
    expect(migrationSql).toContain(
      'supplier_bill_post_request_state'
    )
    expect(migrationSql).toContain(
      'ux_supplier_bill_post_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'supplier_bill_post_requests_state_payload'
    )
  })

  it('requires tenant-composite parents and server-only privileges', () => {
    expect(migrationSql).toMatch(
      /supplier_bill_post_requests_bill_tenant_fk[\s\S]*?foreign key \(tenant_id, supplier_bill_id\)[\s\S]*?references public\.supplier_bills \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /supplier_bill_post_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.supplier_bill_post_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.supplier_bill_post_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle table names aligned with migration constraints', () => {
    expect(
      getTableConfig(supplierBillPostRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_supplier_bill_post_requests_tenant_key',
        'idx_supplier_bill_post_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(supplierBillPostRequests).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'supplier_bill_post_requests_bill_tenant_fk',
        'supplier_bill_post_requests_created_by_tenant_fk',
      ])
    )
  })
})
