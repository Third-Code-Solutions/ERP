import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import {
  assertSafeMappingTemplatePath,
  buildPurchaseOrderMappingTemplate,
} from './lib/purchase-order-mapping-template.mjs'

const ROOT = 'D:/thirdcode/ERP'
const TENANT = '11111111-1111-4111-8111-111111111111'
const FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

test('creates a deterministic owner-review skeleton without guessing replacements', () => {
  const template = buildPurchaseOrderMappingTemplate({
    capturedAt: '2026-08-06T00:00:00.000Z',
    rows: [
      {
        id: SECOND,
        tenantId: TENANT,
        poNumber: 'PO-0002',
        createdAt: '2026-08-02T00:00:00.000Z',
      },
      {
        id: FIRST,
        tenantId: TENANT,
        poNumber: 'PO-0002',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        tenantId: TENANT,
        poNumber: 'PO-0003',
        createdAt: '2026-08-03T00:00:00.000Z',
      },
    ],
  })

  assert.deepEqual(template.entries, [
    {
      tenantId: TENANT,
      purchaseOrderId: FIRST,
      currentNumber: 'PO-0002',
      replacementNumber: '',
    },
    {
      tenantId: TENANT,
      purchaseOrderId: SECOND,
      currentNumber: 'PO-0002',
      replacementNumber: '',
    },
  ])
  assert.equal(template.snapshot.duplicateRecords, 2)
  assert.equal(JSON.stringify(template).includes('PO-0002-01'), false)
})

test('rejects malformed snapshot rows', () => {
  assert.throws(
    () =>
      buildPurchaseOrderMappingTemplate({
        rows: [{ id: FIRST, tenantId: TENANT, poNumber: '' }],
      }),
    /poNumber must be a non-empty string/
  )
})

test('requires the artifact outside the repository and build outputs', () => {
  assert.equal(
    assertSafeMappingTemplatePath(ROOT, 'C:/secure/thirdcode-po-template.json'),
    resolve('C:/secure/thirdcode-po-template.json')
  )
  assert.throws(
    () => assertSafeMappingTemplatePath(ROOT, 'D:/thirdcode/ERP/template.json'),
    /outside the repository/
  )
  assert.throws(
    () => assertSafeMappingTemplatePath(ROOT, 'C:/public/thirdcode-po-template.json'),
    /build or public-output/
  )
})
