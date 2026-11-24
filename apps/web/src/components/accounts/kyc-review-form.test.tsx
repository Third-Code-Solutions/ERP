import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(dashboard)/crm/accounts/actions', () => ({ reviewKyc: vi.fn() }))

import { KycReviewForm, REJECT_KYC_CONFIRMATION } from './kyc-review-form'

const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

describe('KycReviewForm', () => {
  it('offers a first decision on a pending account with optional approval notes', () => {
    const markup = renderToStaticMarkup(<KycReviewForm accountId={ACCOUNT_ID} />)

    expect(markup).toContain(`name="account_id" value="${ACCOUNT_ID}"`)
    expect(markup).toContain('Record decision')
    expect(markup).not.toContain('is currently')
    expect(markup).toContain('Notes (optional)')
  })

  it.each(['flagged', 'rejected'])('explains that a %s account is being reconsidered and requires a reason', (status) => {
    const markup = renderToStaticMarkup(<KycReviewForm accountId={ACCOUNT_ID} currentStatus={status} />)

    expect(markup).toContain(`<strong>${status}</strong>`)
    expect(markup).toContain('kept in the audit trail')
    expect(markup).toContain('explain why the earlier decision is being changed')
    expect(markup).toMatch(/<textarea[^>]*required=""/)
  })

  it('confirms before a rejection and keeps typed notes by not using a form action', () => {
    const source = readFileSync(new URL('./kyc-review-form.tsx', import.meta.url), 'utf8')

    expect(REJECT_KYC_CONFIRMATION).toContain('Reject this account?')
    expect(source).toContain("decision === 'rejected' && !window.confirm(REJECT_KYC_CONFIRMATION)")
    expect(source).toContain('event.preventDefault()')
    expect(source).not.toContain('action={onSubmit}')
  })
})
