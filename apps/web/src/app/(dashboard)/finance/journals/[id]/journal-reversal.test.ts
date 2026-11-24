import { describe, expect, it } from 'vitest'
import { journalReversalRoute } from './journal-reversal'

const ID = '11111111-1111-4111-8111-111111111111'

describe('journalReversalRoute', () => {
  it('offers the direct reversal for a manual journal', () => {
    expect(
      journalReversalRoute({
        sourceType: 'manual',
        referenceType: null,
        referenceId: null,
      })
    ).toEqual({ kind: 'manual' })
  })

  it.each([
    ['customer_invoice', 'customer invoice', `/invoices/${ID}`],
    ['supplier_bill', 'supplier bill', `/finance/payables/${ID}`],
    ['cash_transaction', 'cash transaction', `/finance/cash/${ID}`],
    ['stock_receipt', 'stock receipt', `/inventory/receipts/${ID}`],
    ['stock_movement', 'stock movement', `/inventory/movements/${ID}`],
  ])('points a %s journal to its own document', (referenceType, document, href) => {
    expect(
      journalReversalRoute({
        sourceType: 'system',
        referenceType,
        referenceId: ID,
      })
    ).toEqual({ kind: 'workflow', document, href })
  })

  it('gives guidance without a link when the source document is unknown', () => {
    expect(
      journalReversalRoute({
        sourceType: 'system',
        referenceType: 'something_new',
        referenceId: ID,
      })
    ).toEqual({ kind: 'workflow', document: 'source document', href: null })
    expect(
      journalReversalRoute({
        sourceType: 'system',
        referenceType: 'supplier_bill',
        referenceId: null,
      })
    ).toEqual({ kind: 'workflow', document: 'supplier bill', href: null })
  })
})
