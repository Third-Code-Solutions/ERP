import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', () => ({
  submitInspection: vi.fn(),
}))

import { InspectionForm } from './inspection-form'

const EXPECTED_FIELD_NAMES = [
  'accessibility_notes', 'as_built_available', 'client_submission_id',
  'expected_start_date', 'floor_area_sqm', 'landlord_contact', 'observations',
  'photo_document_ids', 'site_address', 'weather',
] as const

describe('InspectionForm', () => {
  it('mounts every accepted field exactly once without browser opportunity identity', () => {
    const html = renderToStaticMarkup(
      <InspectionForm opportunityId="33333333-3333-4333-8333-333333333333" pprfSubmitted />
    )
    const names = [...html.matchAll(/\sname="([^"]+)"/g)].map((match) => match[1]).sort()
    const actionSource = readFileSync(
      new URL('../../app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts', import.meta.url),
      'utf8',
    )
    const fieldBlock = /const INSPECTION_FIELD_NAMES = \[([\s\S]*?)\] as const/.exec(actionSource)
    const acceptedNames = [...(fieldBlock?.[1] ?? '').matchAll(/'([^']+)'/g)]
      .map((match) => match[1]).sort()

    expect(names).toEqual(EXPECTED_FIELD_NAMES)
    expect(acceptedNames).toEqual(EXPECTED_FIELD_NAMES)
    expect(new Set(names).size).toBe(names.length)
    expect(html).not.toContain('name="opportunity_id"')
    expect(html).toContain('aria-describedby="inspection-form-status"')
  })

  it('uses a synchronous single-flight guard and keeps drafts on failure', () => {
    const source = readFileSync(new URL('./inspection-form.tsx', import.meta.url), 'utf8')
    expect(source).toContain('if (inFlightRef.current) return')
    expect(source).toContain('submitInspection(opportunityId, formData)')
    expect(source).toContain('if (!res.ok)')
    expect(source).toContain('await saveDraftNow()')
    expect(source).toContain('res.archiveWarning')
    expect(source).toContain('res.replayed')
  })
})
