import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/app/(dashboard)/crm/opportunities/new/pprf/actions', () => ({
  createPprfIntake: vi.fn(),
}))

import { PprfIntakeForm } from './pprf-intake-form'

const SUBMISSION_ID = '33333333-3333-4333-8333-333333333333'
const EXPECTED_FIELD_NAMES = [
  'area_sqm',
  'as_built_available',
  'billing_address',
  'budget_range',
  'client_name',
  'closing_date',
  'expected_start_date',
  'floor_area_sqm',
  'gp',
  'industry',
  'landlord_contact',
  'opportunity_type',
  'primary_email',
  'primary_phone',
  'project_type',
  'remarks',
  'scope_notes',
  'site_address',
  'submission_id',
  'tcv',
] as const

describe('PprfIntakeForm', () => {
  it('mounts the stable retry key and accessible form controls', () => {
    const html = renderToStaticMarkup(<PprfIntakeForm submissionId={SUBMISSION_ID} />)
    expect(html).toContain(`name="submission_id" value="${SUBMISSION_ID}"`)
    expect(html).toContain('aria-describedby="pprf-intake-form-status"')
    expect(html).toContain('id="site_address"')
    expect(html).toContain('for="site_address"')
    expect(html).toContain('for="area_sqm">Opportunity area (sqm)')
    const areaControl = /<input[^>]*id="area_sqm"[^>]*>/.exec(html)?.[0]
    expect(areaControl).toContain('name="area_sqm"')
    expect(areaControl).toContain('type="number"')
    expect(areaControl).toContain('min="1"')
    expect(areaControl).toContain('step="1"')
    expect(html).toContain('aria-describedby="area_sqm_help"')
    expect(html).toContain('This is separate from the required PPRF floor area below.')
  })

  it('emits every accepted intake field exactly once and no unknown fields', () => {
    const html = renderToStaticMarkup(<PprfIntakeForm submissionId={SUBMISSION_ID} />)
    const names = [...html.matchAll(/\sname="([^"]+)"/g)]
      .map((match) => match[1])
      .sort()
    const actionSource = readFileSync(
      new URL('../../app/(dashboard)/crm/opportunities/new/pprf/actions.ts', import.meta.url),
      'utf8'
    )
    const fieldBlock = /const FIELD_NAMES = \[([\s\S]*?)\] as const/.exec(actionSource)
    const acceptedNames = [...(fieldBlock?.[1] ?? '').matchAll(/'([^']+)'/g)]
      .map((match) => match[1])
      .sort()

    expect(names).toEqual(EXPECTED_FIELD_NAMES)
    expect(acceptedNames).toEqual(EXPECTED_FIELD_NAMES)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps a synchronous guard and contains returned and rejected failures', () => {
    const source = readFileSync(new URL('./pprf-intake-form.tsx', import.meta.url), 'utf8')
    expect(source).toContain('if (inFlightRef.current) return')
    expect(source).toContain('if (!result.ok)')
    expect(source).toContain("setError('Unable to submit the PPRF intake. Please retry.')")
    expect(source).not.toContain('.reset()')
    expect(source).toContain('result.replayed')
    expect(source).toContain('result.refreshFailed')
  })
})
