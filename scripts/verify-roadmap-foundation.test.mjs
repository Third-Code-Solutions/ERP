import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migration = await readFile(
  'supabase/migrations/20260921181036_roadmap_integrations_foundation.sql',
  'utf8',
)
const service = await readFile('apps/api/src/roadmap/roadmap.service.ts', 'utf8')
const controller = await readFile('apps/api/src/roadmap/roadmap.controller.ts', 'utf8')

test('roadmap migration contains every guarded foundation table', () => {
  for (const table of [
    'tenant_feature_flags',
    'procurement_requisitions',
    'roadmap_workflow_events',
    'inventory_reservations',
    'landed_cost_documents',
    'landed_cost_allocations',
    'price_lists',
    'price_list_items',
    'tenant_currencies',
    'exchange_rates',
    'tax_profiles',
    'statutory_outputs',
    'fiscal_period_close_runs',
    'sap_posting_outbox',
    'provider_delivery_outbox',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  }
  assert.match(migration, /foreach table_name in array/)
  assert.match(migration, /alter table public\.%I enable row level security/)
  assert.match(migration, /tenant_id = public\.auth_tenant_id\(\)/)
})

test('roadmap ledger extension is guarded and append-only', () => {
  assert.match(migration, /add value if not exists 'landed_cost'/)
  assert.match(migration, /stock_ledger_entries_landed_cost_document_fk/)
  assert.match(migration, /stock_ledger_entries_landed_cost_allocation_fk/)
  assert.match(migration, /guard_stock_ledger_entry\(\)/)
  assert.match(migration, /app\.stock_ledger_write/)
  assert.match(migration, /idempotency_key varchar\(256\) not null/)
})

test('roadmap service keeps mutations feature-gated and idempotent', () => {
  for (const feature of [
    'procurement_lifecycle',
    'stock_reservations',
    'landed_cost',
    'price_lists',
    'tax_statutory_outputs',
    'multi_currency',
    'period_close',
    'sap_posting',
    'provider_delivery',
  ]) {
    assert.match(service, new RegExp(`'${feature}'`))
  }
  assert.match(service, /requireIdempotency/)
  assert.match(service, /writeSemantic/)
})

test('roadmap controller exposes each requested route under an explicit capability', () => {
  for (const route of [
    "procurement/requisitions",
    "procurement/requisitions/:requisitionId/trace",
    "inventory/reservations",
    "inventory/landed-cost",
    "price-lists/resolve",
    "currency/convert",
    "currency/configuration",
    "tax/calculate",
    "tax/profiles/:taxProfileId/workflow",
    "period-close",
    "sap/postings",
    "provider-delivery",
  ]) {
    assert.match(controller, new RegExp(route.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')))
  }
  assert.match(controller, /@RequireCapabilities\(/)
})
