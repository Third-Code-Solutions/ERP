import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProjectSubmittalDocumentsController } from './project-submittal-documents.controller'
import type { ProjectSubmittalDocumentsService } from './project-submittal-documents.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const LINK_ID = '55555555-5555-4555-8555-555555555555'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'
const PRINCIPAL = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm' as const,
  email: 'pm@example.test',
}

describe('ProjectSubmittalDocumentsController', () => {
  it('rejects invalid link commands before service invocation', () => {
    const service = { link: vi.fn() } as unknown as ProjectSubmittalDocumentsService
    const controller = new ProjectSubmittalDocumentsController(service)
    expect(() => controller.link(PROJECT_ID, SUBMITTAL_ID, { documentId: 'not-a-uuid' }, PRINCIPAL)).toThrow(BadRequestException)
    expect(service.link).not.toHaveBeenCalled()
  })

  it('forwards project document reads and link lifecycle commands', async () => {
    const service = {
      listProjectDocuments: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({}),
      link: vi.fn().mockResolvedValue({}),
      unlink: vi.fn().mockResolvedValue({}),
    } as unknown as ProjectSubmittalDocumentsService
    const controller = new ProjectSubmittalDocumentsController(service)
    await controller.listProjectDocuments(PROJECT_ID, {}, PRINCIPAL)
    await controller.list(PROJECT_ID, SUBMITTAL_ID, PRINCIPAL)
    await controller.link(PROJECT_ID, SUBMITTAL_ID, { documentId: DOCUMENT_ID, role: 'plan', caption: 'M-202', expectedVersion: 1, clientRequestId: REQUEST_ID }, PRINCIPAL)
    await controller.unlink(PROJECT_ID, SUBMITTAL_ID, LINK_ID, { expectedVersion: 2 }, PRINCIPAL)
    expect(service.listProjectDocuments).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ page: 1 }), PRINCIPAL)
    expect(service.list).toHaveBeenCalledWith(PROJECT_ID, SUBMITTAL_ID, PRINCIPAL)
    expect(service.link).toHaveBeenCalledWith(PROJECT_ID, SUBMITTAL_ID, expect.objectContaining({ role: 'plan' }), PRINCIPAL)
    expect(service.unlink).toHaveBeenCalledWith(PROJECT_ID, SUBMITTAL_ID, LINK_ID, { expectedVersion: 2 }, PRINCIPAL)
  })
})
