import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { can } from '@third-code-erp/auth'
import {
  ERP_ROLES,
  type ErpRole,
} from '@third-code-erp/shared-types/authorization'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  leftJoin: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  stageAdvanceButton: vi.fn(
    (props: { opportunityId: string; currentStage: string }) => (
      <button
        type="button"
        data-opportunity-id={props.opportunityId}
        data-current-stage={props.currentStage}
      >
        Advance stage
      </button>
    )
  ),
}))

vi.mock('@third-code-erp/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.requireUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@/components/pipeline/stage-advance-button', () => ({
  StageAdvanceButton: mocks.stageAdvanceButton,
}))

import ConversionPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const MUTATION_ROLES = new Set<ErpRole>(['owner', 'admin', 'sales'])
const OPPORTUNITY = {
  id: OPPORTUNITY_ID,
  stage: 'negotiation',
  probability: 70,
  tcv_cents: 2_000_000,
  gp_cents: 500_000,
  weighted_tcv_cents: 1_400_000,
  closing_date: '2026-09-30',
  created_at: new Date('2026-09-03T00:00:00.000Z'),
  project_name: 'Tenant-safe fit-out',
  project_client: 'Example client',
  project_id: PROJECT_ID,
}

describe('ConversionPage stage mutation visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin })
    mocks.leftJoin.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy })
    mocks.orderBy.mockResolvedValue([OPPORTUNITY])
  })

  it.each(ERP_ROLES)(
    'renders the central stage-advance policy for %s',
    async (role) => {
      mocks.requireUserProfile.mockResolvedValue({
        tenantId: TENANT_ID,
        role,
      })

      const markup = renderToStaticMarkup(await ConversionPage())
      const canAdvance = MUTATION_ROLES.has(role)

      expect(can(role, 'opportunity.advance_stage')).toBe(canAdvance)
      expect(markup).toContain('Tenant-safe fit-out')
      expect(markup).toContain('Example client')
      expect(markup.includes('Advance stage')).toBe(canAdvance)
      expect(markup.includes('>Actions</th>')).toBe(canAdvance)
      expect(markup.includes('role="status"')).toBe(!canAdvance)
      expect(
        markup.includes('Read-only conversion pipeline access.')
      ).toBe(!canAdvance)
      expect(mocks.stageAdvanceButton).toHaveBeenCalledTimes(
        canAdvance ? 1 : 0
      )
    }
  )

  it('keeps an allowed stage control wired to the rendered opportunity', async () => {
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'sales',
    })

    renderToStaticMarkup(await ConversionPage())

    expect(mocks.stageAdvanceButton.mock.calls[0]?.[0]).toEqual({
      opportunityId: OPPORTUNITY_ID,
      currentStage: 'negotiation',
    })
  })
})
