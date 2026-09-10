import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProjectSubmittalsController } from './project-submittals.controller'
import type { ProjectSubmittalsService } from './project-submittals.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const PRINCIPAL = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'pm' as const, email: 'pm@example.test' }

describe('ProjectSubmittalsController', () => {
  it('rejects invalid command before service invocation', () => {
    const service = { create: vi.fn() } as unknown as ProjectSubmittalsService
    const controller = new ProjectSubmittalsController(service)
    expect(() => controller.create(PROJECT_ID, { projectId: SUBMITTAL_ID }, PRINCIPAL)).toThrow(BadRequestException)
    expect(service.create).not.toHaveBeenCalled()
  })

  it('forwards strict create and review decisions', async () => {
    const service = { create: vi.fn().mockResolvedValue({}), decide: vi.fn().mockResolvedValue({}) } as unknown as ProjectSubmittalsService
    const controller = new ProjectSubmittalsController(service)
    await controller.create(PROJECT_ID, { projectId: PROJECT_ID, clientRequestId: REQUEST_ID, title: 'Submittal', description: 'Description', specSection: '', discipline: '', planReference: '', dueDate: null, assignedTo: null }, PRINCIPAL)
    await controller.decide(PROJECT_ID, SUBMITTAL_ID, { expectedVersion: 1, decision: 'approve', reviewNotes: 'Approved', rejectionReason: '' }, PRINCIPAL)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), PRINCIPAL)
    expect(service.decide).toHaveBeenCalledWith(PROJECT_ID, SUBMITTAL_ID, expect.objectContaining({ decision: 'approve' }), PRINCIPAL)
  })
})
