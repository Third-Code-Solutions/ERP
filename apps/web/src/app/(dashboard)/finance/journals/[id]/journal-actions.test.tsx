import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('../../actions', () => ({
  postJournalEntry: vi.fn(),
  reverseJournalEntry: vi.fn(),
}))

import { JournalActions } from './journal-actions'

const BILL_ID = '11111111-1111-4111-8111-111111111111'

function render(
  overrides: Partial<React.ComponentProps<typeof JournalActions>>
): string {
  return renderToStaticMarkup(
    <JournalActions
      entryId="entry-1"
      status="posted"
      sourceType="manual"
      referenceType={null}
      referenceId={null}
      hasReversal={false}
      defaultDate="2026-11-17"
      {...overrides}
    />
  )
}

describe('JournalActions', () => {
  it('offers the reversal for a posted manual journal', () => {
    expect(render({})).toContain('Prepare reversal')
  })

  it('sends a supplier bill journal to the bill instead of a reversal that always fails', () => {
    const html = render({
      sourceType: 'system',
      referenceType: 'supplier_bill',
      referenceId: BILL_ID,
    })
    expect(html).not.toContain('Prepare reversal')
    expect(html).toContain('reverse the supplier bill')
    expect(html).toContain(`href="/finance/payables/${BILL_ID}"`)
  })

  it('explains the workflow even when the source document link is unknown', () => {
    const html = render({ sourceType: 'system', referenceType: null })
    expect(html).not.toContain('Prepare reversal')
    expect(html).toContain('cannot be reversed here')
    expect(html).not.toContain('<a ')
  })

  it('still offers Post journal for a draft', () => {
    expect(render({ status: 'draft' })).toContain('Post journal')
  })
})
