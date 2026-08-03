import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { customerInvoiceIssueRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260803090000_customer_invoice_issue_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('Customer invoice issuance idempotency foundation', () => {
  it('creates one tenant-scoped issuance request table', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.customer_invoice_issue_requests'
    )
    expect(migrationSql).toContain(
      'customer_invoice_issue_request_state'
    )
    expect(migrationSql).toContain(
      'ux_customer_invoice_issue_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'customer_invoice_issue_requests_state_payload'
    )
  })

  it('requires tenant-composite parents and server-only privileges', () => {
    expect(migrationSql).toMatch(
      /customer_invoice_issue_requests_invoice_tenant_fk[\s\S]*?foreign key \(tenant_id, invoice_id\)[\s\S]*?references public\.invoices \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /customer_invoice_issue_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.customer_invoice_issue_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.customer_invoice_issue_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle table names aligned with migration constraints', () => {
    expect(
      getTableConfig(customerInvoiceIssueRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_customer_invoice_issue_requests_tenant_key',
        'idx_customer_invoice_issue_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(customerInvoiceIssueRequests).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'customer_invoice_issue_requests_invoice_tenant_fk',
        'customer_invoice_issue_requests_created_by_tenant_fk',
      ])
    )
  })
})
