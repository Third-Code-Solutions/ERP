import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { QualityHoldPointsController } from './quality-hold-points.controller'
import type { QualityHoldPointsService } from './quality-hold-points.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const PRINCIPAL = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm' as const,
  email: 'pm@example.test',
}

describe('QualityHoldPointsController', () => {
  it('validates route/body scope before calling Core service', async () => {
    const service = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
      prepare: vi.fn(),
      submit: vi.fn(),
      accept: vi.fn(),
      reject: vi.fn(),
    } as unknown as QualityHoldPointsService
    const controller = new QualityHoldPointsController(service)
    expect(() => controller.create(PROJECT_ID, { projectId: ENTRY_ID }, PRINCIPAL)).toThrow(BadRequestException)
    expect(service.create).not.toHaveBeenCalled()
  })

  it('passes strict list and transition commands to the service', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      prepare: vi.fn().mockResolvedValue({}),
      submit: vi.fn().mockResolvedValue({}),
      accept: vi.fn().mockResolvedValue({}),
      reject: vi.fn().mockResolvedValue({}),
    } as unknown as QualityHoldPointsService
    const controller = new QualityHoldPointsController(service)
    await controller.create(PROJECT_ID, {
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: 'IWR',
      description: 'Inspect work',
      discipline: '',
      location: '',
      planReference: '',
      holdPoint: true,
      inspectionDate: null,
      assignedTo: null,
    }, PRINCIPAL)
    await controller.accept(PROJECT_ID, ENTRY_ID, {
      expectedVersion: 1,
      findings: '',
      acceptanceNotes: 'Accepted',
    }, PRINCIPAL)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), PRINCIPAL)
    expect(service.accept).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, {
      expectedVersion: 1,
      findings: '',
      acceptanceNotes: 'Accepted',
    }, PRINCIPAL)
  })
})
