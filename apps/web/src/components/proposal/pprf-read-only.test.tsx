import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PprfReadOnly } from './pprf-read-only'

const values = {
  site_address: '5F Tower One, Ayala Ave, Makati',
  floor_area_sqm: '420',
  landlord_contact: 'Ana Reyes 0917 000 0000',
  as_built_available: 'partial' as const,
  scope_notes: 'Ceiling works\nElectrical rough-in',
  project_type: '',
  expected_start_date: '2026-12-01',
  budget_range: '',
}

describe('PprfReadOnly', () => {
  it('shows the latest version content as read-only text with no form controls', () => {
    const markup = renderToStaticMarkup(
      <PprfReadOnly version={3} submittedAt="Nov 17, 2026, 09:00 AM" values={values} />
    )

    expect(markup).toContain('PPRF v3 (latest)')
    expect(markup).toContain('submitted Nov 17, 2026, 09:00 AM')
    expect(markup).toContain('5F Tower One, Ayala Ave, Makati')
    expect(markup).toContain('Partial')
    expect(markup).toContain('Electrical rough-in')
    expect(markup).not.toContain('<form')
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain('<textarea')
  })

  it('prints a dash for optional fields that were left blank', () => {
    const markup = renderToStaticMarkup(
      <PprfReadOnly version={1} submittedAt={null} values={values} />
    )

    expect(markup).toMatch(/>Budget range<\/dt><dd[^>]*>—<\/dd>/)
    expect(markup).not.toContain('submitted')
  })
})
