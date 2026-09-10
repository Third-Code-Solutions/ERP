import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProjectPerformanceController } from './project-performance.controller'
import type { ProjectPerformanceService } from './project-performance.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PRINCIPAL = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer' as const,
  email: 'viewer@example.test',
}

describe('ProjectPerformanceController', () => {
  it('rejects unknown query parameters before service invocation', () => {
    const performance = { read: vi.fn() } as unknown as ProjectPerformanceService
    const controller = new ProjectPerformanceController(performance)
    expect(() => controller.read(PROJECT_ID, { unexpected: 'value' }, PRINCIPAL)).toThrow(
      BadRequestException,
    )
    expect(performance.read).not.toHaveBeenCalled()
  })

  it('forwards a validated project performance read', async () => {
    const result = { projectId: PROJECT_ID }
    const performance = {
      read: vi.fn().mockResolvedValue(result),
    } as unknown as ProjectPerformanceService
    const controller = new ProjectPerformanceController(performance)
    await expect(controller.read(PROJECT_ID, {}, PRINCIPAL)).resolves.toEqual(result)
    expect(performance.read).toHaveBeenCalledWith(PROJECT_ID, {}, PRINCIPAL)
  })
})
