import { describe, expect, it } from 'vitest'
import {
  bir2307Available,
  invoiceDocumentState,
  invoiceStateMark,
  invoiceStateNotice,
} from './invoice-document-state'

describe('invoiceDocumentState', () => {
  it.each(['issued', 'partial_payment', 'paid', 'overdue'])('treats an un-reversed %s invoice as valid', (status) => {
    expect(invoiceDocumentState({ status, reversed_at: null })).toBe('valid')
  })

  it('marks draft and cancelled invoices', () => {
    expect(invoiceDocumentState({ status: 'draft' })).toBe('draft')
    expect(invoiceDocumentState({ status: 'cancelled', reversed_at: null })).toBe('cancelled')
  })

  it('reads a reversal from reversed_at even though the status still says issued or paid', () => {
    expect(invoiceDocumentState({ status: 'issued', reversed_at: new Date('2026-11-10T00:00:00Z') })).toBe('reversed')
    expect(invoiceDocumentState({ status: 'paid', reversed_at: '2026-11-10T00:00:00Z' })).toBe('reversed')
  })

  it('does not mistake a missing status for a problem', () => {
    expect(invoiceDocumentState({ status: undefined })).toBe('valid')
  })
})

describe('invoice state wording', () => {
  it('has a mark and a notice for every non-valid state and none for a valid one', () => {
    expect(invoiceStateMark('draft')).toBe('DRAFT')
    expect(invoiceStateMark('cancelled')).toBe('CANCELLED')
    expect(invoiceStateMark('reversed')).toBe('REVERSED')
    expect(invoiceStateMark('valid')).toBeNull()
    for (const state of ['draft', 'cancelled', 'reversed'] as const) {
      expect(invoiceStateNotice(state)).toContain('not')
    }
    expect(invoiceStateNotice('valid')).toBeNull()
  })
})

describe('bir2307Available', () => {
  it('hides the certificate for draft and cancelled invoices only', () => {
    expect(bir2307Available('draft')).toBe(false)
    expect(bir2307Available('cancelled')).toBe(false)
    expect(bir2307Available('valid')).toBe(true)
    expect(bir2307Available('reversed')).toBe(true)
  })
})
