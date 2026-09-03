import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', () => ({
  addInspectionRfi: vi.fn(),
}))

import { RfiForm } from './rfi-form'

const SUBMISSION_ID = '55555555-5555-4555-8555-555555555555'

describe('RfiForm', () => {
  it('mounts its stable key and only the duplicate-free command fields', () => {
    const html = renderToStaticMarkup(
      <RfiForm
        opportunityId="33333333-3333-4333-8333-333333333333"
        inspectionId="77777777-7777-4777-8777-777777777777"
        submissionId={SUBMISSION_ID}
      />
    )
    const names = [...html.matchAll(/\sname="([^"]+)"/g)].map((match) => match[1]).sort()
    const actionSource = readFileSync(
      new URL('../../app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts', import.meta.url),
      'utf8',
    )
    const fieldBlock = /const RFI_FIELD_NAMES = \[([\s\S]*?)\] as const/.exec(actionSource)
    const acceptedNames = [...(fieldBlock?.[1] ?? '').matchAll(/'([^']+)'/g)]
      .map((match) => match[1]).sort()
    expect(names).toEqual(['description', 'priority', 'submission_id'])
    expect(acceptedNames).toEqual(names)
    expect(new Set(names).size).toBe(names.length)
    expect(html).toContain(`name="submission_id" value="${SUBMISSION_ID}"`)
    expect(html).not.toContain('name="opportunity_id"')
    expect(html).not.toContain('name="inspection_id"')
    expect(html).toContain('for="rfi-description"')
    expect(html).toContain('for="rfi-priority"')
  })

  it('contains thrown failures, clears stale state, retains input, and guards double submit', () => {
    const source = readFileSync(new URL('./rfi-form.tsx', import.meta.url), 'utf8')
    expect(source).toContain('if (inFlightRef.current) return')
    expect(source).toContain('addInspectionRfi(opportunityId, inspectionId, formData)')
    expect(source).toContain('catch')
    expect(source).toContain("setError('Unable to add the RFI. Please retry.')")
    expect(source).not.toContain('.reset()')
    expect(source).toContain('value={description}')
    expect(source).toContain('result.replayed')
  })
})
