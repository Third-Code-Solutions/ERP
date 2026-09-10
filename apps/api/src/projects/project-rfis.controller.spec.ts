import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { ProjectRfisService } from './project-rfis.service'
import { ProjectRfisController } from './project-rfis.controller'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RFI_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

describe('ProjectRfisController', () => {
  it('validates route-bound create input and forwards normalized commands', async () => {
    const service = {
      list: vi.fn(),
      create: vi.fn(),
      answer: vi.fn(),
      close: vi.fn(),
      reopen: vi.fn(),
    }
    const controller = new ProjectRfisController(service as unknown as ProjectRfisService)

    await controller.list(PROJECT_ID, { page: '2', limit: '10' }, PRINCIPAL)
    expect(service.list).toHaveBeenCalledWith(PROJECT_ID, { page: 2, limit: 10 }, PRINCIPAL)

    await controller.create(PROJECT_ID, {
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      subject: '  Confirm slab opening  ',
      question: '  Please confirm the coordinated opening size. ',
      priority: 'high',
      assignedTo: null,
      dueAt: null,
    }, PRINCIPAL)
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Confirm slab opening' }), PRINCIPAL)

    await controller.answer(PROJECT_ID, RFI_ID, { expectedVersion: 1, response: ' Answer ' }, PRINCIPAL)
    expect(service.answer).toHaveBeenCalledWith(PROJECT_ID, RFI_ID, { expectedVersion: 1, response: 'Answer' }, PRINCIPAL)
    await controller.close(PROJECT_ID, RFI_ID, { expectedVersion: 2, reason: ' Done ' }, PRINCIPAL)
    expect(service.close).toHaveBeenCalledWith(PROJECT_ID, RFI_ID, { expectedVersion: 2, reason: 'Done' }, PRINCIPAL)
    await controller.reopen(PROJECT_ID, RFI_ID, { expectedVersion: 3, reason: ' Revisit ' }, PRINCIPAL)
    expect(service.reopen).toHaveBeenCalledWith(PROJECT_ID, RFI_ID, { expectedVersion: 3, reason: 'Revisit' }, PRINCIPAL)
  })

  it('rejects invalid filters, forged tenant fields, and mismatched project ids', () => {
    const service = { list: vi.fn(), create: vi.fn(), answer: vi.fn(), close: vi.fn(), reopen: vi.fn() }
    const controller = new ProjectRfisController(service as unknown as ProjectRfisService)
    expect(() => controller.list(PROJECT_ID, { limit: 101 }, PRINCIPAL)).toThrow(BadRequestException)
    expect(() => controller.create(PROJECT_ID, {
      projectId: '66666666-6666-4666-8666-666666666666',
      clientRequestId: REQUEST_ID,
      subject: 'RFI',
      question: 'Question',
      priority: 'normal',
      assignedTo: null,
      dueAt: null,
    }, PRINCIPAL)).toThrow(BadRequestException)
    expect(() => controller.answer(PROJECT_ID, RFI_ID, {
      expectedVersion: 1,
      response: 'Answer',
      tenantId: PRINCIPAL.tenantId,
    }, PRINCIPAL)).toThrow(BadRequestException)
  })

  it('declares explicit read and mutation capabilities', () => {
    expect(Reflect.getMetadata('third-code-erp:capabilities', ProjectRfisController.prototype.list)).toEqual(['project.rfi.read'])
    for (const method of ['create', 'answer', 'close', 'reopen'] as const) {
      expect(Reflect.getMetadata('third-code-erp:capabilities', ProjectRfisController.prototype[method])).toEqual(['project.rfi.manage'])
    }
  })
})
