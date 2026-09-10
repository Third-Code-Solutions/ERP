import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProjectWeeklyProgressController } from './project-weekly-progress.controller'
import type { ProjectWeeklyProgressService } from './project-weekly-progress.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PERIOD_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const PRINCIPAL = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm' as const,
  email: 'pm@example.test',
}
const payload = {
  projectId: PROJECT_ID,
  clientRequestId: REQUEST_ID,
  weekEnding: '2026-09-13',
  percentByCategory: { civil_pct: 10, electrical_pct: 20, mep_pct: 30, finishes_pct: 40, overall_pct: 25 },
  notes: '',
}

describe('ProjectWeeklyProgressController', () => {
  it('rejects malformed commands before service invocation', () => {
    const progress = { create: vi.fn() } as unknown as ProjectWeeklyProgressService
    const controller = new ProjectWeeklyProgressController(progress)
    expect(() => controller.create(PROJECT_ID, { projectId: PROJECT_ID }, PRINCIPAL)).toThrow(BadRequestException)
    expect(progress.create).not.toHaveBeenCalled()
  })

  it('forwards list, capture, and lock commands after validation', async () => {
    const progress = {
      list: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      lock: vi.fn().mockResolvedValue({}),
    } as unknown as ProjectWeeklyProgressService
    const controller = new ProjectWeeklyProgressController(progress)
    await controller.list(PROJECT_ID, {}, PRINCIPAL)
    await controller.create(PROJECT_ID, payload, PRINCIPAL)
    await controller.lock(PROJECT_ID, PERIOD_ID, { expectedVersion: 1, lockReason: '' }, PRINCIPAL)
    expect(progress.list).toHaveBeenCalledWith(PROJECT_ID, { page: 1, limit: 25 }, PRINCIPAL)
    expect(progress.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), PRINCIPAL)
    expect(progress.lock).toHaveBeenCalledWith(PROJECT_ID, PERIOD_ID, { expectedVersion: 1, lockReason: '' }, PRINCIPAL)
  })

  it('rejects a body project mismatch', () => {
    const progress = { create: vi.fn() } as unknown as ProjectWeeklyProgressService
    const controller = new ProjectWeeklyProgressController(progress)
    expect(() => controller.create(PROJECT_ID, { ...payload, projectId: PERIOD_ID }, PRINCIPAL)).toThrow(BadRequestException)
  })
})
