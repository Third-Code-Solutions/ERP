import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/procurement/actions', () => ({
  advancePoStatus: vi.fn(),
  submitPoForPmApproval: vi.fn(),
  pmApprovePo: vi.fn(),
  commercialApprovePo: vi.fn(),
  scmIssuePo: vi.fn(),
  rejectPoApproval: vi.fn(),
}))

import { PoStatusActions } from './po-status-actions'

const PO_ID = '33333333-3333-4333-8333-333333333333'

describe('PoStatusActions', () => {
  it('hides the delivery close-out from roles without po.issue', () => {
    expect(renderToStaticMarkup(<PoStatusActions poId={PO_ID} currentStatus="issued" viewerRole="viewer" />)).toBe('')
    expect(renderToStaticMarkup(<PoStatusActions poId={PO_ID} currentStatus="issued" viewerRole="finance" />)).toBe('')
    expect(renderToStaticMarkup(<PoStatusActions poId={PO_ID} currentStatus="issued" viewerRole="procurement" />)).toContain(
      'Mark Fully Delivered'
    )
  })

  it('lets a PM submit a draft but not cancel it', () => {
    const markup = renderToStaticMarkup(<PoStatusActions poId={PO_ID} currentStatus="draft" viewerRole="pm" />)
    expect(markup).toContain('Submit for PM approval')
    expect(markup).not.toContain('Cancel')
  })

  it('renders nothing when the role is unknown', () => {
    expect(renderToStaticMarkup(<PoStatusActions poId={PO_ID} currentStatus="draft" viewerRole={null} />)).toBe('')
  })

  it('filters legacy transitions by the capability each one needs', () => {
    const markup = renderToStaticMarkup(<PoStatusActions poId={PO_ID} currentStatus="submitted" viewerRole="commercial" />)
    expect(markup).toContain('Confirm PO')
    expect(markup).not.toContain('Cancel')
  })
})
