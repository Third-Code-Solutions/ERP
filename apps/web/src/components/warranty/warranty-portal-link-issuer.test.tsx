import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { WarrantyPortalLinkIssuer } from './warranty-portal-link-issuer'

vi.mock('@/app/(dashboard)/warranty/actions', () => ({
  mintWarrantyPortalToken: vi.fn(),
}))

describe('WarrantyPortalLinkIssuer', () => {
  it('renders tenant-provided projects and an explicit issuance action', () => {
    const markup = renderToStaticMarkup(
      <WarrantyPortalLinkIssuer
        projects={[
          { id: '11111111-1111-4111-8111-111111111111', name: 'Makati Office Fit-out' },
          { id: '22222222-2222-4222-8222-222222222222', name: 'Cebu Retail Renovation' },
        ]}
      />,
    )

    expect(markup).toContain('Select a project')
    expect(markup).toContain('Makati Office Fit-out')
    expect(markup).toContain('Cebu Retail Renovation')
    expect(markup).toContain('Issue warranty portal link')
  })

  it('explains when no project is available', () => {
    const markup = renderToStaticMarkup(<WarrantyPortalLinkIssuer projects={[]} />)

    expect(markup).toContain('No projects are available for warranty portal access.')
    expect(markup).not.toContain('Issue warranty portal link')
  })
})
