import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/procurement/rfqs/actions', () => ({
  completeRfq: vi.fn(),
  cancelRfq: vi.fn(),
}))

import { RfqTerminalActions } from './rfq-terminal-actions'

const RFQ_ID = '55555555-5555-4555-8555-555555555555'

// Result handling (refusal, thrown call, reason rule) is tested in
// lib/procurement/rfq-terminal-command.test.ts.
describe('RfqTerminalActions', () => {
  it('renders complete disabled until every line is covered, and the cancel controls', () => {
    const html = renderToStaticMarkup(<RfqTerminalActions rfqId={RFQ_ID} canComplete={false} />)

    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Complete RFQ<\/button>/)
    expect(html).toContain('aria-label="Cancellation reason"')
    expect(html).toContain('>Cancel RFQ</button>')
    expect(html).not.toContain('aria-invalid')
    expect(html).not.toContain('role="alert"')
  })

  it('enables complete once every line is covered', () => {
    const html = renderToStaticMarkup(<RfqTerminalActions rfqId={RFQ_ID} canComplete />)

    expect(html).toMatch(/<button type="button"(?! disabled)[^>]*>Complete RFQ<\/button>/)
  })
})
