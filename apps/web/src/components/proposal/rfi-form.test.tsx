import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', () => ({
  addInspectionRfi: vi.fn(),
}))

import { RfiForm } from './rfi-form'

const PROPS = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  opportunityId: '33333333-3333-4333-8333-333333333333',
  inspectionId: '44444444-4444-4444-8444-444444444444',
  submissionId: '55555555-5555-4555-8555-555555555555',
}

describe('RfiForm', () => {
  it('renders one accessible description, priority, and stable command identity', () => {
    const html = renderToStaticMarkup(<RfiForm {...PROPS} />)

    expect([...html.matchAll(/\sname="([^"]+)"/g)].map((match) => match[1]).sort()).toEqual([
      'description',
      'priority',
      'submission_id',
    ])
    expect(html).toContain('<label class="form-label" for="rfi-description">Description</label>')
    expect(html).toContain('<label class="form-label" for="rfi-priority">Priority</label>')
    expect(html).toContain('name="submission_id" value="55555555-5555-4555-8555-555555555555"')
    expect(html).toContain('aria-describedby="rfi-form-status"')
    expect(html).toContain('aria-live="polite"')
  })

  it('does not expose server scope identities as form fields', () => {
    const html = renderToStaticMarkup(<RfiForm {...PROPS} />)

    expect(html).not.toContain('name="actor_id"')
    expect(html).not.toContain('name="tenant_id"')
    expect(html).not.toContain('name="opportunity_id"')
    expect(html).not.toContain('name="inspection_id"')
  })

  it('uses a phone-friendly multiline description control and retry-safe button types', () => {
    const html = renderToStaticMarkup(<RfiForm {...PROPS} />)

    expect(html).toContain('<textarea')
    expect(html).toContain('rows="3"')
    expect(html).toContain('type="submit"')
    expect(html).not.toContain('type="button"')
  })
})
