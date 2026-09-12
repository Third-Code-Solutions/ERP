import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProjectScheduleController } from './project-schedule.controller'
import type { ProjectScheduleService } from './project-schedule.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const PRINCIPAL = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'pm' as const, email: 'pm@example.test' }

describe('ProjectScheduleController', () => {
  it('validates import snapshot identity without accepting actor or tenant fields', async () => {
    const service = { importLegacy: vi.fn().mockResolvedValue({}) } as unknown as ProjectScheduleService
    const controller = new ProjectScheduleController(service)
    for (const body of [{}, { sourceScheduleId: REQUEST_ID, tenantId: PROJECT_ID }, { sourceScheduleId: REQUEST_ID, actorId: PROJECT_ID }]) expect(() => controller.importLegacy(PROJECT_ID, body, PRINCIPAL)).toThrow(BadRequestException)
    expect(service.importLegacy).not.toHaveBeenCalled()
    await controller.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)
    expect(service.importLegacy).toHaveBeenCalledWith(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)
  })
  it('rejects invalid schedule commands before service invocation', () => {
    const service = { create: vi.fn() } as unknown as ProjectScheduleService
    const controller = new ProjectScheduleController(service)
    expect(() => controller.create(PROJECT_ID, { projectId: PROJECT_ID }, PRINCIPAL)).toThrow(BadRequestException)
    expect(service.create).not.toHaveBeenCalled()
  })

  it('forwards list, create, edit, and status operations', async () => {
    const service = { list: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateStatus: vi.fn().mockResolvedValue({}) } as unknown as ProjectScheduleService
    const controller = new ProjectScheduleController(service)
    await controller.list(PROJECT_ID, {}, PRINCIPAL)
    await controller.create(PROJECT_ID, { projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: '', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: 120, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)
    await controller.update(PROJECT_ID, TASK_ID, { expectedVersion: 1, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: '', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: 120, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)
    await controller.updateStatus(PROJECT_ID, TASK_ID, { expectedVersion: 1, status: 'in_progress', percentComplete: 20, actualStart: '2026-09-10', actualFinish: null, actualLaborMinutes: 30, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)
    expect(service.list).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ page: 1 }), PRINCIPAL)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), PRINCIPAL)
    expect(service.update).toHaveBeenCalledWith(PROJECT_ID, TASK_ID, expect.objectContaining({ expectedVersion: 1 }), PRINCIPAL)
    expect(service.updateStatus).toHaveBeenCalledWith(PROJECT_ID, TASK_ID, expect.objectContaining({ status: 'in_progress' }), PRINCIPAL)
  })
})
