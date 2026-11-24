import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/app/(dashboard)/claims/draft-command-actions', () => ({ createClaimDraftCommand: vi.fn() }))

import { ClaimForm } from './claim-form'

describe('claim draft form', () => {
  it('renders accessible exact-money inputs and project selection', () => {
    const markup = renderToStaticMarkup(<ClaimForm
      projects={[{ id: '33333333-3333-4333-8333-333333333333', name: 'Synthetic project' }]}
      tenantId="11111111-1111-4111-8111-111111111111"
      actorId="22222222-2222-4222-8222-222222222222"
    />)
    expect(markup).toContain('for="claim-project"')
    expect(markup).toContain('for="claim-amount"')
    expect(markup).toContain('name="amount_php"')
    expect(markup).toContain('Amount (₱, excl. VAT)')
    expect(markup).toContain('Save as draft')
  })
})
