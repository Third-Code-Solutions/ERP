import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('../actions', () => ({
  autoMatchBankStatement: vi.fn(),
  deleteBankStatementDraft: vi.fn(),
  matchBankStatementLine: vi.fn(),
  reconcileBankStatement: vi.fn(),
  unmatchBankStatementLine: vi.fn(),
  voidBankStatement: vi.fn(),
}))

import {
  BankStatementActions,
  type ReconciliationCandidate,
  type ReconciliationLine,
} from './statement-actions'

const lines: ReconciliationLine[] = [
  {
    id: 'line-1',
    line_number: 1,
    transaction_date: '2026-07-01',
    reference_number: 'DEP-1',
    description: 'Customer deposit',
    amount_cents: 50_000,
    matched_cash_transaction_id: 'cash-1',
    matched_at: '2026-07-02T00:00:00Z',
    matched_internal_number: 'CT-0001',
    matched_reference_number: 'OR-100',
    matched_transaction_date: '2026-07-01',
  },
  {
    id: 'line-2',
    line_number: 2,
    transaction_date: '2026-07-03',
    reference_number: null,
    description: 'Bank charge',
    amount_cents: -1_500,
    matched_cash_transaction_id: null,
    matched_at: null,
    matched_internal_number: null,
    matched_reference_number: null,
    matched_transaction_date: null,
  },
]
const candidates: ReconciliationCandidate[] = []

function render(
  canManage: boolean,
  status: 'draft' | 'reconciled' | 'voided'
): string {
  return renderToStaticMarkup(
    <BankStatementActions
      statementId="statement-1"
      status={status}
      canManage={canManage}
      currency="PHP"
      lines={lines}
      candidates={candidates}
    />
  )
}

describe('BankStatementActions', () => {
  it('shows a view-only role every line and its match without any control', () => {
    const html = render(false, 'draft')
    expect(html).toContain('Customer deposit')
    expect(html).toContain('Bank charge')
    expect(html).toContain('CT-0001')
    expect(html).toContain('unmatched')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<select')
  })

  it('keeps the matching and finalizing controls for a manager of a draft', () => {
    const html = render(true, 'draft')
    expect(html).toContain('Run exact auto-match')
    expect(html).toContain('Reconcile statement')
    expect(html).toContain('Unmatch')
  })

  it('hides the void control from a reader of a reconciled statement', () => {
    expect(render(false, 'reconciled')).not.toContain('Void reconciliation')
    expect(render(true, 'reconciled')).toContain('Void reconciliation')
  })
})
