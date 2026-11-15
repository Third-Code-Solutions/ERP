import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpRole } from '@third-code-erp/shared-types'

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

function buttons(currentStatus: string, viewerRole: ErpRole | null): string[] {
  const html = renderToStaticMarkup(
    <PoStatusActions poId="po-1" currentStatus={currentStatus} viewerRole={viewerRole} />
  )
  const labels = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1]!)
  // Every button is plain text, so none can slip past the label match.
  expect(html.match(/<button/g)?.length ?? 0).toBe(labels.length)
  return labels
}

describe('PoStatusActions', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
  })

  // advancePoStatus requires po.issue to cancel or mark delivery, po.approve to confirm.
  it.each([
    ['draft', 'pm', ['Submit for PM approval']],
    ['draft', 'sd_pm_pe', ['Submit for PM approval']],
    ['draft', 'commercial', ['Submit for PM approval']],
    ['draft', 'procurement', ['Submit for PM approval', 'Cancel']],
    ['draft', 'viewer', []],
    ['issued', 'pm', []],
    ['issued', 'procurement', ['Mark Partial Delivery']],
    ['partial_delivered', 'commercial', []],
    ['partial_delivered', 'admin', ['Mark Fully Delivered']],
    ['submitted', 'commercial', ['Confirm PO']],
    ['submitted', 'procurement', ['Cancel']],
    ['submitted', 'owner', ['Confirm PO', 'Cancel']],
    ['confirmed', 'pm', []],
    ['confirmed', 'procurement', ['Mark Partial Delivery', 'Mark Delivered', 'Cancel']],
  ] as const)('%s PO, %s sees %j', (status, role, expected) => {
    expect(buttons(status, role)).toEqual(expected)
  })

  it('shows every button when the role is unknown (the server still enforces)', () => {
    expect(buttons('draft', null)).toEqual(['Submit for PM approval', 'Cancel'])
    expect(buttons('submitted', null)).toEqual(['Confirm PO', 'Cancel'])
  })

  it('keeps the approval steps on their own roles', () => {
    expect(buttons('pending_pm_approval', 'pm')).toEqual(['Approve as PM', 'Reject'])
    expect(buttons('pending_commercial_approval', 'pm')).toEqual([])
    expect(buttons('pending_scm_issuance', 'procurement')).toEqual([
      'Issue PO to supplier',
      'Reject',
    ])
  })

  it('lets the commercial approver reject at SCM issuance, and nobody else outside po.issue', () => {
    expect(buttons('pending_scm_issuance', 'commercial')).toEqual(['Reject'])
    expect(buttons('pending_scm_issuance', 'pm')).toEqual([])
    expect(buttons('pending_scm_issuance', null)).toEqual(['Issue PO to supplier', 'Reject'])
  })
})
