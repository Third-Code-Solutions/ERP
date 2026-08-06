import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizePurchaseOrderMapping,
  validatePurchaseOrderMapping,
} from './lib/purchase-order-duplicate-mapping.mjs'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OCCUPIED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const duplicateRows = [
  { id: FIRST, tenantId: TENANT, poNumber: 'PO-0002' },
  { id: SECOND, tenantId: TENANT, poNumber: 'PO-0002' },
]

test('accepts complete, current, tenant-scoped mapping', () => {
  const report = validatePurchaseOrderMapping({
    mapping: {
      version: 1,
      entries: [
        {
          tenantId: TENANT,
          purchaseOrderId: FIRST,
          currentNumber: 'PO-0002',
          replacementNumber: 'PO-0002',
        },
        {
          tenantId: TENANT,
          purchaseOrderId: SECOND,
          currentNumber: 'PO-0002',
          replacementNumber: 'PO-0002-01',
        },
      ],
    },
    duplicateRows,
    scopedRows: duplicateRows,
  })
  assert.equal(report.status, 'ready')
  assert.deepEqual(report.conflicts, {
    missingEntryRefs: [],
    extraEntryRefs: [],
    staleEntryRefs: [],
    tenantMismatchRefs: [],
    occupiedTargetRefs: [],
  })
})

test('blocks incomplete and stale mapping without exposing business values', () => {
  const report = validatePurchaseOrderMapping({
    mapping: {
      version: 1,
      entries: [
        {
          tenantId: TENANT,
          purchaseOrderId: FIRST,
          currentNumber: 'PO-OLD',
          replacementNumber: 'PO-0002',
        },
      ],
    },
    duplicateRows,
    scopedRows: duplicateRows,
  })
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /cover every duplicate/)
  assert.match(report.blockers.join('\n'), /current numbers/)
  assert.equal(JSON.stringify(report).includes('PO-0002'), false)
  assert.equal(JSON.stringify(report).includes(FIRST), false)
})

test('blocks occupied targets and tenant mismatch', () => {
  const report = validatePurchaseOrderMapping({
    mapping: {
      version: 1,
      entries: [
        {
          tenantId: OTHER_TENANT,
          purchaseOrderId: FIRST,
          currentNumber: 'PO-0002',
          replacementNumber: 'PO-0009',
        },
        {
          tenantId: TENANT,
          purchaseOrderId: SECOND,
          currentNumber: 'PO-0002',
          replacementNumber: 'PO-0009',
        },
      ],
    },
    duplicateRows,
    scopedRows: [
      ...duplicateRows,
      { id: OCCUPIED, tenantId: TENANT, poNumber: 'PO-0009' },
    ],
  })
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /tenant does not match/)
  assert.match(report.blockers.join('\n'), /already used/)
})

test('rejects duplicate mapping ids and target numbers', () => {
  assert.throws(
    () =>
      normalizePurchaseOrderMapping({
        version: 1,
        entries: [
          {
            tenantId: TENANT,
            purchaseOrderId: FIRST,
            currentNumber: 'PO-0002',
            replacementNumber: 'PO-0002-01',
          },
          {
            tenantId: TENANT,
            purchaseOrderId: FIRST,
            currentNumber: 'PO-0002',
            replacementNumber: 'PO-0002-01',
          },
        ],
      }),
    /duplicate Purchase Order id/
  )
})
