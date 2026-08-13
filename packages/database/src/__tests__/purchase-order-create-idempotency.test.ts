import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  purchaseOrderCreateRequests,
  purchaseOrders,
} from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260801090000_purchase_order_create_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('standalone Purchase Order idempotency foundation', () => {
  it('creates tenant-composite request evidence and unique PO numbers', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.purchase_order_create_requests'
    )
    expect(migrationSql).toContain(
      'ux_purchase_order_create_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'ux_purchase_orders_tenant_po_number'
    )
    expect(migrationSql).toContain(
      'purchase_order_create_requests_state_payload'
    )
  })

  it('requires tenant-composite parents and browser-denied server state', () => {
    expect(migrationSql).toMatch(
      /purchase_order_create_requests_purchase_order_tenant_fk[\s\S]*?foreign key \(tenant_id, purchase_order_id\)[\s\S]*?references public\.purchase_orders \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /purchase_order_create_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.purchase_order_create_requests enable row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.purchase_order_create_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle table names aligned with migration constraints', () => {
    expect(
      getTableConfig(purchaseOrderCreateRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_purchase_order_create_requests_tenant_key',
        'idx_purchase_order_create_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(purchaseOrderCreateRequests).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'purchase_order_create_requests_purchase_order_tenant_fk',
        'purchase_order_create_requests_created_by_tenant_fk',
      ])
    )
    expect(
      getTableConfig(purchaseOrders).indexes.map(
        (index) => index.config.name
      )
    ).toContain('ux_purchase_orders_tenant_po_number')
  })
})
