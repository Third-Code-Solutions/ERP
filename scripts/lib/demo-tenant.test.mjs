import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getConfiguredDemoTenantSlug,
  selectDemoTenant,
} from './demo-tenant.mjs'

test('selects only configured dedicated demo tenant', () => {
  const rows = [
    { id: 'abi', slug: 'abi-production' },
    { id: 'demo', slug: 'buildops-e2e' },
  ]
  assert.deepEqual(selectDemoTenant(rows, 'buildops-e2e'), rows[1])
})

test('does not fall back to first tenant', () => {
  assert.throws(
    () => selectDemoTenant([{ id: 'abi', slug: 'abi-production' }], 'buildops-e2e'),
    /Dedicated demo tenant not found/
  )
})

test('rejects production-looking demo override', () => {
  assert.throws(
    () => getConfiguredDemoTenantSlug({ DEMO_TENANT_SLUG: 'abi-production' }),
    /dedicated demo/
  )
})
