import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { InspectionRfisController } from './inspection-rfis.controller'
import type { InspectionRfisService } from './inspection-rfis.service'

const principal = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'admin' as const, email: 'admin@example.test' }

describe('InspectionRfisController', () => {
  it('validates filters and commands before forwarding principal and explicit target', async () => {
    const service = { list: vi.fn(), transition: vi.fn() }
    const controller = new InspectionRfisController(service as unknown as InspectionRfisService)
    await controller.list('opportunity', { page: '2' }, principal)
    expect(service.list).toHaveBeenCalledWith('opportunity', { page: 2, limit: 25 }, principal)
    await controller.resolve('opportunity', 'rfi', { expectedResolvedAt: null, reason: ' Done ' }, principal)
    expect(service.transition).toHaveBeenLastCalledWith('opportunity', 'rfi', 'resolved', { expectedResolvedAt: null, reason: 'Done' }, principal)
    await controller.reopen('opportunity', 'rfi', { expectedResolvedAt: null, reason: 'Review' }, principal)
    expect(service.transition).toHaveBeenLastCalledWith('opportunity', 'rfi', 'open', expect.anything(), principal)
    expect(() => controller.list('opportunity', { limit: 500 }, principal)).toThrow(BadRequestException)
    expect(() => controller.resolve('opportunity', 'rfi', { expectedResolvedAt: null, reason: 'Done', tenantId: 'injected' }, principal)).toThrow(BadRequestException)
  })
  it('declares read and mutation capabilities explicitly', () => {
    for (const method of ['resolve', 'reopen'] as const) expect(Reflect.getMetadata('third-code-erp:capabilities', InspectionRfisController.prototype[method])).toEqual(['site_inspection.submit'])
    expect(Reflect.getMetadata('third-code-erp:capabilities', InspectionRfisController.prototype.list)).toEqual(['opportunity.read'])
  })
})
