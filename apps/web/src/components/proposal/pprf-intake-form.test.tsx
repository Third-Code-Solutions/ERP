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

describe('PprfIntakeForm', () => {
  it('mounts the stable retry key and accessible form controls', () => {
    const html = renderToStaticMarkup(<PprfIntakeForm submissionId={SUBMISSION_ID} />)
    expect(html).toContain(`name="submission_id" value="${SUBMISSION_ID}"`)
    expect(html).toContain('aria-describedby="pprf-intake-form-status"')
    expect(html).toContain('id="site_address"')
    expect(html).toContain('for="site_address"')
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
