import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/procurement/actions', () => ({
  resendSupplierPoEmail: vi.fn(),
}))

import { SupplierEmailBanner } from './supplier-email-banner'

describe('SupplierEmailBanner', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
  })

  it('shows why the supplier was not emailed and offers a resend to a user who can issue', () => {
    const html = renderToStaticMarkup(
      <SupplierEmailBanner poId="po-1" message="The supplier has no email address on file." canResend />
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('The supplier has no email address on file.')
    expect(html).toContain('Resend supplier email')
  })

  it('shows the message without a resend button to a user who cannot issue', () => {
    const html = renderToStaticMarkup(
      <SupplierEmailBanner poId="po-1" message="No supplier is set." canResend={false} />
    )

    expect(html).toContain('No supplier is set.')
    expect(html).not.toContain('Resend supplier email')
  })
})
