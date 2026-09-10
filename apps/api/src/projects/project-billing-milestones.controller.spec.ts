import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProjectBillingMilestonesController } from './project-billing-milestones.controller'
import type { ProjectBillingMilestonesService } from './project-billing-milestones.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PRINCIPAL = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'viewer' as const, email: 'viewer@example.test' }

describe('ProjectBillingMilestonesController', () => {
  it('rejects unknown filters before invoking the service', () => {
    const milestones = { list: vi.fn() } as unknown as ProjectBillingMilestonesService
    const controller = new ProjectBillingMilestonesController(milestones)
    expect(() => controller.list(PROJECT_ID, { unexpected: 'value' }, PRINCIPAL)).toThrow(BadRequestException)
    expect(milestones.list).not.toHaveBeenCalled()
  })

  it('forwards validated paginated reads', async () => {
    const milestones = { list: vi.fn().mockResolvedValue({}) } as unknown as ProjectBillingMilestonesService
    const controller = new ProjectBillingMilestonesController(milestones)
    await controller.list(PROJECT_ID, { page: '2', limit: '10' }, PRINCIPAL)
    expect(milestones.list).toHaveBeenCalledWith(PROJECT_ID, { page: 2, limit: 10 }, PRINCIPAL)
  })
})
