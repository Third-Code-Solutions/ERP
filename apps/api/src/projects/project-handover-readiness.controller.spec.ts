import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProjectHandoverReadinessController } from './project-handover-readiness.controller'
import type { ProjectHandoverReadinessService } from './project-handover-readiness.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PRINCIPAL = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer' as const,
  email: 'viewer@example.test',
}

describe('ProjectHandoverReadinessController', () => {
  it('rejects unknown query parameters before service invocation', () => {
    const service = { read: vi.fn() } as unknown as ProjectHandoverReadinessService
    const controller = new ProjectHandoverReadinessController(service)
    expect(() => controller.read(PROJECT_ID, { unexpected: 'value' }, PRINCIPAL)).toThrow(
      BadRequestException,
    )
    expect(service.read).not.toHaveBeenCalled()
  })

  it('forwards a validated readiness read', async () => {
    const result = { projectId: PROJECT_ID }
    const service = { read: vi.fn().mockResolvedValue(result) } as unknown as ProjectHandoverReadinessService
    const controller = new ProjectHandoverReadinessController(service)
    await expect(controller.read(PROJECT_ID, {}, PRINCIPAL)).resolves.toEqual(result)
    expect(service.read).toHaveBeenCalledWith(PROJECT_ID, {}, PRINCIPAL)
  })
})
