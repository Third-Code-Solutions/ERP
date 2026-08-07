import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import {
  assertSafeMappingProposalPath,
  buildPurchaseOrderMappingProposal,
} from './lib/purchase-order-mapping-proposal.mjs'

const ROOT = 'D:/thirdcode/ERP'
const TENANT = '11111111-1111-4111-8111-111111111111'
const FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const THIRD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

test('recommends one deterministic canonical row and collision-free replacements', () => {
  const proposal = buildPurchaseOrderMappingProposal({
    capturedAt: '2026-08-07T00:00:00.000Z',
    duplicateRows: [
      {
        id: THIRD,
        tenantId: TENANT,
        poNumber: 'PO-0002',
        createdAt: '2026-08-03T00:00:00.000Z',
      },
      {
        id: FIRST,
        tenantId: TENANT,
        poNumber: 'PO-0002',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: SECOND,
        tenantId: TENANT,
        poNumber: 'PO-0002',
        createdAt: '2026-08-02T00:00:00.000Z',
      },
    ],
    scopedRows: [
      { tenantId: TENANT, poNumber: 'PO-0002' },
      { tenantId: TENANT, poNumber: 'PO-0002-R01' },
    ],
  })

  assert.equal(proposal.kind, 'purchase_order_duplicate_mapping_proposal')
  assert.equal(proposal.proposalVersion, 1)
  assert.equal(proposal.ownerApproval.status, 'pending')
  assert.deepEqual(
    proposal.recommendations.map((entry) => ({
      id: entry.purchaseOrderId,
      action: entry.suggestedAction,
      number: entry.suggestedReplacementNumber,
    })),
    [
      { id: FIRST, action: 'keep', number: 'PO-0002' },
      { id: SECOND, action: 'renumber', number: 'PO-0002-R02' },
      { id: THIRD, action: 'renumber', number: 'PO-0002-R03' },
    ]
  )
})

test('keeps generated numbers within the database length limit', () => {
  const currentNumber = 'X'.repeat(50)
  const proposal = buildPurchaseOrderMappingProposal({
    duplicateRows: [
      {
        id: FIRST,
        tenantId: TENANT,
        poNumber: currentNumber,
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: SECOND,
        tenantId: TENANT,
        poNumber: currentNumber,
        createdAt: '2026-08-02T00:00:00.000Z',
      },
    ],
    scopedRows: [{ tenantId: TENANT, poNumber: currentNumber }],
  })

  assert.equal(
    proposal.recommendations[1].suggestedReplacementNumber.length,
    50
  )
  assert.match(
    proposal.recommendations[1].suggestedReplacementNumber,
    /-R01$/
  )
})

test('rejects repeated records and malformed values', () => {
  const row = {
    id: FIRST,
    tenantId: TENANT,
    poNumber: 'PO-0002',
    createdAt: '2026-08-01T00:00:00.000Z',
  }
  assert.throws(
    () =>
      buildPurchaseOrderMappingProposal({
        duplicateRows: [row, row],
        scopedRows: [{ tenantId: TENANT, poNumber: 'PO-0002' }],
      }),
    /repeated Purchase Order id/
  )
  assert.throws(
    () =>
      buildPurchaseOrderMappingProposal({
        duplicateRows: [{ ...row, poNumber: '' }],
        scopedRows: [{ tenantId: TENANT, poNumber: 'PO-0002' }],
      }),
    /poNumber must be a non-empty string/
  )
  assert.throws(
    () =>
      buildPurchaseOrderMappingProposal({
        duplicateRows: [row],
        scopedRows: [],
      }),
    /scopedRows does not cover/
  )
  assert.throws(
    () =>
      buildPurchaseOrderMappingProposal({
        duplicateRows: [row],
        scopedRows: [{ tenantId: TENANT, poNumber: 'PO-0002' }],
        postgresMajor: 16,
      }),
    /not PostgreSQL 17/
  )
  assert.throws(
    () =>
      buildPurchaseOrderMappingProposal({
        duplicateRows: [row],
        scopedRows: [{ tenantId: TENANT, poNumber: 'PO-0002' }],
      }),
    /only complete duplicate groups/
  )
  assert.throws(
    () =>
      buildPurchaseOrderMappingProposal({
        duplicateRows: [row, { ...row, id: SECOND, poNumber: ' PO-0002' }],
        scopedRows: [{ tenantId: TENANT, poNumber: 'PO-0002' }],
      }),
    /leading or trailing whitespace/
  )
  assert.throws(
    () =>
      buildPurchaseOrderMappingProposal({
        duplicateRows: [row, { ...row, id: SECOND, createdAt: 'invalid' }],
        scopedRows: [{ tenantId: TENANT, poNumber: 'PO-0002' }],
      }),
    /createdAt must be valid/
  )
})

test('requires proposal artifacts outside repository and build outputs', () => {
  assert.equal(
    assertSafeMappingProposalPath(ROOT, 'C:/secure/thirdcode-po-proposal.json'),
    resolve('C:/secure/thirdcode-po-proposal.json')
  )
  assert.throws(
    () => assertSafeMappingProposalPath(ROOT, 'D:/thirdcode/ERP/proposal.json'),
    /outside the repository/
  )
  assert.throws(
    () => assertSafeMappingProposalPath(ROOT, 'C:/public/thirdcode-po-proposal.json'),
    /build or public-output/
  )
})
