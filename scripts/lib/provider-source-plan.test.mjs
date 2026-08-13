import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeProviderSource } from './provider-source-plan.mjs'

test('summarizes pending source migrations and SQL risk counts', () => {
  const report = summarizeProviderSource({
    migrations: [
      { version: '001', filename: '001.sql', sqlRisk: [] },
      { version: '002', filename: '002.sql', sqlRisk: ['drop-object'] },
      { version: '003', filename: '003.sql', sqlRisk: ['drop-object', 'update-data'] },
    ],
    appliedVersions: ['001'],
    duplicatePurchaseOrderGroups: [
      { tenantId: 'redacted', poNumber: 'PO-0002', rowCount: 2 },
    ],
  })

  assert.equal(report.sourceCount, 3)
  assert.equal(report.pendingCount, 2)
  assert.equal(report.firstPending, '002.sql')
  assert.deepEqual(report.riskCounts, {
    'drop-object': 2,
    'update-data': 1,
  })
  assert.deepEqual(report.duplicatePurchaseOrderGroups, [
    { tenantId: 'redacted', poNumber: 'PO-0002', rowCount: 2 },
  ])
  assert.equal(report.ready, false)
})

test('reports ready only when source is fully applied and duplicate-free', () => {
  const report = summarizeProviderSource({
    migrations: [{ version: '001', filename: '001.sql', sqlRisk: [] }],
    appliedVersions: ['001'],
  })
  assert.equal(report.ready, true)
  assert.equal(report.pendingCount, 0)
})
