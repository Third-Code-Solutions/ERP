import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/(dashboard)/projects/[id]/vos/actions', () => ({
  cancelVoSigningRequest: vi.fn(),
  rejectVo: vi.fn(),
  resendVoSigningLink: vi.fn(),
  submitVoForClientSignature: vi.fn(),
  submitVoForCommercialPricing: vi.fn(),
}))

import { VoApprovalActions } from './vo-approval-actions'

function render(props: Partial<React.ComponentProps<typeof VoApprovalActions>>): string {
  return renderToStaticMarkup(
    <VoApprovalActions
      voId="vo-1"
      status="pending_client_signature"
      canSubmitForCommercialPricing={false}
      canSendForClientSignature
      canReject
      {...props}
    />
  )
}

describe('VoApprovalActions', () => {
  it('lets the sender resend or cancel a pending signature request', () => {
    const html = render({})

    expect(html).toContain('Awaiting client signature')
    expect(html).toContain('Resend signing link')
    expect(html).toContain('Cancel request')
    expect(html).toContain('48 hours')
    expect(html).not.toContain('DocuSeal')
  })

  it('shows the waiting state without resend or cancel to a role that cannot send', () => {
    const html = render({ canSendForClientSignature: false })

    expect(html).toContain('Awaiting client signature')
    expect(html).not.toContain('Resend signing link')
    expect(html).not.toContain('Cancel request')
  })

  it('offers the first send once commercial has priced the VO', () => {
    const html = render({ status: 'pending_commercial_pricing' })

    expect(html).toContain('Send for client signature')
    expect(html).not.toContain('Resend signing link')
  })

  it('has no actions once the VO is rejected', () => {
    const html = render({ status: 'rejected' })

    expect(html).not.toContain('<button')
  })
})
