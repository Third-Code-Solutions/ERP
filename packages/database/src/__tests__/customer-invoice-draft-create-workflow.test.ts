import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { customerInvoiceDraftCreateRequests } from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260807130000_customer_invoice_draft_create_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('customer invoice draft creation workflow migration', () => {
  it('defines a tenant-scoped durable idempotency ledger', () => {
    expect(migration).toContain(
      'create table if not exists public.customer_invoice_draft_create_requests'
    )
    expect(migration).toContain(
      'customer_invoice_draft_create_request_state'
    )
    expect(migration).toContain(
      'ux_customer_invoice_draft_create_requests_tenant_key'
    )
    expect(migration).toContain(
      'customer_invoice_draft_create_requests_state_payload'
    )
  })

  it('requires tenant-composite parents and server-only privileges', () => {
    expect(migration).toMatch(
      /customer_invoice_draft_create_requests_project_tenant_fk[\s\S]*?foreign key \(tenant_id, project_id\)[\s\S]*?references public\.projects \(tenant_id, id\)/
    )
    expect(migration).toMatch(
      /customer_invoice_draft_create_requests_invoice_tenant_fk[\s\S]*?foreign key \(tenant_id, invoice_id\)[\s\S]*?references public\.invoices \(tenant_id, id\)/
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.customer_invoice_draft_create_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toMatch(
      /revoke insert, update, delete on table public\.invoices[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and foreign keys aligned', () => {
    expect(
      getTableConfig(customerInvoiceDraftCreateRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_customer_invoice_draft_create_requests_tenant_key',
        'idx_customer_invoice_draft_create_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(customerInvoiceDraftCreateRequests).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'customer_invoice_draft_create_requests_project_tenant_fk',
        'customer_invoice_draft_create_requests_invoice_tenant_fk',
        'customer_invoice_draft_create_requests_created_by_tenant_fk',
      ])
    )
  })
})
