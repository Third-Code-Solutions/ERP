import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', () => ({
  submitPprf: vi.fn(),
}))

import { PprfForm } from './pprf-form'

const defaults = {
  site_address: 'Makati City',
  floor_area_sqm: '45.5',
  landlord_contact: 'Jane Doe',
  as_built_available: 'yes' as const,
  scope_notes: 'Preserve me',
  project_type: 'Retail',
  expected_start_date: '2026-10-01',
  budget_range: 'PHP 1M-2M',
}

describe('PprfForm', () => {
  it('mounts only the stable retry key, never browser opportunity identity', () => {
    const html = renderToStaticMarkup(
      <PprfForm
        opportunityId="33333333-3333-4333-8333-333333333333"
        submissionId="44444444-4444-4444-8444-444444444444"
        defaults={defaults}
      />
    )
    expect(html).toContain('name="submission_id"')
    expect(html).not.toContain('name="opportunity_id"')
    expect(html).toContain('aria-describedby="pprf-form-status"')
    expect(html).toContain('Preserve me')
  })

  it('guards double-submit, binds mounted identity, and preserves fields on failure', () => {
    const source = readFileSync(new URL('./pprf-form.tsx', import.meta.url), 'utf8')
    expect(source).toContain('if (inFlightRef.current) return')
    expect(source).toContain('submitPprf(opportunityId, formData)')
    expect(source).toContain('if (!res.ok)')
    expect(source).toContain("setError('Unable to submit the PPRF. Please retry.')")
    expect(source).not.toContain('.reset()')
    expect(source).toContain('res.replayed')
    expect(source).toContain('res.refreshFailed')
  })
})
