import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn((config: unknown, handler: unknown) => ({ config, handler })),
}))

vi.mock('@third-code-erp/database', () => ({ db: {} }))
vi.mock('./inngest', () => ({ inngest: { createFunction: mocks.createFunction } }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: mocks.createFunction } }))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))

import { buildStalePermitNotice } from './inngest-permits'

describe('stale permit notification wording', () => {
  const link = 'https://erp.example.test/projects/p1/permits'

  it('names the permit and status in words, never as enum values', () => {
    const notice = buildStalePermitNotice(
      { permit_type: 'lgu_building_permit', status: 'under_review', project_name: 'Tower A' },
      link
    )

    expect(notice.subject).toBe('Permit stale: LGU building permit on Tower A')
    expect(notice.body).toBe(
      'LGU building permit on Tower A has been in status "under review" for over 7 days.'
    )
    expect(notice.templateVars).toEqual({
      entity_label: 'LGU building permit',
      sla_label: 'Permit status update',
      project_name: 'Tower A',
      link_url: link,
    })
    expect(JSON.stringify(notice)).not.toMatch(/lgu_building_permit|under_review|permit_status_update/)
  })

  it('humanizes a permit type that has no explicit label', () => {
    const notice = buildStalePermitNotice(
      { permit_type: 'fire_safety_certificate', status: 'submitted', project_name: null },
      link
    )

    expect(notice.templateVars.entity_label).toBe('Fire safety certificate')
    expect(notice.subject).toBe('Permit stale: Fire safety certificate on Unknown project')
  })
})
